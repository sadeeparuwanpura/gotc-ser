import { Router } from 'express';
import {
  getCalculation,
  getGarmentById,
  getGarments,
  getNextStyleNumber,
  patchGarment,
  postApproveGarment,
  postDuplicate,
  postGarment,
  postGarmentStatus,
  removeGarment
} from '../controllers/garment.controller';
import {
  getOperations,
  patchOperation,
  patchOperationOrder,
  patchOperationThread,
  postOperation,
  removeOperation
} from '../controllers/operation.controller';
import { requirePermission } from '../middleware/auth.middleware';

export const garmentRouter = Router();

// The literal path must be registered before `/:id`.
garmentRouter.get('/next-style-number', getNextStyleNumber);

garmentRouter.get('/', getGarments);
garmentRouter.post('/', requirePermission('info'), postGarment);
garmentRouter.get('/:id/calculation', getCalculation);
garmentRouter.get('/:id/operations', getOperations);
garmentRouter.post('/:id/operations', requirePermission('operations'), postOperation);
garmentRouter.patch('/:id/operations/order', requirePermission('operations'), patchOperationOrder);
garmentRouter.post('/:id/duplicate', requirePermission('info'), postDuplicate);
garmentRouter.post('/:id/approve', requirePermission('approve'), postApproveGarment);
garmentRouter.post('/:id/status', requirePermission('approve'), postGarmentStatus);
garmentRouter.get('/:id', getGarmentById);
garmentRouter.patch('/:id', requirePermission('info'), patchGarment);
garmentRouter.delete('/:id', requirePermission('info'), removeGarment);

export const operationRouter = Router();

operationRouter.patch('/:id/threads', requirePermission('operations'), patchOperationThread);
operationRouter.patch('/:id', requirePermission('operations'), patchOperation);
operationRouter.delete('/:id', requirePermission('operations'), removeOperation);
