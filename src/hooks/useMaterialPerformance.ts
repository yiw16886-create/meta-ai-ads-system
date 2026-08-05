import useSWR from 'swr';
import axios from 'axios';
import { useState, useCallback, useRef } from 'react';

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

// 模块级缓存时间戳，实现跨组件卸载/挂载精确定位 120 秒冷却锁
const globalLastFetchMap = new Map<string, number>();

// Fetcher 函数：使用 POST 发送 Body 参数，根除超长 URL 导致的 414 / Timeout 异常
const fetcher = ([url, params]: [string, Record<string, any>]) => {
  const paramKey = JSON.stringify(params);
  const now = Date.now();
  const lastFetch = globalLastFetchMap.get(paramKey) || 0;

  // 如果非强刷请求在 120 秒 (120,000ms) 防抖冷却期内，直接读取缓存
  if (!params.force_refresh && now - lastFetch < 120000) {
    console.log('[useMaterialPerformance] 命中 120 秒防抖保护，静默读取 SWR 内存缓存');
  } else {
    globalLastFetchMap.set(paramKey, now);
  }

  // 同时也支持 GET 与 POST
  return axios.post(url, params).then(res => res.data);
};

export function useMaterialPerformance(filters: {
  storeId: string;
  accountIds: string[];
  dateRange: [string, string];
  materialType: string;
  page?: number;
}) {
  const [internalPage, setInternalPage] = useState(1);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const lastFetchTimeRef = useRef<number>(0);

  const { storeId, materialType, page: externalPage } = filters;
  const page = externalPage ?? internalPage;
  const setPage = setInternalPage;

  // 1. 账户 ID 预清洗：仅保留符合格式的前缀账户
  const cleanedAccountIds = (filters.accountIds || [])
    .map(id => id.trim())
    .filter(id => id.length > 0);

  const accountIdsStr = cleanedAccountIds.join(',');
  const startDate = filters.dateRange[0];
  const endDate = filters.dateRange[1];

  // 构建统一的 SWR Key（不带任何 tab 等 UI 路由参数，彻底与视图层解耦）
  const queryParams = {
    storeId,
    accountIds: accountIdsStr,
    startDate,
    endDate,
    materialType,
    page,
    pageSize: 20,
  };

  const { data, error, isLoading, isValidating, mutate } = useSWR(
    ['/api/materials/leaderboard', queryParams],
    fetcher,
    {
      revalidateOnFocus: false,     // ❌ 彻底关闭切屏自动刷新，杜绝全屏 Loading 闪烁
      revalidateOnReconnect: true,  // ✅ 网络重连时静默校验
      dedupingInterval: 120000,     // ⏱️ 120 秒内重复请求直接读取 SWR 缓存
      keepPreviousData: true,       // 🚀 保持上一次数据，避免切换分页时 Loading 空白
    }
  );

  const itemList: MaterialPerformanceItem[] = (data?.data || []) as MaterialPerformanceItem[];

  // 核心控制：仅在【完全没有数据（首次加载）】或【手动点击强刷】时才为 true！
  // 切 Tab 或重新挂载时，只要 data 中有数据，一律为 false，无感知静默更新！
  const computedLoading = (itemList.length === 0 || isManualRefreshing) && (isLoading || isManualRefreshing);

  // 手动强刷处理逻辑
  const refresh = useCallback(async () => {
    setIsManualRefreshing(true);
    try {
      const now = Date.now();
      lastFetchTimeRef.current = now;
      
      const paramKey = JSON.stringify({ ...queryParams, force_refresh: 'true' });
      globalLastFetchMap.set(paramKey, now);

      await mutate(
        fetcher(['/api/materials/leaderboard', { ...queryParams, force_refresh: 'true' }]),
        { revalidate: true }
      );
      setRefreshVersion(prev => prev + 1);
    } catch (e) {
      console.error('[useMaterialPerformance] 强刷失败:', e);
    } finally {
      setIsManualRefreshing(false);
    }
  }, [mutate, queryParams]);

  return {
    data: itemList,
    total: Number(data?.total || 0),
    loading: computedLoading,
    validating: isValidating,
    page,
    setPage,
    refresh,
    refreshVersion,
    error,
  };
}
