import axios from 'axios';
import prisma from '../../db/index.js';
import { getMetaToken } from '../utils.js';

export class MetaPageManagerService {
  static async fetchAndSyncPages(accessToken: string, userId?: number) {
    if (!accessToken || !accessToken.trim()) {
      throw new Error("未提供有效的 Facebook 授权 Token，请先完成账号绑定");
    }

    const token = accessToken.trim();

    try {
      let url: string | null = `https://graph.facebook.com/v20.0/me/accounts`;
      let params: any = {
        fields: "id,name,access_token",
        access_token: token,
        limit: 100,
      };

      const allPages: any[] = [];

      while (url) {
        const response: any = await axios.get(url, {
          params: url.includes("access_token") ? undefined : params,
        });

        const data = response.data;
        allPages.push(...(data.data || []));

        url = data.paging?.next || null;
        params = {}; // subsequent requests use the next URL which already contains params
      }

      for (const page of allPages) {
        if (!page.access_token) continue; // Need the page access token
        await prisma.facebookPage.upsert({
          where: { id: page.id },
          create: {
            id: page.id,
            page_name: page.name || "Unknown Page",
            access_token: page.access_token,
            shop_id: "", // Default or leave empty until mapped
            is_active: true,
            userId: userId ? Number(userId) : null,
          },
          update: {
            page_name: page.name || "Unknown Page",
            access_token: page.access_token,
            userId: userId ? Number(userId) : null,
          },
        });
      }

      return allPages;
    } catch (error: any) {
      if (error.response?.status === 401) {
         throw new Error("401 Meta Token Expired");
      }
      const metaMsg = error.response?.data?.error?.message;
      if (metaMsg) {
         throw new Error(`Meta API Error (fetchAndSyncPages): ${metaMsg}`);
      }
      throw error;
    }
  }

  /**
   * 抓取该公共主页发布的所有普通帖子（时间线与已发布动态）
   */
  static async fetchAdsPosts(pageId: string, userId?: number) {
    return this.fetchPagePosts(pageId, userId);
  }

  static async fetchPagePosts(pageId: string, userId?: number) {
    let page = await prisma.facebookPage.findUnique({
      where: { id: pageId },
    });

    let pageAccessToken = page?.access_token;

    // If access token is missing or page not found, dynamically fetch page access token from Meta
    if (!pageAccessToken) {
      const userToken = await getMetaToken(userId);
      if (userToken) {
        try {
          const pageRes = await axios.get(`https://graph.facebook.com/v20.0/${pageId}`, {
            params: {
              fields: "access_token,name",
              access_token: userToken,
            },
            timeout: 8000,
          });
          if (pageRes.data?.access_token) {
            pageAccessToken = pageRes.data.access_token;
            page = await prisma.facebookPage.upsert({
              where: { id: pageId },
              update: {
                access_token: pageAccessToken,
                page_name: pageRes.data.name || page?.page_name || "Unknown Page",
                userId: userId ? Number(userId) : null,
              },
              create: {
                id: pageId,
                page_name: pageRes.data.name || "Unknown Page",
                access_token: pageAccessToken,
                shop_id: "",
                is_active: true,
                userId: userId ? Number(userId) : null,
              },
            });
          }
        } catch (tokenErr: any) {
          console.warn(`[fetchPagePosts] Failed to fetch page token for ${pageId}:`, tokenErr.response?.data || tokenErr.message);
        }
      }
    }

    if (!pageAccessToken) {
      throw new Error("公共主页未授权或 Token 缺失，请先在右上角同步公共主页");
    }

    const warnings: string[] = [];

    const fetchPostsWithToken = async (token: string) => {
      let pagePosts: any[] = [];

      // 1. Fetch published posts directly from /{pageId}/posts
      try {
        let url: string | null = `https://graph.facebook.com/v20.0/${pageId}/posts`;
        let params: any = {
          fields: "id,message,story,created_time,status_type,full_picture,picture,permalink_url,attachments{media,type,unshimmed_url,title}",
          access_token: token,
          limit: 50,
        };

        while (url && pagePosts.length < 100) {
          const res: any = await axios.get(url, {
            params: url.includes("access_token") ? undefined : params,
            timeout: 10000,
          });
          const data = res.data;
          pagePosts.push(...(data.data || []));
          url = data.paging?.next || null;
          params = {};
        }
      } catch (e: any) {
        warnings.push(`普通帖子抓取提示: ${e.response?.data?.error?.message || e.message}`);
      }

      // 2. If /posts returned empty, fallback to /{pageId}/feed
      if (pagePosts.length === 0) {
        try {
          let url: string | null = `https://graph.facebook.com/v20.0/${pageId}/feed`;
          let params: any = {
            fields: "id,message,story,created_time,status_type,full_picture,picture,permalink_url",
            access_token: token,
            limit: 50,
          };

          while (url && pagePosts.length < 100) {
            const feedResponse: any = await axios.get(url, {
              params: url.includes("access_token") ? undefined : params,
              timeout: 10000,
            });
            const data = feedResponse.data;
            pagePosts.push(...(data.data || []));
            url = data.paging?.next || null;
            params = {};
          }
        } catch (e: any) {
          warnings.push(`动态流抓取提示: ${e.response?.data?.error?.message || e.message}`);
        }
      }

      return pagePosts;
    };

    let allPosts = await fetchPostsWithToken(pageAccessToken);

    // If failed with token error, attempt one auto-refresh with user token
    if (allPosts.length === 0 && warnings.some(w => w.includes("OAuth") || w.includes("token") || w.includes("session") || w.includes("190"))) {
      const userToken = await getMetaToken(userId);
      if (userToken) {
        try {
          const pageRes = await axios.get(`https://graph.facebook.com/v20.0/${pageId}`, {
            params: {
              fields: "access_token,name",
              access_token: userToken,
            },
            timeout: 8000,
          });
          if (pageRes.data?.access_token) {
            pageAccessToken = pageRes.data.access_token;
            await prisma.facebookPage.update({
              where: { id: pageId },
              data: { access_token: pageAccessToken },
            });
            warnings.length = 0;
            allPosts = await fetchPostsWithToken(pageAccessToken);
          }
        } catch (e: any) {
          console.warn(`[fetchPagePosts] Token auto-refresh failed for ${pageId}:`, e.message);
        }
      }
    }

    // Remove duplicates by ID
    const uniquePosts = Array.from(new Map(allPosts.map((item) => [item.id, item])).values());

    for (const post of uniquePosts) {
      const previewUrl = post.full_picture || post.picture || post.attachments?.data?.[0]?.media?.image?.src || null;
      post.preview_url = previewUrl;

      const postContent = post.message || post.story || "";

      await prisma.facebookAdPost.upsert({
        where: { id: post.id },
        create: {
          id: post.id,
          page_id: pageId,
          ad_id: null,
          post_title: postContent ? postContent.substring(0, 500) : null,
          preview_url: previewUrl,
          created_time: post.created_time ? new Date(post.created_time) : new Date(),
        },
        update: {
          post_title: postContent ? postContent.substring(0, 500) : null,
          preview_url: previewUrl,
        },
      });
    }

    return { posts: uniquePosts, warnings };
  }

  /**
   * 透视指定广告帖子的全量评论
   */
  static async fetchPostComments(postId: string, userId?: number) {
    const post = await prisma.facebookAdPost.findUnique({
      where: { id: postId },
      include: { page: true }
    });

    if (!post || !post.page) {
      throw new Error("找不到对应的贴文或公共主页信息");
    }

    let token = post.page.access_token;
    if (!token) {
      token = (await getMetaToken(userId)) || "";
    }

    if (!token) {
      throw new Error("缺少有效的访问授权 Token");
    }

    const warnings: string[] = [];
    let comments: any[] = [];

    try {
      let url: string | null = `https://graph.facebook.com/v20.0/${postId}/comments`;
      let params: any = {
        fields: "id,message,from,created_time,is_hidden",
        filter: "stream",
        limit: 100,
        access_token: token,
      };

      while (url) {
        const response: any = await axios.get(url, {
          params: url.includes("access_token") ? undefined : params,
        });
        const data = response.data;
        comments.push(...(data.data || []));
        url = data.paging?.next || null;
        params = {}; // subsequent requests use the next URL which already contains params
      }
    } catch (error: any) {
      warnings.push(`Could not fetch comments for post ${postId}: ${error.response?.data?.error?.message || error.message}`);
      console.warn(`Could not fetch comments for post ${postId}:`, error.response?.data?.error?.message || error.message);
    }

    try {
      for (const comment of comments) {
        if (!comment.from) continue;
        
        await prisma.adPostComment.upsert({
          where: { id: comment.id },
          create: {
            id: comment.id,
            post_id: postId,
            from_name: comment.from.name || "Unknown",
            from_id: comment.from.id || "Unknown",
            message: comment.message || "",
            is_hidden: comment.is_hidden || false,
            created_time: new Date(comment.created_time),
          },
          update: {
            is_hidden: comment.is_hidden || false,
            message: comment.message || "",
          },
        });
      }

      return { comments, warnings };
    } catch (error: any) {
      if (error.response?.status === 401) {
         throw new Error("401 Page Access Token Expired");
      }
      const metaMsg = error.response?.data?.error?.message;
      if (metaMsg) {
         throw new Error(`Meta API Error (fetchPostComments): ${metaMsg}`);
      }
      throw error;
    }
  }
}
