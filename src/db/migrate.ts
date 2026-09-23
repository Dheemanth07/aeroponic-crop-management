import fs from 'node:fs';
import path from 'node:path';
import { query, closePool } from './client.js';

export async function runMigrations(): Promise<void> {
  const schemaPath = path.resolve(process.cwd(), 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`schema.sql not found at ${schemaPath}`);
  }

  console.log(`Running schema migration from ${schemaPath}...`);
  const sql = fs.readFileSync(schemaPath, 'utf8');

  try {
    await query(sql);
    console.log('Migration completed successfully: All tables, constraints, and indexes created.');
  } catch (err) {
    console.error('Migration failed:', err);
    throw err;
  }
}

// Allow direct execution: `npx tsx src/db/migrate.ts`
if (process.argv[1] && process.argv[1].endsWith('migrate.ts')) {
  runMigrations()
    .then(async () => {
      await closePool();
      process.exit(0);
    })
    .catch(async () => {
      await closePool();
      process.exit(1);
    });
}
