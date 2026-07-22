import { Router } from "express";
import prisma from "../../db/index.js";

const router = Router();

router.get("/", async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "用户未登录" });
    }

    const dbUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!dbUser) {
      return res.status(401).json({ error: "用户不存在" });
    }
    
    req.user.role = dbUser.role;
    const isSuperAdmin = req.user.role === "SUPER_ADMIN";

    const config = await prisma.systemSetting.findFirst();
    return res.json({
      meta_client_id: config?.meta_client_id || process.env.META_APP_ID || process.env.FACEBOOK_CLIENT_ID || "",
      meta_config_id: config?.meta_config_id || "",
      meta_client_secret: isSuperAdmin ? (config?.meta_client_secret || process.env.META_APP_SECRET || process.env.FACEBOOK_CLIENT_SECRET || "") : ""
    });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

router.post("/", async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "用户未登录" });
    }

    const dbUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!dbUser) {
      return res.status(401).json({ error: "用户不存在" });
    }

    req.user.role = dbUser.role;

    if (req.user.role !== "SUPER_ADMIN") {
      return res.status(403).json({ error: "无权访问" });
    }

    const { meta_client_id, meta_client_secret, meta_config_id } = req.body;

    const existing = await prisma.systemSetting.findFirst();
    let result;
    if (existing) {
      result = await prisma.systemSetting.update({
        where: { id: existing.id },
        data: {
          meta_client_id,
          meta_client_secret,
          meta_config_id,
        },
      });
    } else {
      result = await prisma.systemSetting.create({
        data: {
          meta_client_id: meta_client_id || "",
          meta_client_secret: meta_client_secret || "",
          meta_config_id: meta_config_id || "",
        },
      });
    }

    return res.json({ success: true, setting: result });
  } catch (error: any) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
