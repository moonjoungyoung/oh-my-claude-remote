import type { Context } from 'grammy';
import type { SessionManager } from '../session-manager';
import type { SessionMode } from '../types';

const VALID_MODES: SessionMode[] = ['yolo', 'normal', 'plan'];

export async function handleMode(ctx: Context, sm: SessionManager): Promise<void> {
  const text = ctx.message?.text ?? '';
  const parts = text.trim().split(/\s+/);
  // /mode N mode [confirm]
  const sessionArg = parts[1];
  const modeArg = parts[2];
  const confirmArg = parts[3];

  if (!sessionArg || !modeArg) {
    await ctx.reply('Usage: /mode N yolo|normal|plan');
    return;
  }

  const sessionId = parseInt(sessionArg, 10);
  if (isNaN(sessionId)) {
    await ctx.reply('❌ Invalid session number.');
    return;
  }

  const mode = modeArg.toLowerCase() as SessionMode;
  if (!VALID_MODES.includes(mode)) {
    await ctx.reply(`❌ Invalid mode. Valid modes: ${VALID_MODES.join(', ')}`);
    return;
  }

  // yolo mode requires confirmation
  if (mode === 'yolo' && confirmArg !== 'confirm') {
    await ctx.reply(
      `⚠️ yolo mode enables unrestricted access. Reply /mode ${sessionId} yolo confirm to proceed.`
    );
    return;
  }

  try {
    const { state, needsRestart } = sm.changeMode(sessionId, mode);

    if (needsRestart) {
      await ctx.reply(
        `🔧 Session ${sessionId} mode will change to ${mode.toUpperCase()} on next restart. Currently ${state.status}.`
      );
    } else {
      await ctx.reply(
        `🔧 Session ${sessionId} mode changed to ${mode.toUpperCase()}. Restart required if running.`
      );
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await ctx.reply(`❌ Failed to change mode: ${msg}`);
  }
}
