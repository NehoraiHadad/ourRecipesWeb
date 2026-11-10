import { config } from 'dotenv';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
// Production deploys apply additive changes before compiling the application.
// Local builds and preview deploys must not mutate a shared production database.
if (process.argv.includes('--on-deploy') && process.env.VERCEL_ENV !== 'production') {
  console.log('Skipping deployment schema setup outside Vercel production.');
  process.exit(0);
}
config({ path: '.env.local', quiet: true });
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  await client.query(await readFile('prisma/sql/timer-push.sql', 'utf8'));
  console.log('Added Timer Push tables and indexes without changing existing recipe tables.');
} finally { await client.end(); }
