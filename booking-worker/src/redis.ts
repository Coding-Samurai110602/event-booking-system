import Redis from 'ioredis';
import { withExponentialBackoff } from './backoff';

export const QUEUE_KEY       = 'bookings:queue';
export const DEAD_LETTER_KEY = 'bookings:dead-letter';

export async function connectRedis(): Promise<Redis> {
  return withExponentialBackoff(
    async () => {
      const client = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
        lazyConnect:           true,
        maxRetriesPerRequest:  0,    // disable ioredis auto-retry; backoff is ours to control
        enableReadyCheck:      true,
      });
      await client.connect();
      return client;
    },
    'redis',
  );
}
