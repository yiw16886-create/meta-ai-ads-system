import { Router } from "express";
import axios from "axios";
import { PageCommentController } from "../controllers/pageComment.controller.js";
import { MetaPageManagerService } from "../services/metaPageManager.service.js";
import { createPagePost, createPostComment, deletePagePost } from "../controllers/page.controller.js";
import prisma from "../../db/index.js";
import { authenticateJWT } from "../middlewares/auth.middleware.js";
import { getMetaToken } from "../utils.js";

const router = Router();

// Create a new feed/photos post on Meta Facebook Page
router.post("/posts/create", authenticateJWT as any, createPagePost);
router.post("/:pageId/publish-post", authenticateJWT as any, createPagePost);

// Comment/reply on a Facebook post on behalf of the page
router.post("/post/:postId/comment", createPostComment);

// Delete/unpublish a post from page (both Facebook and DB)
router.delete("/post/:postId", deletePagePost);


// Get all mapped pages
router.get("/", authenticateJWT as any, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const pages = await prisma.facebookPage.findMany({
      where: userId ? {
        OR: [
          { userId: Number(userId) },
          { userId: null }
        ]
      } : undefined,
      orderBy: { page_name: 'asc' }
    });
    res.json(pages);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Check Meta OAuth Page permissions status
router.get("/permissions-status", authenticateJWT as any, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const token = await getMetaToken(userId);
    if (!token) {
      return res.json({
        connected: false,
        message: "未检测到 Meta 绑定授权",
        permissions: [],
        pagePermissionsGranted: false,
        pageCount: 0
      });
    }

    // Inspect permissions via Meta Graph API
    let permissions: Array<{ permission: string; status: string }> = [];
    try {
      const permRes = await axios.get("https://graph.facebook.com/v20.0/me/permissions", {
        params: { access_token: token },
        timeout: 8000
      });
      permissions = permRes.data?.data || [];
    } catch (permErr: any) {
      console.warn("[Meta Permissions Check] Failed:", permErr.response?.data || permErr.message);
    }

    // Inspect me/accounts page count
    let pageCount = 0;
    let pageNames: string[] = [];
    try {
      const accountsRes = await axios.get("https://graph.facebook.com/v20.0/me/accounts", {
        params: { access_token: token, fields: "id,name", limit: 25 },
        timeout: 8000
      });
      const pageList = accountsRes.data?.data || [];
      pageCount = pageList.length;
      pageNames = pageList.map((p: any) => p.name);
    } catch (accErr: any) {
      console.warn("[Meta Accounts Check] Failed:", accErr.response?.data || accErr.message);
    }

    const grantedMap = new Set(
      permissions.filter(p => p.status === "granted").map(p => p.permission)
    );

    const hasPagesShowList = grantedMap.has("pages_show_list");
    const hasPagesReadEngagement = grantedMap.has("pages_read_engagement");
    const hasPagesManagePosts = grantedMap.has("pages_manage_posts");

    const pagePermissionsGranted = hasPagesShowList && (hasPagesReadEngagement || hasPagesManagePosts);

    return res.json({
      connected: true,
      permissions,
      grantedPermissions: Array.from(grantedMap),
      hasPagesShowList,
      hasPagesReadEngagement,
      hasPagesManagePosts,
      pagePermissionsGranted,
      pageCount,
      samplePages: pageNames.slice(0, 5)
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch and sync pages from Meta API using system user token
router.post("/fetch-pages", authenticateJWT as any, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const token = await getMetaToken(userId);
    if (!token) {
      return res.status(400).json({ success: false, code: "FB_NOT_CONNECTED", message: "未绑定 Facebook 账号或 Token 已失效，请前往配置页面绑定" });
    }
    const pages = await MetaPageManagerService.fetchAndSyncPages(token, userId);
    res.json({ success: true, count: pages.length });
  } catch (error: any) {
    if (error.message.includes("401") || error.message.includes("OAuth") || error.message.includes("token")) {
      return res.status(401).json({ error: error.message, message: error.message });
    }
    res.json({ error: error.message, message: error.message });
  }
});

// Alias endpoint for frontend compatibility
router.post("/sync", authenticateJWT as any, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const token = await getMetaToken(userId);
    if (!token) {
      return res.status(400).json({ success: false, code: "FB_NOT_CONNECTED", message: "未绑定 Facebook 账号或 Token 已失效，请前往配置页面绑定" });
    }
    const pages = await MetaPageManagerService.fetchAndSyncPages(token, userId);
    res.json({ success: true, count: pages.length });
  } catch (error: any) {
    if (error.message.includes("401") || error.message.includes("OAuth") || error.message.includes("token")) {
      return res.status(401).json({ error: error.message, message: error.message });
    }
    res.json({ error: error.message, message: error.message });
  }
});

// Get posts from DB for a page
router.get("/:pageId/posts", authenticateJWT as any, async (req: any, res) => {
  try {
    const { pageId } = req.params;
    const posts = await prisma.facebookAdPost.findMany({
      where: { page_id: pageId },
      orderBy: { created_time: 'desc' }
    });
    res.json(posts);
  } catch (error: any) {
    res.json({ error: error.message });
  }
});

// Get comments from DB for a post
router.get("/post/:postId/comments", authenticateJWT as any, async (req: any, res) => {
  try {
    const { postId } = req.params;
    const comments = await prisma.adPostComment.findMany({
      where: { post_id: postId },
      orderBy: { created_time: 'desc' }
    });
    res.json(comments);
  } catch (error: any) {
    res.json({ error: error.message });
  }
});

// Page posts fetch endpoint (Fetch regular published posts from Meta API)
router.post("/:pageId/fetch-posts", authenticateJWT as any, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const { pageId } = req.params;
    const page = await prisma.facebookPage.findUnique({
      where: { id: pageId }
    });
    if (!page) {
      return res.status(404).json({ error: "找不到指定的公共主页，请先点击右上角同步公共主页" });
    }
    const result = await MetaPageManagerService.fetchPagePosts(pageId, userId);
    res.json({ success: true, posts: result.posts, warnings: result.warnings });
  } catch (error: any) {
    if (error.message.includes("401") || error.message.includes("OAuth") || error.message.includes("token")) {
      return res.status(401).json({ error: error.message, message: error.message });
    }
    res.status(500).json({ error: error.message, message: error.message });
  }
});

// Backward compatibility alias for fetch-ads
router.post("/:pageId/fetch-ads", authenticateJWT as any, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const { pageId } = req.params;
    const page = await prisma.facebookPage.findUnique({
      where: { id: pageId }
    });
    if (!page) {
      return res.status(404).json({ error: "找不到指定的公共主页，请先点击右上角同步公共主页" });
    }
    const result = await MetaPageManagerService.fetchPagePosts(pageId, userId);
    res.json({ success: true, posts: result.posts, warnings: result.warnings });
  } catch (error: any) {
    if (error.message.includes("401") || error.message.includes("OAuth") || error.message.includes("token")) {
      return res.status(401).json({ error: error.message, message: error.message });
    }
    res.status(500).json({ error: error.message, message: error.message });
  }
});

// Post comments fetch endpoint
router.post("/post/:postId/fetch-comments", authenticateJWT as any, async (req: any, res) => {
  try {
    const userId = req.user?.id;
    const { postId } = req.params;
    const result = await MetaPageManagerService.fetchPostComments(postId, userId);
    res.json({ success: true, comments: result.comments, warnings: result.warnings });
  } catch (error: any) {
    if (error.message.includes("401") || error.message.includes("OAuth") || error.message.includes("token")) {
      return res.status(401).json({ error: error.message, message: error.message });
    }
    res.status(500).json({ error: error.message, message: error.message });
  }
});

// Comment toggle hide
router.post("/comment/:commentId/toggle-hide", PageCommentController.toggleHideComment);

// Comment delete
router.delete("/comment/:commentId", PageCommentController.deleteComment);

export default router;
