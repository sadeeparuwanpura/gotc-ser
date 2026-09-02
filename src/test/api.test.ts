import type { Express } from 'express';
import type { Response } from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ADMIN,
  FABRIC_TECH,
  GARMENT_TECH,
  PROJECT_MANAGER,
  signIn,
  startTestServer,
  stopTestServer
} from './harness';
import { DEFAULT_PERMISSIONS } from '../constants/domain';
import type {
  CalculationDTO,
  FabricDTO,
  FabricListResponse,
  GarmentDTO,
  GarmentListResponse,
  MachineTypeListResponse,
  NextStyleNumberResponse,
  OperationDTO,
  OrderDTO,
  OrderListResponse,
  SessionResponse,
  ThreadListResponse,
  UserListResponse
} from '../dto/api-types';

/** supertest types the body as `any`; narrow it once, here. */
function body<T>(response: Response): T {
  return response.body as T;
}

interface ErrorBody {
  error: { code: string; message: string; details?: Record<string, unknown> };
}

let app: Express;
let admin: TestAgent;
let fabricTech: TestAgent;
let garmentTech: TestAgent;
let projectManager: TestAgent;

const styleId: Record<string, string> = {};

beforeAll(async () => {
  app = await startTestServer();
  [admin, fabricTech, garmentTech, projectManager] = await Promise.all([
    signIn(app, ADMIN),
    signIn(app, FABRIC_TECH),
    signIn(app, GARMENT_TECH),
    signIn(app, PROJECT_MANAGER)
  ]);

  const garments = body<GarmentListResponse>(await admin.get('/api/garments').expect(200)).items;
  for (const garment of garments) {
    styleId[garment.styleNumber] = garment.id;
  }
}, 120_000);

afterAll(async () => {
  await stopTestServer();
});

// ---------------------------------------------------------------------------
// Phase 1 — skeleton, health, error envelope
// ---------------------------------------------------------------------------

describe('phase 1 — skeleton', () => {
  it('reports a connected database', async () => {
    const response = await admin.get('/api/health').expect(200);
    expect(body<{ ok: boolean; db: string }>(response)).toEqual({ ok: true, db: 'connected' });
  });

  it('answers an unknown route with the standard 404 envelope', async () => {
    const response = await admin.get('/api/does-not-exist').expect(404);
    const payload = body<ErrorBody>(response);
    expect(payload.error.code).toBe('NOT_FOUND');
    expect(typeof payload.error.message).toBe('string');
  });

  it('answers an unknown route with 404 even without a session', async () => {
    const { default: request } = await import('supertest');
    const response = await request(app).get('/api/does-not-exist').expect(404);
    expect(body<ErrorBody>(response).error.code).toBe('NOT_FOUND');
  });

  it('wraps a validation failure as 422 VALIDATION_FAILED', async () => {
    const response = await admin.post('/api/fabrics').send({ name: 'No composition' }).expect(422);
    const payload = body<ErrorBody>(response);
    expect(payload.error.code).toBe('VALIDATION_FAILED');
    expect(payload.error.message).toBe('Composition is required — it drives needle and thread choice.');
  });

  it('uses the same copy whether a field is missing or empty', async () => {
    const missing = await admin.post('/api/fabrics').send({ name: 'Nameless' }).expect(422);
    const empty = await admin.post('/api/fabrics').send({ name: 'Nameless', composition: '  ' }).expect(422);
    expect(body<ErrorBody>(missing).error.message).toBe(
      body<ErrorBody>(empty).error.message
    );
  });

  it('reports the new-garment validation messages in the documented order', async () => {
    const draft: Record<string, unknown> = {};
    const expected = [
      'Garment name is required.',
      'Style number is required.',
      'Buyer is required — the order and both sheets are addressed to them.',
      'Order quantity must be a positive number of pieces.',
      'Assign at least one fabric.'
    ];
    const fill: Record<string, unknown>[] = [
      { name: 'Test garment' },
      { styleNumber: 'STY-9900' },
      { buyer: 'Nordwear' },
      { orderQuantity: 500 },
      { fabrics: [] }
    ];

    for (let step = 0; step < expected.length; step += 1) {
      const response = await admin.post('/api/garments').send(draft).expect(422);
      expect(body<ErrorBody>(response).error.message).toBe(expected[step]);
      Object.assign(draft, fill[step]);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 4 — auth, users, permissions
// ---------------------------------------------------------------------------

describe('phase 4 — auth and the role matrix', () => {
  it('returns each role’s seven booleans on sign-in', async () => {
    for (const [email, role] of [
      [ADMIN, 'ADMIN'],
      [FABRIC_TECH, 'FABRIC_TECH'],
      [GARMENT_TECH, 'GARMENT_TECH'],
      [PROJECT_MANAGER, 'PROJECT_MANAGER']
    ] as const) {
      const agent = await signIn(app, email);
      const session = body<SessionResponse>(await agent.get('/api/auth/me').expect(200));
      expect(session.user.role).toBe(role);
      expect(session.permissions).toEqual(DEFAULT_PERMISSIONS[role]);
    }
  });

  it('refuses wrong credentials with the documented copy', async () => {
    const response = await admin
      .post('/api/auth/login')
      .send({ email: ADMIN, password: 'wrong-password' })
      .expect(401);
    expect(body<ErrorBody>(response).error).toMatchObject({
      code: 'UNAUTHENTICATED',
      message: 'Email or password is incorrect.'
    });
  });

  it('refuses an unauthenticated read', async () => {
    const { default: request } = await import('supertest');
    const response = await request(app).get('/api/garments').expect(401);
    expect(body<ErrorBody>(response).error.code).toBe('UNAUTHENTICATED');
  });

  it('gates writes by permission and re-reads the matrix without a restart', async () => {
    const operations = body<OperationDTO[]>(
      await admin.get(`/api/garments/${styleId['STY-4471']}/operations`).expect(200)
    );
    const first = operations[0];
    expect(first).toBeDefined();
    if (!first) return;

    const fabrics = body<FabricListResponse>(await admin.get('/api/fabrics').expect(200)).items;
    const rib = fabrics.find((fabric) => fabric.name === 'Rib 1×1');
    expect(rib).toBeDefined();
    if (!rib) return;

    // A fabric technician may edit fabrics but not operations.
    const forbidden = await fabricTech
      .patch(`/api/operations/${first.id}`)
      .send({ seamLengthCm: 43 })
      .expect(403);
    expect(body<ErrorBody>(forbidden).error.code).toBe('FORBIDDEN');
    await fabricTech.patch(`/api/fabrics/${rib.id}`).send({ supplier: 'Teejay Lanka' }).expect(200);

    // Granting `operations` to FABRIC_TECH takes effect on the very next request.
    await admin
      .patch('/api/role-permissions/FABRIC_TECH')
      .send({ permissions: { operations: true } })
      .expect(200);
    await fabricTech.patch(`/api/operations/${first.id}`).send({ seamLengthCm: 42 }).expect(200);

    await admin
      .patch('/api/role-permissions/FABRIC_TECH')
      .send({ permissions: { operations: false } })
      .expect(200);
    await fabricTech.patch(`/api/operations/${first.id}`).send({ seamLengthCm: 42 }).expect(403);
  });

  it('refuses to edit the Admin column', async () => {
    const response = await admin
      .patch('/api/role-permissions/ADMIN')
      .send({ permissions: { users: false } })
      .expect(409);
    expect(body<ErrorBody>(response).error.code).toBe('ADMIN_PERMISSIONS_FIXED');
  });

  it('refuses to remove or demote the last admin', async () => {
    const users = body<UserListResponse>(await admin.get('/api/users').expect(200)).items;
    const onlyAdmin = users.find((user) => user.role === 'ADMIN');
    expect(onlyAdmin).toBeDefined();
    if (!onlyAdmin) return;

    const removed = await admin.delete(`/api/users/${onlyAdmin.id}`).expect(409);
    expect(body<ErrorBody>(removed).error).toMatchObject({
      code: 'LAST_ADMIN',
      message: 'R. Fernando is the last admin. Promote another user first.'
    });

    const demoted = await admin
      .patch(`/api/users/${onlyAdmin.id}`)
      .send({ role: 'GARMENT_TECH' })
      .expect(409);
    expect(body<ErrorBody>(demoted).error.code).toBe('LAST_ADMIN');
  });

  it('refuses a duplicate email', async () => {
    const response = await admin
      .post('/api/users')
      .send({ name: 'Impostor', email: ADMIN, role: 'GARMENT_TECH' })
      .expect(409);
    expect(body<ErrorBody>(response).error).toMatchObject({
      code: 'DUPLICATE',
      message: 'That email already has an account.'
    });
  });
});

// ---------------------------------------------------------------------------
// Phase 5 — master data
// ---------------------------------------------------------------------------

describe('phase 5 — master data', () => {
  it('refuses to delete a fabric that is assigned to garments', async () => {
    const fabrics = body<FabricListResponse>(await admin.get('/api/fabrics').expect(200)).items;
    const jersey = fabrics.find((fabric) => fabric.name === 'Single Jersey 30s');
    expect(jersey).toBeDefined();
    if (!jersey) return;

    const response = await admin.delete(`/api/fabrics/${jersey.id}`).expect(409);
    const payload = body<ErrorBody>(response);
    expect(payload.error.code).toBe('IN_USE');
    expect(payload.error.details?.styleNumbers).toEqual([
      'STY-4471',
      'STY-4488',
      'STY-4502',
      'STY-4510'
    ]);
    expect(payload.error.message).toBe(
      'Single Jersey 30s is used on STY-4471, STY-4488, STY-4502, STY-4510. Remove it from those garments first.'
    );
  });

  it('deletes an unused fabric', async () => {
    const created = body<FabricDTO>(
      await fabricTech
        .post('/api/fabrics')
        .send({ name: 'Interlock 40s', composition: '100% Cotton', gsm: 190 })
        .expect(201)
    );
    expect(created.usedOn).toEqual([]);
    await fabricTech.delete(`/api/fabrics/${created.id}`).expect(204);
  });

  it('refuses a duplicate fabric name', async () => {
    const response = await fabricTech
      .post('/api/fabrics')
      .send({ name: 'single jersey 30s', composition: '100% Cotton' })
      .expect(409);
    expect(body<ErrorBody>(response).error.message).toBe('A fabric with that name already exists.');
  });

  it('refuses to delete a thread that is assigned to operations', async () => {
    const threads = body<ThreadListResponse>(await admin.get('/api/threads').expect(200)).items;
    const gramax = threads.find((thread) => thread.brand === 'Gramax');
    expect(gramax).toBeDefined();
    if (!gramax) return;

    expect(gramax.usage.styles).toBe(3);
    const response = await admin.delete(`/api/threads/${gramax.id}`).expect(409);
    expect(body<ErrorBody>(response).error.code).toBe('IN_USE');
  });

  it('rejects a ticket outside 8–400 with the standing note', async () => {
    const response = await admin
      .post('/api/threads')
      .send({ brand: 'Test', ticket: 900, composition: 'Poly', coneYieldM: 5000 })
      .expect(422);
    expect(body<ErrorBody>(response).error.message).toBe(
      'Ticket must be between 8 and 400. Higher ticket means finer thread.'
    );
  });

  it('propagates a consumption-ratio change into every calculation', async () => {
    const machineTypes = body<MachineTypeListResponse>(await admin.get('/api/machine-types').expect(200)).items;
    const overlock = machineTypes.find((machineType) => machineType.code === 'OL-4');
    const needle = overlock?.positions.find((position) => position.position === 'NEEDLE');
    expect(needle).toBeDefined();
    if (!overlock || !needle) return;

    const url = `/api/garments/${styleId['STY-4471']}/calculation`;
    const before = body<CalculationDTO>(await admin.get(url).expect(200));

    await admin
      .patch(`/api/machine-types/${overlock.id}/positions/${needle.id}`)
      .send({ consumptionRatio: 4.5 })
      .expect(200);

    const after = body<CalculationDTO>(await admin.get(url).expect(200));
    expect(after.totalCones).toBeGreaterThan(before.totalCones);

    // Put it back — later assertions read the seeded figures.
    await admin
      .patch(`/api/machine-types/${overlock.id}/positions/${needle.id}`)
      .send({ consumptionRatio: 4.0 })
      .expect(200);
    const restored = body<CalculationDTO>(await admin.get(url).expect(200));
    expect(restored.totalCones).toBe(before.totalCones);
  });

  it('refuses a machine-type ratio edit from a role without master data', async () => {
    const machineTypes = body<MachineTypeListResponse>(await garmentTech.get('/api/machine-types').expect(200)).items;
    const overlock = machineTypes.find((machineType) => machineType.code === 'OL-4');
    const needle = overlock?.positions[0];
    if (!overlock || !needle) return;

    await garmentTech
      .patch(`/api/machine-types/${overlock.id}/positions/${needle.id}`)
      .send({ consumptionRatio: 9 })
      .expect(403);
  });
});

// ---------------------------------------------------------------------------
// Phase 6 — garments, operations, calculation
// ---------------------------------------------------------------------------

describe('phase 6 — garments and operations', () => {
  it('paginates the library and searches it server-side', async () => {
    const all = body<GarmentListResponse>(await admin.get('/api/garments').expect(200));
    expect(all.total).toBe(4);
    expect(all.page).toBe(1);
    expect(all.limit).toBe(25);
    expect(all.items).toHaveLength(4);

    const firstPage = body<GarmentListResponse>(
      await admin.get('/api/garments?page=1&limit=2').expect(200)
    );
    expect(firstPage.items.map((garment) => garment.styleNumber)).toEqual(['STY-4471', 'STY-4488']);
    expect(firstPage.total).toBe(4);

    const secondPage = body<GarmentListResponse>(
      await admin.get('/api/garments?page=2&limit=2').expect(200)
    );
    expect(secondPage.items.map((garment) => garment.styleNumber)).toEqual([
      'STY-4502',
      'STY-4510'
    ]);
    // Totals describe the whole filter, not the page.
    expect(secondPage.total).toBe(4);

    const beyond = body<GarmentListResponse>(
      await admin.get('/api/garments?page=9&limit=2').expect(200)
    );
    expect(beyond.items).toEqual([]);
    expect(beyond.total).toBe(4);

    const searched = body<GarmentListResponse>(
      await admin.get('/api/garments?q=halden').expect(200)
    );
    expect(searched.total).toBe(2);
    expect(searched.items.every((garment) => garment.buyer === 'Halden Supply')).toBe(true);

    const byStyle = body<GarmentListResponse>(
      await admin.get('/api/garments?q=STY-4502').expect(200)
    );
    expect(byStyle.items.map((garment) => garment.styleNumber)).toEqual(['STY-4502']);
  });

  it('rejects a page size beyond the cap', async () => {
    const response = await admin.get('/api/garments?limit=5000').expect(422);
    expect(body<ErrorBody>(response).error.code).toBe('VALIDATION_FAILED');
  });

  it('paginates every list endpoint in the same envelope', async () => {
    for (const [path, expected] of [
      ['/api/threads', 3],
      ['/api/machine-types', 6],
      ['/api/fabrics', 3],
      ['/api/users', 4]
    ] as const) {
      const all = body<{ items: unknown[]; total: number; page: number; limit: number }>(
        await admin.get(path).expect(200)
      );
      expect(all.total).toBe(expected);
      expect(all.page).toBe(1);
      expect(all.limit).toBe(25);
      expect(all.items).toHaveLength(expected);

      const paged = body<{ items: unknown[]; total: number }>(
        await admin.get(`${path}?page=2&limit=2`).expect(200)
      );
      // The page shrinks; the total describes the whole filter.
      expect(paged.total).toBe(expected);
      expect(paged.items.length).toBeLessThanOrEqual(2);

      await admin.get(`${path}?limit=5000`).expect(422);
    }
  });

  it('searches the master-data lists server-side', async () => {
    const threads = body<ThreadListResponse>(
      await admin.get('/api/threads?q=gramax').expect(200)
    );
    expect(threads.items.map((thread) => thread.brand)).toEqual(['Gramax']);

    const machines = body<MachineTypeListResponse>(
      await admin.get('/api/machine-types?q=overlock').expect(200)
    );
    expect(machines.items.map((machine) => machine.code)).toEqual(['OL-4']);

    const fabrics = body<FabricListResponse>(
      await admin.get('/api/fabrics?q=jersey').expect(200)
    );
    expect(fabrics.items.map((fabric) => fabric.name)).toEqual(['Single Jersey 30s']);

    const users = body<UserListResponse>(await admin.get('/api/users?q=perera').expect(200));
    expect(users.items.map((user) => user.name)).toEqual(['N. Perera']);
  });

  it('suggests the next free style number', async () => {
    const response = await admin.get('/api/garments/next-style-number').expect(200);
    expect(body<NextStyleNumberResponse>(response).styleNumber).toBe('STY-4511');
  });

  it('returns the documented calculation payload for STY-4471', async () => {
    const calculation = body<CalculationDTO>(
      await admin.get(`/api/garments/${styleId['STY-4471']}/calculation`).expect(200)
    );

    expect(calculation.operationCount).toBe(12);
    expect(calculation.threadCount).toBe(3);
    expect(calculation.machineChangeovers).toBe(8);
    expect(calculation.canCreateOrder).toBe(true);
    expect(calculation.incompleteOperations).toEqual([]);
    expect(calculation.machineTypesUsed.map((machine) => machine.code)).toEqual([
      'OL-4',
      'FL-2',
      'LS-1',
      'CS-1',
      'CS-2',
      'BT'
    ]);

    const surfilor = calculation.threads.find((thread) => thread.brand === 'Surfilor');
    expect(surfilor?.metresPerGarment).toBeCloseTo(53.92, 2);
    expect(surfilor?.metresWithWastage).toBeCloseTo(724684.8, 1);
    expect(surfilor?.cones).toBe(145);

    // The order total is the sum of the per-thread ceilings in PER_THREAD mode.
    expect(calculation.totalCones).toBe(
      calculation.threads.reduce((sum, thread) => sum + thread.cones, 0)
    );
  });

  it('previews a different quantity without saving it', async () => {
    const url = `/api/garments/${styleId['STY-4471']}/calculation`;
    const preview = body<CalculationDTO>(await admin.get(`${url}?quantity=24000`).expect(200));
    const saved = body<CalculationDTO>(await admin.get(url).expect(200));

    expect(preview.quantity).toBe(24000);
    expect(saved.quantity).toBe(12000);
    expect(preview.totalCones).toBeGreaterThan(saved.totalCones);
  });

  it('reorders twelve operations into contiguous sequences in one request', async () => {
    const url = `/api/garments/${styleId['STY-4471']}/operations`;
    const before = body<OperationDTO[]>(await garmentTech.get(url).expect(200));
    expect(before.map((operation) => operation.sequence)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
    ]);

    const reversed = [...before].reverse().map((operation) => operation.id);
    const after = body<OperationDTO[]>(
      await garmentTech
        .patch(`/api/garments/${styleId['STY-4471']}/operations/order`)
        .send({ orderedIds: reversed })
        .expect(200)
    );

    expect(after.map((operation) => operation.sequence)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
    ]);
    expect(after.map((operation) => operation.id)).toEqual(reversed);

    // Put the sequence back the way the factory wrote it.
    const restored = body<OperationDTO[]>(
      await garmentTech
        .patch(`/api/garments/${styleId['STY-4471']}/operations/order`)
        .send({ orderedIds: before.map((operation) => operation.id) })
        .expect(200)
    );
    expect(restored.map((operation) => operation.name)).toEqual(
      before.map((operation) => operation.name)
    );
  });

  it('rejects a reorder that does not name every operation', async () => {
    const operations = body<OperationDTO[]>(
      await garmentTech.get(`/api/garments/${styleId['STY-4471']}/operations`).expect(200)
    );
    const response = await garmentTech
      .patch(`/api/garments/${styleId['STY-4471']}/operations/order`)
      .send({ orderedIds: operations.slice(0, 3).map((operation) => operation.id) })
      .expect(422);
    expect(body<ErrorBody>(response).error.code).toBe('VALIDATION_FAILED');
  });

  it('clears the thread map when the machine type changes', async () => {
    const url = `/api/garments/${styleId['STY-4502']}/operations`;
    const operations = body<OperationDTO[]>(await garmentTech.get(url).expect(200));
    const target = operations[0];
    expect(target?.isComplete).toBe(true);
    if (!target) return;

    const machineTypes = body<MachineTypeListResponse>(await garmentTech.get('/api/machine-types').expect(200)).items;
    const lockStitch = machineTypes.find((machineType) => machineType.code === 'LS-1');
    const overlock = machineTypes.find((machineType) => machineType.code === 'OL-4');
    if (!lockStitch || !overlock) return;

    const changed = body<OperationDTO>(
      await garmentTech
        .patch(`/api/operations/${target.id}`)
        .send({ machineTypeId: lockStitch.id })
        .expect(200)
    );
    expect(changed.isComplete).toBe(false);
    expect(changed.positions.every((position) => position.threadId === null)).toBe(true);

    const calculation = body<CalculationDTO>(
      await garmentTech.get(`/api/garments/${styleId['STY-4502']}/calculation`).expect(200)
    );
    expect(calculation.canCreateOrder).toBe(false);
    expect(calculation.incompleteOperations.map((operation) => operation.id)).toContain(target.id);

    // Restore the overlock and reassign its three positions.
    const restored = body<OperationDTO>(
      await garmentTech
        .patch(`/api/operations/${target.id}`)
        .send({ machineTypeId: overlock.id })
        .expect(200)
    );
    const threads = body<ThreadListResponse>(await garmentTech.get('/api/threads').expect(200)).items;
    const gramax = threads.find((thread) => thread.brand === 'Gramax');
    const surfilor = threads.find((thread) => thread.brand === 'Surfilor');
    if (!gramax || !surfilor) return;

    for (const position of restored.positions) {
      await garmentTech
        .patch(`/api/operations/${target.id}/threads`)
        .send({
          positionId: position.id,
          threadId: position.position === 'NEEDLE' ? gramax.id : surfilor.id
        })
        .expect(200);
    }

    const complete = body<OperationDTO[]>(await garmentTech.get(url).expect(200));
    expect(complete[0]?.isComplete).toBe(true);
  });

  it('copies operations into a new garment as an independent set', async () => {
    const fabrics = body<FabricListResponse>(await admin.get('/api/fabrics').expect(200)).items;
    const jersey = fabrics.find((fabric) => fabric.name === 'Single Jersey 30s');
    if (!jersey) return;

    const created = body<GarmentDTO & { operationsCopied: number }>(
      await admin
        .post('/api/garments')
        .send({
          name: 'Copied Crew Neck',
          styleNumber: 'STY-9001',
          buyer: 'Nordwear',
          orderQuantity: 5000,
          wastagePercent: 12,
          fabrics: [{ fabricId: jersey.id, parts: ['Body'] }],
          copyOperationsFrom: styleId['STY-4471']
        })
        .expect(201)
    );
    expect(created.operationsCopied).toBe(12);

    const copies = body<OperationDTO[]>(
      await admin.get(`/api/garments/${created.id}/operations`).expect(200)
    );
    const originals = body<OperationDTO[]>(
      await admin.get(`/api/garments/${styleId['STY-4471']}/operations`).expect(200)
    );

    expect(copies).toHaveLength(12);
    expect(copies.map((operation) => operation.name)).toEqual(
      originals.map((operation) => operation.name)
    );
    expect(copies.map((operation) => operation.id)).not.toEqual(
      originals.map((operation) => operation.id)
    );

    // Editing the copy must not touch the source.
    const firstCopy = copies[0];
    const firstOriginal = originals[0];
    if (!firstCopy || !firstOriginal) return;

    await admin.patch(`/api/operations/${firstCopy.id}`).send({ seamLengthCm: 999 }).expect(200);
    const untouched = body<OperationDTO[]>(
      await admin.get(`/api/garments/${styleId['STY-4471']}/operations`).expect(200)
    );
    expect(untouched[0]?.seamLengthCm).toBe(firstOriginal.seamLengthCm);

    await admin.delete(`/api/garments/${created.id}`).expect(204);
    expect(
      body<OperationDTO[]>(await admin.get(`/api/garments/${created.id}/operations`).expect(404))
    ).toBeDefined();
  });

  it('refuses a duplicate style number', async () => {
    const fabrics = body<FabricListResponse>(await admin.get('/api/fabrics').expect(200)).items;
    const jersey = fabrics.find((fabric) => fabric.name === 'Single Jersey 30s');
    if (!jersey) return;

    const response = await admin
      .post('/api/garments')
      .send({
        name: 'Clash',
        styleNumber: 'STY-4471',
        buyer: 'Nordwear',
        orderQuantity: 100,
        fabrics: [{ fabricId: jersey.id, parts: ['Body'] }]
      })
      .expect(409);
    expect(body<ErrorBody>(response).error.message).toBe('Style number STY-4471 already exists.');
  });

  it('names the fabric that has no part assigned', async () => {
    const fabrics = body<FabricListResponse>(await admin.get('/api/fabrics').expect(200)).items;
    const jersey = fabrics.find((fabric) => fabric.name === 'Single Jersey 30s');
    if (!jersey) return;

    const response = await admin
      .post('/api/garments')
      .send({
        name: 'Partless',
        styleNumber: 'STY-9002',
        buyer: 'Nordwear',
        orderQuantity: 100,
        fabrics: [{ fabricId: jersey.id, parts: [] }]
      })
      .expect(422);
    expect(body<ErrorBody>(response).error.message).toBe(
      'Single Jersey 30s has no garment part assigned.'
    );
  });

  it('duplicates a garment with the -A suffix and a deep operation copy', async () => {
    const duplicate = body<GarmentDTO & { operationsCopied: number }>(
      await admin.post(`/api/garments/${styleId['STY-4488']}/duplicate`).expect(201)
    );
    expect(duplicate.styleNumber).toBe('STY-4488-A');
    expect(duplicate.status).toBe('Draft');
    expect(duplicate.operationsCopied).toBe(5);

    await admin.delete(`/api/garments/${duplicate.id}`).expect(204);
  });
});

// ---------------------------------------------------------------------------
// Phase 7 — cone orders and approvals
// ---------------------------------------------------------------------------

describe('phase 7 — cone orders', () => {
  it('returns the seeded register with counts and totals', async () => {
    const register = body<OrderListResponse>(await admin.get('/api/orders').expect(200));

    expect(register.total).toBe(5);
    expect(register.counts.All).toBe(5);
    expect(register.counts.Draft).toBe(1);
    expect(register.counts.Approved).toBe(1);
    expect(register.counts.Ordered).toBe(1);
    expect(register.counts.Rejected).toBe(1);
    expect(register.counts['Pending approval']).toBe(1);
    expect(register.totals.orders).toBe(5);
    expect(register.items.map((order) => order.code)).toEqual([
      'TCO-0153',
      'TCO-0151',
      'TCO-0142',
      'TCO-0139',
      'TCO-0136'
    ]);

    // The register's dates are demonstration data, not the seed run's clock.
    const approved = register.items.find((order) => order.code === 'TCO-0142');
    expect(approved?.createdAt.slice(0, 10)).toBe('2026-08-18');
    expect(approved?.approvedAt?.slice(0, 10)).toBe('2026-08-20');
    expect(approved?.createdByName).toBe('K. Aluthge');
    expect(approved?.approvedByName).toBe('R. Fernando');

    const draft = register.items.find((order) => order.code === 'TCO-0153');
    expect(draft?.createdAt.slice(0, 10)).toBe('2026-09-01');
    expect(draft?.approvedAt).toBeNull();
  });

  it('filters and searches the register', async () => {
    const approved = body<OrderListResponse>(await admin.get('/api/orders?status=Approved').expect(200));
    expect(approved.items).toHaveLength(1);
    expect(approved.items[0]?.code).toBe('TCO-0142');

    const searched = body<OrderListResponse>(await admin.get('/api/orders?q=halden').expect(200));
    expect(searched.items.every((order) => order.buyer === 'Halden Supply')).toBe(true);
  });

  it('refuses an order for a garment with no operations', async () => {
    const response = await projectManager
      .post('/api/orders')
      .send({ garmentId: styleId['STY-4510'] })
      .expect(409);
    expect(body<ErrorBody>(response).error.code).toBe('INCOMPLETE_OPERATIONS');
  });

  it('refuses an order while any position is unassigned, and names the operations', async () => {
    const operations = body<OperationDTO[]>(
      await garmentTech.get(`/api/garments/${styleId['STY-4488']}/operations`).expect(200)
    );
    const target = operations[0];
    const position = target?.positions[0];
    if (!target || !position) return;

    await garmentTech
      .patch(`/api/operations/${target.id}/threads`)
      .send({ positionId: position.id, threadId: null })
      .expect(200);

    const response = await projectManager
      .post('/api/orders')
      .send({ garmentId: styleId['STY-4488'] })
      .expect(409);
    const payload = body<ErrorBody>(response);
    expect(payload.error.code).toBe('INCOMPLETE_OPERATIONS');
    expect(payload.error.details?.operations).toEqual([
      { id: target.id, sequence: target.sequence, name: target.name }
    ]);

    await garmentTech
      .patch(`/api/operations/${target.id}/threads`)
      .send({ positionId: position.id, threadId: position.threadId })
      .expect(200);
  });

  it('creates an order whose totals match the calculation preview', async () => {
    const calculation = body<CalculationDTO>(
      await projectManager.get(`/api/garments/${styleId['STY-4471']}/calculation`).expect(200)
    );

    const order = body<OrderDTO>(
      await projectManager.post('/api/orders').send({ garmentId: styleId['STY-4471'] }).expect(201)
    );

    expect(order.code).toBe('TCO-0154');
    expect(order.status).toBe('Pending approval');
    expect(order.totalCones).toBe(calculation.totalCones);
    expect(order.totalMetres).toBeCloseTo(calculation.totalMetres, 2);
    expect(order.quantity).toBe(12000);
    expect(order.wastagePercent).toBe(12);
    expect(order.roundingMode).toBe('PER_THREAD');
    expect(order.createdByName).toBe('K. Aluthge');
    expect(order.lines).toHaveLength(calculation.threadCount);
    expect(order.rows).toHaveLength(12);
    expect(order.rows[0]?.cells).toEqual(['LOOPER - 2 - 120 SURFILOR', 'NEEDLE - 2 - 160 GRAMAX']);
    expect(order.maxCells).toBe(2);
  });

  it('refuses to create an order without the orders permission', async () => {
    await garmentTech.post('/api/orders').send({ garmentId: styleId['STY-4471'] }).expect(403);
  });

  it('runs an order through approval and refuses invalid moves', async () => {
    const register = body<OrderListResponse>(
      await admin.get('/api/orders?status=Pending approval').expect(200)
    );
    const pending = register.items.find((order) => order.code === 'TCO-0154');
    expect(pending).toBeDefined();
    if (!pending) return;

    // A garment technician holds neither `orders` nor `approve`.
    await garmentTech.post(`/api/orders/${pending.id}/approve`).expect(403);

    const approved = body<OrderDTO>(
      await projectManager.post(`/api/orders/${pending.id}/approve`).expect(200)
    );
    expect(approved.status).toBe('Approved');
    expect(approved.approvedByName).toBe('K. Aluthge');
    expect(approved.approvedAt).not.toBeNull();

    // Approved → Ordered is allowed; Approved → Pending approval is not.
    const submitted = await projectManager.post(`/api/orders/${pending.id}/submit`).expect(409);
    expect(body<ErrorBody>(submitted).error.code).toBe('INVALID_TRANSITION');

    const placed = body<OrderDTO>(
      await projectManager
        .post(`/api/orders/${pending.id}/place`)
        .send({ note: 'Placed with Coats on 13 Aug 2026.' })
        .expect(200)
    );
    expect(placed.status).toBe('Ordered');
    expect(placed.note).toBe('Placed with Coats on 13 Aug 2026.');

    // An order that has been placed cannot be deleted.
    const deleted = await projectManager.delete(`/api/orders/${pending.id}`).expect(409);
    expect(body<ErrorBody>(deleted).error.code).toBe('INVALID_TRANSITION');
  });

  it('freezes the order: editing the garment afterwards changes nothing', async () => {
    const register = body<OrderListResponse>(await admin.get('/api/orders?q=TCO-0154').expect(200));
    const order = register.items[0];
    expect(order).toBeDefined();
    if (!order) return;

    const before = body<OrderDTO>(await admin.get(`/api/orders/${order.id}`).expect(200));

    const operations = body<OperationDTO[]>(
      await garmentTech.get(`/api/garments/${styleId['STY-4471']}/operations`).expect(200)
    );
    const target = operations[0];
    if (!target) return;

    await garmentTech
      .patch(`/api/operations/${target.id}`)
      .send({ seamLengthCm: target.seamLengthCm * 3 })
      .expect(200);

    const recalculated = body<CalculationDTO>(
      await admin.get(`/api/garments/${styleId['STY-4471']}/calculation`).expect(200)
    );
    const after = body<OrderDTO>(await admin.get(`/api/orders/${order.id}`).expect(200));

    expect(recalculated.totalCones).toBeGreaterThan(before.totalCones);
    expect(after.totalCones).toBe(before.totalCones);
    expect(after.totalMetres).toBe(before.totalMetres);
    expect(after.lines).toEqual(before.lines);
    expect(after.rows).toEqual(before.rows);
  });

  it('refuses to delete a garment that carries a non-draft order', async () => {
    const response = await admin.delete(`/api/garments/${styleId['STY-4471']}`).expect(409);
    expect(body<ErrorBody>(response).error.code).toBe('IN_USE');
  });
});
