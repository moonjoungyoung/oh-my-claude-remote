import type { AppConfig, SessionConfig, SessionMode, SessionState, SessionStatus, StateFile } from './types';
import type { CredentialProvider } from './credential-provider';
import type { ProcessManager } from './process-manager';
import { loadState, saveState, initializeState } from './config';

const VALID_TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  stopped: ['starting'],
  starting: ['running', 'error'],
  running: ['stopping', 'error'],
  stopping: ['stopped', 'error'],
  error: ['starting'],
  restarting: ['starting', 'error'],
};

export class SessionManager {
  private state: StateFile;

  constructor(
    private readonly config: AppConfig,
    private readonly processManager: ProcessManager,
    private readonly credentialProvider: CredentialProvider
  ) {
    const existing = loadState();
    if (Object.keys(existing.sessions).length > 0) {
      for (const session of config.sessions) {
        if (!existing.sessions[session.id]) {
          existing.sessions[session.id] = this.createDefaultSessionState(session);
        }
      }
      // Reset any stale running/restarting states from previous crash
      for (const session of Object.values(existing.sessions)) {
        if (session.status === 'running' || session.status === 'starting' || session.status === 'restarting' || session.status === 'stopping') {
          session.status = 'stopped';
          session.pid = null;
        }
      }
      this.state = existing;
    } else {
      this.state = initializeState(config);
    }
    this.persistState();
  }

  async startSession(sessionId: number, mode?: SessionMode): Promise<SessionState> {
    const session = this.getSessionState(sessionId);
    const sessionConfig = this.getSessionConfig(sessionId);

    this.validateTransition(session.status, 'starting');

    if (mode) {
      session.mode = mode;
    }

    this.setStatus(sessionId, 'starting');

    try {
      const token = await this.credentialProvider.getToken(sessionConfig.credentialKey);

      const { pid } = await this.processManager.spawnSession(
        sessionConfig,
        session.mode,
        token,
        this.config.authorizedUsers,
      );

      session.pid = pid;
      session.startedAt = new Date().toISOString();
      session.lastError = null;
      session.restartCount = 0;
      this.setStatus(sessionId, 'running');
    } catch (err) {
      session.lastError = err instanceof Error ? err.message : String(err);
      this.setStatus(sessionId, 'error');
    }

    return { ...this.state.sessions[sessionId] };
  }

  async stopSession(sessionId: number): Promise<SessionState> {
    const session = this.getSessionState(sessionId);

    // Allow stopping from any active state
    if (session.status === 'stopped') {
      return { ...session };
    }

    session.status = 'stopping';
    this.persistState();

    try {
      await this.processManager.killSession(sessionId);
    } catch { /* ignore kill errors */ }

    session.pid = null;
    session.startedAt = null;
    session.status = 'stopped';
    this.persistState();

    return { ...this.state.sessions[sessionId] };
  }

  async restartSession(sessionId: number, mode?: SessionMode): Promise<SessionState> {
    await this.stopSession(sessionId);
    return this.startSession(sessionId, mode);
  }

  changeMode(sessionId: number, mode: SessionMode): { state: SessionState; needsRestart: boolean } {
    const session = this.getSessionState(sessionId);
    session.mode = mode;
    this.persistState();

    const needsRestart = session.status === 'running';
    return { state: { ...session }, needsRestart };
  }

  async startAll(): Promise<void> {
    for (const sessionConfig of this.config.sessions) {
      const session = this.state.sessions[sessionConfig.id];
      if (session && (session.status === 'stopped' || session.status === 'error')) {
        await this.startSession(sessionConfig.id);
        await Bun.sleep(3000);
      }
    }
  }

  async stopAll(): Promise<void> {
    // Mark ALL sessions as stopping first — prevents any auto-restart
    for (const sessionConfig of this.config.sessions) {
      const session = this.state.sessions[sessionConfig.id];
      if (session && session.status !== 'stopped') {
        session.status = 'stopping';
      }
    }
    this.persistState();

    // Now kill
    for (const sessionConfig of this.config.sessions) {
      const session = this.state.sessions[sessionConfig.id];
      if (session && session.status === 'stopping') {
        try {
          await this.processManager.killSession(sessionConfig.id);
        } catch { /* ignore */ }
        session.pid = null;
        session.startedAt = null;
        session.status = 'stopped';
      }
    }
    this.persistState();
  }

  getAllStates(): SessionState[] {
    return Object.values(this.state.sessions).map((s) => ({ ...s }));
  }

  getSessionState(sessionId: number): SessionState {
    const session = this.state.sessions[sessionId];
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    return session;
  }

  markSessionDead(sessionId: number): void {
    const session = this.state.sessions[sessionId];
    if (!session) return;
    session.status = 'error';
    session.pid = null;
    session.lastError = 'Process died unexpectedly';
    this.persistState();
  }

  getBotUsername(sessionId: number): string | undefined {
    try {
      return this.getSessionConfig(sessionId).botUsername;
    } catch {
      return undefined;
    }
  }

  // --- Private helpers ---

  private getSessionConfig(sessionId: number): SessionConfig {
    const config = this.config.sessions.find((s) => s.id === sessionId);
    if (!config) {
      throw new Error(`Session config for ID ${sessionId} not found`);
    }
    return config;
  }

  private validateTransition(from: SessionStatus, to: SessionStatus): void {
    const allowed = VALID_TRANSITIONS[from];
    if (!allowed || !allowed.includes(to)) {
      throw new Error(`Invalid state transition: ${from} -> ${to}`);
    }
  }

  private setStatus(sessionId: number, status: SessionStatus): void {
    const session = this.state.sessions[sessionId];
    if (!session) return;
    session.status = status;
    this.persistState();
  }

  private persistState(): void {
    this.state.updatedAt = new Date().toISOString();
    saveState(this.state);
  }

  private createDefaultSessionState(sessionConfig: SessionConfig): SessionState {
    return {
      id: sessionConfig.id,
      name: sessionConfig.name,
      status: 'stopped',
      pid: null,
      mode: sessionConfig.defaultMode ?? this.config.defaultMode,
      startedAt: null,
      restartCount: 0,
      lastError: null,
    };
  }
}
