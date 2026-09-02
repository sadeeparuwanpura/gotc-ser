import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { isAllowedOrigin, isTest } from './config/env';
import { apiRouter } from './routes';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { logger } from './utils/logger';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  /**
   * Only needed when the browser calls this API cross-origin. Behind the Vite dev proxy —
   * or a Vercel rewrite in production — the request carries no `Origin` header and none of
   * this applies.
   */
  app.use(
    cors({
      origin(origin, callback) {
        // No Origin: same-origin, a proxy hop, curl, or a health check.
        callback(null, !origin || isAllowedOrigin(origin));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE']
    })
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  if (!isTest) {
    app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));
  }

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
