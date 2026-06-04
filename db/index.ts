import { PrismaClient } from "@prisma/client";

const prismaClientSingleton = () => {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL;
  if (!url) {
    console.warn("⚠️ DATABASE_URL is not set. Prisma might fail.");
    return new PrismaClient();
  }
  
  // Use standard Prisma Client
  return new PrismaClient({
    datasources: {
      db: { url }
    }
  });
};

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || prismaClientSingleton();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
