const mongoose = require('mongoose');
const env = require('./env');
const logger = require('./logger');

async function connectDatabase() {
  mongoose.connection.on('connected', () => {
    logger.info('MongoDB connected');
  });

  mongoose.connection.on('error', (err) => {
    logger.error(`MongoDB connection error: ${err.message}`);
  });

  await mongoose.connect(env.mongodbUri);
}

module.exports = connectDatabase;
