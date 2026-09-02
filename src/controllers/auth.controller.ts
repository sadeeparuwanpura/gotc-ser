import type { Response } from 'express';
import { env, isProduction, SESSION_MAX_AGE_MS } from '../config/env';
import { loginBodySchema } from '../schemas/auth.schema';
import { currentSession, login } from '../services/auth.service';
import { asyncHandler } from '../utils/async-handler';
import { authContext } from '../middleware/auth.middleware';

function setSessionCookie(res: Response, token: string): void {
  res.cookie(env.COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: SESSION_MAX_AGE_MS,
    path: '/'
  });
}

export const postLogin = asyncHandler(async (req, res) => {
  const body = loginBodySchema.parse(req.body);
  const { session, token } = await login(body);
  setSessionCookie(res, token);
  res.status(200).json(session);
});

export const postLogout = asyncHandler(async (_req, res) => {
  res.clearCookie(env.COOKIE_NAME, { httpOnly: true, sameSite: 'lax', secure: isProduction, path: '/' });
  res.status(204).send();
});

export const getMe = asyncHandler(async (req, res) => {
  const auth = authContext(req);
  res.status(200).json(await currentSession(auth.userId));
});
