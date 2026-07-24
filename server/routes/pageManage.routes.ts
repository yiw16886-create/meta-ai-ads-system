import { Router } from "express";
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
router.get("/", async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.json([]);
    }
    const pages = await prisma.facebookPage.findMany({
      where: { userId: Number(userId) }
    });
    res.json(pages);
  } catch (error: any) {
    res.json({ error: error.message });
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
router.get("/:pageId/posts", async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.json([]);
    }
    const { pageId } = req.params;
    const page = await prisma.facebookPage.findFirst({
      where: { id: pageId, userId: Number(userId) }
    });
    if (!page) {
      return res.json([]);
    }
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
router.get("/post/:postId/comments", async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.json([]);
    }
    const { postId } = req.params;
    const post = await prisma.facebookAdPost.findFirst({
      where: { id: postId, page: { userId: Number(userId) } }
    });
    if (!post) {
      return res.json([]);
    }
    const comments = await prisma.adPostComment.findMany({
      where: { post_id: postId },
      orderBy: { created_time: 'desc' }
    });
    res.json(comments);
  } catch (error: any) {
    res.json({ error: error.message });
  }
});

// Page ads fetch endpoint (Sync from Meta API)
router.post("/:pageId/fetch-ads", async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const { pageId } = req.params;
    const page = await prisma.facebookPage.findFirst({
      where: { id: pageId, userId: Number(userId) }
    });
    if (!page) {
      return res.status(403).json({ error: "Forbidden: Page access denied" });
    }
    const result = await MetaPageManagerService.fetchAdsPosts(pageId);
    res.json({ success: true, posts: result.posts, warnings: result.warnings });
  } catch (error: any) {
    if (error.message.includes("401") || error.message.includes("OAuth") || error.message.includes("token")) {
      return res.status(401).json({ error: error.message, message: error.message });
    }
    res.json({ error: error.message, message: error.message });
  }
});

// Post comments fetch endpoint
router.post("/post/:postId/fetch-comments", async (req, res) => {
  try {
    const { postId } = req.params;
    const result = await MetaPageManagerService.fetchPostComments(postId);
    res.json({ success: true, comments: result.comments, warnings: result.warnings });
  } catch (error: any) {
    if (error.message.includes("401") || error.message.includes("OAuth") || error.message.includes("token")) {
      return res.status(401).json({ error: error.message, message: error.message });
    }
    res.json({ error: error.message, message: error.message });
  }
});

// Comment toggle hide
router.post("/comment/:commentId/toggle-hide", PageCommentController.toggleHideComment);

// Comment delete
router.delete("/comment/:commentId", PageCommentController.deleteComment);

export default router;
