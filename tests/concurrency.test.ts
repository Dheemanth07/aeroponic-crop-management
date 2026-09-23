import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestApp, teardownTestApp } from './setup.js';

describe('Part 3a: Concurrency Safety Under High Load', () => {
  let app: FastifyInstance;
  let trayId: string;

  beforeEach(async () => {
    app = await createTestApp();

    // Create tray T-A-014
    const trayRes = await app.inject({
      method: 'POST',
      url: '/trays',
      payload: { code: 'T-A-014', zone: 'Zone-Aeroponics-1', capacity_units: 64 }
    });
    trayId = trayRes.json().id;
  });

  afterEach(async () => {
    await teardownTestApp(app);
  });

  it('fires 10 genuinely concurrent seeding requests for the same tray: exactly 1 succeeds (201) and 9 fail cleanly (409)', async () => {
    const crops = [
      'Butterhead Lettuce',
      'Romaine Lettuce',
      'Baby Spinach',
      'Wild Arugula',
      'Red Russian Kale',
      'Genovese Basil',
      'Watercress',
      'Mustard Greens',
      'Swiss Chard',
      'Bok Choy'
    ];

    // Fire 10 simultaneous requests against the exact same tray using Promise.all()
    const concurrentRequests = crops.map(crop =>
      app.inject({
        method: 'POST',
        url: '/batches',
        payload: {
          tray_id: trayId,
          crop,
          expected_harvest_on: new Date(Date.now() + 30 * 86400000).toISOString()
        }
      })
    );

    const responses = await Promise.all(concurrentRequests);

    // Count status codes
    const successResponses = responses.filter(r => r.statusCode === 201);
    const conflictResponses = responses.filter(r => r.statusCode === 409);

    // Exactly one request must succeed
    expect(successResponses.length).toBe(1);

    // The other 9 requests must fail cleanly with 409 Conflict
    expect(conflictResponses.length).toBe(9);

    // Verify all 409 responses contain a clean error message
    conflictResponses.forEach(res => {
      const body = res.json();
      expect(body.statusCode).toBe(409);
      expect(body.message).toMatch(/already holds active batch|at most one active batch/);
    });

    // Verify the database has exactly 1 batch for this tray
    const listRes = await app.inject({
      method: 'GET',
      url: '/batches'
    });
    const batches = listRes.json().data;
    const trayBatches = batches.filter((b: any) => b.tray_id === trayId);
    expect(trayBatches.length).toBe(1);
  });
});
