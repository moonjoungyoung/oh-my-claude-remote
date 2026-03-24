import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { handleStart } from '../commands/start';
import { handleStop } from '../commands/stop';
import { handleStatus } from '../commands/status';
import { handleMode } from '../commands/mode';
import type { SessionManager } from '../session-manager';
import type { SessionState } from '../types';

// --- Mock helpers ---

function createMockCtx(text: string) {
  return {
    message: { text },
    reply: mock(() => Promise.resolve()),
  };
}

function createRunningSession(id: number, name: string, mode = 'normal' as const): SessionState {
  return {
    id,
    name,
    status: 'running',
    pid: 12345 + id,
    mode,
    startedAt: '2025-01-01T00:00:00Z',
    restartCount: 0,
    lastError: null,
  };
}

function createStoppedSession(id: number, name: string, mode = 'normal' as const): SessionState {
  return {
    id,
    name,
    status: 'stopped',
    pid: null,
    mode,
    startedAt: null,
    restartCount: 0,
    lastError: null,
  };
}

function createMockSessionManager(overrides?: Record<string, unknown>): SessionManager {
  return {
    startSession: mock(() => Promise.resolve(createRunningSession(1, 'worker-1'))),
    stopSession: mock(() => Promise.resolve(createStoppedSession(1, 'worker-1'))),
    restartSession: mock(() => Promise.resolve(createRunningSession(1, 'worker-1'))),
    getAllStates: mock(() => [
      createRunningSession(1, 'worker-1'),
      createStoppedSession(2, 'worker-2'),
    ]),
    getSessionState: mock((id: number) => {
      if (id === 1) return createRunningSession(1, 'worker-1');
      if (id === 2) return createStoppedSession(2, 'worker-2');
      throw new Error(`Session ${id} not found`);
    }),
    changeMode: mock((id: number, mode: string) => ({
      state: { ...createStoppedSession(id, 'worker-1'), mode },
      needsRestart: false,
    })),
    getBotUsername: mock((id: number) => (id === 1 ? 'bot1' : undefined)),
    markSessionDead: mock(() => {}),
    startAll: mock(() => Promise.resolve()),
    stopAll: mock(() => Promise.resolve()),
    ...overrides,
  } as unknown as SessionManager;
}

// --- handleStart tests ---

describe('handleStart', () => {
  it('starts a session with a valid ID and replies with success', async () => {
    const ctx = createMockCtx('/run 1');
    const sm = createMockSessionManager();

    await handleStart(ctx as any, sm);

    expect(sm.startSession).toHaveBeenCalledWith(1);
    expect(ctx.reply).toHaveBeenCalled();
    const replyArg = (ctx.reply as any).mock.calls[0][0] as string;
    expect(replyArg).toContain('Session 1');
    expect(replyArg).toContain('started');
  });

  it('includes bot chat link in reply when botUsername exists', async () => {
    const ctx = createMockCtx('/run 1');
    const sm = createMockSessionManager();

    await handleStart(ctx as any, sm);

    const replyArg = (ctx.reply as any).mock.calls[0][0] as string;
    expect(replyArg).toContain('https://t.me/bot1');
  });

  it('replies with usage when no session ID is provided', async () => {
    const ctx = createMockCtx('/run');
    const sm = createMockSessionManager();

    await handleStart(ctx as any, sm);

    const replyArg = (ctx.reply as any).mock.calls[0][0] as string;
    expect(replyArg).toContain('Usage');
  });

  it('replies with error when session ID is not a number', async () => {
    const ctx = createMockCtx('/run abc');
    const sm = createMockSessionManager();

    await handleStart(ctx as any, sm);

    const replyArg = (ctx.reply as any).mock.calls[0][0] as string;
    expect(replyArg).toContain('Invalid session number');
  });

  it('replies with error message when startSession throws', async () => {
    const ctx = createMockCtx('/run 99');
    const sm = createMockSessionManager({
      startSession: mock(() => Promise.reject(new Error('Session 99 not found'))),
    });

    await handleStart(ctx as any, sm);

    const replyArg = (ctx.reply as any).mock.calls[0][0] as string;
    expect(replyArg).toContain('Session 99 not found');
  });

  it('replies with error when startSession returns error status', async () => {
    const ctx = createMockCtx('/run 1');
    const errorSession: SessionState = {
      ...createStoppedSession(1, 'worker-1'),
      status: 'error',
      lastError: 'spawn failed',
    };
    const sm = createMockSessionManager({
      startSession: mock(() => Promise.resolve(errorSession)),
    });

    await handleStart(ctx as any, sm);

    const replyArg = (ctx.reply as any).mock.calls[0][0] as string;
    expect(replyArg).toContain('Failed to start');
    expect(replyArg).toContain('spawn failed');
  });
});

// --- handleStop tests ---

describe('handleStop', () => {
  it('stops a running session and replies with success', async () => {
    const ctx = createMockCtx('/kill 1');
    const sm = createMockSessionManager();

    await handleStop(ctx as any, sm);

    expect(sm.stopSession).toHaveBeenCalledWith(1);
    const replyArg = (ctx.reply as any).mock.calls[0][0] as string;
    expect(replyArg).toContain('Session 1');
    expect(replyArg).toContain('stopped');
  });

  it('replies with already stopped message when session is stopped', async () => {
    const ctx = createMockCtx('/kill 2');
    const sm = createMockSessionManager();

    await handleStop(ctx as any, sm);

    const replyArg = (ctx.reply as any).mock.calls[0][0] as string;
    expect(replyArg).toContain('already stopped');
  });

  it('replies with usage when no session ID is provided', async () => {
    const ctx = createMockCtx('/kill');
    const sm = createMockSessionManager();

    await handleStop(ctx as any, sm);

    const replyArg = (ctx.reply as any).mock.calls[0][0] as string;
    expect(replyArg).toContain('Usage');
  });

  it('replies with error when session ID is not a number', async () => {
    const ctx = createMockCtx('/kill xyz');
    const sm = createMockSessionManager();

    await handleStop(ctx as any, sm);

    const replyArg = (ctx.reply as any).mock.calls[0][0] as string;
    expect(replyArg).toContain('Invalid session number');
  });

  it('replies with error when getSessionState throws', async () => {
    const ctx = createMockCtx('/kill 99');
    const sm = createMockSessionManager({
      getSessionState: mock(() => { throw new Error('Session 99 not found'); }),
    });

    await handleStop(ctx as any, sm);

    const replyArg = (ctx.reply as any).mock.calls[0][0] as string;
    expect(replyArg).toContain('Session 99 not found');
  });
});

// --- handleStatus tests ---

describe('handleStatus', () => {
  it('displays all session statuses', async () => {
    const ctx = createMockCtx('/status');
    const sm = createMockSessionManager();

    await handleStatus(ctx as any, sm);

    expect(ctx.reply).toHaveBeenCalled();
    const replyArg = (ctx.reply as any).mock.calls[0][0] as string;
    expect(replyArg).toContain('worker-1');
    expect(replyArg).toContain('worker-2');
    expect(replyArg).toContain('RUN');
    expect(replyArg).toContain('STOP');
  });

  it('shows bot link for running sessions', async () => {
    const ctx = createMockCtx('/status');
    const sm = createMockSessionManager();

    await handleStatus(ctx as any, sm);

    const replyArg = (ctx.reply as any).mock.calls[0][0] as string;
    expect(replyArg).toContain('https://t.me/bot1');
  });

  it('shows PID for running sessions', async () => {
    const ctx = createMockCtx('/status');
    const sm = createMockSessionManager();

    await handleStatus(ctx as any, sm);

    const replyArg = (ctx.reply as any).mock.calls[0][0] as string;
    expect(replyArg).toContain('PID:12346');
  });

  it('replies with no sessions message when there are none', async () => {
    const ctx = createMockCtx('/status');
    const sm = createMockSessionManager({
      getAllStates: mock(() => []),
    });

    await handleStatus(ctx as any, sm);

    const replyArg = (ctx.reply as any).mock.calls[0][0] as string;
    expect(replyArg).toContain('No sessions configured');
  });
});

// --- handleMode tests ---

describe('handleMode', () => {
  it('changes mode for a stopped session and replies with success', async () => {
    const ctx = createMockCtx('/mode 1 normal');
    const sm = createMockSessionManager();

    await handleMode(ctx as any, sm);

    expect(sm.changeMode).toHaveBeenCalledWith(1, 'normal');
    const replyArg = (ctx.reply as any).mock.calls[0][0] as string;
    expect(replyArg).toContain('mode changed to NORMAL');
  });

  it('replies with needsRestart message when session is running', async () => {
    const ctx = createMockCtx('/mode 1 plan');
    const sm = createMockSessionManager({
      changeMode: mock(() => ({
        state: createRunningSession(1, 'worker-1', 'plan' as any),
        needsRestart: true,
      })),
    });

    await handleMode(ctx as any, sm);

    const replyArg = (ctx.reply as any).mock.calls[0][0] as string;
    expect(replyArg).toContain('will change to PLAN');
    expect(replyArg).toContain('next restart');
  });

  it('requires confirm argument for yolo mode', async () => {
    const ctx = createMockCtx('/mode 1 yolo');
    const sm = createMockSessionManager();

    await handleMode(ctx as any, sm);

    const replyArg = (ctx.reply as any).mock.calls[0][0] as string;
    expect(replyArg).toContain('unrestricted');
    expect(replyArg).toContain('confirm');
    // changeMode should NOT have been called
    expect(sm.changeMode).not.toHaveBeenCalled();
  });

  it('allows yolo mode with confirm argument', async () => {
    const ctx = createMockCtx('/mode 1 yolo confirm');
    const sm = createMockSessionManager({
      changeMode: mock(() => ({
        state: { ...createStoppedSession(1, 'worker-1'), mode: 'yolo' },
        needsRestart: false,
      })),
    });

    await handleMode(ctx as any, sm);

    expect(sm.changeMode).toHaveBeenCalledWith(1, 'yolo');
  });

  it('replies with usage when session ID or mode is missing', async () => {
    const ctx = createMockCtx('/mode');
    const sm = createMockSessionManager();

    await handleMode(ctx as any, sm);

    const replyArg = (ctx.reply as any).mock.calls[0][0] as string;
    expect(replyArg).toContain('Usage');
  });

  it('replies with error for invalid mode', async () => {
    const ctx = createMockCtx('/mode 1 turbo');
    const sm = createMockSessionManager();

    await handleMode(ctx as any, sm);

    const replyArg = (ctx.reply as any).mock.calls[0][0] as string;
    expect(replyArg).toContain('Invalid mode');
  });

  it('replies with error when session ID is not a number', async () => {
    const ctx = createMockCtx('/mode abc normal');
    const sm = createMockSessionManager();

    await handleMode(ctx as any, sm);

    const replyArg = (ctx.reply as any).mock.calls[0][0] as string;
    expect(replyArg).toContain('Invalid session number');
  });

  it('replies with error when changeMode throws', async () => {
    const ctx = createMockCtx('/mode 99 normal');
    const sm = createMockSessionManager({
      changeMode: mock(() => { throw new Error('Session 99 not found'); }),
    });

    await handleMode(ctx as any, sm);

    const replyArg = (ctx.reply as any).mock.calls[0][0] as string;
    expect(replyArg).toContain('Failed to change mode');
    expect(replyArg).toContain('Session 99 not found');
  });
});
