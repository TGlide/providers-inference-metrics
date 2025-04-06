import pino from 'pino';
import { config } from './config';

const logger = pino({
  level: config.logLevel,
  transport: {
    target: 'pino-pretty', // Make logs pretty in development
    options: {
      colorize: true,
      ignore: 'pid,hostname', // Optional: Hide pid and hostname
      translateTime: 'SYS:yyyy-mm-dd HH:MM:ss.l', // Optional: Prettier timestamp
    },
  },
});

export default logger;
