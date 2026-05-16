import pino from 'pino';
import pretty from 'pino-pretty';

const isDev = process.env.NODE_ENV !== 'production';

const stream = isDev
  ? pretty({ colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname', sync: true })
  : process.stdout;

export const logger = pino(
  {
    level: process.env['LOG_LEVEL'] ?? (isDev ? 'debug' : 'info'),
  },
  stream,
);
