import { query } from '../../db/client.js';
import { Tray } from '../../types/index.js';

export class TraysRepository {
  async create(code: string, zone: string, capacityUnits: number): Promise<Tray> {
    const text = `
      INSERT INTO trays (code, zone, capacity_units)
      VALUES ($1, $2, $3)
      RETURNING id, code, zone, capacity_units, created_at;
    `;
    const res = await query<Tray>(text, [code, zone, capacityUnits]);
    return res.rows[0];
  }

  async findAll(): Promise<Tray[]> {
    const text = `
      SELECT id, code, zone, capacity_units, created_at
      FROM trays
      ORDER BY created_at ASC;
    `;
    const res = await query<Tray>(text);
    return res.rows;
  }

  async findById(id: string): Promise<Tray | null> {
    const text = `
      SELECT id, code, zone, capacity_units, created_at
      FROM trays
      WHERE id = $1;
    `;
    const res = await query<Tray>(text, [id]);
    return res.rows[0] || null;
  }

  async findByCode(code: string): Promise<Tray | null> {
    const text = `
      SELECT id, code, zone, capacity_units, created_at
      FROM trays
      WHERE code = $1;
    `;
    const res = await query<Tray>(text, [code]);
    return res.rows[0] || null;
  }
}

export const traysRepository = new TraysRepository();
