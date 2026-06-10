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
           console.log(`info: skipped optional story details fetch for storyId ${data.object_story_id}`);
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
  console.log("Starting AdCreative data sync patch via Ad endpoints with robust extraction...");

  // Get all active accounts mapped directly from database
  const accounts = await prisma.adAccount.findMany({ include: { store: true } });
  
  console.log(`Found ${accounts.length} accounts to process.`);

  const cleanPrefix = (str: string | null | undefined): string => {
    if (!str) return "";
    return str.replace(/^(as-|ad-|camp-)/gi, "");
  };

  for (const account of accounts) {
    try {
      const fbAccountId = account.fb_account_id.startsWith('act_') ? account.fb_account_id : `act_${account.fb_account_id}`;
      const rawAccountId = fbAccountId.replace('act_', '');
      let url: string | null = `https://graph.facebook.com/v21.0/${fbAccountId}/ads`;
      
      let hasNext = true;
      while(url && hasNext) {
        console.log(`[Manual Creative Sync] Fetching ads from URL: ${url}`);
        const response = await axios.get(url, {
          params: {
            fields: 'id,name,campaign{id,name,status},adset{id,name,status},creative{image_hash,video_id,id,image_url,thumbnail_url,object_type,name}',
            limit: 100,
            access_token: accessToken
          }
        });
        
        const ads = response.data?.data || [];
        console.log(`[Manual Creative Sync] Found ${ads.length} ads in current batch for account ${fbAccountId}`);

        for (const ad of ads) {
            if (ad.creative && ad.creative.id) {
                const creativeId = ad.creative.id;
                
                // 1. Get Campaign info and upsert Campaign
                let campId = null;
                if (ad.campaign && ad.campaign.id) {
                    campId = cleanPrefix(ad.campaign.id);
                    await prisma.campaign.upsert({
                        where: { id: campId },
                        update: {
                            name: ad.campaign.name || `Campaign ${campId}`,
                            status: ad.campaign.status || "ACTIVE"
                        },
                        create: {
                            id: campId,
                            accountId: rawAccountId,
                            name: ad.campaign.name || `Campaign ${campId}`,
                            status: ad.campaign.status || "ACTIVE"
                        }
                    });
                }

                // 2. Get AdSet info and upsert AdSet
                let adsetId = null;
                if (ad.adset && ad.adset.id && campId) {
                    adsetId = cleanPrefix(ad.adset.id);
                    await prisma.adSet.upsert({
                        where: { id: adsetId },
                        update: {
                            name: ad.adset.name || `AdSet ${adsetId}`,
                            campaignId: campId
                        },
                        create: {
                            id: adsetId,
                            campaignId: campId,
                            accountId: rawAccountId,
                            name: ad.adset.name || `AdSet ${adsetId}`
                        }
                    });
                }

                // 3. Extract hasKey / asset hashes
                let imageHash = ad.creative.image_hash || null;
                let videoId = ad.creative.video_id || null;
                let previewUrl = ad.creative.thumbnail_url || ad.creative.image_url || null;
                
                // If the fields are blank, let's query the specific creative endpoint for deep inspection!
                if (!imageHash && !videoId) {
                    console.log(`[Manual Creative Sync] Deep fetching creative detailed assets for ID: ${creativeId}`);
                    const extracted = await extractMetaAssetHash(creativeId, accessToken);
                    if (extracted) {
                        imageHash = extracted.imageHash || null;
                        videoId = extracted.videoId || null;
                        if (extracted.previewUrl) {
                            previewUrl = extracted.previewUrl;
                        }
                    }
                }

                const hash = imageHash || videoId;
                const mediaType = videoId ? "VIDEO" : "IMAGE";

                // 4. Upsert AdCreative
                await prisma.adCreative.upsert({
                    where: { creativeId },
                    update: {
                        fbAccountId: fbAccountId,
                        imageHash: imageHash,
                        videoId: videoId,
                        previewUrl: previewUrl,
                        metaAssetId: hash,
                        mediaType: mediaType,
                        type: mediaType,
                        storeId: account.storeId,
                        name: ad.creative.name || ad.name ? `Creative for ${ad.creative.name || ad.name}` : `Creative ${creativeId}`
                    },
                    create: {
                        creativeId,
                        fbAccountId: fbAccountId,
                        imageHash: imageHash,
                        videoId: videoId,
                        previewUrl: previewUrl,
                        metaAssetId: hash,
                        mediaType: mediaType,
                        type: mediaType,
                        storeId: account.storeId,
                        name: ad.creative.name || ad.name ? `Creative for ${ad.creative.name || ad.name}` : `Creative ${creativeId}`
                    }
                });

                // 5. Upsert Ad with updated creativeId reference
                const cleanedAdId = cleanPrefix(ad.id);
                if (adsetId && campId) {
                    await prisma.ad.upsert({
                        where: { id: cleanedAdId },
                        update: {
                            name: ad.name || `Ad ${cleanedAdId}`,
                            adsetId: adsetId,
                            campaignId: campId,
                            creativeId: creativeId
                        },
                        create: {
                            id: cleanedAdId,
                            adsetId: adsetId,
                            campaignId: campId,
                            accountId: rawAccountId,
                            name: ad.name || `Ad ${cleanedAdId}`,
                            creativeId: creativeId
                        }
                    });
                }
            }
        }
        
        if (response.data?.paging?.next) {
            url = response.data.paging.next;
        } else {
            hasNext = false;
        }
      }
      console.log(`Completed processing ads for account ${fbAccountId}`);
    } catch (error: any) {
      console.error(`Failed to process account ${account.fb_account_id}:`, error.response?.data?.error?.message || error.message);
    }
  }

  console.log("Finished AdCreative hash patch & sync!");
};
