import { Request, Response } from 'express';
import axios from 'axios';
import prisma from '../../db/index.js';

export class PageCommentController {
  
  /**
   * 控评核心A：隐藏/取消隐藏评论
   */
  static async toggleHideComment(req: Request, res: Response) {
    try {
      const { commentId } = req.params;
      const { is_hidden } = req.body; 

      if (typeof is_hidden !== 'boolean') {
        return res.status(400).json({ error: "is_hidden must be a boolean" });
      }

      const comment = await prisma.adPostComment.findUnique({
        where: { id: commentId },
        include: {
          post: {
            include: { page: true }
          }
        }
      });

      if (!comment || !comment.post?.page?.access_token) {
        return res.status(404).json({ error: "Comment, post, or page access token not found" });
      }

      const url = `https://graph.facebook.com/v20.0/${commentId}`;
      const response = await axios.post(url, null, {
        params: {
          is_hidden,
          access_token: comment.post.page.access_token
        }
      });

      const isSuccessful = response.status === 200 || (response.data && (response.data.success === true || response.data.id));

      if (isSuccessful) {
        await prisma.adPostComment.update({
          where: { id: commentId },
          data: { is_hidden }
        });
        return res.json({ success: true, is_hidden });
      } else {
        return res.status(400).json({ error: "Meta API returned unsuccessful response", message: "Meta API returned unsuccessful response" });
      }

    } catch (error: any) {
      console.error("[toggleHideComment error]", error?.response?.data || error);
      const metaErrorMsg = error.response?.data?.error?.message;
      const finalError = metaErrorMsg || error.message || "Failed to toggle hide comment";
      if (error.response?.status === 401) {
         return res.status(401).json({ error: "401 Page Access Token Expired", message: "401 Page Access Token Expired" });
      }
      return res.status(error.response?.status || 500).json({ error: finalError, message: finalError });
    }
  }

  /**
   * 控评核心B：彻底删除评论
   */
  static async deleteComment(req: Request, res: Response) {
    try {
      const { commentId } = req.params;

      const comment = await prisma.adPostComment.findUnique({
        where: { id: commentId },
        include: {
          post: {
            include: { page: true }
          }
        }
      });

      if (!comment || !comment.post?.page?.access_token) {
        return res.status(404).json({ error: "Comment, post, or page access token not found", message: "Comment, post, or page access token not found" });
      }

      const url = `https://graph.facebook.com/v20.0/${commentId}`;
      const response = await axios.delete(url, {
        params: {
          access_token: comment.post.page.access_token
        }
      });

      const isSuccessful = response.status === 200 || (response.data && (response.data.success === true || response.data.id));

      if (isSuccessful) {
        await prisma.adPostComment.delete({
          where: { id: commentId }
        });
        return res.json({ success: true });
      } else {
        return res.status(400).json({ error: "Meta API returned unsuccessful response", message: "Meta API returned unsuccessful response" });
      }

    } catch (error: any) {
      console.error("[deleteComment error]", error?.response?.data || error);
      const metaErrorMsg = error.response?.data?.error?.message;
      const finalError = metaErrorMsg || error.message || "Failed to delete comment";
      if (error.response?.status === 401) {
         return res.status(401).json({ error: "401 Page Access Token Expired", message: "401 Page Access Token Expired" });
      }
      return res.status(error.response?.status || 500).json({ error: finalError, message: finalError });
    }
  }
}
