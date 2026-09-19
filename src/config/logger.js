const winston = require('winston');
const env = require('./env');

const logger = winston.createLogger({
  level: env.nodeEnv === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack }) => {
      return `${timestamp} ${level.toUpperCase()} ${stack || message}`;
    })
  ),
  transports: [new winston.transports.Console()],
});

module.exports = logger;
