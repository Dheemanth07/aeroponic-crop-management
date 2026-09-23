import { query, withTransaction } from '../../db/client.js';
import { Batch, Harvest, HarvestGrade } from '../../types/index.js';

export interface IdempotencyRecord {
  key: string;
  batch_id: string;
  response_status: number;
  response_body: any;
  created_at: Date;
  expires_at: Date;
}

export class HarvestsRepository {
  async findByBatchId(batchId: string): Promise<Harvest | null> {
    const text = `
      SELECT id, batch_id, harvested_on, weight_grams, grade, created_at
      FROM harvests
      WHERE batch_id = $1;
    `;
    const res = await query<Harvest>(text, [batchId]);
    return res.rows[0] || null;
  }

  // Atomic database transaction: insert harvest record AND update batch stage to HARVESTED
  async recordHarvestAtomic(
    batchId: string,
    weightGrams: number,
    grade: HarvestGrade,
    harvestedOn?: string | Date
  ): Promise<{ harvest: Harvest; batch: Batch }> {
    return withTransaction(async (client) => {
      // 1. Insert harvest record
      const harvestSql = `
        INSERT INTO harvests (batch_id, harvested_on, weight_grams, grade)
        VALUES ($1, COALESCE($2, NOW()), $3, $4)
        RETURNING id, batch_id, harvested_on, weight_grams, grade, created_at;
      `;
      const harvestRes = await client.query<Harvest>(harvestSql, [
        batchId,
        harvestedOn || null,
        weightGrams,
        grade
      ]);

      // 2. Advance batch stage to HARVESTED (freeing the tray)
      const batchSql = `
        UPDATE batches
        SET stage = 'HARVESTED'
        WHERE id = $1
        RETURNING id, tray_id, crop, seeded_on, stage, expected_harvest_on, created_at;
      `;
      const batchRes = await client.query<Batch>(batchSql, [batchId]);

      return {
        harvest: harvestRes.rows[0],
        batch: batchRes.rows[0]
      };
    });
  }

  // Idempotency: Lookup cached response for an idempotency key
  async getIdempotencyRecord(key: string): Promise<IdempotencyRecord | null> {
    const text = `
      SELECT key, batch_id, response_status, response_body, created_at, expires_at
      FROM idempotency_keys
      WHERE key = $1 AND expires_at > NOW();
    `;
    const res = await query<IdempotencyRecord>(text, [key]);
    return res.rows[0] || null;
  }

  // Idempotency: Save response payload with a 24-hour expiration
  async saveIdempotencyRecord(
    key: string,
    batchId: string,
    responseStatus: number,
    responseBody: any
  ): Promise<void> {
    const text = `
      INSERT INTO idempotency_keys (key, batch_id, response_status, response_body, expires_at)
      VALUES ($1, $2, $3, $4, NOW() + INTERVAL '24 hours')
      ON CONFLICT (key) DO NOTHING;
    `;
    await query(text, [
      key,
      batchId,
      responseStatus,
      JSON.stringify(responseBody)
    ]);
  }
}

export const harvestsRepository = new HarvestsRepository();
