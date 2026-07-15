import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();
const IS_PROD = env.server.nodeEnv === 'production';

// Trust the first proxy hop in production (Render, Fly, etc.)
// so req.ip reflects the real client IP.
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
      // In production every browser request carries an Origin header.
      // Requests without one (curl, server-to-server) are allowed only in dev.
      if (!origin) return callback(null, !IS_PROD);
      if (allowedOrigins.includes(origin)) return callback(null, true);
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

// Suppress debug noise in production (errors/warns kept for monitoring)
if (IS_PROD) {
  console.log = () => {};
  console.debug = () => {};
}

// ── Health check — also used as keep-alive ping by UptimeRobot / cron ─────
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
import authRoutes      from './routes/authRoutes.js';
import storeRoutes     from './routes/storeRoutes.js';
import adminRoutes     from './routes/adminRoutes.js';
import amRoutes        from './routes/areaManagerRoutes.js';
import adminAmRoutes   from './routes/adminAmRoutes.js';

app.use('/api/auth',       authRoutes);
app.use('/api/store',      storeRoutes);
app.use('/api/admin',      adminRoutes);
app.use('/api/am',         amRoutes);
app.use('/api/admin',      adminAmRoutes);

// ── 404 for unknown /api routes ────────────────────────────────────────────
app.all('/api/*', (_req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// ── Production: serve React SPA from client/dist (only when built together) ──
// When frontend is deployed as a separate Render Static Site, client/dist
// won't exist here — skip static serving so the API still works cleanly.
if (IS_PROD) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const distPath = path.join(__dirname, '..', '..', 'client', 'dist');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath, { maxAge: '1y', etag: true }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

// ── Error handler ──────────────────────────────────────────────────────────
app.use(errorHandler);

export default app;
