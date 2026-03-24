import { loadConfig } from './config';
import { detectPlatform } from './platform';
import { createCredentialProvider } from './credential-provider';
import { ProcessManager } from './process-manager';
import { SessionManager } from './session-manager';
import { HealthMonitor } from './health-monitor';
import { createBot, registerCommands, sendNotification } from './bot';

async function main(): Promise<void> {
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
