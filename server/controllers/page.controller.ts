import { Request, Response } from 'express';
import axios from 'axios';
import prisma from '../../db/index.js';

export const createPagePost = async (req: Request, res: Response) => {
  try {
    const { pageId, message, imageUrl } = req.body;
    
    // 1. 根据传入的 pageId，从本地 FacebookPage 表中精准捞取该 Page 专属的 page_access_token
    const page = await prisma.facebookPage.findUnique({ where: { id: pageId } });
    if (!page || !page.access_token) {
      return res.status(404).json({ success: false, message: '找不到对应的公共主页授权' });
    }

    let response;
    
    // 2. 根据运营是否上传了图片，自动分流 Meta Graph API 写入端点
    if (imageUrl) {
      // 如果有图片，调用 /photos 端点发布带图贴文
      response = await axios.post(`https://graph.facebook.com/v20.0/${pageId}/photos`, {
        url: imageUrl,
        caption: message,
        access_token: page.access_token
      });
    } else {
      // 如果纯文字，调用 /feed 端点发布纯文本贴文
      response = await axios.post(`https://graph.facebook.com/v20.0/${pageId}/feed`, {
        message: message,
        access_token: page.access_token
      });
    }

    // Meta 成功返回后会吐出：{ id: "post_id" } 或 { id: "photo_id", post_id: "xxx" }
    const fbPostId = response.data.post_id || response.data.id;

    // 3. 💥 核心：发布成功后，立刻在本地 Prisma 库里 upsert 一条记录，实现全血缘数据即时对齐
    const finalTitle = message || `系统直接发布贴文 (${new Date().toLocaleDateString()})`;
    const newPost = await prisma.facebookAdPost.upsert({
      where: { id: fbPostId },
      update: { post_title: finalTitle, preview_url: imageUrl || null },
      create: {
        id: fbPostId,
        page_id: pageId,
        post_title: finalTitle,
        preview_url: imageUrl || null,
        created_time: new Date()
      }
    });

    return res.json({ success: true, message: '动态成功发布至 Facebook 公共主页！', data: newPost });
  } catch (error: any) {
    console.error('发布主页贴文失败:', error.response?.data || error.message);
    const metaErrorMsg = error.response?.data?.error?.message || error.message;
    return res.status(error.response?.status || 500).json({ success: false, message: metaErrorMsg, error: metaErrorMsg });
  }
};

export const createPostComment = async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ success: false, message: '评论内容不能为空', error: '评论内容不能为空' });
    }

    // 1. 获取贴文以及对应的 Page Access Token
    const post = await prisma.facebookAdPost.findUnique({
      where: { id: postId },
      include: { page: true }
    });

    if (!post || !post.page || !post.page.access_token) {
      return res.status(404).json({ success: false, message: '找不到对应的公共主页授权', error: '找不到对应的公共主页授权' });
    }

    // 2. 调用 Meta API 写入评论
    const response = await axios.post(`https://graph.facebook.com/v20.0/${postId}/comments`, {
      message: message,
      access_token: post.page.access_token
    });

    // 格式：{ id: "comment_id" }
    const fbCommentId = response.data.id;

    // 3. 将新评论保存至本地，同步数据
    const newComment = await prisma.adPostComment.create({
      data: {
        id: fbCommentId,
        post_id: postId,
        from_name: post.page.page_name,
        from_id: post.page.id,
        message: message,
        is_hidden: false,
        created_time: new Date()
      }
    });

    return res.json({ success: true, message: '成功回复并同步评论到 Meta 平台！', comment: newComment });
  } catch (error: any) {
    console.error('回复主页贴文评论失败:', error.response?.data || error.message);
    const metaErrorMsg = error.response?.data?.error?.message || error.message;
    return res.status(error.response?.status || 500).json({ success: false, message: metaErrorMsg, error: metaErrorMsg });
  }
};

export const deletePagePost = async (req: Request, res: Response) => {
  try {
    const { postId } = req.params;

    // 1. 查找本地帖子和对应的 Page Access Token
    const post = await prisma.facebookAdPost.findUnique({
      where: { id: postId },
      include: { page: true }
    });

    let deleteError: string | null = null;
    if (post && post.page && post.page.access_token) {
      try {
        // 2. 在 Meta Graph API 上彻底删除该帖子 (同步彻底删除)
        await axios.delete(`https://graph.facebook.com/v20.0/${postId}`, {
          params: {
            access_token: post.page.access_token
          }
        });
      } catch (metaError: any) {
        deleteError = metaError.response?.data?.error?.message || metaError.message;
        console.warn(`Meta 帖子删除失败或已被删除:`, metaError.response?.data || metaError.message);
      }
    }

    // 3. 本地数据库删除帖子
    await prisma.facebookAdPost.delete({
      where: { id: postId }
    });

    return res.json({ 
      success: true, 
      message: '本地已解绑，且贴文已极速向 Meta 平台执行同步物理下架！',
      warning: deleteError ? `Meta 返回提示: ${deleteError}` : undefined
    });
  } catch (error: any) {
    console.error('删除主页贴文失败:', error.response?.data || error.message);
    const metaErrorMsg = error.response?.data?.error?.message || error.message;
    return res.status(error.response?.status || 500).json({ success: false, message: '下架同步失败: ' + metaErrorMsg, error: metaErrorMsg });
  }
};

