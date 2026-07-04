import { PrismaClient } from '@prisma/client';

// Singleton PrismaClient instance
let prisma;

export function getPrismaClient() {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
  }
  return prisma;
}

export default getPrismaClient();
