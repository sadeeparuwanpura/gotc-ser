import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { env, isTest } from './config/env';
import { apiRouter } from './routes';
import { errorHandler, notFoundHandler } from './middleware/error.middleware';
import { logger } from './utils/logger';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  // Only needed when the client is not behind the Vite proxy.
  app.use(cors({ origin: env.CLIENT_ORIGIN, credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE'] }));
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
