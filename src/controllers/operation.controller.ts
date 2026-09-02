import { idParamSchema } from '../schemas/common.schema';
import {
  createOperationBodySchema,
  reorderOperationsBodySchema,
  updateOperationBodySchema,
  updateOperationThreadBodySchema
} from '../schemas/operation.schema';
import {
  createOperation,
  deleteOperation,
  listOperations,
  reorderOperations,
  updateOperation,
  updateOperationThread
} from '../services/operation.service';
import { asyncHandler } from '../utils/async-handler';

export const getOperations = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.status(200).json(await listOperations(id));
});

export const postOperation = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const body = createOperationBodySchema.parse(req.body);
  res.status(201).json(await createOperation(id, body));
});

export const patchOperation = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const body = updateOperationBodySchema.parse(req.body);
  res.status(200).json(await updateOperation(id, body));
});

export const patchOperationThread = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const body = updateOperationThreadBodySchema.parse(req.body);
  res.status(200).json(await updateOperationThread(id, body));
});

export const patchOperationOrder = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const body = reorderOperationsBodySchema.parse(req.body);
  res.status(200).json(await reorderOperations(id, body));
});

export const removeOperation = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  await deleteOperation(id);
  res.status(204).send();
});
