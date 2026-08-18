import { Pool } from 'pg';
import { withExponentialBackoff } from './backoff';

// DB_SSL=true  → enable SSL (required for RDS; set in k8s/secret.yaml or env)
// DB_SSL unset → no SSL (local Docker Compose / Minikube with in-cluster Postgres)
function sslConfig(): object | false {
  if (process.env.DB_SSL !== 'true') return false;
  // rejectUnauthorized: false accepts any valid RDS certificate without
  // pinning the CA bundle.  Adequate for dev/staging.
  // For production, replace with:
  //   { ca: fs.readFileSync('/certs/rds-ca.pem').toString() }
  // and mount the RDS CA bundle (downloadable from AWS docs) as a Secret.
  return { rejectUnauthorized: false };
}

export async function connectPostgres(): Promise<Pool> {
  return withExponentialBackoff(
    async () => {
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: sslConfig(),
      });
      // Acquire and immediately release a connection to verify reachability
      const c = await pool.connect();
      c.release();
      return pool;
    },
    'postgres',
  );
}
