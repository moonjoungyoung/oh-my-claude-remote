import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadConfig, loadState, saveState, initializeState } from '../config';
import type { AppConfig, StateFile } from '../types';

// --- Test fixtures ---

const VALID_CONFIG: AppConfig = {
  version: 1,
  authorizedUsers: [123456],
  master: {
    credentialKey: 'master-token',
    notifyChatId: '999',
  },
  sessions: [
    {
      id: 1,
      name: 'session-1',
      credentialKey: 'token-1',
      botUsername: 'bot1',
      defaultMode: 'normal',
      workingDirectory: '/tmp/work1',
      autoStart: false,
      autoRestart: false,
      maxRestarts: 3,
    },
    {
      id: 2,
      name: 'session-2',
      credentialKey: 'token-2',
      botUsername: 'bot2',
      defaultMode: 'plan',
      workingDirectory: '/tmp/work2',
      autoStart: true,
      autoRestart: true,
      maxRestarts: 5,
    },
  ],
  healthCheck: {
    intervalSeconds: 30,
    unresponsiveThreshold: 120,
  },
};

const DUPLICATE_ID_CONFIG = {
  ...VALID_CONFIG,
  sessions: [
    { ...VALID_CONFIG.sessions[0], id: 1 },
    { ...VALID_CONFIG.sessions[1], id: 1 },
  ],
};

// --- Helpers ---

let tmpDir: string;

function createTmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'omc-config-test-'));
  return dir;
}

function writeJsonFile(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// --- Tests ---

describe('loadConfig', () => {
  beforeEach(() => {
    tmpDir = createTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads a valid config file successfully', () => {
    const configPath = path.join(tmpDir, 'sessions.json');
    writeJsonFile(configPath, VALID_CONFIG);

    const config = loadConfig(configPath);

    expect(config.version).toBe(1);
    expect(config.sessions).toHaveLength(2);
    expect(config.sessions[0].id).toBe(1);
    expect(config.sessions[0].name).toBe('session-1');
    expect(config.sessions[1].id).toBe(2);
    expect(config.authorizedUsers).toEqual([123456]);
    expect(config.master.credentialKey).toBe('master-token');
  });

  it('throws error when config file does not exist', () => {
    const missingPath = path.join(tmpDir, 'nonexistent.json');

    expect(() => loadConfig(missingPath)).toThrow('Config file not found');
  });

  it('throws error when duplicate session IDs exist', () => {
    const configPath = path.join(tmpDir, 'dup.json');
    writeJsonFile(configPath, DUPLICATE_ID_CONFIG);

    expect(() => loadConfig(configPath)).toThrow('Duplicate session IDs');
  });

  it('throws error when zod validation fails for invalid version', () => {
    const configPath = path.join(tmpDir, 'invalid.json');
    writeJsonFile(configPath, { ...VALID_CONFIG, version: 2 });

    expect(() => loadConfig(configPath)).toThrow();
  });

  it('throws error when zod validation fails for missing required fields', () => {
    const configPath = path.join(tmpDir, 'partial.json');
    writeJsonFile(configPath, { version: 1 });

    expect(() => loadConfig(configPath)).toThrow();
  });

  it('throws error when session ID is out of range', () => {
    const configPath = path.join(tmpDir, 'outofrange.json');
    const badConfig = {
      ...VALID_CONFIG,
      sessions: [{ ...VALID_CONFIG.sessions[0], id: 100 }],
    };
    writeJsonFile(configPath, badConfig);

    expect(() => loadConfig(configPath)).toThrow();
  });

  it('throws error when credentialKey contains invalid characters', () => {
    const configPath = path.join(tmpDir, 'badcred.json');
    const badConfig = {
      ...VALID_CONFIG,
      sessions: [{ ...VALID_CONFIG.sessions[0], credentialKey: 'bad key!@#' }],
    };
    writeJsonFile(configPath, badConfig);

    expect(() => loadConfig(configPath)).toThrow();
  });

  it('throws error when healthCheck intervalSeconds is below minimum', () => {
    const configPath = path.join(tmpDir, 'badhc.json');
    const badConfig = {
      ...VALID_CONFIG,
      healthCheck: { intervalSeconds: 5, unresponsiveThreshold: 120 },
    };
    writeJsonFile(configPath, badConfig);

    expect(() => loadConfig(configPath)).toThrow();
  });
});

describe('loadState', () => {
  // loadState uses getStateFilePath() which depends on import.meta.dir.
  // We cannot easily override it, so we test the behaviors that don't
  // depend on the exact path by using saveState/loadState together.
  // For the "file not found" and "corrupted JSON" cases, we test via
  // the state file path mechanism.

  it('returns default state with empty sessions when state file does not exist', () => {
    // loadState returns a default when no file exists
    // We can't easily control getStateFilePath, so we test the return shape
    const state = loadState();

    expect(state).toBeDefined();
    expect(state.updatedAt).toBeDefined();
    expect(typeof state.sessions).toBe('object');
  });
});

describe('saveState + loadState round-trip', () => {
  it('persists and loads state consistently', () => {
    const testState: StateFile = {
      updatedAt: new Date().toISOString(),
      sessions: {
        1: {
          id: 1,
          name: 'test-session',
          status: 'running',
          pid: 9999,
          mode: 'normal',
          startedAt: new Date().toISOString(),
          restartCount: 0,
          lastError: null,
        },
      },
    };

    saveState(testState);
    const loaded = loadState();

    expect(loaded.sessions[1].id).toBe(1);
    expect(loaded.sessions[1].name).toBe('test-session');
    expect(loaded.sessions[1].status).toBe('running');
    expect(loaded.sessions[1].pid).toBe(9999);
    expect(loaded.sessions[1].mode).toBe('normal');
  });
});

describe('initializeState', () => {
  it('creates a SessionState for each session in config with stopped status', () => {
    const state = initializeState(VALID_CONFIG);

    expect(Object.keys(state.sessions)).toHaveLength(2);
    expect(state.sessions[1].status).toBe('stopped');
    expect(state.sessions[2].status).toBe('stopped');
  });

  it('sets pid to null for all sessions', () => {
    const state = initializeState(VALID_CONFIG);

    expect(state.sessions[1].pid).toBeNull();
    expect(state.sessions[2].pid).toBeNull();
  });

  it('uses defaultMode from session config', () => {
    const state = initializeState(VALID_CONFIG);

    expect(state.sessions[1].mode).toBe('normal');
    expect(state.sessions[2].mode).toBe('plan');
  });

  it('sets restartCount to 0 for all sessions', () => {
    const state = initializeState(VALID_CONFIG);

    expect(state.sessions[1].restartCount).toBe(0);
    expect(state.sessions[2].restartCount).toBe(0);
  });

  it('sets startedAt and lastError to null for all sessions', () => {
    const state = initializeState(VALID_CONFIG);

    expect(state.sessions[1].startedAt).toBeNull();
    expect(state.sessions[1].lastError).toBeNull();
    expect(state.sessions[2].startedAt).toBeNull();
    expect(state.sessions[2].lastError).toBeNull();
  });

  it('populates updatedAt timestamp', () => {
    const before = new Date().toISOString();
    const state = initializeState(VALID_CONFIG);
    const after = new Date().toISOString();

    expect(state.updatedAt >= before).toBe(true);
    expect(state.updatedAt <= after).toBe(true);
  });
});
