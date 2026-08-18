import express from 'express';
import { liveAvailability } from './sse';
import { getPool } from './db';
import logger from './logger';

const app  = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

// ── Probes ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.get('/ready', async (_req, res) => {
  try {
    await getPool().query('SELECT 1');
    res.json({ status: 'ready' });
  } catch (err) {
    logger.warn({ err: String(err) }, 'readiness_check_failed');
    res.status(503).json({ status: 'not ready', error: String(err) });
  }
});

// ── SSE ──────────────────────────────────────────────────────────────────────

app.get('/events/:event_id/live', liveAvailability);

// ── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'status_service_started');
});
