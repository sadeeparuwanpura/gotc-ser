import type { RequestHandler } from 'express';
import { dbState } from '../config/db';
import type { HealthResponse } from '../dto/api-types';

export const getHealth: RequestHandler = (_req, res) => {
  const db = dbState();
  const body: HealthResponse = { ok: db === 'connected', db };
  res.status(200).json(body);
};
