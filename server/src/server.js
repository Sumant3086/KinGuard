import app from './app.js';
import { env } from './config/env.js';
import prisma from './config/prisma.js';
import { exec } from 'child_process';

// Kill whatever process is holding the port so we never fight over it
function freePort(port) {
  return new Promise((resolve) => {
    const cmd = `powershell -Command "$p=(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue).OwningProcess; if($p){Stop-Process -Id $p -Force}"`;
    exec(cmd, () => resolve()); // resolve regardless — nothing on the port is fine too
  });
}

async function startServer() {
  try {
    await prisma.$connect();
    console.log('Database connected successfully');

    await freePort(env.server.port);

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
