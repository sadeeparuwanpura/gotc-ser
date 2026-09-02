import { Types } from 'mongoose';
import { FabricModel, type FabricDocument } from '../models/fabric.model';
import { GarmentModel } from '../models/garment.model';
import type { FabricDTO, FabricListResponse } from '../dto/api-types';
import { searchAcross } from '../utils/regex';
import type { ListQuery } from '../schemas/common.schema';
import { HttpError } from '../utils/http-error';
import type { CreateFabricBody, UpdateFabricBody } from '../schemas/fabric.schema';

/** Style numbers per fabric — the "Used on" column and the in-use refusal. */
async function usedOnByFabric(): Promise<Map<string, string[]>> {
  const garments = await GarmentModel.find({ 'fabrics.0': { $exists: true } })
    .select('styleNumber fabrics.fabric')
    .sort({ styleNumber: 1 });

  const used = new Map<string, string[]>();
  for (const garment of garments) {
    for (const entry of garment.fabrics) {
      const key = entry.fabric.toString();
      const list = used.get(key) ?? [];
      if (!list.includes(garment.styleNumber)) {
        list.push(garment.styleNumber);
      }
      used.set(key, list);
    }
  }
  return used;
}

function toDTO(fabric: FabricDocument, usedOn: string[]): FabricDTO {
  return {
    id: fabric._id.toHexString(),
    name: fabric.name,
    composition: fabric.composition,
    gsm: fabric.gsm,
    colour: fabric.colour,
    supplier: fabric.supplier,
    usedOn
  };
}

export async function listFabrics(query: ListQuery): Promise<FabricListResponse> {
  const filter = searchAcross(['name', 'composition', 'supplier'], query.q);

  const [fabrics, total, usedOn] = await Promise.all([
    FabricModel.find(filter)
      .sort({ name: 1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    FabricModel.countDocuments(filter),
    usedOnByFabric()
  ]);

  return {
    items: fabrics.map((fabric) => toDTO(fabric, usedOn.get(fabric._id.toHexString()) ?? [])),
    total,
    page: query.page,
    limit: query.limit
  };
}

async function assertNameIsFree(name: string, exceptId?: string): Promise<void> {
  const filter: Record<string, unknown> = { name };
  if (exceptId) {
    filter._id = { $ne: new Types.ObjectId(exceptId) };
  }
  const existing = await FabricModel.findOne(filter).collation({ locale: 'en', strength: 2 });
  if (existing) {
    throw HttpError.duplicate('A fabric with that name already exists.');
  }
}

export async function createFabric(body: CreateFabricBody): Promise<FabricDTO> {
  await assertNameIsFree(body.name);
  const fabric = await FabricModel.create({
    name: body.name,
    composition: body.composition,
    gsm: body.gsm ?? null,
    colour: body.colour,
    supplier: body.supplier
  });
  return toDTO(fabric, []);
}

export async function updateFabric(id: string, body: UpdateFabricBody): Promise<FabricDTO> {
  const fabric = await FabricModel.findById(id);
  if (!fabric) {
    throw HttpError.notFound('That fabric does not exist.');
  }

  if (body.name !== undefined && body.name !== fabric.name) {
    await assertNameIsFree(body.name, id);
    fabric.name = body.name;
  }
  if (body.composition !== undefined) fabric.composition = body.composition;
  if (body.gsm !== undefined) fabric.gsm = body.gsm ?? null;
  if (body.colour !== undefined) fabric.colour = body.colour;
  if (body.supplier !== undefined) fabric.supplier = body.supplier;

  await fabric.save();

  const usedOn = await usedOnByFabric();
  return toDTO(fabric, usedOn.get(id) ?? []);
}

export async function deleteFabric(id: string): Promise<void> {
  const fabric = await FabricModel.findById(id);
  if (!fabric) {
    throw HttpError.notFound('That fabric does not exist.');
  }

  const usedOn = (await usedOnByFabric()).get(id) ?? [];
  if (usedOn.length > 0) {
    throw HttpError.inUse(
      `${fabric.name} is used on ${usedOn.join(', ')}. Remove it from those garments first.`,
      { styleNumbers: usedOn }
    );
  }

  await fabric.deleteOne();
}
