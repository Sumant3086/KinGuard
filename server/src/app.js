import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestContext } from './middleware/requestContext.js';
import prisma from './config/prisma.js';

const app = express();
const IS_PROD = env.server.nodeEnv === 'production';

// Trust the first proxy hop in production (Render, Fly, etc.)
// so req.ip reflects the real client IP.
if (IS_PROD) app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      // React renders inline styles; allow them. Scripts are served as files (no inline eval).
      styleSrc:    ["'self'", "'unsafe-inline'"],
      scriptSrc:   ["'self'"],
      imgSrc:      ["'self'", 'data:', 'blob:'],
      connectSrc:  ["'self'"],
      fontSrc:     ["'self'"],
      objectSrc:   ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: IS_PROD ? [] : null,
    },
    // In dev, report violations to console rather than blocking
    reportOnly: !IS_PROD,
  },
}));

// CORS — allow comma-separated origins in CLIENT_URL
const allowedOrigins = env.client.url.split(',').map(url => url.trim()).filter(Boolean);
app.use(
  cors({
    origin: (origin, callback) => {
      // Dev: allow all origins (Vite proxy, curl, Postman, etc.)
      if (!IS_PROD) return callback(null, true);
      // Same-origin requests from the browser carry no Origin header — allow them.
      if (!origin) return callback(null, true);
      // Prod: only configured CLIENT_URL origins get CORS headers.
      // callback(null, false) means no CORS headers set; the browser enforces
      // the rejection client-side. Using new Error() here would cause a 500.
      callback(null, allowedOrigins.includes(origin));
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

// ── Request context — must precede the routes so every log line in a request,
//    including the error handler's, carries the same requestId ────────────────
app.use(requestContext);

// ── Health check — verifies DB connectivity so wait-on (dev) and
//    UptimeRobot (prod) only see OK when the server is fully ready ──────────
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.setHeader('Cache-Control', 'no-store');
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    res.status(503).json({ status: 'starting', timestamp: new Date().toISOString() });
  }
});

// ── Rate limiting ───────────────────────────────────────────────────────────
const rlOptions = { standardHeaders: true, legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'Too many requests. Please try again later.' }) };

// Credential-guessing guard — applied to /login only. Brute-force protection is
// primarily the per-account DB lockout in authController (10 failures → 15 min);
// this is the secondary per-IP ceiling.
const loginLimiter = rateLimit({
  ...rlOptions, windowMs: 15 * 60 * 1000, max: 20,
  handler: (_req, res) => res.status(429).json({ error: 'Too many sign-in attempts. Please try again in a few minutes.' }),
});

// Everything else under /api/auth is session upkeep, not credential entry:
// /me fires on every page load and /refresh every 15 minutes per active user.
// Stores share one NAT'd office IP, so this ceiling has to accommodate a whole
// site's normal traffic — a tight per-IP limit here locks out the entire office
// (including /login, since it sits on the same router).
const authLimiter = rateLimit({ ...rlOptions, windowMs: 15 * 60 * 1000, max: 600 });

// ── Routes ─────────────────────────────────────────────────────────────────
import authRoutes      from './routes/authRoutes.js';
import storeRoutes     from './routes/storeRoutes.js';
import adminRoutes     from './routes/adminRoutes.js';
import amRoutes        from './routes/areaManagerRoutes.js';
import adminAmRoutes   from './routes/adminAmRoutes.js';
import scheduleRoutes  from './routes/scheduleRoutes.js';

app.use('/api/auth/login',    loginLimiter);
app.use('/api/auth',          authLimiter, authRoutes);
app.use('/api/store',         storeRoutes);
app.use('/api/admin',         adminRoutes);
app.use('/api/am',            amRoutes);
app.use('/api/admin',         adminAmRoutes);
app.use('/api/admin/schedules', scheduleRoutes);

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
    // Serve hashed assets (JS/CSS/images) with 1-year cache — safe because
    // Vite embeds content hashes in filenames so stale files are never loaded.
    // index.html itself must NEVER be cached: it references the hashed filenames,
    // and a stale index.html after a redeploy causes "MIME type text/html" errors
    // when the browser tries to load old hashes that no longer exist on the server.
    app.use(express.static(distPath, {
      maxAge: '1y',
      etag: true,
      setHeaders(res, filePath) {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      },
    }));
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

// ── Error handler ──────────────────────────────────────────────────────────
app.use(errorHandler);

export default app;
