import type { Context } from 'grammy';
import type { SessionManager } from '../session-manager';

export async function handleStop(ctx: Context, sm: SessionManager): Promise<void> {
  const text = ctx.message?.text ?? '';
  const parts = text.trim().split(/\s+/);
  const arg = parts[1];

  if (!arg) {
    await ctx.reply('Usage: /kill N (session number) or /killall');
    return;
  }

  const sessionId = parseInt(arg, 10);
  if (isNaN(sessionId)) {
    await ctx.reply('❌ Invalid session number.');
    return;
  }

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
