import { Types, type FilterQuery } from 'mongoose';
import {
  ORDER_STATUSES,
  ORDER_TRANSITIONS,
  type OrderStatus
} from '../constants/domain';
import {
  ConeOrderModel,
  type ConeOrderAttrs,
  type ConeOrderDocument
} from '../models/cone-order.model';
import { nextConeOrderCode } from '../models/counter.model';
import type {
  OrderDTO,
  OrderListItem,
  OrderListResponse,
  OrderStatusCounts
} from '../dto/api-types';
import { HttpError } from '../utils/http-error';
import { escapeRegex } from '../utils/regex';
import { withTransaction, sessionOption } from '../utils/transaction';
import { buildOrderRows, calculateFromContext, loadContext } from './calculation.service';
import type { AuthContext } from '../types/express';
import type { CreateOrderBody, OrderListQuery, TransitionBody } from '../schemas/order.schema';

function toListItem(order: ConeOrderDocument): OrderListItem {
  return {
    id: order._id.toHexString(),
    code: order.code,
    garmentId: order.garment.toString(),
    styleNumber: order.styleNumber,
    garmentName: order.garmentName,
    buyer: order.buyer,
    quantity: order.quantity,
    wastagePercent: order.wastagePercent,
    roundingMode: order.roundingMode,
    status: order.status,
    totalMetres: order.totalMetres,
    totalCones: order.totalCones,
    createdByName: order.createdByName,
    createdAt: order.createdAt.toISOString(),
    approvedByName: order.approvedByName,
    approvedAt: order.approvedAt ? order.approvedAt.toISOString() : null,
    note: order.note
  };
}

export function toOrderDTO(order: ConeOrderDocument): OrderDTO {
  return {
    ...toListItem(order),
    lines: order.lines.map((line) => ({
      threadId: line.thread.toString(),
      brand: line.brand,
      ticket: line.ticket,
      composition: line.composition,
      colour: line.colour,
      coneYieldM: line.coneYieldM,
      metresPerGarment: line.metresPerGarment,
      metresOrder: line.metresOrder,
      metresWithWastage: line.metresWithWastage,
      rawCones: line.rawCones,
      cones: line.cones
    })),
    rows: order.rows.map((row) => ({
      sequence: row.sequence,
      name: row.name,
      machineName: row.machineName,
      cells: [...row.cells]
    })),
    maxCells: order.rows.reduce((widest, row) => Math.max(widest, row.cells.length), 0)
  };
}

/** Matches order code, style number, garment name, buyer and approver. */
function searchFilter(term: string | undefined): FilterQuery<ConeOrderAttrs> {
  if (!term) return {};
  const pattern = new RegExp(escapeRegex(term), 'i');
  return {
    $or: [
      { code: pattern },
      { styleNumber: pattern },
      { garmentName: pattern },
      { buyer: pattern },
      { approvedByName: pattern }
    ]
  };
}

export async function listOrders(query: OrderListQuery): Promise<OrderListResponse> {
  const search = searchFilter(query.q);
  const filter: FilterQuery<ConeOrderAttrs> = query.status ? { ...search, status: query.status } : search;

  const [items, total, grouped, totals] = await Promise.all([
    ConeOrderModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    ConeOrderModel.countDocuments(filter),
    // Chips count within the search term, across every status.
    ConeOrderModel.aggregate<{ _id: OrderStatus; count: number }>([
      { $match: search },
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]),
    // Register totals follow the screen's current filter, including the status chip.
    ConeOrderModel.aggregate<{ _id: null; cones: number; orders: number }>([
      { $match: filter },
      { $group: { _id: null, cones: { $sum: '$totalCones' }, orders: { $sum: 1 } } }
    ])
  ]);

  const byStatus = new Map(grouped.map((entry) => [entry._id, entry.count]));
  const counts = ORDER_STATUSES.reduce<OrderStatusCounts>(
    (accumulator, status) => ({ ...accumulator, [status]: byStatus.get(status) ?? 0 }),
    { All: grouped.reduce((sum, entry) => sum + entry.count, 0) } as OrderStatusCounts
  );

  const summary = totals[0];
  return {
    items: items.map(toListItem),
    total,
    page: query.page,
    limit: query.limit,
    counts,
    totals: { cones: summary?.cones ?? 0, orders: summary?.orders ?? 0 }
  };
}

async function requireOrder(id: string): Promise<ConeOrderDocument> {
  const order = await ConeOrderModel.findById(id);
  if (!order) {
    throw HttpError.notFound('That cone order does not exist.');
  }
  return order;
}

export async function getOrder(id: string): Promise<OrderDTO> {
  return toOrderDTO(await requireOrder(id));
}

/**
 * Snapshots everything at creation: identity, quantity, wastage, rounding mode, rows,
 * lines and totals. Editing the garment afterwards must never change this paper.
 */
export async function createOrder(body: CreateOrderBody, actor: AuthContext): Promise<OrderDTO> {
  const context = await loadContext(body.garmentId);
  const { garment } = context;

  const quantity = body.quantity ?? garment.orderQuantity;
  const wastagePercent = body.wastagePercent ?? garment.wastagePercent;
  const roundingMode = body.roundingMode ?? 'PER_THREAD';

  const calculation = calculateFromContext(context, { quantity, wastagePercent, roundingMode });

  if (context.operations.length === 0) {
    throw HttpError.incompleteOperations(0, { operations: [], reason: 'NO_OPERATIONS' });
  }
  if (!calculation.canCreateOrder) {
    throw HttpError.incompleteOperations(calculation.incompleteOperations.length, {
      operations: calculation.incompleteOperations,
      reason: 'UNASSIGNED_POSITIONS'
    });
  }

  const lines = calculation.threads.map((thread) => ({
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
    cones: thread.cones
  }));

  const order = await withTransaction(async (session) => {
    const code = await nextConeOrderCode(session);
    const [created] = await ConeOrderModel.create(
      [
        {
          code,
          garment: garment._id,
          styleNumber: garment.styleNumber,
          garmentName: garment.name,
          buyer: garment.buyer,
          quantity,
          wastagePercent,
          roundingMode,
          status: 'Pending approval',
          lines,
          rows: buildOrderRows(context),
          totalMetres: calculation.totalMetres,
          totalCones: calculation.totalCones,
          createdBy: new Types.ObjectId(actor.userId),
          createdByName: actor.name,
          note: body.note ?? ''
        }
      ],
      sessionOption(session)
    );

    if (!created) {
      throw HttpError.internal('The cone order could not be created.');
    }
    return created;
  });

  return toOrderDTO(order);
}

function assertTransition(order: ConeOrderDocument, next: OrderStatus): void {
  if (!ORDER_TRANSITIONS[order.status].includes(next)) {
    throw HttpError.invalidTransition(
      `${order.code} is ${order.status.toLowerCase()} and cannot move to ${next.toLowerCase()}.`,
      { from: order.status, to: next }
    );
  }
}

export async function submitOrder(id: string): Promise<OrderDTO> {
  const order = await requireOrder(id);
  assertTransition(order, 'Pending approval');
  order.status = 'Pending approval';
  await order.save();
  return toOrderDTO(order);
}

export async function approveOrder(id: string, actor: AuthContext): Promise<OrderDTO> {
  const order = await requireOrder(id);
  assertTransition(order, 'Approved');
  order.status = 'Approved';
  order.approvedBy = new Types.ObjectId(actor.userId);
  order.approvedByName = actor.name;
  order.approvedAt = new Date();
  await order.save();
  return toOrderDTO(order);
}

export async function rejectOrder(
  id: string,
  actor: AuthContext,
  body: TransitionBody
): Promise<OrderDTO> {
  const order = await requireOrder(id);
  assertTransition(order, 'Rejected');
  order.status = 'Rejected';
  // approvedBy doubles as the decision actor — the sheet reads "Rejected by <name> · <date>".
  order.approvedBy = new Types.ObjectId(actor.userId);
  order.approvedByName = actor.name;
  order.approvedAt = new Date();
  if (body.note !== undefined) order.note = body.note;
  await order.save();
  return toOrderDTO(order);
}

export async function placeOrder(
  id: string,
  _actor: AuthContext,
  body: TransitionBody
): Promise<OrderDTO> {
  const order = await requireOrder(id);
  assertTransition(order, 'Ordered');
  order.status = 'Ordered';
  if (body.note !== undefined) order.note = body.note;
  await order.save();
  return toOrderDTO(order);
}

export async function deleteOrder(id: string): Promise<void> {
  const order = await requireOrder(id);
  if (order.status !== 'Draft') {
    throw HttpError.invalidTransition(
      `${order.code} is ${order.status.toLowerCase()}. Only a draft order can be deleted.`,
      { from: order.status }
    );
  }
  await order.deleteOne();
}
