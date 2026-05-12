import axios from 'axios';
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tokenRecord = await prisma.setting.findUnique({ where: { key: "META_ACCESS_TOKEN" } });
  const token = tokenRecord?.value;
  if (!token) return console.log("NO TOKEN");

  // Choose romanti-s2 account from previous output
  const accountId = '4224628771111125';
  
  try {
    const res = await axios.get(`https://graph.facebook.com/v19.0/act_${accountId}/campaigns`, {
      params: {
        fields: 'name,status,effective_status,objective,budget_remaining,daily_budget,lifetime_budget,insights.time_range({"since":"2026-04-11","until":"2026-05-10"}){spend,impressions,reach,frequency,actions,cost_per_action_type}',
        access_token: token,
      }
    });
    console.log(JSON.stringify(res.data, null, 2));
  } catch(e: any) {
    console.log(e.response ? e.response.data : e.message);
  }
}
main();
