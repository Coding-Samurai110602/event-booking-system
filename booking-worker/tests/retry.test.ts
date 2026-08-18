/**
 * Unit tests for the exponential-backoff helper (withExponentialBackoff).
 *
 * The `sleep` function is injected rather than relying on real timers, so
 * the tests complete instantly and the delay sequence can be asserted exactly.
 */

// __esModule: true tells ts-jest's __importDefault helper that this object
// already has the correct shape, preventing it from double-wrapping the default.
jest.mock('../src/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { withExponentialBackoff } from '../src/backoff';

describe('withExponentialBackoff', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns immediately when the operation succeeds on the first attempt', async () => {
    const sleep = jest.fn<Promise<void>, [number]>().mockResolvedValue(undefined);
    const op    = jest.fn().mockResolvedValue('ok');

    const result = await withExponentialBackoff(op, 'test', { sleep });

    expect(result).toBe('ok');
    expect(op).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries with doubling delays and resolves once the operation succeeds', async () => {
    const sleep = jest.fn<Promise<void>, [number]>().mockResolvedValue(undefined);

    let calls = 0;
    const op = jest.fn().mockImplementation(async () => {
      if (++calls < 4) throw new Error('not ready');
      return 'connected';
    });

    const result = await withExponentialBackoff(op, 'test', {
      initialDelay: 1_000,
      maxDelay:     30_000,
      sleep,
    });

    expect(result).toBe('connected');
    expect(op).toHaveBeenCalledTimes(4);

    // 3 failed attempts → 3 sleeps: 1 s, 2 s, 4 s
    expect(sleep).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 1_000);
    expect(sleep).toHaveBeenNthCalledWith(2, 2_000);
    expect(sleep).toHaveBeenNthCalledWith(3, 4_000);
  });

  it('caps the delay at maxDelay and holds it there', async () => {
    const sleep = jest.fn<Promise<void>, [number]>().mockResolvedValue(undefined);

    let calls = 0;
    // 6 failures → delays: 1000, 2000, 4000, 8000, 10000 (capped), 10000 (capped)
    const op = jest.fn().mockImplementation(async () => {
      if (++calls < 7) throw new Error('not ready');
      return 'ok';
    });

    await withExponentialBackoff(op, 'test', {
      initialDelay: 1_000,
      maxDelay:     10_000,
      sleep,
    });

    expect(sleep).toHaveBeenCalledTimes(6);
    expect(sleep).toHaveBeenNthCalledWith(1, 1_000);
    expect(sleep).toHaveBeenNthCalledWith(2, 2_000);
    expect(sleep).toHaveBeenNthCalledWith(3, 4_000);
    expect(sleep).toHaveBeenNthCalledWith(4, 8_000);
    expect(sleep).toHaveBeenNthCalledWith(5, 10_000); // 16 000 capped to 10 000
    expect(sleep).toHaveBeenNthCalledWith(6, 10_000); // stays capped
  });

  it('logs a warning on every failed attempt', async () => {
    const sleep = jest.fn<Promise<void>, [number]>().mockResolvedValue(undefined);
    const { default: logger } = await import('../src/logger');

    let calls = 0;
    const op = jest.fn().mockImplementation(async () => {
      if (++calls < 3) throw new Error('busy');
      return 'done';
    });

    await withExponentialBackoff(op, 'pg', { sleep });

    // Two failures → two warn calls
    expect((logger.warn as jest.Mock)).toHaveBeenCalledTimes(2);
    const firstWarnArg = (logger.warn as jest.Mock).mock.calls[0][0] as Record<string, unknown>;
    expect(firstWarnArg).toMatchObject({ label: 'pg', attempt: 1, delay_ms: 1_000 });
  });
});
