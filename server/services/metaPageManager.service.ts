import axios from 'axios';
import prisma from '../../db/index.js';

export class MetaPageManagerService {
  static async fetchAndSyncPages() {
    const setting = await prisma.setting.findUnique({
      where: { key: "meta_access_token" },
    });

    const token = setting?.value || process.env.META_ACCESS_TOKEN;

    if (!token) {
      throw new Error("全局 Meta Token 未配置");
    }

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
          },
          update: {
            page_name: page.name || "Unknown Page",
            access_token: page.access_token,
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
   * 抓取该主页所有正在投放的广告贴（含暗帖）和主页时间线帖子
   */
  static async fetchAdsPosts(pageId: string) {
    const page = await prisma.facebookPage.findUnique({
      where: { id: pageId },
    });

    if (!page || !page.access_token) {
      throw new Error("Page not found or access token missing");
    }

    const warnings: string[] = [];

    try {
      // 1. Fetch ads posts (Dark Posts & Ads)
      let adsPosts: any[] = [];
      try {
        let url: string | null = `https://graph.facebook.com/v20.0/${pageId}/ads_posts`;
        let params: any = {
          fields: "id,message,created_time,object_id,status,full_picture,picture",
          access_token: page.access_token,
          limit: 100,
        };

        while (url) {
          const adsResponse: any = await axios.get(url, {
            params: url.includes("access_token") ? undefined : params,
          });
          const data = adsResponse.data;
          adsPosts.push(...(data.data || []));
          url = data.paging?.next || null;
          params = {}; // subsequent requests use the next URL which already contains params
        }
      } catch (e: any) {
        warnings.push(`Missing advanced ads permissions for /ads_posts endpoint: ${e.response?.data?.error?.message || e.message}`);
        console.warn(`Could not fetch ads_posts for page ${pageId}:`, e.response?.data?.error?.message || e.message);
      }

      // 2. Fetch page feed
      let feedPosts: any[] = [];
      try {
        let url: string | null = `https://graph.facebook.com/v20.0/${pageId}/feed`;
        let params: any = {
          fields: "id,message,created_time,status,full_picture,picture",
          access_token: page.access_token,
          limit: 100,
        };

        while (url) {
          const feedResponse: any = await axios.get(url, {
            params: url.includes("access_token") ? undefined : params,
          });
          const data = feedResponse.data;
          feedPosts.push(...(data.data || []));
          url = data.paging?.next || null;
          params = {}; // subsequent requests use the next URL which already contains params
        }
      } catch (e: any) {
        warnings.push(`Feed sync failed: ${e.response?.data?.error?.message || e.message}`);
        console.warn(`Could not fetch feed for page ${pageId}:`, e.response?.data?.error?.message || e.message);
      }

      const allPosts = [
        ...adsPosts,
        ...feedPosts,
      ];

      // Remove duplicates by ID
      const uniquePosts = Array.from(new Map(allPosts.map((item) => [item.id, item])).values());

      for (const post of uniquePosts) {
        const previewUrl = post.full_picture || post.picture || null;
        post.preview_url = previewUrl; // Attach to return object for client response

        await prisma.facebookAdPost.upsert({
          where: { id: post.id },
          create: {
            id: post.id,
            page_id: pageId,
            ad_id: post.object_id || null,
            post_title: post.message ? post.message.substring(0, 500) : null,
            preview_url: previewUrl,
            created_time: new Date(post.created_time),
          },
          update: {
            post_title: post.message ? post.message.substring(0, 500) : null,
            ad_id: post.object_id || post.ad_id || null,
            preview_url: previewUrl,
          },
        });
      }

      return { posts: uniquePosts, warnings };
    } catch (error: any) {
      if (error.response?.status === 401) {
         throw new Error("401 Page Access Token Expired");
      }
      const metaMsg = error.response?.data?.error?.message;
      if (metaMsg) {
         throw new Error(`Meta API Error (fetchAdsPosts): ${metaMsg}`);
      }
      throw error;
    }
  }

  /**
   * 透视指定广告帖子的全量评论
   */
  static async fetchPostComments(postId: string) {
    const post = await prisma.facebookAdPost.findUnique({
      where: { id: postId },
      include: { page: true }
    });

    if (!post || !post.page || !post.page.access_token) {
      throw new Error("Post/Page not found or access token missing");
    }

    const warnings: string[] = [];
    let comments: any[] = [];

    try {
      let url: string | null = `https://graph.facebook.com/v20.0/${postId}/comments`;
      let params: any = {
        fields: "id,message,from,created_time,is_hidden",
        filter: "stream",
        limit: 100,
        access_token: post.page.access_token,
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
