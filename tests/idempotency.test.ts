import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestApp, teardownTestApp } from './setup.js';

describe('Part 3b: Idempotent Harvest Recording', () => {
  let app: FastifyInstance;
  let batchId: string;

  beforeEach(async () => {
    app = await createTestApp();

    // 1. Create a tray
    const trayRes = await app.inject({
      method: 'POST',
      url: '/trays',
      payload: { code: 'T-IDEM-01', zone: 'Greenhouse-North', capacity_units: 40 }
    });
    const trayId = trayRes.json().id;

    // 2. Seed a batch
    const batchRes = await app.inject({
      method: 'POST',
      url: '/batches',
      payload: {
        tray_id: trayId,
        crop: 'Rainbow Chard',
        expected_harvest_on: new Date(Date.now() + 30 * 86400000).toISOString()
      }
    });
    batchId = batchRes.json().id;

    // 3. Advance through to HARVEST_READY
    await app.inject({ method: 'PATCH', url: `/batches/${batchId}/stage`, payload: { stage: 'GERMINATION' } });
    await app.inject({ method: 'PATCH', url: `/batches/${batchId}/stage`, payload: { stage: 'GROWING' } });
    await app.inject({ method: 'PATCH', url: `/batches/${batchId}/stage`, payload: { stage: 'HARVEST_READY' } });
  });

  afterEach(async () => {
    await teardownTestApp(app);
  });

  it('safely replays original 201 response when retried with identical Idempotency-Key', async () => {
    const idempotencyKey = 'mobile-worker-txn-789a-4bc1';

    // Request 1: Initial harvest submission
    const res1 = await app.inject({
      method: 'POST',
      url: `/batches/${batchId}/harvest`,
      headers: {
        'Idempotency-Key': idempotencyKey
      },
      payload: {
        weight_grams: 850,
        grade: 'A'
      }
    });

    expect(res1.statusCode).toBe(201);
    const body1 = res1.json();
    expect(body1.harvest.id).toBeDefined();
    expect(body1.harvest.weight_grams).toBe(850);
    expect(body1.batch.stage).toBe('HARVESTED');

    // Request 2: Field worker retries submission due to spotty greenhouse Wi-Fi
    const res2 = await app.inject({
      method: 'POST',
      url: `/batches/${batchId}/harvest`,
      headers: {
        'Idempotency-Key': idempotencyKey
      },
      payload: {
        weight_grams: 850,
        grade: 'A'
      }
    });

    // Must return the exact same 201 result without failing or recording a second harvest
    expect(res2.statusCode).toBe(201);
    const body2 = res2.json();
    expect(body2.harvest.id).toBe(body1.harvest.id);
    expect(body2.harvest.weight_grams).toBe(850);
  });

  it('rejects a duplicate harvest request when no Idempotency-Key header is supplied (409 Conflict)', async () => {
    // Initial harvest without idempotency header
    const res1 = await app.inject({
      method: 'POST',
      url: `/batches/${batchId}/harvest`,
      payload: { weight_grams: 600, grade: 'B' }
    });
    expect(res1.statusCode).toBe(201);

    // Second harvest attempt without header
    const res2 = await app.inject({
      method: 'POST',
      url: `/batches/${batchId}/harvest`,
      payload: { weight_grams: 600, grade: 'B' }
    });
    expect(res2.statusCode).toBe(409);
    expect(res2.json().message).toMatch(/already been harvested/);
  });
});
