import { idParamSchema } from '../schemas/common.schema';
import {
  createOrderBodySchema,
  orderListQuerySchema,
  transitionBodySchema
} from '../schemas/order.schema';
import {
  approveOrder,
  createOrder,
  deleteOrder,
  getOrder,
  listOrders,
  placeOrder,
  rejectOrder,
  submitOrder
} from '../services/order.service';
import { asyncHandler } from '../utils/async-handler';
import { authContext } from '../middleware/auth.middleware';

export const getOrders = asyncHandler(async (req, res) => {
  const query = orderListQuerySchema.parse(req.query);
  res.status(200).json(await listOrders(query));
});

export const getOrderById = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.status(200).json(await getOrder(id));
});

export const postOrder = asyncHandler(async (req, res) => {
  const body = createOrderBodySchema.parse(req.body);
  res.status(201).json(await createOrder(body, authContext(req)));
});

export const postSubmit = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.status(200).json(await submitOrder(id));
});

export const postApprove = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  res.status(200).json(await approveOrder(id, authContext(req)));
});

export const postReject = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const body = transitionBodySchema.parse(req.body);
  res.status(200).json(await rejectOrder(id, authContext(req), body));
});

export const postPlace = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const body = transitionBodySchema.parse(req.body);
  res.status(200).json(await placeOrder(id, authContext(req), body));
});

export const removeOrder = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  await deleteOrder(id);
  res.status(204).send();
});
