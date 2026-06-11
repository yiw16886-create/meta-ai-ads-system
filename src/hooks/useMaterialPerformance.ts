import { useState, useEffect, useCallback } from 'react';
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

  // Extract primitives to prevent reference change triggering infinite re-renders
  const { storeId, materialType } = filters;
  const accountIdsStr = filters.accountIds.join(',');
  const startDate = filters.dateRange[0];
  const endDate = filters.dateRange[1];

  useEffect(() => {
    let active = true;
    setLoading(true);

    const fetchData = async () => {
      try {
        const response = await axios.get('/api/materials/leaderboard', {
          params: {
            storeId,
            accountIds: accountIdsStr,
            startDate,
            endDate,
            materialType,
            page: page,
            pageSize: 20
          }
        });
        if (active && response.data && response.data.success) {
          setData(response.data.data);
          setTotal(response.data.total);
        }
      } catch (error) {
        console.error('前端拉取隔离数据失败:', error);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      active = false;
    };
  }, [storeId, accountIdsStr, startDate, endDate, materialType, page, refreshTrigger]);

  const refresh = useCallback(() => {
    setRefreshTrigger(prev => prev + 1);
  }, []);

  return { data, loading, total, page, setPage, refresh };
}
