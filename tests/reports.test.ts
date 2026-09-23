import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestApp, teardownTestApp } from './setup.js';

describe('Part 3c: Yield Reporting (Single SQL Aggregation)', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestApp();

    // Setup: Create 2 trays across 2 zones
    const tray1Res = await app.inject({
      method: 'POST',
      url: '/trays',
      payload: { code: 'T-REP-01', zone: 'Zone-A', capacity_units: 50 }
    });
    const tray1Id = tray1Res.json().id;

    const tray2Res = await app.inject({
      method: 'POST',
      url: '/trays',
      payload: { code: 'T-REP-02', zone: 'Zone-B', capacity_units: 50 }
    });
    const tray2Id = tray2Res.json().id;

    // Seed and harvest Batch 1: Butterhead Lettuce in Zone-A
    // Seeded 20 days ago, harvested today (20 days cycle)
    const seededOn1 = new Date(Date.now() - 20 * 86400000).toISOString();
    const harvestedOn1 = new Date().toISOString();
    const batch1Res = await app.inject({
      method: 'POST',
      url: '/batches',
      payload: {
        tray_id: tray1Id,
        crop: 'Butterhead Lettuce',
        seeded_on: seededOn1,
        expected_harvest_on: harvestedOn1
      }
    });
    const b1Id = batch1Res.json().id;
    await app.inject({ method: 'PATCH', url: `/batches/${b1Id}/stage`, payload: { stage: 'GERMINATION' } });
    await app.inject({ method: 'PATCH', url: `/batches/${b1Id}/stage`, payload: { stage: 'GROWING' } });
    await app.inject({ method: 'PATCH', url: `/batches/${b1Id}/stage`, payload: { stage: 'HARVEST_READY' } });
    await app.inject({
      method: 'POST',
      url: `/batches/${b1Id}/harvest`,
      payload: { weight_grams: 500, grade: 'A', harvested_on: harvestedOn1 }
    });

    // Seed and harvest Batch 2: Tuscan Kale in Zone-B
    // Seeded 30 days ago, harvested today (30 days cycle)
    const seededOn2 = new Date(Date.now() - 30 * 86400000).toISOString();
    const harvestedOn2 = new Date().toISOString();
    const batch2Res = await app.inject({
      method: 'POST',
      url: '/batches',
      payload: {
        tray_id: tray2Id,
        crop: 'Tuscan Kale',
        seeded_on: seededOn2,
        expected_harvest_on: harvestedOn2
      }
    });
    const b2Id = batch2Res.json().id;
    await app.inject({ method: 'PATCH', url: `/batches/${b2Id}/stage`, payload: { stage: 'GERMINATION' } });
    await app.inject({ method: 'PATCH', url: `/batches/${b2Id}/stage`, payload: { stage: 'GROWING' } });
    await app.inject({ method: 'PATCH', url: `/batches/${b2Id}/stage`, payload: { stage: 'HARVEST_READY' } });
    await app.inject({
      method: 'POST',
      url: `/batches/${b2Id}/harvest`,
      payload: { weight_grams: 800, grade: 'B', harvested_on: harvestedOn2 }
    });
  });

  afterEach(async () => {
    await teardownTestApp(app);
  });

  it('GET /reports/yield grouped by crop returns aggregated yield and duration', async () => {
    const from = new Date(Date.now() - 50 * 86400000).toISOString();
    const to = new Date(Date.now() + 86400000).toISOString();

    const res = await app.inject({
      method: 'GET',
      url: `/reports/yield?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&group_by=crop`
    });

    expect(res.statusCode).toBe(200);
    const report = res.json();
    expect(report.length).toBe(2);

    // Tuscan Kale had 800g
    const kale = report.find((r: any) => r.group_by === 'Tuscan Kale');
    expect(kale).toBeDefined();
    expect(kale.total_harvested_weight).toBe(800);
    expect(kale.batches_harvested).toBe(1);
    expect(kale.avg_days_to_harvest).toBeGreaterThanOrEqual(29);

    // Butterhead Lettuce had 500g
    const lettuce = report.find((r: any) => r.group_by === 'Butterhead Lettuce');
    expect(lettuce).toBeDefined();
    expect(lettuce.total_harvested_weight).toBe(500);
    expect(lettuce.batches_harvested).toBe(1);
    expect(lettuce.avg_days_to_harvest).toBeGreaterThanOrEqual(19);
  });

  it('GET /reports/yield grouped by zone returns aggregated yield by facility zone', async () => {
    const from = new Date(Date.now() - 50 * 86400000).toISOString();
    const to = new Date(Date.now() + 86400000).toISOString();

    const res = await app.inject({
      method: 'GET',
      url: `/reports/yield?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&group_by=zone`
    });

    expect(res.statusCode).toBe(200);
    const report = res.json();
    expect(report.length).toBe(2);

    const zoneB = report.find((r: any) => r.group_by === 'Zone-B');
    expect(zoneB).toBeDefined();
    expect(zoneB.total_harvested_weight).toBe(800);

    const zoneA = report.find((r: any) => r.group_by === 'Zone-A');
    expect(zoneA).toBeDefined();
    expect(zoneA.total_harvested_weight).toBe(500);
  });

  it('GET /reports/yield rejects invalid group_by with 400 Bad Request', async () => {
    const from = new Date(Date.now() - 10 * 86400000).toISOString();
    const to = new Date().toISOString();

    const res = await app.inject({
      method: 'GET',
      url: `/reports/yield?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&group_by=invalid_field`
    });

    expect(res.statusCode).toBe(400);
  });
});
