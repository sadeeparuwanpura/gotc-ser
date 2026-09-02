import { idParamSchema } from '../schemas/common.schema';
import {
  createThreadBodySchema,
  threadListQuerySchema,
  updateThreadBodySchema
} from '../schemas/thread.schema';
import { createThread, deleteThread, listThreads, updateThread } from '../services/thread.service';
import { asyncHandler } from '../utils/async-handler';

export const getThreads = asyncHandler(async (req, res) => {
  const query = threadListQuerySchema.parse(req.query);
  res.status(200).json(await listThreads(query));
});

export const postThread = asyncHandler(async (req, res) => {
  const body = createThreadBodySchema.parse(req.body);
  res.status(201).json(await createThread(body));
});

export const patchThread = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  const body = updateThreadBodySchema.parse(req.body);
  res.status(200).json(await updateThread(id, body));
});

export const removeThread = asyncHandler(async (req, res) => {
  const { id } = idParamSchema.parse(req.params);
  await deleteThread(id);
  res.status(204).send();
});
