import type { Context } from 'grammy';
import type { SessionManager } from '../session-manager';

export async function handleRestart(ctx: Context, sm: SessionManager): Promise<void> {
  const text = ctx.message?.text ?? '';
  const parts = text.trim().split(/\s+/);
  const arg = parts[1];

  if (!arg) {
    await ctx.reply('Usage: /restart N (session number)');
    return;
  }

  const sessionId = parseInt(arg, 10);
  if (isNaN(sessionId)) {
    await ctx.reply('❌ Invalid session number.');
    return;
  }

  try {
    await ctx.reply(`🔄 Restarting session ${sessionId}...`);
    const state = await sm.restartSession(sessionId);
    if (state.status === 'running') {
      await ctx.reply(`🔄 Session ${sessionId} restarted. PID: ${state.pid}`);
    } else {
      await ctx.reply(`❌ Failed to restart session ${sessionId}: ${state.lastError ?? 'unknown error'}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`❌ Failed to restart session ${sessionId}: ${msg}`);
  }
}
