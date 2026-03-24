import type { HealthCheckConfig } from './types';
import type { SessionManager } from './session-manager';
import type { ProcessManager } from './process-manager';

export class HealthMonitor {
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly config: HealthCheckConfig,
    private readonly sessionManager: SessionManager,
    private readonly processManager: ProcessManager,
    private readonly notifyCallback: (msg: string) => void
  ) {}

  start(): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.checkAll(), this.config.intervalSeconds * 1000);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  checkAll(): void {
    const sessions = this.sessionManager.getAllStates();

    for (const session of sessions) {
      if (session.status !== 'running') continue;

      if (!this.processManager.isAlive(session.id)) {
        const msg = `⚠️ Session ${session.id} (${session.name}) process died.`;
        console.error(`[HealthMonitor] ${msg}`);

        // markSessionDead persists to disk — stops repeated alerts
        this.sessionManager.markSessionDead(session.id);
        this.notifyCallback(msg);
      }
    }
  }
}
