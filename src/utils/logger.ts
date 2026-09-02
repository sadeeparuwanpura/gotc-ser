import pino, { type LoggerOptions } from 'pino';
import { env, isProduction, isTest } from '../config/env';

const options: LoggerOptions = {
  level: isTest ? 'silent' : env.LOG_LEVEL,
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' }
        }
      })
};

export const logger = pino(options);
