import type { SessionConfig, SessionMode } from './types';
import { isProcessAlive, forceKillProcess } from './platform';
import { getProjectRoot } from './config';
import fs from 'fs';
import path from 'path';

interface TrackedProcess {
  pid: number;
  logFile: string;
}

export class ProcessManager {
  private activeProcesses = new Map<number, TrackedProcess>();

  /**
   * Spawn a claude-telegram-bot instance for this session.
   * Each session gets its own .env config file with its bot token.
   * The bot runs as a background process — no terminal window needed.
   */
  async spawnSession(
    config: SessionConfig,
    mode: SessionMode,
    token: string,
    authorizedUsers: number[],
  ): Promise<{ pid: number }> {
    const sessionDir = path.join(getProjectRoot(), 'state', 'sessions', `session-${config.id}`);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const logsDir = path.join(getProjectRoot(), 'state', 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const logFile = path.join(logsDir, `session-${config.id}.log`);

    // Create per-session .env for claude-telegram-bot
    const envFile = path.join(sessionDir, '.env');
    const permissionMode = mode === 'yolo' ? 'bypassPermissions' : mode === 'plan' ? 'plan' : 'default';
    const envContent = [
      `TELEGRAM_BOT_TOKEN=${token}`,
      `TELEGRAM_BOT_USERNAME=${config.botUsername}`,
      `APPROVED_DIRECTORY=${config.workingDirectory}`,
      `ALLOWED_USERS=${authorizedUsers.join(',')}`,
      `CLAUDE_PERMISSION_MODE=${permissionMode}`,
      `AGENTIC_MODE=true`,
      `SANDBOX_ENABLED=false`,
      `DISABLE_SECURITY_PATTERNS=true`,
      `DISABLE_TOOL_VALIDATION=true`,
    ].join('\n');
    fs.writeFileSync(envFile, envContent);

    // Spawn claude-telegram-bot with this config
    const proc = Bun.spawn(['claude-telegram-bot', '--config-file', envFile], {
      cwd: config.workingDirectory,
      env: { ...process.env },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const pid = proc.pid;

    // Pipe output to log file
    const logSink = Bun.file(logFile).writer();
    const pipeStream = async (stream: ReadableStream<Uint8Array> | null) => {
      if (!stream) return;
      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          logSink.write(value);
        }
      } catch { /* stream closed */ }
    };
    pipeStream(proc.stdout).catch(() => {});
    pipeStream(proc.stderr).catch(() => {});

    this.activeProcesses.set(config.id, { pid, logFile });

    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFile, `[${timestamp}] Session ${config.id} started (claude-telegram-bot). PID: ${pid}\n`);

    return { pid };
  }

  async killSession(sessionId: number): Promise<boolean> {
    const entry = this.activeProcesses.get(sessionId);
    if (!entry) return false;

    this.activeProcesses.delete(sessionId);

    const pid = entry.pid;
    try { await forceKillProcess(pid); } catch { /* ignore */ }

    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && isProcessAlive(pid)) {
      await Bun.sleep(200);
    }

    return true;
  }

  isAlive(sessionId: number): boolean {
    const entry = this.activeProcesses.get(sessionId);
    if (!entry) return false;
    return isProcessAlive(entry.pid);
  }
}
