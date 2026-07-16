import app from './app.js';
import { env } from './config/env.js';
import prisma from './config/prisma.js';
import { startReminderScheduler, stopReminderScheduler } from './services/reminderScheduler.js';
import { exec } from 'child_process';
import { platform } from 'os';

// Catch async errors that escape try/catch (e.g. background fire-and-forget that throws)
// In development, log but DO NOT exit — let the server keep running for debugging
process.on('unhandledRejection', (reason) => {
  console.error('[server] ❌ Unhandled promise rejection:', reason);
  console.error('[server] Stack:', reason instanceof Error ? reason.stack : 'No stack trace');
  // Only exit in production (where a process manager can restart)
  const isDev = process.env.NODE_ENV === 'development';
  if (!isDev) {
    console.error('[server] Exiting due to unhandled rejection in production');
    process.exit(1);
  } else {
    console.warn('[server] ⚠️  Continuing in development mode despite unhandled rejection');
  }
});

process.on('uncaughtException', (error) => {
  console.error('[server] ❌ Uncaught exception:', error);
  console.error('[server] Stack:', error.stack);
  const isDev = process.env.NODE_ENV === 'development';
  if (!isDev) {
    console.error('[server] Exiting due to uncaught exception in production');
    process.exit(1);
  } else {
    console.warn('[server] ⚠️  Continuing in development mode despite uncaught exception');
  }
});

// Kill whatever process is holding the port so we never fight over it during development
function freePort(port) {
  // Validate port is a safe integer before interpolating into a shell command
  const safePort = parseInt(port, 10);
  if (!Number.isInteger(safePort) || safePort < 1 || safePort > 65535) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const cmd = platform() === 'win32'
      ? `powershell -Command "$p=(Get-NetTCPConnection -LocalPort ${safePort} -State Listen -ErrorAction SilentlyContinue).OwningProcess; if($p){Stop-Process -Id $p -Force}"`
      : `lsof -ti tcp:${safePort} | xargs kill -9 2>/dev/null || true`;
    exec(cmd, () => resolve());
  });
}

async function startServer() {
  try {
    await prisma.$connect();
    // Warm-up #1: raw query forces the TCP connection to open.
    await prisma.$queryRaw`SELECT 1`;
    // Warm-up #2: ORM-level query forces Prisma to compile prepared statements
    // for real models. Without this, the first user.findUnique() in production
    // (or after a watch reload) can miss the prepared-statement cache and fail.
    await prisma.user.count().catch(() => {}); // best-effort — don't block startup
    console.log('Database connected successfully');

    // Purge expired refresh tokens left over from previous sessions.
    // Best-effort — a failure here should not block startup.
    prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date() } } })
      .then(r => { if (r.count > 0) console.log(`[startup] Purged ${r.count} expired refresh token(s)`); })
      .catch(e => console.error('[startup] Failed to purge expired tokens:', e.message));

    // Keep-alive: ping the DB every 3 minutes so Supabase's pooler doesn't
    // drop idle connections (it times out after ~5 min of inactivity).
    // Without this, the first request after a quiet period pays a cold-start
    // reconnect penalty of 500–2000 ms.
    setInterval(async () => {
      try { await prisma.$queryRaw`SELECT 1`; }
      catch { /* ignore — next real request will reconnect */ }
    }, 180_000).unref();

    // Start the automated 1-hour deadline reminder scheduler
    startReminderScheduler();

    // Only kill the port in development — never do this in production
    if (env.server.nodeEnv === 'development') await freePort(env.server.port);

    const server = app.listen(env.server.port, () => {
      console.log(`Server running on port ${env.server.port}`);
      console.log(`Environment: ${env.server.nodeEnv}`);
    });

    server.on('error', (err) => {
      console.error('Server error:', err);
      process.exit(1);
    });

    async function shutdown(signal) {
      console.log(`\n[server] ${signal} received — shutting down gracefully`);
      stopReminderScheduler();
      // Cancel the force-exit timer if graceful shutdown succeeds first
      const forceTimer = setTimeout(() => {
        console.error('[server] Forced shutdown after timeout');
        process.exit(1);
      }, 10_000).unref();
      // Stop accepting new connections; give in-flight requests 10 s to finish
      server.close(async () => {
        clearTimeout(forceTimer);
        try {
          await prisma.$disconnect();
          console.log('[server] Database disconnected');
        } catch (err) {
          console.error('[server] Error during DB disconnect:', err.message);
        } finally {
          process.exit(0);
        }
      });
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
