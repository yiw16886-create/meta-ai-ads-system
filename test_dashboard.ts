import prisma from './server/db/index.js';
import axios from 'axios';

async function testFetch() {
  const q1 = await axios.get("http://localhost:3000/api/stores/kolaich/dashboard-summary?startDate=2026-06-04&endDate=2026-06-04");
  console.log("Kolaich:", q1.data);

  const q2 = await axios.get("http://localhost:3000/api/stores/baslayer/dashboard-summary?startDate=2026-06-03&endDate=2026-06-03");
  console.log("Baslayer:", q2.data);
}

testFetch().catch(console.error);
