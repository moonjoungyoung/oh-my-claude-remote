import type { Context } from 'grammy';

const HELP_TEXT = `
🤖 OmcSessionManager Commands

/run N — Start session N
/kill N — Stop session N
/restart N — Restart session N
/runall — Start all sessions
/killall — Stop all sessions
/status — Show all session statuses
/mode N yolo|normal|plan — Change session mode
/help — Show this help message

Modes:
• normal — Standard permissions
• plan — Plan mode (read-only)
• yolo — Unrestricted (requires confirmation)
`.trim();

export async function handleHelp(ctx: Context): Promise<void> {
  await ctx.reply(HELP_TEXT);
}
