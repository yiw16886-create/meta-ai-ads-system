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
 * 获取所有的 Page Access Token 并进行缓存，避免每个创意请求一次导致的极速限流。
 */
interface PageInfo {
  token: string;
  name: string;
}

async function getPageTokensMap(accessToken: string): Promise<Record<string, PageInfo>> {
  const pageTokensMap: Record<string, PageInfo> = {};
  try {
    let url = "https://graph.facebook.com/v21.0/me/accounts?limit=100";
    while (url) {
      const res = await axios.get(url, { params: { access_token: accessToken } });
      const pages = res.data?.data || [];
      for (const p of pages) {
        if (p.id && p.access_token) {
          pageTokensMap[p.id] = { token: p.access_token, name: p.name || '' };
        }
      }
      url = res.data?.paging?.next || null;
    }
  } catch (e: any) {
    console.warn("getPageTokensMap warning: failed to fetch page tokens, landing url from attachments might be limited:", e.message);
  }
  return pageTokensMap;
}

/**
 * 核心逻辑：利用已有的 ads_read / pages_read_engagement 权限，
 * 深度穷举解析不同类型的广告创意（普通、动态素材、轮播、主页帖子），以及帖子真实落地页链接、主页ID、有效帖子ID。
 */
export async function extractMetaAssetHash(creativeId: string, accessToken: string, pageTokensMap: Record<string, PageInfo> = {}) {
  try {
    const url = `https://graph.facebook.com/v21.0/${creativeId}?fields=name,actor_id,effective_object_story_id,object_story_spec,object_story_id,object_url,template_url,asset_feed_spec,thumbnail_url,image_url,video_id,url_tags&access_token=${accessToken}`;
    const response = await axios.get(url);
    const data = response.data;

    let landingUrl: string | null = null;
    let previewUrl: string | null = data.thumbnail_url || data.image_url || null;
    let metaAssetId: string | null = null;
    let videoHash: string | null = null;
    let videoId: string | null = data.video_id || null;
    let imageHash: string | null = null;

    const pageId = data.actor_id || null;
    const rawEffectivePostId = data.effective_object_story_id || data.object_story_id || null;

    const objStorySpec = data.object_story_spec;
    const assetFeedSpec = data.asset_feed_spec;
    
    // Attempt the requested strict extraction for video_id and link
    if (objStorySpec && objStorySpec.link_data && objStorySpec.link_data.link) {
      landingUrl = objStorySpec.link_data.link;
    }

    if (objStorySpec) {
      if (objStorySpec.link_data) {
        if (!landingUrl && objStorySpec.link_data.link) {
            landingUrl = objStorySpec.link_data.link;
        }
        if (objStorySpec.link_data.call_to_action?.value?.link) {
          const ctaLink = objStorySpec.link_data.call_to_action.value.link;
          const ctaIsDirty = ctaLink.includes("facebook.com/reel") || ctaLink.includes("instagram.com/reel") || ctaLink.includes("facebook.com/watch");
          const landingIsDirty = landingUrl ? (landingUrl.includes("facebook.com/reel") || landingUrl.includes("instagram.com/reel") || landingUrl.includes("facebook.com/watch")) : true;
          
          if (!landingUrl || (landingIsDirty && !ctaIsDirty)) {
              landingUrl = ctaLink;
          }
        }
        metaAssetId = objStorySpec.link_data.image_hash || metaAssetId;
        imageHash = objStorySpec.link_data.image_hash || imageHash;
        if (!previewUrl) previewUrl = objStorySpec.link_data.picture || objStorySpec.link_data.image_url;
      } 
      
      if (objStorySpec.video_data) {
        if (objStorySpec.video_data.call_to_action?.value?.link) {
          const ctaLink = objStorySpec.video_data.call_to_action.value.link;
          const ctaIsDirty = ctaLink.includes("facebook.com/reel") || ctaLink.includes("instagram.com/reel") || ctaLink.includes("facebook.com/watch");
          const landingIsDirty = landingUrl ? (landingUrl.includes("facebook.com/reel") || landingUrl.includes("instagram.com/reel") || landingUrl.includes("facebook.com/watch")) : true;

          if (!landingUrl || (landingIsDirty && !ctaIsDirty)) {
             landingUrl = ctaLink;
          }
        }
        metaAssetId = objStorySpec.video_data.video_id || metaAssetId;
        videoId = objStorySpec.video_data.video_id || videoId;
        videoHash = objStorySpec.video_data.video_hash || videoHash;
        if (!previewUrl) previewUrl = objStorySpec.video_data.image_url;
      } 
      
      if (objStorySpec.photo_data) {
        metaAssetId = objStorySpec.photo_data.image_hash || metaAssetId;
        imageHash = objStorySpec.photo_data.image_hash || imageHash;
        landingUrl = objStorySpec.photo_data.url || landingUrl;
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

    if (!landingUrl) {
       landingUrl = data.object_url || data.template_url || null;
    }

    // 针对主页帖子的有效帖子链接提取（强力穿透 l.facebook 重定向并还原真实独立站链接）
    let pageName: string | null = null;
    if (pageId && pageTokensMap[pageId]) {
      pageName = pageTokensMap[pageId].name;
    }

    if (rawEffectivePostId && pageId && pageTokensMap[pageId]) {
      try {
        const pageToken = pageTokensMap[pageId].token;
        const attachmentsUrl = `https://graph.facebook.com/v21.0/${rawEffectivePostId}/attachments`;
        const attachmentsRes = await axios.get(attachmentsUrl, {
          params: { access_token: pageToken }
        });
        const attachments = attachmentsRes.data?.data || [];
        if (attachments.length > 0) {
          const attachment = attachments[0];
          let postTargetUrl = attachment.target?.url || attachment.url;
          if (postTargetUrl) {
            if (postTargetUrl.includes("l.facebook.com/l.php")) {
              try {
                const parsedUrl = new URL(postTargetUrl);
                const decodedUrl = parsedUrl.searchParams.get("u");
                if (decodedUrl) {
                  postTargetUrl = decodedUrl;
                }
              } catch (_) {}
            }
            // Only overwrite if we haven't found a valid landing page URL yet, or if our current one is just a facebook page reel url
            if (!landingUrl || landingUrl.includes("facebook.com/reel") || landingUrl.includes("facebook.com/watch") || landingUrl.includes("instagram.com/reel")) {
                 landingUrl = postTargetUrl;
            }
          }
          if (!previewUrl && attachment.media?.image?.src) {
            previewUrl = attachment.media.image.src;
          }
        }
      } catch (e: any) {
        console.log(`info: skipped optional story details fetch for effectivePostId ${rawEffectivePostId} (unsupported format or private story)`);
      }
    }

    let finalEffectivePostId = rawEffectivePostId;
    if (finalEffectivePostId && finalEffectivePostId.includes("_")) {
      finalEffectivePostId = finalEffectivePostId.split("_")[1];
    }

    return {
      landingUrl: cleanUrl(landingUrl),
      previewUrl,
      metaAssetId,
      videoHash,
      videoId,
      imageHash,
      pageId,
      pageName,
      effectivePostId: finalEffectivePostId,
      data
    };
  } catch (error: any) {
    console.log(`info: unable to extract asset hash for creative ${creativeId}:`, error?.response?.data?.error?.message || error.message);
    return null;
  }
}

export const runMetaCreativeAutoPatch = async (accessToken: string) => {
  console.log("Starting AdCreative data sync patch via Ad endpoints with robust extraction...");

  // Fetch Page Tokens Map once to avoid multiple listing lookups
  const pageTokensMap = await getPageTokensMap(accessToken);
  console.log(`Fetched page tokens for ${Object.keys(pageTokensMap).length} page(s).`);

  // Get all active accounts mapped directly from database
  const accounts = await prisma.adAccount.findMany({ include: { store: true } });
  
  console.log(`Found ${accounts.length} accounts to process.`);

  const cleanPrefix = (str: string | null | undefined): string => {
    if (!str) return "";
    return str.replace(/^(as-|ad-|camp-)/gi, "");
  };

  for (const account of accounts) {
    // Check if account activity status is 4 or above (dormant), skip entirely
    if (account.activityStatus > 3) {
       console.log(`[Manual Creative Sync] Skipping account ${account.fb_account_id} due to low activity.`);
       continue;
    }

    try {
      const fbAccountId = account.fb_account_id.startsWith('act_') ? account.fb_account_id : `act_${account.fb_account_id}`;
      const rawAccountId = fbAccountId.replace('act_', '');
      
      // Step 1: Fetch active ad IDs in the last 30 days
      const activeAdIds = new Set<string>();
      let insightsUrl: string | null = `https://graph.facebook.com/v21.0/${fbAccountId}/insights`;
      
      console.log(`[Manual Creative Sync] Fetching recent active ad IDs for ${fbAccountId}`);
      try {
          while (insightsUrl) {
              const res = await axios.get(insightsUrl, {
                  params: {
                      level: 'ad',
                      date_preset: 'last_30d',
                      fields: 'ad_id',
                      limit: 500,
                      access_token: accessToken
                  }
              });
              const insights = res.data?.data || [];
              for (const insight of insights) {
                  if (insight.ad_id) activeAdIds.add(insight.ad_id);
              }
              insightsUrl = res.data?.paging?.next || null;
          }
      } catch (err: any) {
          throw new Error('Meta API 授权失效或无权限拉取');
      }

      const activeAdIdsArray = Array.from(activeAdIds);
      console.log(`[Manual Creative Sync] Found ${activeAdIdsArray.length} active ads in the last 30 days for ${fbAccountId}`);

      if (activeAdIdsArray.length === 0) continue;

      // Step 2: Fetch detailed ad data for these active IDs in chunks
      const chunkSize = 50;
      for (let i = 0; i < activeAdIdsArray.length; i += chunkSize) {
        const chunkIds = activeAdIdsArray.slice(i, i + chunkSize);
        
        try {
            const response = await axios.get(`https://graph.facebook.com/v21.0/`, {
              params: {
                ids: chunkIds.join(','),
                fields: 'id,name,campaign{id,name,status},adset{id,name,status},creative{image_hash,video_id,id,image_url,thumbnail_url,object_type,name}',
                access_token: accessToken
              }
            });
            
            const adsData = response.data || {};
            const ads = Object.values(adsData) as any[];

            console.log(`[Manual Creative Sync] Processing batch of ${ads.length} ads for account ${fbAccountId}`);

            for (const ad of ads) {
                try {
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
                        let landingUrl: string | null = null;
                        let pageId: string | null = null;
                        let pageName: string | null = null;
                        let effectivePostId: string | null = null;

                        const dbCreative = await prisma.adCreative.findUnique({
                            where: { creativeId }
                        });

                        if (dbCreative && dbCreative.landingUrl && dbCreative.pageId && dbCreative.effectivePostId) {
                            imageHash = dbCreative.imageHash || imageHash;
                            videoId = dbCreative.videoId || videoId;
                            previewUrl = dbCreative.previewUrl || previewUrl;
                            landingUrl = dbCreative.landingUrl;
                            pageId = dbCreative.pageId;
                            pageName = dbCreative.pageName;
                            effectivePostId = dbCreative.effectivePostId;
                        } else {
                            console.log(`[Manual Creative Sync] Deep fetching creative detailed assets for ID: ${creativeId}`);
                            const extracted = await extractMetaAssetHash(creativeId, accessToken, pageTokensMap);
                            if (extracted) {
                                imageHash = extracted.imageHash || null;
                                videoId = extracted.videoId || null;
                                if (extracted.previewUrl) {
                                    previewUrl = extracted.previewUrl;
                                }
                                landingUrl = extracted.landingUrl;
                                pageId = extracted.pageId;
                                pageName = extracted.pageName || null;
                                effectivePostId = extracted.effectivePostId;
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
                                landingUrl: landingUrl,
                                pageId: pageId,
                                pageName: pageName,
                                effectivePostId: effectivePostId,
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
                                landingUrl: landingUrl,
                                pageId: pageId,
                                pageName: pageName,
                                effectivePostId: effectivePostId,
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
                } catch (adError: any) {
                    console.log(`info: skipped individual ad ${ad?.id || 'unknown'} in batch:`, adError.message);
                }
            }
        } catch (batchErr: any) {
            console.log(`info: skipped batch for account ${fbAccountId}:`, batchErr.response?.data?.error?.message || batchErr.message);
        }
      }
      console.log(`Completed processing active ads for account ${fbAccountId}`);
    } catch (error: any) {
      // If the error is a permission/auth issue, update activityStatus to 4 (dormant) so we don't spam attempts
      const isAuthError = error.message?.includes("授权失效") || error.message?.includes("无权限") || error.response?.status === 400 || error.response?.status === 403;
      if (isAuthError) {
        try {
          await prisma.adAccount.update({
            where: { id: account.id },
            data: { activityStatus: 4 }
          });
          console.log(`info: Account ${account.fb_account_id} marked as dormant (activityStatus: 4) due to permission or authorization failure.`);
        } catch (dbErr: any) {
          console.log(`info: Failed to update status for account ${account.fb_account_id}:`, dbErr.message);
        }
      }
      console.log(`info: skipped account ${account.fb_account_id} processing:`, error.response?.data?.error?.message || error.message);
    }
  }

  console.log("Finished AdCreative hash patch & sync!");
};
