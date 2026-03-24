import type { Bot } from 'grammy';
import type { SessionManager } from '../session-manager';
import { handleStart, handleStartAll } from './start';
import { handleStop, handleStopAll } from './stop';
import { handleRestart } from './restart';
import { handleStatus } from './status';
import { handleMode } from './mode';
import { handleHelp } from './help';

export function registerAllCommands(bot: Bot, sm: SessionManager): void {
  // Note: /start is Telegram's built-in "start bot" command.
  // Use /run instead to avoid conflict with Telegram's default behavior.
  bot.command('run', (ctx) => handleStart(ctx, sm));
  bot.command('kill', (ctx) => handleStop(ctx, sm));
  bot.command('restart', (ctx) => handleRestart(ctx, sm));
  bot.command('runall', (ctx) => handleStartAll(ctx, sm));
  bot.command('killall', (ctx) => handleStopAll(ctx, sm));
  bot.command('status', (ctx) => handleStatus(ctx, sm));
  bot.command('mode', (ctx) => handleMode(ctx, sm));
  bot.command('help', (ctx) => handleHelp(ctx));
  // Handle Telegram's built-in /start command with welcome message
  bot.command('start', (ctx) => handleHelp(ctx));
}
