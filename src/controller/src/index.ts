import { loadConfig, getProjectRoot } from './config';
import { detectPlatform } from './platform';
import { createCredentialProvider } from './credential-provider';
import { ProcessManager } from './process-manager';
import { SessionManager } from './session-manager';
import { HealthMonitor } from './health-monitor';
import { createBot, registerCommands, sendNotification } from './bot';
import { forceKillProcess } from './platform';
import fs from 'fs';
import path from 'path';

/**
 * Kill any existing master bot (bun) and worker (claude-telegram-bot) processes
 * to prevent duplicate instances and Telegram polling conflicts.
 */
async function cleanupExistingProcesses(): Promise<void> {
  const pidFile = path.join(getProjectRoot(), 'state', 'master.pid');

  // Kill previous master bot if PID file exists
  if (fs.existsSync(pidFile)) {
    const oldPid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10);
    if (!isNaN(oldPid) && oldPid !== process.pid) {
      console.log(`[Main] Killing previous master bot (PID: ${oldPid})...`);
      try { await forceKillProcess(oldPid); } catch { /* already dead */ }
    }
  }

  // Kill any existing telegram worker processes
  if (detectPlatform() === 'windows') {
    const proc = Bun.spawn(['pwsh', '-NoProfile', '-Command',
      `Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like '*telegram*' } | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }`
    ], { stdout: 'ignore', stderr: 'ignore' });
    await proc.exited;
  } else {
    const proc = Bun.spawn(['pkill', '-f', 'claude-telegram-bot'], { stdout: 'ignore', stderr: 'ignore' });
    await proc.exited;
  }

  // Write current PID
  const stateDir = path.join(getProjectRoot(), 'state');
  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true });
  }
  fs.writeFileSync(pidFile, String(process.pid));

  console.log('[Main] Cleanup complete.');
}

async function main(): Promise<void> {
  console.log('[Main] Cleaning up existing processes...');
  await cleanupExistingProcesses();

  console.log('[Main] Loading config...');
  const config = loadConfig();

  console.log('[Main] Detecting platform...');
  const platform = detectPlatform();
  console.log(`[Main] Platform: ${platform}`);

  console.log('[Main] Creating credential provider...');
  const credentialProvider = createCredentialProvider(platform);

  console.log('[Main] Retrieving master bot token...');
  const masterToken = await credentialProvider.getToken(config.master.credentialKey);

  console.log('[Main] Initializing process manager...');
  const processManager = new ProcessManager();

  console.log('[Main] Initializing session manager...');
  const sessionManager = new SessionManager(config, processManager, credentialProvider);

  console.log('[Main] Creating bot...');
  const bot = createBot(masterToken, config.authorizedUsers);

  console.log('[Main] Registering commands...');
  registerCommands(bot, sessionManager);

  console.log('[Main] Starting health monitor...');
  const healthMonitor = new HealthMonitor(
    config.healthCheck,
    sessionManager,
    processManager,
    (msg) => sendNotification(bot, config.master.notifyChatId, msg)
  );
  healthMonitor.start();

  // Auto-start sessions
  const autoStartSessions = config.sessions.filter((s) => s.autoStart);
  if (autoStartSessions.length > 0) {
    console.log(`[Main] Auto-starting ${autoStartSessions.length} sessions...`);
    for (const sessionConfig of autoStartSessions) {
      try {
        await sessionManager.startSession(sessionConfig.id);
        console.log(`[Main] Session ${sessionConfig.id} (${sessionConfig.name}) started.`);
        await Bun.sleep(3000);
      } catch (err) {
        console.error(`[Main] Failed to auto-start session ${sessionConfig.id}:`, err);
      }
    }
  }

  // Send startup notification
  await sendNotification(
    bot,
    config.master.notifyChatId,
    '🤖 Master controller started'
  );

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[Main] Shutting down...');
    await sendNotification(
      bot,
      config.master.notifyChatId,
      '👋 Master controller shutting down'
    );
    await sessionManager.stopAll();
    healthMonitor.stop();
    await bot.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log('[Main] Bot starting long polling...');
  await bot.start();
}

main().catch(console.error);
