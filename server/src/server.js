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

    // On Windows, node --watch restarts faster than the OS releases the TCP
    // socket, so the new process hits EADDRINUSE before the port is free.
    // Retry after a short delay instead of crashing.
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`Port ${env.server.port} still busy — retrying in 1s...`);
        setTimeout(() => server.listen(env.server.port), 1000);
      } else {
        console.error('Server error:', err);
        process.exit(1);
      }
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
