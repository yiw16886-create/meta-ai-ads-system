import { PrismaClient } from "@prisma/client";
import axios from "axios";

const prisma = new PrismaClient();

const cleanUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  try {
    const urlObj = new URL(url);
    urlObj.search = "";
    urlObj.hash = "";
    return urlObj.toString();
  } catch (e) {
    const parts = url.split("?");
    return parts[0] || null;
  }
};

/**
 * 核心逻辑：利用已有的 ads_read / pages_read_engagement 权限，
 * 深度穷举解析不同类型的广告创意（普通、动态素材、轮播、主页帖子），榨干其素材哈希值。
 */
export async function extractMetaAssetHash(creativeId: string, accessToken: string) {
  try {
    const url = `https://graph.facebook.com/v21.0/${creativeId}?fields=name,object_story_spec,object_story_id,asset_feed_spec,thumbnail_url,image_url,video_id,url_tags&access_token=${accessToken}`;
    const response = await axios.get(url);
    const data = response.data;

    let landingUrl: string | null = null;
    let previewUrl: string | null = data.thumbnail_url || data.image_url || null;
    let metaAssetId: string | null = null;
    let videoHash: string | null = null;
    let videoId: string | null = data.video_id || null;
    let imageHash: string | null = null;

    const objStorySpec = data.object_story_spec;
    const assetFeedSpec = data.asset_feed_spec;

    if (objStorySpec) {
      if (objStorySpec.link_data) {
        landingUrl = objStorySpec.link_data.link;
        metaAssetId = objStorySpec.link_data.image_hash;
        imageHash = objStorySpec.link_data.image_hash;
        if (!previewUrl) previewUrl = objStorySpec.link_data.picture || objStorySpec.link_data.image_url;
      } else if (objStorySpec.video_data) {
        if (objStorySpec.video_data.call_to_action && objStorySpec.video_data.call_to_action.value) {
          landingUrl = objStorySpec.video_data.call_to_action.value.link;
        }
        metaAssetId = objStorySpec.video_data.video_id;
        videoId = objStorySpec.video_data.video_id;
        videoHash = objStorySpec.video_data.video_hash || null;
        if (!previewUrl) previewUrl = objStorySpec.video_data.image_url;
      } else if (objStorySpec.photo_data) {
        metaAssetId = objStorySpec.photo_data.image_hash;
        imageHash = objStorySpec.photo_data.image_hash;
        landingUrl = objStorySpec.photo_data.url;
      }
    }

    if (assetFeedSpec) {
      if (!landingUrl && assetFeedSpec.link_urls && assetFeedSpec.link_urls.length > 0) {
        landingUrl = assetFeedSpec.link_urls[0].website_url;
      }
      if (!metaAssetId) {
        if (assetFeedSpec.images && assetFeedSpec.images.length > 0) {
          metaAssetId = assetFeedSpec.images[0].hash;
          imageHash = assetFeedSpec.images[0].hash;
        } else if (assetFeedSpec.videos && assetFeedSpec.videos.length > 0) {
          metaAssetId = assetFeedSpec.videos[0].video_id;
          videoId = assetFeedSpec.videos[0].video_id;
        }
      }
    }

    // 针对轮播或者其他深层结构（进一步解析如果有的话，比如 object_story_id）
    if (!metaAssetId && data.object_story_id) {
       try {
           const postUrl = `https://graph.facebook.com/v21.0/${data.object_story_id}?fields=attachments&access_token=${accessToken}`;
           const postRes = await axios.get(postUrl);
           const attachments = postRes.data?.attachments?.data;
           if (attachments && attachments.length > 0) {
              const attachment = attachments[0];
              if (!landingUrl && attachment.target && attachment.target.url) {
                 landingUrl = attachment.target.url;
              }
              if (!previewUrl && attachment.media && attachment.media.image && attachment.media.image.src) {
                 previewUrl = attachment.media.image.src;
              }
           }
       } catch (e: any) {
           console.warn(`Failed to fetch object_story_id ${data.object_story_id} details`);
       }
    }

    return {
      landingUrl: cleanUrl(landingUrl),
      previewUrl,
      metaAssetId,
      videoHash,
      videoId,
      imageHash,
      data
    };
  } catch (error: any) {
    console.error(`Error extracting asset hash for creative ${creativeId}:`, error?.response?.data?.error?.message || error.message);
    return null;
  }
}

export const runMetaCreativeAutoPatch = async (accessToken: string) => {
  console.log("Starting AdCreative data sync patch...");
  
  const creatives = await prisma.adCreative.findMany({});
  
  console.log(`Found ${creatives.length} creatives to sync.`);

  for (const creative of creatives) {
    try {
      const creativeId = creative.creativeId;
      const accountId = creative.fbAccountId;
      
      const extracted = await extractMetaAssetHash(creativeId, accessToken);
      
      if (!extracted) {
         continue;
      }

      let { landingUrl, previewUrl, metaAssetId, videoHash, videoId, imageHash, data } = extracted;

      // 如果有 imageHash 或 metaAssetId 但是没 previewUrl，再去 adimages 找
      if (metaAssetId && !previewUrl && !data?.object_story_spec?.video_data) {
        try {
          const imageRes = await axios.get(
            `https://graph.facebook.com/v21.0/act_${accountId}/adimages`,
            {
              params: {
                hashes: JSON.stringify([metaAssetId]),
                fields: 'url,permalink_url',
                access_token: accessToken
              }
            }
          );
          if (imageRes.data?.data && imageRes.data.data.length > 0) {
            previewUrl = imageRes.data.data[0].url || imageRes.data.data[0].permalink_url;
          }
        } catch (imgErr: any) {
          console.warn(`Could not resolve image URL for hash ${metaAssetId}`);
        }
      }

      await prisma.adCreative.update({
        where: { creativeId },
        data: {
          landingUrl: landingUrl || null,
          previewUrl: previewUrl || null,
          metaAssetId: metaAssetId || null,
          videoHash: videoHash || null,
          videoId: videoId || undefined,
          imageHash: imageHash || undefined,
        }
      });
      
      console.log(`Updated creative ${creativeId} - Landing: ${landingUrl}, Asset ID: ${metaAssetId}`);
      
    } catch (error: any) {
      console.error(`Failed to update creative ${creative.creativeId}:`, error.response?.data?.error?.message || error.message);
    }
  }
  
  console.log("Finished AdCreative data sync patch!");
};
