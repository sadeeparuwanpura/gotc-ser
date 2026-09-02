import { Router } from 'express';
import {
  getThreads,
  patchThread,
  postThread,
  removeThread
} from '../controllers/thread.controller';
import {
  getMachineTypes,
  patchMachineType,
  patchPositionRatio,
  postMachineType,
  removeMachineType
} from '../controllers/machine-type.controller';
import { getFabrics, patchFabric, postFabric, removeFabric } from '../controllers/fabric.controller';
import { requireAnyPermission, requirePermission } from '../middleware/auth.middleware';

export const threadRouter = Router();

threadRouter.get('/', getThreads);
// Creation is also permitted with `operations` — the operations screen creates threads inline.
threadRouter.post('/', requireAnyPermission('master', 'operations'), postThread);
threadRouter.patch('/:id', requirePermission('master'), patchThread);
threadRouter.delete('/:id', requirePermission('master'), removeThread);

export const machineTypeRouter = Router();

machineTypeRouter.get('/', getMachineTypes);
machineTypeRouter.post('/', requirePermission('master'), postMachineType);
machineTypeRouter.patch('/:id/positions/:positionId', requirePermission('master'), patchPositionRatio);
machineTypeRouter.patch('/:id', requirePermission('master'), patchMachineType);
machineTypeRouter.delete('/:id', requirePermission('master'), removeMachineType);

export const fabricRouter = Router();

fabricRouter.get('/', getFabrics);
fabricRouter.post('/', requirePermission('fabrics'), postFabric);
fabricRouter.patch('/:id', requirePermission('fabrics'), patchFabric);
fabricRouter.delete('/:id', requirePermission('fabrics'), removeFabric);
