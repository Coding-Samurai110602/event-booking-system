import http from 'http';

import type { Pool }  from 'pg';
import type { Redis } from 'ioredis';

import { connectRedis }   from './redis';
import { connectPostgres } from './db';
import { runWorker }       from './worker';
import logger              from './logger';

const HEALTH_PORT = parseInt(process.env.HEALTH_PORT ?? '3000', 10);

/**
 * Minimal HTTP server that answers Kubernetes liveness and readiness probes.
 * Uses only Node's built-in `http` module — no extra dependencies.
 *
 * Started AFTER both connections are established, so /ready truly reflects
 * whether the worker can reach its dependencies.
 */
function startHealthServer(pool: Pool, redis: Redis): Promise<void> {
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'GET') {
      res.writeHead(405); res.end(); return;
    }

    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    if (req.url === '/ready') {
      try {
        await pool.query('SELECT 1');
        await redis.ping();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ready' }));
      } catch (err) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'not ready', error: String(err) }));
      }
      return;
    }

    res.writeHead(404); res.end();
  });

  return new Promise((resolve) => {
    server.listen(HEALTH_PORT, () => {
      logger.info({ port: HEALTH_PORT }, 'health_server_started');
      resolve();
    });
  });
}

async function main(): Promise<void> {
  logger.info('booking_worker_starting');

  // Both dependencies use exponential backoff (1 s → 2 s → … capped at 30 s,
  // retried indefinitely), so the process never crash-loops when Redis or
  // Postgres is not yet reachable at container start time.
  const [redis, pool] = await Promise.all([
    connectRedis(),
    connectPostgres(),
  ]);

  // Probe server must be up before we signal readiness to Kubernetes
  await startHealthServer(pool, redis);

  await runWorker(redis, pool);
}

main().catch((err) => {
  process.stderr.write(JSON.stringify({ level: 'fatal', err: String(err) }) + '\n');
  process.exit(1);
});
