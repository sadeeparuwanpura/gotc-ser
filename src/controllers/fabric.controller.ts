import { idParamSchema, listQuerySchema } from '../schemas/common.schema';
import { createFabricBodySchema, updateFabricBodySchema } from '../schemas/fabric.schema';
import { createFabric, deleteFabric, listFabrics, updateFabric } from '../services/fabric.service';
import { asyncHandler } from '../utils/async-handler';

export const getFabrics = asyncHandler(async (req, res) => {
  const query = listQuerySchema.parse(req.query);
  res.status(200).json(await listFabrics(query));
});

export const postFabric = asyncHandler(async (req, res) => {
  const body = createFabricBodySchema.parse(req.body);
  res.status(201).json(await createFabric(body));
});

export const patchFabric = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const body = updateFabricBodySchema.parse(req.body);
  res.status(200).json(await updateFabric(id, body));
});

export const removeFabric = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  await deleteFabric(id);
  res.status(204).send();
});
