import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import type { SessionManager } from '../session-manager';

export async function handleStart(ctx: Context, sm: SessionManager): Promise<void> {
  const text = ctx.message?.text ?? '';
  const parts = text.trim().split(/\s+/);
  const arg = parts[1];

  if (!arg) {
    // No argument: show stopped sessions as buttons
    const states = sm.getAllStates();
    const stopped = states.filter((s) => s.status === 'stopped' || s.status === 'error');
    if (stopped.length === 0) {
      await ctx.reply('All sessions are already running.');
      return;
    }
    const kb = new InlineKeyboard();
    for (const s of stopped) {
      kb.text(`▶ ${s.id} ${s.name}`, `run:${s.id}`).row();
    }
    await ctx.reply('Start which session?', { reply_markup: kb });
    return;
  }

  const sessionId = parseInt(arg, 10);
  if (isNaN(sessionId)) {
    await ctx.reply('❌ Invalid session number.');
    return;
  }

  await startSessionById(ctx, sm, sessionId);
}

export async function handleStartAll(ctx: Context, sm: SessionManager): Promise<void> {
  try {
    await ctx.reply('🚀 Starting all sessions...');
    await sm.startAll();
    const states = sm.getAllStates();
    const running = states.filter((s) => s.status === 'running').length;
    await ctx.reply(`✅ ${running}/${states.length} sessions running.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`❌ Failed to start all sessions: ${msg}`);
  }
}

export async function startSessionById(ctx: Context, sm: SessionManager, sessionId: number): Promise<void> {
  try {
    const state = await sm.startSession(sessionId);
    if (state.status === 'running') {
      const botUsername = sm.getBotUsername(sessionId);
      const chatLink = botUsername ? `\n💬 https://t.me/${botUsername}` : '';
      await ctx.reply(`✅ Session ${sessionId} (${state.name}) started. PID: ${state.pid}${chatLink}`);
    } else {
      await ctx.reply(`❌ Failed to start session ${sessionId}: ${state.lastError ?? 'unknown error'}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`❌ Failed to start session ${sessionId}: ${msg}`);
  }
}
