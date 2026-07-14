import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();
const IS_PROD = env.server.nodeEnv === 'production';

// Trust the first proxy hop in production (Render, Fly, etc.)
// so req.ip reflects the real client IP for rate-limit keying.
if (IS_PROD) app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,  // React uses inline styles/scripts
  crossOriginEmbedderPolicy: false,
}));

// CORS — allow comma-separated origins in CLIENT_URL
const allowedOrigins = env.client.url.split(',').map(url => url.trim()).filter(Boolean);
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow same-origin requests (no Origin header) only in development.
      // In production every browser request carries an Origin.
      if (!origin) {
        return callback(null, !IS_PROD);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

// Parse cookies — required for HttpOnly JWT cookies
app.use(cookieParser());

// Compress responses
app.use(compression());

// Body parsing — cap at 1 MB to prevent DoS
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Suppress debug noise in production (errors/warns are kept for error tracking)
if (IS_PROD) {
  console.log = () => {};
  console.debug = () => {};
}

// ── Rate limiters ──────────────────────────────────────────────────────────
// General API limiter: 200 req / 15 min per IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please try again later' },
});

// Strict limiter for auth endpoints: 20 attempts / 15 min per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts — please wait 15 minutes and try again' },
  skipSuccessfulRequests: true, // only count failed attempts
});

// ── Health check ───────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Request logging (development only) ────────────────────────────────────
if (!IS_PROD) {
  app.use((req, res, next) => {
    const start = Date.now();
    console.log(`🌐 [${new Date().toISOString()}] ${req.method} ${req.path}`);
    res.on('finish', () => {
      const ms = Date.now() - start;
      console.log(`✓ [${new Date().toISOString()}] ${req.method} ${req.path} → ${res.statusCode} (${ms}ms)`);
    });
    next();
  });
}

// ── Cache helper — stamp cacheable GET responses ───────────────────────────
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.cacheFor = (seconds) => {
    res.setHeader('Cache-Control', `private, max-age=${seconds}`);
    res.json = (body) => { res.json = originalJson; return originalJson(body); };
    return res;
  };
  next();
});

// ── Routes ─────────────────────────────────────────────────────────────────
import authRoutes from './routes/authRoutes.js';
import storeRoutes from './routes/storeRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

app.use('/api/auth',  authLimiter, authRoutes);
app.use('/api/store', apiLimiter,  storeRoutes);
app.use('/api/admin', apiLimiter,  adminRoutes);

// ── 404 for unknown /api routes ────────────────────────────────────────────
app.all('/api/*', (_req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// ── Production: serve React SPA from client/dist ───────────────────────────
if (IS_PROD) {
  const { default: path } = await import('path');
  const { fileURLToPath } = await import('url');
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const distPath = path.join(__dirname, '..', '..', 'client', 'dist');

  app.use(express.static(distPath, { maxAge: '1y', etag: true }));
  // SPA fallback: let React Router handle all non-API paths
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// ── Error handler ──────────────────────────────────────────────────────────
app.use(errorHandler);

export default app;
