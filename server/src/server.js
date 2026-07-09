import app from './app.js';
import { env } from './config/env.js';
import prisma from './config/prisma.js';
import { exec } from 'child_process';
import { platform } from 'os';

// Kill whatever process is holding the port so we never fight over it during development
function freePort(port) {
  return new Promise((resolve) => {
    const cmd = platform() === 'win32'
      ? `powershell -Command "$p=(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue).OwningProcess; if($p){Stop-Process -Id $p -Force}"`
      : `lsof -ti tcp:${port} | xargs kill -9 2>/dev/null || true`;
    exec(cmd, () => resolve());
  });
}

async function startServer() {
  try {
    await prisma.$connect();
    // Warm-up: force the connection pool to establish a real connection.
    // Without this, the pool is lazy — the first incoming HTTP request
    // triggers the real DB handshake and can fail on cold start (watch reload).
    await prisma.$queryRaw`SELECT 1`;
    console.log('Database connected successfully');

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

    async function shutdown() {
      server.close(async () => {
        await prisma.$disconnect();
        process.exit(0);
      });
    }

    process.on('SIGTERM', shutdown);
    process.on('SIGINT',  shutdown);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
