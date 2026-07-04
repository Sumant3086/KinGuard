import { createServer } from 'http';
import { Server } from 'socket.io';
import app from './app.js';
import { env } from './config/env.js';
import { PrismaClient } from '@prisma/client';
import jwt from 'jsonwebtoken';
import { setSocketIO } from './controllers/storeController.js';

const prisma = new PrismaClient();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: env.client.url,
    credentials: true,
  },
});

// WebSocket authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication required'));
  }

  try {
    const decoded = jwt.verify(token, env.jwt.secret);
    socket.userId = decoded.userId;
    socket.role = decoded.role;
    socket.storeId = decoded.storeId;
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

// WebSocket connection handler
io.on('connection', (socket) => {
  console.log(`[WebSocket] User ${socket.userId} connected`);

  // Join room based on role
  if (socket.role === 'STORE_MANAGER' && socket.storeId) {
    socket.join(`store:${socket.storeId}`);
    console.log(`[WebSocket] User joined store:${socket.storeId}`);
  } else if (socket.role === 'ADMIN') {
    socket.join('admin');
    console.log(`[WebSocket] User joined admin room`);
  }

  socket.on('disconnect', () => {
    console.log(`[WebSocket] User ${socket.userId} disconnected`);
  });
});

// Pass io instance to controllers
setSocketIO(io);

// Export io instance for use in controllers
export { io };

async function startServer() {
  try {
    // Test database connection
    await prisma.$connect();
    console.log('Database connected successfully');

    // Start server
    httpServer.listen(env.server.port, () => {
      console.log(`Server running on port ${env.server.port}`);
      console.log(`Environment: ${env.server.nodeEnv}`);
      console.log(`WebSocket enabled`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  io.close();
  process.exit(0);
});

startServer();
