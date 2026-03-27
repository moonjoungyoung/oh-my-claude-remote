export type SessionMode = 'yolo' | 'normal' | 'plan';

export type SessionStatus = 'stopped' | 'starting' | 'running' | 'stopping' | 'error' | 'restarting';

export type Platform = 'windows' | 'linux';

export interface SessionConfig {
  id: number;
  name: string;
  credentialKey: string;
  botUsername: string;
  defaultMode?: SessionMode; // overrides global defaultMode if set
  workingDirectory: string;
  autoStart: boolean;
  autoRestart: boolean;
  maxRestarts: number;
}

export interface MasterConfig {
  credentialKey: string;
  notifyChatId: string;
}

export interface HealthCheckConfig {
  intervalSeconds: number;
  unresponsiveThreshold: number;
}

export interface AppConfig {
  version: 1;
  authorizedUsers: number[];
  defaultMode: SessionMode; // global default, used when session doesn't override
  master: MasterConfig;
  sessions: SessionConfig[];
  healthCheck: HealthCheckConfig;
}

export interface SessionState {
  id: number;
  name: string;
  status: SessionStatus;
  pid: number | null;
  mode: SessionMode;
  startedAt: string | null;
  restartCount: number;
  lastError: string | null;
}

export interface StateFile {
  updatedAt: string;
  sessions: Record<number, SessionState>;
}
