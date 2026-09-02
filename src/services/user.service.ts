import { Types } from 'mongoose';
import { ROLE_LABELS } from '../constants/domain';
import { ConeOrderModel } from '../models/cone-order.model';
import { UserModel, type UserDocument } from '../models/user.model';
import type { UserListItem, UserListResponse } from '../dto/api-types';
import { searchAcross } from '../utils/regex';
import type { ListQuery } from '../schemas/common.schema';
import { HttpError } from '../utils/http-error';
import { hashPassword } from './auth.service';
import type { CreateUserBody, UpdateUserBody } from '../schemas/user.schema';

const DEFAULT_PASSWORD = 'demo1234';

interface ActivityCounts {
  created: number;
  approved: number;
}

/** Cone orders created and approved, per user — the "Activity" column. */
async function activityByUser(): Promise<Map<string, ActivityCounts>> {
  const [created, approved] = await Promise.all([
    ConeOrderModel.aggregate<{ _id: Types.ObjectId | null; count: number }>([
      { $group: { _id: '$createdBy', count: { $sum: 1 } } }
    ]),
    ConeOrderModel.aggregate<{ _id: Types.ObjectId | null; count: number }>([
      { $match: { approvedBy: { $ne: null } } },
      { $group: { _id: '$approvedBy', count: { $sum: 1 } } }
    ])
  ]);

  const activity = new Map<string, ActivityCounts>();
  const bump = (id: Types.ObjectId | null, key: keyof ActivityCounts, count: number): void => {
    if (!id) return;
    const key_ = id.toHexString();
    const entry = activity.get(key_) ?? { created: 0, approved: 0 };
    entry[key] = count;
    activity.set(key_, entry);
  };

  created.forEach((entry) => bump(entry._id, 'created', entry.count));
  approved.forEach((entry) => bump(entry._id, 'approved', entry.count));
  return activity;
}

function toListItem(user: UserDocument, activity: Map<string, ActivityCounts>): UserListItem {
  const id = user._id.toHexString();
  return {
    id,
    name: user.name,
    email: user.email,
    role: user.role,
    roleLabel: ROLE_LABELS[user.role],
    active: user.active,
    activity: activity.get(id) ?? { created: 0, approved: 0 }
  };
}

export async function listUsers(query: ListQuery): Promise<UserListResponse> {
  const filter = searchAcross(['name', 'email'], query.q);

  const [users, total, activity] = await Promise.all([
    UserModel.find(filter)
      .sort({ name: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    UserModel.countDocuments(filter),
    activityByUser()
  ]);

  return {
    items: users.map((user) => toListItem(user, activity)),
    total,
    page: query.page,
    limit: query.limit
  };
}

async function assertEmailIsFree(email: string, exceptId?: string): Promise<void> {
  const filter: Record<string, unknown> = { email: email.toLowerCase() };
  if (exceptId) {
    filter._id = { $ne: new Types.ObjectId(exceptId) };
  }
  if (await UserModel.exists(filter)) {
    throw HttpError.duplicate('That email already has an account.');
  }
}

export async function createUser(body: CreateUserBody): Promise<UserListItem> {
  await assertEmailIsFree(body.email);

  const user = await UserModel.create({
    name: body.name,
    email: body.email.toLowerCase(),
    role: body.role,
    passwordHash: await hashPassword(body.password ?? DEFAULT_PASSWORD)
  });

  return toListItem(user, new Map());
}

/** Refuses anything that would leave the system without an active admin. */
async function assertNotLastAdmin(user: UserDocument): Promise<void> {
  if (user.role !== 'ADMIN' || !user.active) return;
  const others = await UserModel.countDocuments({
    role: 'ADMIN',
    active: true,
    _id: { $ne: user._id }
  });
  if (others === 0) {
    throw HttpError.lastAdmin(user.name);
  }
}

export async function updateUser(id: string, body: UpdateUserBody): Promise<UserListItem> {
  const user = await UserModel.findById(id);
  if (!user) {
    throw HttpError.notFound('That user does not exist.');
  }

  const losesAdmin = (body.role !== undefined && body.role !== 'ADMIN') || body.active === false;
  if (losesAdmin) {
    await assertNotLastAdmin(user);
  }

  if (body.email !== undefined) {
    await assertEmailIsFree(body.email, id);
    user.email = body.email.toLowerCase();
  }
  if (body.name !== undefined) user.name = body.name;
  if (body.role !== undefined) user.role = body.role;
  if (body.active !== undefined) user.active = body.active;

  await user.save();

  const activity = await activityByUser();
  return toListItem(user, activity);
}

export async function deleteUser(id: string): Promise<void> {
  const user = await UserModel.findById(id);
  if (!user) {
    throw HttpError.notFound('That user does not exist.');
  }
  await assertNotLastAdmin(user);
  // Orders keep createdByName / approvedByName, so the history survives the deletion.
  await user.deleteOne();
}
