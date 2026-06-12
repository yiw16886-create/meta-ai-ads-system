import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  console.log('DATABASE_URL:', process.env.DATABASE_URL?.substring(0, 30) + '...');
  const count = await prisma.user.count();
  console.log('User count:', count);
}
main().catch(console.dir).finally(() => prisma.$disconnect());
