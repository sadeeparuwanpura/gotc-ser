import { Router } from 'express';
import {
  getOrderById,
  getOrders,
  postApprove,
  postOrder,
  postPlace,
  postReject,
  postSubmit,
  removeOrder
} from '../controllers/order.controller';
import { requirePermission } from '../middleware/auth.middleware';

export const orderRouter = Router();

orderRouter.get('/', getOrders);
orderRouter.get('/:id', getOrderById);
orderRouter.post('/', requirePermission('orders'), postOrder);
orderRouter.post('/:id/submit', requirePermission('orders'), postSubmit);
orderRouter.post('/:id/approve', requirePermission('approve'), postApprove);
orderRouter.post('/:id/reject', requirePermission('approve'), postReject);
orderRouter.post('/:id/place', requirePermission('approve'), postPlace);
orderRouter.delete('/:id', requirePermission('orders'), removeOrder);
