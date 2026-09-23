import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { createTestApp, teardownTestApp } from './setup.js';

describe('Part 1: Trays API Endpoints & Validations', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await teardownTestApp(app);
  });

  it('POST /trays creates a new tray with 201 status code', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/trays',
      payload: {
        code: 'T-A-001',
        zone: 'Zone-A',
        capacity_units: 48
      }
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.id).toBeDefined();
    expect(body.code).toBe('T-A-001');
    expect(body.zone).toBe('Zone-A');
    expect(body.capacity_units).toBe(48);
  });

  it('POST /trays rejects invalid request bodies with 400 Bad Request', async () => {
    // Missing zone and negative capacity
    const res = await app.inject({
      method: 'POST',
      url: '/trays',
      payload: {
        code: 'T-B-002',
        capacity_units: -10
      }
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('Bad Request');
    expect(body.details).toBeDefined();
  });

  it('POST /trays rejects duplicate tray codes with 409 Conflict', async () => {
    await app.inject({
      method: 'POST',
      url: '/trays',
      payload: { code: 'T-C-003', zone: 'Zone-B', capacity_units: 36 }
    });

    const duplicateRes = await app.inject({
      method: 'POST',
      url: '/trays',
      payload: { code: 'T-C-003', zone: 'Zone-B', capacity_units: 36 }
    });

    expect(duplicateRes.statusCode).toBe(409);
    expect(duplicateRes.json().error).toBe('CONFLICT');
  });

  it('GET /trays lists all trays with 200 OK', async () => {
    await app.inject({
      method: 'POST',
      url: '/trays',
      payload: { code: 'T-D-004', zone: 'Zone-C', capacity_units: 24 }
    });

    const res = await app.inject({
      method: 'GET',
      url: '/trays'
    });

    expect(res.statusCode).toBe(200);
    const list = res.json();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /trays/:id returns one tray or 404 for unknown ID', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/trays',
      payload: { code: 'T-E-005', zone: 'Zone-D', capacity_units: 60 }
    });
    const trayId = created.json().id;

    // Existing tray
    const resOk = await app.inject({
      method: 'GET',
      url: `/trays/${trayId}`
    });
    expect(resOk.statusCode).toBe(200);
    expect(resOk.json().code).toBe('T-E-005');

    // Non-existent tray
    const res404 = await app.inject({
      method: 'GET',
      url: '/trays/00000000-0000-0000-0000-000000000000'
    });
    expect(res404.statusCode).toBe(404);
  });
});
