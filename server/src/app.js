import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: env.client.url,
    credentials: true, // required for cross-origin cookies (dev proxy → server)
  })
);

// Parse cookies — required for HttpOnly JWT access/refresh token cookies
app.use(cookieParser());

// Compression
app.use(compression());

// Body parsing — cap JSON at 1 MB to prevent DoS via oversized payloads
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// In production suppress only console.log (debug/perf noise).
// console.error and console.warn are preserved for error tracking.
if (env.server.nodeEnv === 'production') {
  console.log = () => {};
  console.debug = () => {};
}

// Health check (no-store, checked frequently by proxies)
app.get('/api/health', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Request logging middleware (development only)
if (env.server.nodeEnv === 'development') {
  app.use((req, res, next) => {
    const start = Date.now();
    console.log(`🌐 [${new Date().toISOString()}] ${req.method} ${req.path}`);
    
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`✓ [${new Date().toISOString()}] ${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`);
    });
    
    next();
  });
}

// Tiny helper: stamp cacheable GET responses so browsers/CDNs cooperate.
// Only applied to routes that explicitly call it — mutation routes never should.
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.cacheFor = (seconds) => {
    res.setHeader('Cache-Control', `private, max-age=${seconds}`);
    res.json = (body) => { res.json = originalJson; return originalJson(body); };
    return res;
  };
  next();
});

// Import routes
import authRoutes from './routes/authRoutes.js';
import storeRoutes from './routes/storeRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

app.use('/api/auth',  authRoutes);
app.use('/api/store', storeRoutes);
app.use('/api/admin', adminRoutes);

// Error handling
app.use(errorHandler);

export default app;
