import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';

export interface MaterialPerformanceItem {
  creative_id: string;
  material_name: string;
  material_type: string;
  preview_url: string | null;
  landing_url: string | null;
  storeId: number | null;
  account_id: string;
  spend: string;
  impressions: number;
  clicks: number;
  reach: number;
  linkClicks: number;
  purchases: number;
  purchaseValue: number;
  addToCart: number;
  initiateCheckout: number;
  cpm: string;
  pageId: string | null;
  pageName: string | null;
  effectivePostId: string | null;
}

export function useMaterialPerformance(filters: {
  storeId: string;
  accountIds: string[];
  dateRange: [string, string];
  materialType: string;
}) {
  const [data, setData] = useState<MaterialPerformanceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // 手动强制刷新成功后递增，通知素材预览重新读取最新缓存数据。
  const [refreshVersion, setRefreshVersion] = useState(0);

  // 只有用户点击“刷新数据”时才绕过服务端缓存。
  const forceRefreshRef = useRef(false);

  const { storeId, materialType } = filters;
  const accountIdsStr = filters.accountIds.join(',');
  const startDate = filters.dateRange[0];
  const endDate = filters.dateRange[1];

  useEffect(() => {
    let active = true;
    const forceRefresh = forceRefreshRef.current;

    setLoading(true);

    const fetchData = async () => {
      let requestSucceeded = false;

      try {
        const response = await axios.get('/api/materials/leaderboard', {
          params: {
            storeId,
            accountIds: accountIdsStr,
            startDate,
            endDate,
            materialType,
            page,
            pageSize: 20,
            // 后端已支持 force_refresh=true。
            // 普通筛选和分页不绕过缓存，只有手动刷新才绕过。
            force_refresh: forceRefresh ? 'true' : undefined
          }
        });

        if (active && response.data?.success) {
          setData(Array.isArray(response.data.data) ? response.data.data : []);
          setTotal(Number(response.data.total || 0));
          requestSucceeded = true;
        }
      } catch (error: any) {
        console.error('前端拉取素材真实指标失败:', error?.message || error);
      } finally {
        if (forceRefresh) {
          forceRefreshRef.current = false;
        }

        if (active) {
          setLoading(false);

          // 强制刷新完成后，让素材预览重新请求。
          // 预览请求会读取刚刚写入的最新服务端缓存，避免重复请求 Meta。
          if (forceRefresh && requestSucceeded) {
            setRefreshVersion(prev => prev + 1);
          }
        }
      }
    };

    fetchData();

    return () => {
      active = false;
    };
  }, [
    storeId,
    accountIdsStr,
    startDate,
    endDate,
    materialType,
    page,
    refreshTrigger
  ]);

  const refresh = useCallback(() => {
    forceRefreshRef.current = true;
    setRefreshTrigger(prev => prev + 1);
  }, []);

  return {
    data,
    loading,
    total,
    page,
    setPage,
    refresh,
    refreshVersion
  };
}
