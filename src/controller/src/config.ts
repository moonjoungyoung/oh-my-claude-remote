import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import type { AppConfig, StateFile, SessionState } from './types';

// --- Zod Schemas ---

const SessionModeSchema = z.enum(['yolo', 'normal', 'plan']);

const credentialKeySchema = z.string().regex(/^[a-zA-Z0-9_-]+$/, 'credentialKey must only contain alphanumeric, dash, underscore');

const SessionConfigSchema = z.object({
  id: z.number().int().min(1).max(99),
  name: z.string(),
  credentialKey: credentialKeySchema,
  botUsername: z.string(),
  defaultMode: SessionModeSchema,
  workingDirectory: z.string(),
  autoStart: z.boolean(),
  autoRestart: z.boolean(),
  maxRestarts: z.number().int(),
});

const MasterConfigSchema = z.object({
  credentialKey: credentialKeySchema,
  notifyChatId: z.string(),
});

const HealthCheckConfigSchema = z.object({
  intervalSeconds: z.number().int().min(10),
  unresponsiveThreshold: z.number().int().min(60),
});

const AppConfigSchema = z.object({
  version: z.literal(1),
  authorizedUsers: z.array(z.number()),
  master: MasterConfigSchema,
  sessions: z.array(SessionConfigSchema),
  healthCheck: HealthCheckConfigSchema,
});

// --- Helpers ---

export function getProjectRoot(): string {
  // import.meta.dir points to the directory of this file (src/controller/src/)
  // Project root is 3 levels up: src/controller/src -> src/controller -> src -> root
  return path.resolve(import.meta.dir, '..', '..', '..');
}

export function getStateFilePath(): string {
  return path.join(getProjectRoot(), 'state', 'sessions.state.json');
}

// --- Config ---

export function loadConfig(configPath?: string): AppConfig {
  const resolvedPath =
    configPath ??
    process.env.CONFIG_PATH ??
    path.join(getProjectRoot(), 'config', 'sessions.json');

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Config file not found: ${resolvedPath}`);
  }

  const raw = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));
  const config = AppConfigSchema.parse(raw);

  // Validate no duplicate session IDs
  const ids = config.sessions.map((s) => s.id);
  const duplicates = ids.filter((id, idx) => ids.indexOf(id) !== idx);
  if (duplicates.length > 0) {
    throw new Error(`Duplicate session IDs found: ${[...new Set(duplicates)].join(', ')}`);
  }

  return config;
}

// --- State ---

export function loadState(): StateFile {
  const statePath = getStateFilePath();

  const defaultState: StateFile = {
    updatedAt: new Date().toISOString(),
    sessions: {},
  };

  if (!fs.existsSync(statePath)) {
    return defaultState;
  }

  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf-8'));
  } catch {
    console.error(`[loadState] Failed to parse state file: ${statePath}. Returning default state.`);
    return defaultState;
  }
}

export function saveState(state: StateFile): void {
  const statePath = getStateFilePath();
  const stateDir = path.dirname(statePath);

  if (!fs.existsSync(stateDir)) {
    fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  }

  // Atomic write: write to temp file, then rename
  const tmpPath = `${statePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), { encoding: 'utf-8', mode: 0o600 });
  fs.renameSync(tmpPath, statePath);
}

export function initializeState(config: AppConfig): StateFile {
  const sessions: Record<number, SessionState> = {};

  for (const session of config.sessions) {
    sessions[session.id] = {
      id: session.id,
      name: session.name,
      status: 'stopped',
      pid: null,
      mode: session.defaultMode,
      startedAt: null,
      restartCount: 0,
      lastError: null,
    };
  }

  return {
    updatedAt: new Date().toISOString(),
    sessions,
  };
}
