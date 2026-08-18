import { Pool } from 'pg';

// DB_SSL=true  → require SSL (set via ConfigMap for RDS)
// DB_SSL unset → no SSL (local Docker Compose / Minikube in-cluster Postgres)
// For production, replace rejectUnauthorized: false with the RDS CA bundle:
//   { ca: fs.readFileSync('/certs/rds-ca.pem').toString() }
function sslConfig(): object | false {
  return process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false;
}

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: sslConfig(),
    });
  }
  return pool;
}
