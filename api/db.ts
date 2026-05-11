import { PrismaClient } from "@prisma/client";

const prismaClientSingleton = () => {
  let url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  
  if (url) {
    try {
      const parsedUrl = new URL(url);
      
      // Auto-append pgbouncer=true for neon/pooler URLs on serverless environments
      if (parsedUrl.hostname.includes('pooler') || parsedUrl.hostname.includes('neon.tech') || parsedUrl.hostname.includes('supabase.com')) {
        parsedUrl.searchParams.set('pgbouncer', 'true');
        parsedUrl.searchParams.delete('channel_binding');
        url = parsedUrl.toString();
      }
    } catch (e) {
      console.warn("Could not parse database URL.");
    }
  }

  return new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
};

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || prismaClientSingleton();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export default prisma;
