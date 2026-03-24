import type { Context } from 'grammy';
import type { SessionManager } from '../session-manager';

const NUMBER_EMOJIS = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];

function getNumberEmoji(n: number): string {
  if (n >= 0 && n <= 9) return NUMBER_EMOJIS[n];
  return `${n}.`;
}

export async function handleStatus(ctx: Context, sm: SessionManager): Promise<void> {
  const sessions = sm.getAllStates();

  if (sessions.length === 0) {
    await ctx.reply('No sessions configured.');
    return;
  }

  const lines: string[] = ['📊 *OmcSessionManager*', ''];

  for (const session of sessions) {
    let statusIcon: string;
    let statusText: string;

    switch (session.status) {
      case 'running':
        statusIcon = '🟢';
        statusText = 'RUN';
        break;
      case 'stopped':
        statusIcon = '🔴';
        statusText = 'STOP';
        break;
      case 'error':
        statusIcon = '⚠️';
        statusText = 'ERR';
        break;
      case 'starting':
        statusIcon = '🟡';
        statusText = 'STARTING';
        break;
      case 'stopping':
        statusIcon = '🟡';
        statusText = 'STOPPING';
        break;
      case 'restarting':
        statusIcon = '🔄';
        statusText = 'RESTART';
        break;
      default:
        statusIcon = '❓';
        statusText = String(session.status).toUpperCase();
    }

    let line = `${getNumberEmoji(session.id)} ${session.name}  ${statusIcon} ${statusText}`;

    if (session.pid) {
      line += `  PID:${session.pid}`;
    }

    const botUsername = sm.getBotUsername(session.id);
    if (botUsername && session.status === 'running') {
      line += `\n    💬 https://t.me/${botUsername}`;
    }

    lines.push(line);
  }

  await ctx.reply(lines.join('\n'));
}
