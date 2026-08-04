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

  const fetchData = useCallback(async (isForce = false) => {
    let requestSucceeded = false;
    setLoading(true);

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
          force_refresh: isForce ? 'true' : undefined
        }
      });

      if (response.data?.success) {
        setData(Array.isArray(response.data.data) ? response.data.data : []);
        setTotal(Number(response.data.total || 0));
        requestSucceeded = true;
      }
    } catch (error: any) {
      console.error('前端拉取素材真实指标失败:', error?.message || error);
    } finally {
      setLoading(false);
      if (isForce && requestSucceeded) {
        setRefreshVersion(prev => prev + 1);
      }
    }
  }, [storeId, accountIdsStr, startDate, endDate, materialType, page]);

  // 1. 首次及依赖改变或手动刷新触发时加载
  useEffect(() => {
    const isForce = forceRefreshRef.current;
    if (isForce) {
      forceRefreshRef.current = false;
    }
    fetchData(isForce);
  }, [fetchData, refreshTrigger]);

  // 2. 废除固定时间间隔轮询 (无 setInterval)。
  // 仅在“页面重新聚焦 (revalidateOnFocus)”和“网络重新连接 (revalidateOnReconnect)”时静默刷新最新数据。
  useEffect(() => {
    const handleFocus = () => {
      console.log('[useMaterialPerformance] Window refocused -> revalidating data...');
      fetchData(false);
    };

    const handleOnline = () => {
      console.log('[useMaterialPerformance] Network reconnected -> revalidating data...');
      fetchData(false);
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
    };
  }, [fetchData]);

  // 3. 手动刷新按钮触发逻辑
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
