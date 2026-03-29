import type { Context } from 'grammy';
import { InlineKeyboard } from 'grammy';
import type { SessionManager } from '../session-manager';

export async function handleStop(ctx: Context, sm: SessionManager): Promise<void> {
  const text = ctx.message?.text ?? '';
  const parts = text.trim().split(/\s+/);
  const arg = parts[1];

  if (!arg) {
    // No argument: show running sessions as buttons
    const states = sm.getAllStates();
    const running = states.filter((s) => s.status === 'running');
    if (running.length === 0) {
      await ctx.reply('No running sessions.');
      return;
    }
    const kb = new InlineKeyboard();
    for (const s of running) {
      kb.text(`⏹ ${s.id} ${s.name}`, `kill:${s.id}`).row();
    }
    await ctx.reply('Stop which session?', { reply_markup: kb });
    return;
  }

  const sessionId = parseInt(arg, 10);
  if (isNaN(sessionId)) {
    await ctx.reply('❌ Invalid session number.');
    return;
  }

  await stopSessionById(ctx, sm, sessionId);
}

export async function handleStopAll(ctx: Context, sm: SessionManager): Promise<void> {
  try {
    await ctx.reply('🛑 Stopping all sessions...');
    await sm.stopAll();
    await ctx.reply('✅ All sessions stopped.');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`❌ Failed to stop all sessions: ${msg}`);
  }
}

export async function stopSessionById(ctx: Context, sm: SessionManager, sessionId: number): Promise<void> {
  try {
    const currentState = sm.getSessionState(sessionId);
    if (currentState.status === 'stopped') {
      await ctx.reply(`⚪ Session ${sessionId} is already stopped.`);
      return;
    }

    const state = await sm.stopSession(sessionId);
    if (state.status === 'stopped') {
      await ctx.reply(`🛑 Session ${sessionId} stopped.`);
    } else {
      await ctx.reply(`❌ Failed to stop session ${sessionId}: ${state.lastError ?? 'unknown error'}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`❌ Failed to stop session ${sessionId}: ${msg}`);
  }
}
