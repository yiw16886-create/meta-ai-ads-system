import { PrismaClient } from "@prisma/client";
import axios from "axios";
import dotenv from "dotenv";

// Load environment variables (e.g. DATABASE_URL)
dotenv.config();

const prisma = new PrismaClient();

async function runTest() {
  console.log("=================================================");
  console.log("🚀 Starting Facebook Enterprise Token Gray Test");
  console.log("=================================================");

  try {
    // 1. Read token from the database
    console.log("📂 Connecting to database and reading token...");
    const tokenSetting = await prisma.setting.findUnique({
      where: { key: "META_ACCESS_TOKEN" }
    });

    if (!tokenSetting || !tokenSetting.value) {
      console.error("❌ ERROR: Key 'META_ACCESS_TOKEN' not found in Settings table!");
      console.log("👉 Please bind your Facebook account via the frontend interface first.");
      
      // List all existing setting keys for diagnostics
      const allSettings = await prisma.setting.findMany();
      if (allSettings.length > 0) {
        console.log("\n📋 Available settings keys in database currently:");
        allSettings.forEach(s => {
          console.log(` - ${s.key}: ${s.key === "META_ACCESS_TOKEN" ? "[HIDDEN]" : s.value}`);
        });
      } else {
        console.log("\n📋 No settings are currently configured in the database.");
      }
      return;
    }

    const token = tokenSetting.value;
    const maskedToken = `${token.substring(0, 15)}...${token.substring(token.length - 15)}`;
    console.log(`✅ Successfully retrieved Token: ${maskedToken}`);

    // Retrieve and show authorized user info if stored
    const userIdSetting = await prisma.setting.findUnique({
      where: { key: "FB_AUTHORIZED_USER_ID" }
    });
    if (userIdSetting && userIdSetting.value) {
      console.log(`👤 Authorized User ID: ${userIdSetting.value}`);
    }

    // 2. Query Meta Graph API for Business Managers
    const apiVersion = "v20.0";
    const endpoint = `https://graph.facebook.com/${apiVersion}/me/businesses`;
    const fields = "id,name,vertical,verification_status,created_time";

    console.log(`\n📡 Fetching BM list from Meta Graph API (${apiVersion})...`);
    console.log(`🔗 Endpoint: ${endpoint}`);
    console.log(`📋 Fields requested: ${fields}`);

    const response = await axios.get(endpoint, {
      params: {
        fields: fields,
        limit: 100
      },
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    // 3. Robust printing of results
    if (response.data && response.data.data) {
      const bms = response.data.data;
      console.log("\n=================================================");
      console.log(`🎉 SUCCESS! Retrieved ${bms.length} Business Manager(s)`);
      console.log("=================================================");

      bms.forEach((bm, index) => {
        console.log(`\n[BM #${index + 1}]`);
        console.log(`  🔹 Name: ${bm.name}`);
        console.log(`  🔹 ID: ${bm.id}`);
        console.log(`  🔹 Vertical: ${bm.vertical || "N/A"}`);
        console.log(`  🔹 Verification Status: ${bm.verification_status || "N/A"}`);
        console.log(`  🔹 Created Time: ${bm.created_time || "N/A"}`);
      });
      console.log("\n=================================================");
    } else {
      console.log("\n⚠️ Response did not contain a standard BM array format:");
      console.dir(response.data, { depth: null });
    }

  } catch (error) {
    console.error("\n❌ ERROR OCCURRED DURING GRAY TEST:");
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error(`🔴 Meta API Response Error (Status Code: ${error.response.status})`);
      if (error.response.data) {
        console.error("📋 Error Payload Details:");
        console.dir(error.response.data, { depth: null });
      } else {
        console.error("🔴 Empty error response body from Meta API.");
      }
    } else if (error.request) {
      // The request was made but no response was received
      console.error("🔴 No response received from Meta API. Network or DNS issue.");
      console.error(error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error("🔴 General Error:", error.message);
    }
  } finally {
    // Ensure the Prisma Client connection is closed cleanly
    await prisma.$disconnect();
    console.log("\n🔌 Database connection closed cleanly. Test run finished.");
  }
}

runTest();
