import bcrypt from "bcryptjs";
import prisma from "../db.js";

export async function checkDb(): Promise<void> {
  try {
    await prisma.$connect();
    console.log("📡 Connecting to Neon PostgreSQL database...");
    const models = Object.keys(prisma).filter(
      (key) => !key.startsWith("$") && !key.startsWith("_"),
    );
    console.log("📦 Available models in Prisma:", models);
    if (!models.includes("adInsight")) {
      console.error(
        "⚠️ CRITICAL: 'adInsight' model not found on prisma object!",
      );
    }

    // Ensure we have at least one admin user
    const defaultEmail = process.env.VITE_ADMIN_ID || "admin";
    const defaultPass = process.env.VITE_ADMIN_SECRET || "123456";
    const hashedPass = await bcrypt.hash(defaultPass, 10);

    await prisma.user.upsert({
      where: { email: defaultEmail },
      update: { role: "admin", password: hashedPass }, 
      create: {
        email: defaultEmail,
        password: hashedPass,
        role: "admin"
      }
    });
    console.log(`👤 Verified/Restored admin user: ${defaultEmail}`);

    const users = await prisma.user.findMany();
    
    // Migration: hash any plain-text passwords
    for (const user of users) {
      if (user.password && !user.password.startsWith("$2a$") && !user.password.startsWith("$2b$")) {
        console.log(`🔐 Hashing plain-text password for user: ${user.email}`);
        const hashed = await bcrypt.hash(user.password, 10);
        await prisma.user.update({
          where: { id: user.id },
          data: { password: hashed }
        });
      }
    }

  } catch (err) {
    console.error("❌ Database connection failed:", err);
  }
}
