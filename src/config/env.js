require('dotenv').config({ quiet: true });

const isProd = process.env.NODE_ENV === 'production';

const env = {
  isProd,
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/clashiq',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-jwt-secret',
  cookieSecret: process.env.COOKIE_SECRET || 'dev-only-cookie-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  roomKey: process.env.ROOM_ENCRYPTION_KEY || process.env.JWT_SECRET || 'dev-only-room-key',
  timezone: process.env.APP_TIMEZONE || 'Asia/Kolkata',
  tzOffset: process.env.APP_TZ_OFFSET || '+05:30',
  testModeDeposits: String(process.env.TEST_MODE_DEPOSITS ?? 'true') !== 'false',
  seedAdminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@clashiq.gg',
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD || 'Admin@123',
};

if (isProd && (env.jwtSecret.startsWith('dev-only') || env.jwtSecret.startsWith('change-this'))) {
  console.warn('[WARN] JWT_SECRET is using a default value. Set a strong secret in production!');
}

module.exports = env;
