import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createMemoryDbPool, setTestPool, closePool } from '../src/db/client.js';

export interface TestContext {
  app: FastifyInstance;
}

export async function createTestApp(): Promise<FastifyInstance> {
  // Use isolated in-memory PostgreSQL instance for each test suite
  const memPool = createMemoryDbPool();
  await setTestPool(memPool);

  const app = buildApp();
  await app.ready();
  return app;
}

export async function teardownTestApp(app: FastifyInstance): Promise<void> {
  await app.close();
  await closePool();
}
