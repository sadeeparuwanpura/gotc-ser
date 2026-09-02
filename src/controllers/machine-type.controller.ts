import { idParamSchema, listQuerySchema } from '../schemas/common.schema';
import {
  createMachineTypeBodySchema,
  positionParamsSchema,
  updateMachineTypeBodySchema,
  updatePositionRatioBodySchema
} from '../schemas/machine-type.schema';
import {
  createMachineType,
  deleteMachineType,
  listMachineTypes,
  updateMachineType,
  updatePositionRatio
} from '../services/machine-type.service';
import { asyncHandler } from '../utils/async-handler';

export const getMachineTypes = asyncHandler(async (req, res) => {
  const query = listQuerySchema.parse(req.query);
  res.status(200).json(await listMachineTypes(query));
});

export const postMachineType = asyncHandler(async (req, res) => {
  const body = createMachineTypeBodySchema.parse(req.body);
  res.status(201).json(await createMachineType(body));
});

export const patchMachineType = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const body = updateMachineTypeBodySchema.parse(req.body);
  res.status(200).json(await updateMachineType(id, body));
});

export const patchPositionRatio = asyncHandler(async (req, res) => {
  const { id, positionId } = positionParamsSchema.parse(req.params);
  const body = updatePositionRatioBodySchema.parse(req.body);
  res.status(200).json(await updatePositionRatio(id, positionId, body));
});

export const removeMachineType = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  await deleteMachineType(id);
  res.status(204).send();
});
