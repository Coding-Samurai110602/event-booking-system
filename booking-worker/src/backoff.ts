import logger from './logger';

type SleepFn = (ms: number) => Promise<void>;

const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export interface BackoffOptions {
  initialDelay?: number;
  maxDelay?: number;
  /** Injectable sleep — override in tests to avoid real waits and assert delays. */
  sleep?: SleepFn;
}

/**
 * Calls `operation` repeatedly until it resolves.
 *
 * On each failure the wait doubles from `initialDelay`, capped at `maxDelay`.
 * Every retry attempt is logged so the delay sequence is visible in logs.
 * Retries indefinitely — callers are responsible for any process-level timeout.
 *
 * Delay sequence (defaults): 1 s → 2 s → 4 s → … → 30 s → 30 s → …
 */
export async function withExponentialBackoff<T>(
  operation: () => Promise<T>,
  label: string,
  { initialDelay = 1_000, maxDelay = 30_000, sleep = defaultSleep }: BackoffOptions = {},
): Promise<T> {
  let delay = initialDelay;
  let attempt = 0;

  for (;;) {
    attempt++;
    try {
      const result = await operation();
      logger.info({ label, attempt }, 'connected');
      return result;
    } catch (err) {
      logger.warn({ label, attempt, delay_ms: delay, err: String(err) }, 'connect_failed_retrying');
      await sleep(delay);
      delay = Math.min(delay * 2, maxDelay);
    }
  }
}
