import { Types } from 'mongoose';
import { MachineTypeModel, type MachineTypeDocument } from '../models/machine-type.model';
import { OperationModel } from '../models/operation.model';
import type { MachineTypeDTO, MachineTypeListResponse } from '../dto/api-types';
import { searchAcross } from '../utils/regex';
import type { ListQuery } from '../schemas/common.schema';
import { HttpError } from '../utils/http-error';
import type {
  CreateMachineTypeBody,
  UpdateMachineTypeBody,
  UpdatePositionRatioBody
} from '../schemas/machine-type.schema';

export function toMachineTypeDTO(machineType: MachineTypeDocument): MachineTypeDTO {
  return {
    id: machineType._id.toHexString(),
    name: machineType.name,
    code: machineType.code,
    colour: machineType.colour,
    positions: machineType.positions.map((position) => ({
      id: position._id.toHexString(),
      position: position.position,
      count: position.count,
      consumptionRatio: position.consumptionRatio
    })),
    totalThreads: machineType.positions.reduce((total, position) => total + position.count, 0),
    active: machineType.active
  };
}

export async function listMachineTypes(query: ListQuery): Promise<MachineTypeListResponse> {
  const filter = searchAcross(['name', 'code'], query.q);

  const [machineTypes, total] = await Promise.all([
    MachineTypeModel.find(filter)
      .sort({ code: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    MachineTypeModel.countDocuments(filter)
  ]);

  return {
    items: machineTypes.map(toMachineTypeDTO),
    total,
    page: query.page,
    limit: query.limit
  };
}

async function assertIdentityIsFree(
  fields: { name: string; code: string },
  exceptId?: string
): Promise<void> {
  const except = exceptId ? { _id: { $ne: new Types.ObjectId(exceptId) } } : {};
  if (await MachineTypeModel.exists({ name: fields.name, ...except })) {
    throw HttpError.duplicate('A machine type with that name already exists.');
  }
  if (await MachineTypeModel.exists({ code: fields.code, ...except })) {
    throw HttpError.duplicate('A machine type with that code already exists.');
  }
}

export async function createMachineType(body: CreateMachineTypeBody): Promise<MachineTypeDTO> {
  await assertIdentityIsFree({ name: body.name, code: body.code });
  const machineType = await MachineTypeModel.create({
    name: body.name,
    code: body.code,
    colour: body.colour,
    positions: body.positions,
    active: body.active ?? true
  });
  return toMachineTypeDTO(machineType);
}

export async function updateMachineType(
  id: string,
  body: UpdateMachineTypeBody
): Promise<MachineTypeDTO> {
  const machineType = await MachineTypeModel.findById(id);
  if (!machineType) {
    throw HttpError.notFound('That machine type does not exist.');
  }

  const identity = { name: body.name ?? machineType.name, code: body.code ?? machineType.code };
  if (identity.name !== machineType.name || identity.code !== machineType.code) {
    await assertIdentityIsFree(identity, id);
  }

  if (body.name !== undefined) machineType.name = body.name;
  if (body.code !== undefined) machineType.code = body.code;
  if (body.colour !== undefined) machineType.colour = body.colour;
  if (body.active !== undefined) machineType.active = body.active;
  if (body.positions !== undefined) {
    // Replacing the position list mints new position ids, so every operation on this
    // machine loses its thread map — the positions it pointed at no longer exist.
    machineType.set('positions', body.positions);
    await OperationModel.updateMany({ machineType: machineType._id }, { $set: { threads: {} } });
  }

  await machineType.save();
  return toMachineTypeDTO(machineType);
}

/** The inline consumption-ratio edit on the machine-types screen. */
export async function updatePositionRatio(
  id: string,
  positionId: string,
  body: UpdatePositionRatioBody
): Promise<MachineTypeDTO> {
  const machineType = await MachineTypeModel.findById(id);
  if (!machineType) {
    throw HttpError.notFound('That machine type does not exist.');
  }

  const position = machineType.positions.id(positionId);
  if (!position) {
    throw HttpError.notFound('That thread position does not exist.');
  }

  // Changing a ratio recalculates every operation on that machine type, on every garment.
  position.consumptionRatio = body.consumptionRatio;
  await machineType.save();
  return toMachineTypeDTO(machineType);
}

export async function deleteMachineType(id: string): Promise<void> {
  const machineType = await MachineTypeModel.findById(id);
  if (!machineType) {
    throw HttpError.notFound('That machine type does not exist.');
  }

  const inUse = await OperationModel.countDocuments({ machineType: machineType._id });
  if (inUse > 0) {
    throw HttpError.inUse(
      `${machineType.name} is used by ${inUse} operation${inUse === 1 ? '' : 's'}. Change those operations first.`,
      { operationCount: inUse }
    );
  }

  await machineType.deleteOne();
}
