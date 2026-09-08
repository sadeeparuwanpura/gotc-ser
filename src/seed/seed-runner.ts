import { Types } from 'mongoose';
import { DEFAULT_PERMISSIONS, ROLES, type PositionName } from '../constants/domain';
import { ConeOrderModel } from '../models/cone-order.model';
import { CounterModel, setConeOrderCounter } from '../models/counter.model';
import { FabricModel, type FabricDocument } from '../models/fabric.model';
import { GarmentModel, type GarmentDocument } from '../models/garment.model';
import { MachineTypeModel, type MachineTypeDocument } from '../models/machine-type.model';
import { OperationModel } from '../models/operation.model';
import { RolePermissionModel } from '../models/role-permission.model';
import { ThreadModel, type ThreadDocument } from '../models/thread.model';
import { UserModel, type UserDocument } from '../models/user.model';
import { hashPassword } from '../services/auth.service';
import { buildOrderRows, calculateFromContext, loadContext } from '../services/calculation.service';
import { invalidateMatrix } from '../services/role-permission.service';
import {
  CONE_ORDER_COUNTER_START,
  DEMO_PASSWORD,
  FABRICS,
  GARMENTS,
  MACHINE_TYPES,
  OPERATION_SEQUENCES,
  ORDERS,
  THREADS,
  THREAD_LAYOUTS,
  USERS
} from './seed-data';

export interface SeedSummary {
  users: number;
  machineTypes: number;
  threads: number;
  fabrics: number;
  garments: number;
  operations: number;
  orders: number;
}

function positionIdFor(machineType: MachineTypeDocument, position: PositionName): string {
  const entry = machineType.positions.find((candidate) => candidate.position === position);
  if (!entry) {
    throw new Error(`${machineType.code} has no ${position} position`);
  }
  return entry._id.toHexString();
}

export async function isDatabaseEmpty(): Promise<boolean> {
  const counts = await Promise.all([
    UserModel.estimatedDocumentCount(),
    RolePermissionModel.estimatedDocumentCount(),
    ThreadModel.estimatedDocumentCount(),
    MachineTypeModel.estimatedDocumentCount(),
    FabricModel.estimatedDocumentCount(),
    GarmentModel.estimatedDocumentCount(),
    OperationModel.estimatedDocumentCount(),
    ConeOrderModel.estimatedDocumentCount(),
    CounterModel.estimatedDocumentCount()
  ]);
  return counts.every((count) => count === 0);
}

export async function dropEverything(): Promise<void> {
  await Promise.all([
    UserModel.deleteMany({}),
    RolePermissionModel.deleteMany({}),
    ThreadModel.deleteMany({}),
    MachineTypeModel.deleteMany({}),
    FabricModel.deleteMany({}),
    GarmentModel.deleteMany({}),
    OperationModel.deleteMany({}),
    ConeOrderModel.deleteMany({}),
    CounterModel.deleteMany({})
  ]);

  // Rebuild the declared indexes, in case an earlier run used older definitions.
  await Promise.all([
    UserModel.syncIndexes(),
    RolePermissionModel.syncIndexes(),
    ThreadModel.syncIndexes(),
    MachineTypeModel.syncIndexes(),
    FabricModel.syncIndexes(),
    GarmentModel.syncIndexes(),
    OperationModel.syncIndexes(),
    ConeOrderModel.syncIndexes()
  ]);

  invalidateMatrix();
}

export async function seedDatabase(): Promise<SeedSummary> {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  await UserModel.insertMany(USERS.map((user) => ({ ...user, passwordHash })));
  await RolePermissionModel.create(
    ROLES.map((role) => ({ role, permissions: { ...DEFAULT_PERMISSIONS[role] } }))
  );
  await MachineTypeModel.insertMany(MACHINE_TYPES);
  await ThreadModel.insertMany(THREADS);
  await FabricModel.insertMany(FABRICS);

  // Re-read as hydrated documents so the embedded position ids are available.
  const users = await UserModel.find();
  const machineTypes = await MachineTypeModel.find();
  const threads = await ThreadModel.find();
  const fabrics = await FabricModel.find();

  const userByEmail = new Map<string, UserDocument>(users.map((user) => [user.email, user]));
  const machineByCode = new Map<string, MachineTypeDocument>(
    machineTypes.map((machineType) => [machineType.code, machineType])
  );
  const threadByBrand = new Map<string, ThreadDocument>(threads.map((thread) => [thread.brand, thread]));
  const fabricByName = new Map<string, FabricDocument>(fabrics.map((fabric) => [fabric.name, fabric]));

  const garmentTech = userByEmail.get('n.perera@factory.lk');
  if (!garmentTech) throw new Error('The garment technician account is missing');

  await GarmentModel.insertMany(
    GARMENTS.map(({ approvedByEmail, approvedAt, ...garment }) => {
      // The approval date is demonstration data, so it is set rather than stamped —
      // the same way a seeded order carries its decision date.
      const approvedBy = approvedByEmail ? userByEmail.get(approvedByEmail) ?? null : null;
      if (approvedByEmail && !approvedBy) throw new Error(`Unknown approver ${approvedByEmail}`);

      return {
        ...garment,
        fabrics: garment.fabrics.map((entry) => {
          const fabric = fabricByName.get(entry.name);
          if (!fabric) throw new Error(`Unknown fabric ${entry.name}`);
          return { fabric: fabric._id, parts: entry.parts };
        }),
        createdBy: garmentTech._id,
        approvedBy: approvedBy?._id ?? null,
        approvedByName: approvedBy?.name ?? null,
        approvedAt: approvedAt ? new Date(approvedAt) : null
      };
    })
  );

  const garments = await GarmentModel.find();
  const garmentByStyle = new Map<string, GarmentDocument>(
    garments.map((garment) => [garment.styleNumber, garment])
  );

  let operationCount = 0;
  for (const [styleNumber, sequence] of Object.entries(OPERATION_SEQUENCES)) {
    const garment = garmentByStyle.get(styleNumber);
    if (!garment || sequence.length === 0) continue;

    const documents = sequence.map((operation, index) => {
      const machineType = machineByCode.get(operation.machineCode);
      if (!machineType) throw new Error(`Unknown machine code ${operation.machineCode}`);

      const layout = THREAD_LAYOUTS[operation.machineCode] ?? {};
      const threadMap = new Map<string, Types.ObjectId>();
      for (const [position, brand] of Object.entries(layout)) {
        const thread = threadByBrand.get(brand);
        if (!thread) throw new Error(`Unknown thread brand ${brand}`);
        threadMap.set(positionIdFor(machineType, position as PositionName), thread._id);
      }

      return {
        garment: garment._id,
        sequence: index + 1,
        name: operation.name,
        machineType: machineType._id,
        seamLengthCm: operation.seamLengthCm,
        threads: threadMap,
        notes: ''
      };
    });

    await OperationModel.insertMany(documents);
    operationCount += documents.length;
  }

  // Order lines come from the calculation module, never from hand-written figures.
  for (const order of ORDERS) {
    const garment = garmentByStyle.get(order.styleNumber);
    if (!garment) throw new Error(`Unknown style ${order.styleNumber}`);

    const createdBy = userByEmail.get(order.createdByEmail);
    if (!createdBy) throw new Error(`Unknown creator ${order.createdByEmail}`);
    const decidedBy = order.decidedByEmail ? userByEmail.get(order.decidedByEmail) ?? null : null;

    const context = await loadContext(garment._id.toHexString());
    const calculation = calculateFromContext(context, {
      quantity: order.quantity,
      wastagePercent: order.wastagePercent,
      roundingMode: 'PER_THREAD'
    });

    const created = await ConeOrderModel.create({
      code: order.code,
      garment: garment._id,
      styleNumber: garment.styleNumber,
      garmentName: garment.name,
      buyer: garment.buyer,
      quantity: order.quantity,
      wastagePercent: order.wastagePercent,
      roundingMode: 'PER_THREAD',
      status: order.status,
      lines: calculation.threads.map((thread) => ({
        thread: new Types.ObjectId(thread.threadId),
        brand: thread.brand,
        ticket: thread.ticket,
        composition: thread.composition,
        colour: thread.colour,
        coneYieldM: thread.coneYieldM,
        metresPerGarment: thread.metresPerGarment,
        metresOrder: thread.metresOrder,
        metresWithWastage: thread.metresWithWastage,
        rawCones: thread.rawCones,
        threadingCones: thread.threadingCones,
        cones: thread.cones
      })),
      rows: buildOrderRows(context),
      totalMetres: calculation.totalMetres,
      totalCones: calculation.totalCones,
      createdBy: createdBy._id,
      createdByName: createdBy.name,
      approvedBy: decidedBy?._id ?? null,
      approvedByName: decidedBy?.name ?? null,
      approvedAt: order.decidedAt ? new Date(order.decidedAt) : null,
      note: order.note ?? ''
    });

    // The register's dates are demonstration data, so they are set rather than stamped.
    // `{ timestamps: true }` makes Mongoose treat `createdAt` as immutable and silently
    // drops it from a `$set`, so this one write goes through the driver directly.
    const createdAt = new Date(order.createdAt);
    await ConeOrderModel.collection.updateOne(
      { _id: created._id },
      { $set: { createdAt, updatedAt: order.decidedAt ? new Date(order.decidedAt) : createdAt } }
    );
  }

  await setConeOrderCounter(CONE_ORDER_COUNTER_START);
  invalidateMatrix();

  return {
    users: users.length,
    machineTypes: machineTypes.length,
    threads: threads.length,
    fabrics: fabrics.length,
    garments: garments.length,
    operations: operationCount,
    orders: ORDERS.length
  };
}
