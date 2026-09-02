import { Router } from 'express';
import { getHealth } from '../controllers/health.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { authRouter } from './auth.routes';
import { rolePermissionRouter, userRouter } from './user.routes';
import { fabricRouter, machineTypeRouter, threadRouter } from './master-data.routes';
import { garmentRouter, operationRouter } from './garment.routes';
import { orderRouter } from './order.routes';

export const apiRouter = Router();

apiRouter.get('/health', getHealth);
apiRouter.use('/auth', authRouter);

/**
 * `requireAuth` is mounted per resource rather than once across `/api`, so a path that
 * matches nothing at all still falls through to the 404 envelope instead of being claimed
 * by the guard. Permissions then gate the writes inside each router.
 */
apiRouter.use('/users', requireAuth, userRouter);
apiRouter.use('/role-permissions', requireAuth, rolePermissionRouter);
apiRouter.use('/threads', requireAuth, threadRouter);
apiRouter.use('/machine-types', requireAuth, machineTypeRouter);
apiRouter.use('/fabrics', requireAuth, fabricRouter);
apiRouter.use('/garments', requireAuth, garmentRouter);
apiRouter.use('/operations', requireAuth, operationRouter);
apiRouter.use('/orders', requireAuth, orderRouter);
