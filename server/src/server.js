import app from './app.js';
import { env } from './config/env.js';
import prisma from './config/prisma.js';

async function startServer() {
  try {
    await prisma.$connect();
    console.log('Database connected successfully');

    const server = app.listen(env.server.port, () => {
      console.log(`Server running on port ${env.server.port}`);
      console.log(`Environment: ${env.server.nodeEnv}`);
    });

    // Graceful shutdown — close the HTTP server first so the port is released
    // before the process exits. This prevents EADDRINUSE when node --watch restarts.
    async function shutdown() {
      server.close(async () => {
        await prisma.$disconnect();
        process.exit(0);
      });
    }

    process.on('SIGTERM', shutdown); // sent by node --watch on restart
    process.on('SIGINT',  shutdown); // Ctrl+C
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
