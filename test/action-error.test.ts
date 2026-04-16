import { describe, it, expect, afterEach, vi } from 'vitest';
import { safeError } from '../src/lib/action-error';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('safeError', () => {
  it('returns the real message in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(safeError(new Error('real detail'))).toBe('real detail');
  });

  it('returns a generic message in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(safeError(new Error('leaks schema: table `staff` not found'))).toMatch(
      /something went wrong/i,
    );
    expect(spy).toHaveBeenCalled();
  });

  it('stringifies non-Error values in development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(safeError('plain string')).toBe('plain string');
    expect(safeError(42)).toBe('42');
  });

  it('logs non-Error values in production without leaking them', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(safeError({ code: 'PGRST301' })).toMatch(/something went wrong/i);
    expect(spy).toHaveBeenCalledWith('[action-error]', { code: 'PGRST301' });
  });
});
