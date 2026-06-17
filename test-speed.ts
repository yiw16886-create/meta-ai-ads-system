import axios from 'axios';
async function test() {
  console.time('fetch1');
  await axios.get('http://localhost:3000/api/materials/leaderboard?startDate=2026-06-08&endDate=2026-06-15');
  console.timeEnd('fetch1');

  console.time('fetch2');
  await axios.get('http://localhost:3000/api/materials/leaderboard?startDate=2026-06-08&endDate=2026-06-15');
  console.timeEnd('fetch2');
}
test();
