import { Router } from 'express';
import { getMe, postLogin, postLogout } from '../controllers/auth.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { loginRateLimiter } from '../middleware/rate-limit.middleware';

export const authRouter = Router();

authRouter.post('/login', loginRateLimiter, postLogin);
authRouter.post('/logout', postLogout);
authRouter.get('/me', requireAuth, getMe);
