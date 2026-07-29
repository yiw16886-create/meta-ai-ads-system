import axios from "axios";

const graphVersion = process.env.META_GRAPH_VERSION || "v20.0";
const graphBaseUrl = `https://graph.facebook.com/${graphVersion}`;

export type DraftAdInput = {
  accountId: string;
  campaignName: string;
  adSetName: string;
  adName: string;
  dailyBudget: number;
  currency?: string;
  countries: string[];
  ageMin: number;
  ageMax: number;
  interestQuery?: string;
  pixelId: string;
  pageId: string;
  landingUrl: string;
  imageUrl: string;
  primaryText: string;
  headline: string;
};

function cleanAccountId(accountId: string) {
  return String(accountId || "").replace(/^act_/, "").trim();
}

function graphError(error: any) {
  return error?.response?.data?.error?.message || error?.message || "Meta API 请求失败";
}

async function postGraph(path: string, payload: Record<string, unknown>, token: string) {
  try {
    const response = await axios.post(`${graphBaseUrl}/${path}`, {
      ...payload,
      access_token: token,
    }, { timeout: 15000 });
    return response.data;
  } catch (error) {
    throw new Error(graphError(error));
  }
}

export async function listCampaigns(accountId: string, token: string) {
  const cleanId = cleanAccountId(accountId);
  try {
    const response = await axios.get(`${graphBaseUrl}/act_${cleanId}/campaigns`, {
      params: {
        fields: "id,name,status,effective_status,objective,daily_budget,lifetime_budget,created_time,updated_time",
        limit: 100,
        access_token: token,
      },
      timeout: 10000,
    });
    return response.data?.data || [];
  } catch (error) {
    throw new Error(graphError(error));
  }
}

async function resolveInterestId(query: string, token: string) {
  try {
    const response = await axios.get(`${graphBaseUrl}/search`, {
      params: {
        type: "adinterest",
        q: query,
        limit: 10,
        access_token: token,
      },
      timeout: 10000,
    });
    const exact = (response.data?.data || []).find(
      (item: any) => String(item.name || "").toLowerCase() === query.toLowerCase(),
    );
    return exact || response.data?.data?.[0] || null;
  } catch (error) {
    throw new Error(`兴趣“${query}”解析失败：${graphError(error)}`);
  }
}

export async function createPausedSalesDraft(input: DraftAdInput, token: string) {
  const cleanId = cleanAccountId(input.accountId);
  const accountPath = `act_${cleanId}`;
  const dailyBudgetMinorUnits = Math.round(input.dailyBudget * 100);
  const interest = input.interestQuery
    ? await resolveInterestId(input.interestQuery, token)
    : null;

  const created: Record<string, string> = {};
  try {
    const campaign = await postGraph(`${accountPath}/campaigns`, {
      name: input.campaignName,
      objective: "OUTCOME_SALES",
      status: "PAUSED",
      special_ad_categories: [],
      buying_type: "AUCTION",
    }, token);
    created.campaignId = campaign.id;

    const targeting: Record<string, unknown> = {
      geo_locations: { countries: input.countries },
      age_min: input.ageMin,
      age_max: input.ageMax,
    };
    if (interest) {
      targeting.flexible_spec = [{ interests: [{ id: interest.id, name: interest.name }] }];
    }

    const adSet = await postGraph(`${accountPath}/adsets`, {
      name: input.adSetName,
      campaign_id: campaign.id,
      daily_budget: dailyBudgetMinorUnits,
      billing_event: "IMPRESSIONS",
      optimization_goal: "OFFSITE_CONVERSIONS",
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
      destination_type: "WEBSITE",
      promoted_object: {
        pixel_id: input.pixelId,
        custom_event_type: "PURCHASE",
      },
      targeting,
      status: "PAUSED",
    }, token);
    created.adSetId = adSet.id;

    const creative = await postGraph(`${accountPath}/adcreatives`, {
      name: `${input.adName} Creative`,
      object_story_spec: {
        page_id: input.pageId,
        link_data: {
          link: input.landingUrl,
          picture: input.imageUrl,
          message: input.primaryText,
          name: input.headline,
          call_to_action: {
            type: "SHOP_NOW",
            value: { link: input.landingUrl },
          },
        },
      },
    }, token);
    created.creativeId = creative.id;

    const ad = await postGraph(`${accountPath}/ads`, {
      name: input.adName,
      adset_id: adSet.id,
      creative: { creative_id: creative.id },
      status: "PAUSED",
    }, token);
    created.adId = ad.id;

    return {
      ...created,
      status: "PAUSED",
      resolvedInterest: interest ? { id: interest.id, name: interest.name } : null,
    };
  } catch (error: any) {
    const partial = Object.keys(created).length
      ? `；已创建的暂停对象：${JSON.stringify(created)}`
      : "";
    throw new Error(`${error.message}${partial}`);
  }
}
