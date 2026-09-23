import { query } from '../../db/client.js';
import { Batch, BatchStage } from '../../types/index.js';
import { ListBatchesQuery } from './batches.schema.js';

export interface BatchWithZone extends Batch {
  zone?: string;
  tray_code?: string;
}

export class BatchesRepository {
  async create(
    trayId: string,
    crop: string,
    expectedHarvestOn: string | Date,
    seededOn?: string | Date
  ): Promise<Batch> {
    const text = `
      INSERT INTO batches (tray_id, crop, seeded_on, expected_harvest_on, stage)
      VALUES ($1, $2, COALESCE($3, NOW()), $4, 'SEEDED')
      RETURNING id, tray_id, crop, seeded_on, stage, expected_harvest_on, created_at;
    `;
    const res = await query<Batch>(text, [
      trayId,
      crop,
      seededOn || null,
      expectedHarvestOn
    ]);
    return res.rows[0];
  }

  async findById(id: string): Promise<Batch | null> {
    const text = `
      SELECT id, tray_id, crop, seeded_on, stage, expected_harvest_on, created_at
      FROM batches
      WHERE id = $1;
    `;
    const res = await query<Batch>(text, [id]);
    return res.rows[0] || null;
  }

  // Find any active batch currently occupying the tray (not HARVESTED)
  async findActiveByTrayId(trayId: string): Promise<Batch | null> {
    const text = `
      SELECT id, tray_id, crop, seeded_on, stage, expected_harvest_on, created_at
      FROM batches
      WHERE tray_id = $1 AND stage != 'HARVESTED'
      LIMIT 1;
    `;
    const res = await query<Batch>(text, [trayId]);
    return res.rows[0] || null;
  }

  async updateStage(id: string, stage: BatchStage): Promise<Batch> {
    const text = `
      UPDATE batches
      SET stage = $1
      WHERE id = $2
      RETURNING id, tray_id, crop, seeded_on, stage, expected_harvest_on, created_at;
    `;
    const res = await query<Batch>(text, [stage, id]);
    return res.rows[0];
  }

  async findAllWithPagination(
    filters: ListBatchesQuery
  ): Promise<{ data: BatchWithZone[]; total: number; page: number; limit: number; totalPages: number }> {
    const { stage, crop, zone, page, limit } = filters;
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];

    if (stage) {
      params.push(stage);
      conditions.push(`b.stage = $${params.length}`);
    }

    if (crop) {
      params.push(`%${crop}%`);
      conditions.push(`b.crop ILIKE $${params.length}`);
    }

    if (zone) {
      params.push(zone);
      conditions.push(`t.zone = $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Total count query
    const countSql = `
      SELECT COUNT(b.id)::int AS count
      FROM batches b
      JOIN trays t ON b.tray_id = t.id
      ${whereClause};
    `;
    const countRes = await query<{ count: number }>(countSql, params);
    const total = countRes.rows[0]?.count || 0;

    // Data query
    const dataSql = `
      SELECT 
        b.id, b.tray_id, b.crop, b.seeded_on, b.stage, b.expected_harvest_on, b.created_at,
        t.zone, t.code AS tray_code
      FROM batches b
      JOIN trays t ON b.tray_id = t.id
      ${whereClause}
      ORDER BY b.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2};
    `;

    const dataRes = await query<BatchWithZone>(dataSql, [...params, limit, offset]);

    return {
      data: dataRes.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1
    };
  }
}

export const batchesRepository = new BatchesRepository();
