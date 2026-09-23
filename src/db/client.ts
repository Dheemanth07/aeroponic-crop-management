import pg, { type Pool, type PoolClient, type QueryResult } from 'pg';
import { newDb, DataType } from 'pg-mem';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';

let poolInstance: Pool | null = null;

// Build an in-memory PostgreSQL instance for zero-dependency testing and clean execution
export function createMemoryDbPool(): Pool {
  const memDb = newDb();

  // Register native UUID generator for compatibility with gen_random_uuid()
  memDb.public.registerFunction({
    name: 'gen_random_uuid',
    returns: DataType.uuid,
    impure: true,
    implementation: () => randomUUID()
  });

  // Register ROUND function for math calculations
  memDb.public.registerFunction({
    name: 'round',
    args: [DataType.float, DataType.integer],
    returns: DataType.float,
    implementation: (val: number, decimals: number) => {
      const factor = Math.pow(10, decimals);
      return Math.round(val * factor) / factor;
    }
  });

  // Find and load schema.sql
  const possiblePaths = [
    path.resolve(process.cwd(), 'schema.sql'),
    path.resolve(process.cwd(), '../../schema.sql')
  ];
  let schemaSql = '';
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      schemaSql = fs.readFileSync(p, 'utf8');
      break;
    }
  }

  if (schemaSql) {
    // Strip out CREATE EXTENSION since pg-mem doesn't need external C libraries
    const sanitized = schemaSql.replace(/CREATE EXTENSION[^\n]+/gi, '');
    memDb.public.none(sanitized);
  }

  const { Pool: MemPool } = memDb.adapters.createPg();
  return new MemPool() as unknown as Pool;
}

export function getPool(): Pool {
  if (poolInstance) {
    return poolInstance;
  }

  // If in test mode and no explicit external DATABASE_URL is configured, use memory pool
  const useMemDb = process.env.USE_IN_MEMORY_DB === 'true' || 
                   (config.isTest && !process.env.DATABASE_URL);

  if (useMemDb) {
    poolInstance = createMemoryDbPool();
    return poolInstance;
  }

  poolInstance = new pg.Pool({
    connectionString: config.databaseUrl,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  });

  return poolInstance;
}

export async function setTestPool(customPool: Pool): Promise<void> {
  if (poolInstance) {
    await poolInstance.end().catch(() => {});
  }
  poolInstance = customPool;
}

// Helper to execute single query
export async function query<T extends pg.QueryResultRow = any>(
  text: string, 
  params?: any[]
): Promise<QueryResult<T>> {
  const pool = getPool();
  return pool.query<T>(text, params);
}

// Helper for atomic multi-statement database transactions
export async function withTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end().catch(() => {});
    poolInstance = null;
  }
}
