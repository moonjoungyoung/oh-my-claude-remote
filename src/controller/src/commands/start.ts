import type { Context } from 'grammy';
import type { SessionManager } from '../session-manager';

export async function handleStart(ctx: Context, sm: SessionManager): Promise<void> {
  const text = ctx.message?.text ?? '';
  const parts = text.trim().split(/\s+/);
  // parts[0] = "/start", parts[1] = N
  const arg = parts[1];

  if (!arg) {
    await ctx.reply('Usage: /run N (session number) or /runall');
    return;
  }

  const sessionId = parseInt(arg, 10);
  if (isNaN(sessionId)) {
    await ctx.reply('❌ Invalid session number.');
    return;
  }

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
