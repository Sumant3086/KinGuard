import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
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

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/store', storeRoutes);
app.use('/api/admin', adminRoutes);

// Error handling
app.use(errorHandler);

export default app;
