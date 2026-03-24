import type { Platform, SessionMode } from './types';

export function detectPlatform(): Platform {
  return process.platform === 'win32' ? 'windows' : 'linux';
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function killProcess(pid: number): Promise<void> {
  const platform = detectPlatform();

  if (platform === 'windows') {
    const proc = Bun.spawn(['taskkill', '/PID', String(pid), '/T'], {
      stdout: 'ignore', stderr: 'ignore',
    });
    await proc.exited;
  } else {
    process.kill(pid, 'SIGTERM');
  }
}

export async function forceKillProcess(pid: number): Promise<void> {
  const platform = detectPlatform();

  if (platform === 'windows') {
    const proc = Bun.spawn(['taskkill', '/PID', String(pid), '/T', '/F'], {
      stdout: 'ignore', stderr: 'ignore',
    });
    await proc.exited;
  } else {
    process.kill(pid, 'SIGKILL');
  }
}
