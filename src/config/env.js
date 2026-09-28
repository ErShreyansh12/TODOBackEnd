const dotenv = require('dotenv');
const { IANAZone } = require('luxon');

dotenv.config();

const requiredVars = ['MONGODB_URI', 'JWT_SECRET'];

for (const key of requiredVars) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const appTimezone = process.env.APP_TIMEZONE || 'Asia/Kolkata';

if (!IANAZone.isValidZone(appTimezone)) {
  throw new Error(`APP_TIMEZONE is not a valid IANA time zone: ${appTimezone}`);
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  mongodbUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  appTimezone,
};

module.exports = env;
