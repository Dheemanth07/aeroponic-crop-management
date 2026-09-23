import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestApp, teardownTestApp } from './setup.js';

describe('Part 2: Business Rules Enforcement', () => {
  let app: FastifyInstance;
  let trayId: string;

  beforeEach(async () => {
    app = await createTestApp();

    // Create a base physical tray for testing rules
    const trayRes = await app.inject({
      method: 'POST',
      url: '/trays',
      payload: { code: 'T-RULE-01', zone: 'Zone-Alpha', capacity_units: 50 }
    });
    trayId = trayRes.json().id;
  });

  afterEach(async () => {
    await teardownTestApp(app);
  });

  // ---------------------------------------------------------------------------
  // BUSINESS RULE 1:
  // "A tray can hold at most one active batch. A batch is active until it reaches HARVESTED."
  // ---------------------------------------------------------------------------
  describe('Rule 1: Tray active batch exclusivity', () => {
    it('allows seeding the first active batch into an empty tray', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/batches',
        payload: {
          tray_id: trayId,
          crop: 'Butterhead Lettuce',
          expected_harvest_on: new Date(Date.now() + 30 * 86400000).toISOString()
        }
      });

      expect(res.statusCode).toBe(201);
      const batch = res.json();
      expect(batch.stage).toBe('SEEDED');
      expect(batch.tray_id).toBe(trayId);
    });

    it('rejects seeding a second batch into a tray that already holds an active batch (409 Conflict)', async () => {
      // Seed first batch (stage: SEEDED)
      await app.inject({
        method: 'POST',
        url: '/batches',
        payload: {
          tray_id: trayId,
          crop: 'Butterhead Lettuce',
          expected_harvest_on: new Date(Date.now() + 30 * 86400000).toISOString()
        }
      });

      // Attempt to seed second batch while first batch is still active
      const secondRes = await app.inject({
        method: 'POST',
        url: '/batches',
        payload: {
          tray_id: trayId,
          crop: 'Arugula',
          expected_harvest_on: new Date(Date.now() + 20 * 86400000).toISOString()
        }
      });

      expect(secondRes.statusCode).toBe(409);
      expect(secondRes.json().message).toMatch(/already holds active batch|at most one active batch/);
    });

    it('frees the tray for a new active batch once the first batch reaches HARVESTED', async () => {
      // 1. Seed initial batch
      const batchRes = await app.inject({
        method: 'POST',
        url: '/batches',
        payload: {
          tray_id: trayId,
          crop: 'Romaine Lettuce',
          expected_harvest_on: new Date(Date.now() + 25 * 86400000).toISOString()
        }
      });
      const batchId = batchRes.json().id;

      // 2. Advance through stages to HARVEST_READY
      await app.inject({ method: 'PATCH', url: `/batches/${batchId}/stage`, payload: { stage: 'GERMINATION' } });
      await app.inject({ method: 'PATCH', url: `/batches/${batchId}/stage`, payload: { stage: 'GROWING' } });
      await app.inject({ method: 'PATCH', url: `/batches/${batchId}/stage`, payload: { stage: 'HARVEST_READY' } });

      // 3. Record harvest -> batch becomes HARVESTED and tray is freed
      const harvestRes = await app.inject({
        method: 'POST',
        url: `/batches/${batchId}/harvest`,
        payload: { weight_grams: 450, grade: 'A' }
      });
      expect(harvestRes.statusCode).toBe(201);

      // 4. Seeding a new batch into the same tray must now succeed!
      const newBatchRes = await app.inject({
        method: 'POST',
        url: '/batches',
        payload: {
          tray_id: trayId,
          crop: 'Spinach',
          expected_harvest_on: new Date(Date.now() + 28 * 86400000).toISOString()
        }
      });

      expect(newBatchRes.statusCode).toBe(201);
      expect(newBatchRes.json().crop).toBe('Spinach');
    });
  });

  // ---------------------------------------------------------------------------
  // BUSINESS RULE 2:
  // "Stage transitions only move forward, and only one step at a time. You cannot skip GROWING..."
  // ---------------------------------------------------------------------------
  describe('Rule 2: Sequential forward transitions and no skipping', () => {
    it('allows sequential advancement: SEEDED -> GERMINATION -> GROWING -> HARVEST_READY', async () => {
      const batchRes = await app.inject({
        method: 'POST',
        url: '/batches',
        payload: {
          tray_id: trayId,
          crop: 'Kale',
          expected_harvest_on: new Date(Date.now() + 35 * 86400000).toISOString()
        }
      });
      const batchId = batchRes.json().id;

      // Step 1: SEEDED -> GERMINATION
      const step1 = await app.inject({
        method: 'PATCH',
        url: `/batches/${batchId}/stage`,
        payload: { stage: 'GERMINATION' }
      });
      expect(step1.statusCode).toBe(200);
      expect(step1.json().stage).toBe('GERMINATION');

      // Step 2: GERMINATION -> GROWING
      const step2 = await app.inject({
        method: 'PATCH',
        url: `/batches/${batchId}/stage`,
        payload: { stage: 'GROWING' }
      });
      expect(step2.statusCode).toBe(200);
      expect(step2.json().stage).toBe('GROWING');

      // Step 3: GROWING -> HARVEST_READY
      const step3 = await app.inject({
        method: 'PATCH',
        url: `/batches/${batchId}/stage`,
        payload: { stage: 'HARVEST_READY' }
      });
      expect(step3.statusCode).toBe(200);
      expect(step3.json().stage).toBe('HARVEST_READY');
    });

    it('rejects skipping stages, e.g. SEEDED directly to GROWING (409 Conflict)', async () => {
      const batchRes = await app.inject({
        method: 'POST',
        url: '/batches',
        payload: {
          tray_id: trayId,
          crop: 'Bok Choy',
          expected_harvest_on: new Date(Date.now() + 25 * 86400000).toISOString()
        }
      });
      const batchId = batchRes.json().id;

      // Attempt to skip GERMINATION directly to GROWING
      const skipRes = await app.inject({
        method: 'PATCH',
        url: `/batches/${batchId}/stage`,
        payload: { stage: 'GROWING' }
      });

      expect(skipRes.statusCode).toBe(409);
      expect(skipRes.json().message).toMatch(/strictly one step forward|valid next stage is 'GERMINATION'/);
    });
  });

  // ---------------------------------------------------------------------------
  // BUSINESS RULE 3:
  // "...and you cannot go back."
  // ---------------------------------------------------------------------------
  describe('Rule 3: No backward stage transitions', () => {
    it('rejects moving backward from GROWING to GERMINATION (409 Conflict)', async () => {
      const batchRes = await app.inject({
        method: 'POST',
        url: '/batches',
        payload: {
          tray_id: trayId,
          crop: 'Swiss Chard',
          expected_harvest_on: new Date(Date.now() + 30 * 86400000).toISOString()
        }
      });
      const batchId = batchRes.json().id;

      // Advance to GERMINATION then GROWING
      await app.inject({ method: 'PATCH', url: `/batches/${batchId}/stage`, payload: { stage: 'GERMINATION' } });
      await app.inject({ method: 'PATCH', url: `/batches/${batchId}/stage`, payload: { stage: 'GROWING' } });

      // Attempt to revert back to GERMINATION
      const backwardRes = await app.inject({
        method: 'PATCH',
        url: `/batches/${batchId}/stage`,
        payload: { stage: 'GERMINATION' }
      });

      expect(backwardRes.statusCode).toBe(409);
      expect(backwardRes.json().message).toMatch(/Invalid stage transition/);
    });

    it('rejects moving backward from GERMINATION to SEEDED (409 Conflict)', async () => {
      const batchRes = await app.inject({
        method: 'POST',
        url: '/batches',
        payload: {
          tray_id: trayId,
          crop: 'Basil',
          expected_harvest_on: new Date(Date.now() + 20 * 86400000).toISOString()
        }
      });
      const batchId = batchRes.json().id;

      // Advance to GERMINATION
      await app.inject({ method: 'PATCH', url: `/batches/${batchId}/stage`, payload: { stage: 'GERMINATION' } });

      // Attempt backward to SEEDED
      const backwardRes = await app.inject({
        method: 'PATCH',
        url: `/batches/${batchId}/stage`,
        payload: { stage: 'SEEDED' }
      });

      expect(backwardRes.statusCode).toBe(409);
    });
  });

  // ---------------------------------------------------------------------------
  // BUSINESS RULE 4:
  // "A harvest can only be recorded for a batch in HARVEST_READY.
  // Recording a harvest moves the batch to HARVESTED and frees the tray for reuse."
  // ---------------------------------------------------------------------------
  describe('Rule 4: Harvest preconditions and lifecycle completion', () => {
    it('rejects recording harvest if batch is in SEEDED stage (409 Conflict)', async () => {
      const batchRes = await app.inject({
        method: 'POST',
        url: '/batches',
        payload: {
          tray_id: trayId,
          crop: 'Mint',
          expected_harvest_on: new Date(Date.now() + 20 * 86400000).toISOString()
        }
      });
      const batchId = batchRes.json().id;

      // Attempt harvest while in SEEDED
      const harvestRes = await app.inject({
        method: 'POST',
        url: `/batches/${batchId}/harvest`,
        payload: { weight_grams: 300, grade: 'A' }
      });

      expect(harvestRes.statusCode).toBe(409);
      expect(harvestRes.json().message).toMatch(/HARVEST_READY/);
    });

    it('rejects recording harvest if batch is in GROWING stage (409 Conflict)', async () => {
      const batchRes = await app.inject({
        method: 'POST',
        url: '/batches',
        payload: {
          tray_id: trayId,
          crop: 'Cilantro',
          expected_harvest_on: new Date(Date.now() + 20 * 86400000).toISOString()
        }
      });
      const batchId = batchRes.json().id;

      await app.inject({ method: 'PATCH', url: `/batches/${batchId}/stage`, payload: { stage: 'GERMINATION' } });
      await app.inject({ method: 'PATCH', url: `/batches/${batchId}/stage`, payload: { stage: 'GROWING' } });

      // Attempt harvest while in GROWING
      const harvestRes = await app.inject({
        method: 'POST',
        url: `/batches/${batchId}/harvest`,
        payload: { weight_grams: 250, grade: 'B' }
      });

      expect(harvestRes.statusCode).toBe(409);
      expect(harvestRes.json().message).toMatch(/HARVEST_READY/);
    });

    it('successfully records harvest when in HARVEST_READY and marks batch as HARVESTED', async () => {
      const batchRes = await app.inject({
        method: 'POST',
        url: '/batches',
        payload: {
          tray_id: trayId,
          crop: 'Parsley',
          expected_harvest_on: new Date(Date.now() + 20 * 86400000).toISOString()
        }
      });
      const batchId = batchRes.json().id;

      await app.inject({ method: 'PATCH', url: `/batches/${batchId}/stage`, payload: { stage: 'GERMINATION' } });
      await app.inject({ method: 'PATCH', url: `/batches/${batchId}/stage`, payload: { stage: 'GROWING' } });
      await app.inject({ method: 'PATCH', url: `/batches/${batchId}/stage`, payload: { stage: 'HARVEST_READY' } });

      const harvestRes = await app.inject({
        method: 'POST',
        url: `/batches/${batchId}/harvest`,
        payload: { weight_grams: 520, grade: 'A' }
      });

      expect(harvestRes.statusCode).toBe(201);
      const resData = harvestRes.json();
      expect(resData.harvest.weight_grams).toBe(520);
      expect(resData.harvest.grade).toBe('A');
      expect(resData.batch.stage).toBe('HARVESTED');
    });

    it('rejects a second harvest on an already HARVESTED batch (409 Conflict)', async () => {
      const batchRes = await app.inject({
        method: 'POST',
        url: '/batches',
        payload: {
          tray_id: trayId,
          crop: 'Dill',
          expected_harvest_on: new Date(Date.now() + 20 * 86400000).toISOString()
        }
      });
      const batchId = batchRes.json().id;

      await app.inject({ method: 'PATCH', url: `/batches/${batchId}/stage`, payload: { stage: 'GERMINATION' } });
      await app.inject({ method: 'PATCH', url: `/batches/${batchId}/stage`, payload: { stage: 'GROWING' } });
      await app.inject({ method: 'PATCH', url: `/batches/${batchId}/stage`, payload: { stage: 'HARVEST_READY' } });

      // First harvest
      await app.inject({
        method: 'POST',
        url: `/batches/${batchId}/harvest`,
        payload: { weight_grams: 400, grade: 'A' }
      });

      // Second harvest attempt on the same batch
      const duplicateRes = await app.inject({
        method: 'POST',
        url: `/batches/${batchId}/harvest`,
        payload: { weight_grams: 100, grade: 'C' }
      });

      expect(duplicateRes.statusCode).toBe(409);
      expect(duplicateRes.json().message).toMatch(/already been harvested/);
    });
  });
});
