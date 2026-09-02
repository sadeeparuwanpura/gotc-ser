import { idParamSchema } from '../schemas/common.schema';
import {
  calculationQuerySchema,
  createGarmentBodySchema,
  garmentListQuerySchema,
  updateGarmentBodySchema
} from '../schemas/garment.schema';
import {
  createGarment,
  deleteGarment,
  duplicateGarment,
  getGarment,
  listGarments,
  nextStyleNumber,
  updateGarment
} from '../services/garment.service';
import { calculateForGarment } from '../services/calculation.service';
import { asyncHandler } from '../utils/async-handler';
import { authContext } from '../middleware/auth.middleware';

export const getGarments = asyncHandler(async (req, res) => {
  const query = garmentListQuerySchema.parse(req.query);
  res.status(200).json(await listGarments(query));
});

export const getNextStyleNumber = asyncHandler(async (_req, res) => {
  res.status(200).json(await nextStyleNumber());
});

export const getGarmentById = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.status(200).json(await getGarment(id));
});

export const postGarment = asyncHandler(async (req, res) => {
  const body = createGarmentBodySchema.parse(req.body);
  const auth = authContext(req);
  const { garment, operationsCopied } = await createGarment(body, auth.userId);
  res.status(201).json({ ...garment, operationsCopied });
});

export const patchGarment = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const body = updateGarmentBodySchema.parse(req.body);
  res.status(200).json(await updateGarment(id, body));
});

export const postDuplicate = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const auth = authContext(req);
  const { garment, operationsCopied, sourceStyleNumber } = await duplicateGarment(id, auth.userId);
  res.status(201).json({ ...garment, operationsCopied, sourceStyleNumber });
});

export const removeGarment = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  await deleteGarment(id);
  res.status(204).send();
});

/** The endpoint both screens and both printed documents read their numbers from. */
export const getCalculation = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const query = calculationQuerySchema.parse(req.query);
  res.status(200).json(await calculateForGarment(id, query));
});
