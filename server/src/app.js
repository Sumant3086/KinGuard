import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: env.client.url,
    credentials: true,
  })
);

// Compression
app.use(compression());

// Body parsing — cap JSON at 1 MB to prevent DoS via oversized payloads
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── Rate limiting ─────────────────────────────────────────────────
// Auth endpoints: 10 attempts per 15 minutes — brute-force guard
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait 15 minutes and try again.' },
});

// General API: 300 requests per minute — allows normal use, blocks scrapers
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' },
  skip: () => env.server.nodeEnv === 'development',
});

// Suppress verbose dev logs in production
if (process.env.NODE_ENV === 'production') {
  const noop = () => {};
  console.log = noop;
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Import routes
import authRoutes from './routes/authRoutes.js';
import storeRoutes from './routes/storeRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

// Mount routes — auth gets the strict limiter, rest get the general one
app.use('/api/auth',  authLimiter, authRoutes);
app.use('/api/store', apiLimiter,  storeRoutes);
app.use('/api/admin', apiLimiter,  adminRoutes);

// Error handling
app.use(errorHandler);

export default app;
