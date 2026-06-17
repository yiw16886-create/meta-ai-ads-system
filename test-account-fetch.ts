import axios from 'axios';
async function test() {
  const accountId = '1352072466719315';
  const res = await axios.get(`http://localhost:3000/api/materials/leaderboard?startDate=2026-06-08&endDate=2026-06-15&accountIds=${accountId}`);
  console.log("Returned data length:", res.data.data.length);
  const totalSpend = res.data.data.reduce((sum, ad) => sum + Number(ad.spend), 0);
  console.log("Total spend:", totalSpend);
}
test();
