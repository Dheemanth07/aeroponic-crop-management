import { query } from '../../db/client.js';

export interface YieldReportRow {
  group_by: string;
  total_harvested_weight: number;
  batches_harvested: number;
  avg_days_to_harvest: number;
}

export class ReportsRepository {
  /**
   * PART 3c: Single SQL Yield Report Query
   * Computes total harvested weight, count of batches, and average cycle duration in days
   * grouped by either crop or zone in a single SQL query with no application loops.
   */
  async getYieldReport(
    from: string,
    to: string,
    groupBy: 'crop' | 'zone'
  ): Promise<YieldReportRow[]> {
    // Whitelist column to prevent SQL injection
    const targetColumn = groupBy === 'crop' ? 'b.crop' : 't.zone';

    const sql = `
      SELECT 
        ${targetColumn} AS group_by,
        COALESCE(SUM(h.weight_grams), 0)::bigint AS total_harvested_weight,
        COUNT(h.id)::int AS batches_harvested,
        ROUND(
          COALESCE(
            AVG(h.harvested_on::date - b.seeded_on::date),
            0
          ), 
          2
        ) AS avg_days_to_harvest
      FROM harvests h
      JOIN batches b ON h.batch_id = b.id
      JOIN trays t ON b.tray_id = t.id
      WHERE h.harvested_on >= $1 AND h.harvested_on <= $2
      GROUP BY ${targetColumn}
      ORDER BY total_harvested_weight DESC;
    `;

    const res = await query<YieldReportRow>(sql, [from, to]);
    return res.rows.map(row => ({
      group_by: row.group_by,
      total_harvested_weight: Number(row.total_harvested_weight),
      batches_harvested: Number(row.batches_harvested),
      avg_days_to_harvest: Number(row.avg_days_to_harvest)
    }));
  }
}

export const reportsRepository = new ReportsRepository();
