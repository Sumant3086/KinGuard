import dotenv from 'dotenv';

dotenv.config();

const requiredEnvVars = [
  'DATABASE_URL',
  'DIRECT_URL',
  'JWT_SECRET',
  'PORT',
  'NODE_ENV',
  'CLIENT_URL',
];

// These two checks intentionally stay on console.error rather than the logger. They
// run at import time, before dotenv has necessarily populated NODE_ENV, and the logger
// reads NODE_ENV once at module load to pick its level and format. Importing it here
// would freeze the wrong config. A failure below exits the process anyway, so plain
// stderr is the right channel.
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

if (process.env.JWT_SECRET.length < 32) {
  console.error('JWT_SECRET must be at least 32 characters long');
  process.exit(1);
}

export const env = {
  database: {
    url: process.env.DATABASE_URL,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
  },
  server: {
    port: parseInt(process.env.PORT, 10) || 5000,
    nodeEnv: process.env.NODE_ENV,
  },
  client: {
    url: process.env.CLIENT_URL,
  },
};
