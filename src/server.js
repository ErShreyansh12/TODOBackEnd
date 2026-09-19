const app = require('./app');
const env = require('./config/env');
const logger = require('./config/logger');
const connectDatabase = require('./config/database');

async function start() {
  await connectDatabase();

  app.listen(env.port, () => {
    logger.info(`Server running on port ${env.port} in ${env.nodeEnv} mode`);
  });
}

start().catch((err) => {
  logger.error(`Failed to start server: ${err.message}`);
  process.exit(1);
});
