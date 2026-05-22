import prisma from './api/db.js';

async function run() {
  const settings = await prisma.setting.findMany();
  console.log(settings);
}
run();
