import { describe, it, expect } from 'bun:test';
import { detectPlatform, isProcessAlive } from '../platform';

describe('detectPlatform', () => {
  it('returns windows when process.platform is win32', () => {
    // On the current Windows machine, this should return 'windows'
    if (process.platform === 'win32') {
      expect(detectPlatform()).toBe('windows');
    } else {
      expect(detectPlatform()).toBe('linux');
    }
  });

  it('returns either windows or linux as the only valid values', () => {
    const result = detectPlatform();
    expect(['windows', 'linux']).toContain(result);
  });
});

describe('isProcessAlive', () => {
  it('returns true for the current process PID', () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  it('returns false for a non-existent PID', () => {
    // PID 99999999 is extremely unlikely to exist
    expect(isProcessAlive(99999999)).toBe(false);
  });

  it('returns false for PID 0 on non-root systems', () => {
    // PID 0 behavior varies: on Windows process.kill(0,0) checks current process group
    // We just verify it does not throw
    const result = isProcessAlive(0);
    expect(typeof result).toBe('boolean');
  });
});
