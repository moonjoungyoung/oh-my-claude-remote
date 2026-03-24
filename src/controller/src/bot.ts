import { Bot, type Context } from 'grammy';
import type { SessionManager } from './session-manager';
import { registerAllCommands } from './commands';

export function createBot(token: string, authorizedUsers: number[]): Bot {
  const bot = new Bot(token);

  // Auth middleware: only allow authorized users
  bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId || !authorizedUsers.includes(userId)) {
      return; // Silently ignore unauthorized users
    }
    await next();
  });

  // Global error handler
  bot.catch((err) => {
    console.error('[Bot] Error:', err.error);
  });

  return bot;
}

export async function sendNotification(bot: Bot, chatId: string, message: string): Promise<void> {
  try {
    await bot.api.sendMessage(chatId, message);
  } catch (err) {
    console.error('[Bot] Failed to send notification:', err);
  }
}

export function registerCommands(bot: Bot, sessionManager: SessionManager): void {
  registerAllCommands(bot, sessionManager);

  bot.api.setMyCommands([
    { command: 'run', description: 'Start a session: /run N' },
    { command: 'kill', description: 'Stop a session: /kill N' },
    { command: 'restart', description: 'Restart a session: /restart N' },
    { command: 'runall', description: 'Start all sessions' },
    { command: 'killall', description: 'Stop all sessions' },
    { command: 'status', description: 'Show all session statuses' },
    { command: 'mode', description: 'Change session mode: /mode N yolo|normal|plan' },
    { command: 'help', description: 'Show help message' },
  ]).catch((err) => {
    console.error('[Bot] Failed to set commands:', err);
  });
}
