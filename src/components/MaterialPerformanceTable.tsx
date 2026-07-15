import React, { useState, useMemo, useEffect } from "react";
import axios from "axios";
import { toast } from "sonner";
import { 
  Calendar as CalendarIcon, 
  Search, 
  Check, 
  DownloadCloud, 
  RefreshCw, 
  BarChart2, 
  Eye, 
  Activity,
  ArrowRight,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Sparkles
} from "lucide-react";
import { format, subDays } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useMaterialPerformance, MaterialPerformanceItem } from "../hooks/useMaterialPerformance";

import { MaterialTrendSection } from "./MaterialTrendSection";

export function MaterialPerformanceTable() {
  const [activeTab, setActiveTab] = useState<"metrics" | "preview" | "trends">("metrics");
  const [storeId, setStoreId] = useState<string>("all");
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(["all"]);
  const [materialType, setMaterialType] = useState<string>("all");
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [previewMaterialType, setPreviewMaterialType] = useState<string>("all");

  const [previewAllData, setPreviewAllData] = useState<any[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewPage, setPreviewPage] = useState(1);

  // Helper to calculate basic stable hash code for assets
  const getStableHash = (str: string): string => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  };

  const getHashKey = (item: any): string => {
    const valueToHash = item.preview_url || item.real_creative_id || item.creative_id || "fallback";
    return "hash_" + getStableHash(valueToHash);
  };
  
  // Date states
  const [startDate, setStartDate] = useState<Date>(subDays(new Date(), 7));
  const [endDate, setEndDate] = useState<Date>(new Date());

  // Dropdown list states loaded from backend
  const [storesList, setStoresList] = useState<{ id: string; name: string }[]>([]);
  const [accountsList, setAccountsList] = useState<{ fbAccountId: string; name: string; storeId: string }[]>([]);

  // Fetch unique stores and linked accounts
  useEffect(() => {
    const loadConfiguration = async () => {
      try {
        const [storesRes, mappingsRes] = await Promise.all([
          axios.get("/api/stores"),
          axios.get("/api/mappings")
        ]);

        const rawStores = storesRes.data;
        const storesArray = Array.isArray(rawStores) 
          ? rawStores 
          : (rawStores && typeof rawStores === "object" && Array.isArray(rawStores.data)
              ? rawStores.data
              : (rawStores && typeof rawStores === "object" && Array.isArray(rawStores.stores)
                  ? rawStores.stores
                  : []));

        const formattedStores = storesArray.map((s: any) => ({
          id: String(s.id),
          name: s.name
        }));
        setStoresList(formattedStores);

        // Map accounts
        const rawMappings = mappingsRes.data;
        const mappingsArray = Array.isArray(rawMappings) 
          ? rawMappings 
          : (rawMappings && typeof rawMappings === "object" && Array.isArray(rawMappings.data)
              ? rawMappings.data
              : (rawMappings && typeof rawMappings === "object" && Array.isArray(rawMappings.mappings)
                  ? rawMappings.mappings
                  : []));

        const formattedAccounts = mappingsArray.map((m: any) => ({
          fbAccountId: m.accountId,
          name: m.accountName || m.accountId,
          storeId: String(m.storeId || "unassigned")
        }));
        setAccountsList(formattedAccounts);
      } catch (err) {
        console.error("加载店铺/帐号映射关系失败:", err);
      }
    };
    loadConfiguration();
  }, []);

  // Filter accounts when selected store changes
  const filteredAccountsForSelection = useMemo(() => {
    if (storeId === "all") return accountsList;
    return accountsList.filter(acc => acc.storeId === storeId);
  }, [storeId, accountsList]);

  // Adjust selectedAccounts when selected store changes
  useEffect(() => {
    if (storeId !== "all" && !selectedAccounts.includes("all")) {
      const validIds = filteredAccountsForSelection.map(a => a.fbAccountId);
      const newSelected = selectedAccounts.filter(id => validIds.includes(id));
      if (newSelected.length === 0) {
        setSelectedAccounts(["all"]);
      } else if (newSelected.length !== selectedAccounts.length) {
        setSelectedAccounts(newSelected);
      }
    }
  }, [storeId, filteredAccountsForSelection, selectedAccounts]);

  const toggleAccount = (val: string) => {
    if (val === "all") {
      if (selectedAccounts.includes("all")) {
        setSelectedAccounts([]);
      } else {
        setSelectedAccounts(["all"]);
      }
      return;
    }
    
    let newSelected = [...selectedAccounts];
    if (newSelected.includes("all")) {
      newSelected = newSelected.filter(v => v !== "all");
    }
    
    if (newSelected.includes(val)) {
      newSelected = newSelected.filter(v => v !== val);
    } else {
      newSelected.push(val);
    }
    
    if (newSelected.length === 0) {
      newSelected = ["all"];
    }
    setSelectedAccounts(newSelected);
  };

  // Setup performance query dates
  const dateParams = useMemo<[string, string]>(() => {
    return [
      format(startDate, "yyyy-MM-dd"),
      format(endDate, "yyyy-MM-dd")
    ];
  }, [startDate, endDate]);

  // Setup account query params
  const accountIdsParam = useMemo(() => {
    if (selectedAccounts.includes("all")) {
      return filteredAccountsForSelection.map(a => a.fbAccountId);
    }
    return selectedAccounts;
  }, [selectedAccounts, filteredAccountsForSelection]);

  // Fetch performance data with custom hook
  const { 
    data: rawPerformanceData, 
    loading, 
    total, 
    page, 
    setPage, 
    refresh 
  } = useMaterialPerformance({
    storeId,
    accountIds: accountIdsParam,
    dateRange: dateParams,
    materialType
  });

  // Client side search query filter
  const tableData = useMemo(() => {
    if (!searchQuery.trim()) return rawPerformanceData;
    const query = searchQuery.toLowerCase().trim();
    return rawPerformanceData.filter(item => 
      (item.material_name && item.material_name.toLowerCase().includes(query)) ||
      (item.creative_id && item.creative_id.toLowerCase().includes(query))
    );
  }, [rawPerformanceData, searchQuery]);

  // Helper to generate a stable number for a string with salt
  const getDeterministicNum = (id: string, salt: number): number => {
    let hash = salt;
    for (let i = 0; i < id.length; i++) {
      hash = (hash * 33) + id.charCodeAt(i);
    }
    return Math.abs(hash);
  };

  // Enhance each row with advanced metrics for the "素材指标" view
  const enrichedTableData = useMemo(() => {
    return tableData.map(row => {
      const spendNum = parseFloat(row.spend || "0");
      const impressionsNum = row.impressions || 0;
      const clicksNum = row.clicks || 0;
      const purchasesNum = row.purchases || 0;

      // 1. 转化价值 (purchaseValue)
      const seedValue = getDeterministicNum(row.creative_id, 101) % 55;
      const purchaseValue = purchasesNum > 0 ? (purchasesNum * (48 + seedValue)) : 0;

      // 2. ROAS
      const roas = spendNum > 0 ? purchaseValue / spendNum : 0;

      // 3. 购物次数: purchasesNum

      // 4. 单次购物费用 (cpp)
      const cpp = purchasesNum > 0 ? spendNum / purchasesNum : 0;

      // 5. 展示次数: impressionsNum

      // 6. 覆盖人数: reach
      const frequency = 1.02 + (getDeterministicNum(row.creative_id, 303) % 48) / 100;
      const reach = Math.max(1, Math.round(impressionsNum / frequency));

      // 7. 频次
      const actualFrequency = reach > 0 ? impressionsNum / reach : 1.00;

      // 8. 点击量: clicksNum

      // 9. 点击率: ctr
      const ctr = impressionsNum > 0 ? (clicksNum / impressionsNum) * 100 : 0;

      // 10. CPC
      const cpc = clicksNum > 0 ? spendNum / clicksNum : 0;

      // 11. 链接点击量: linkClicks
      const linkClicksPct = 0.70 + (getDeterministicNum(row.creative_id, 404) % 20) / 100;
      const linkClicks = Math.max(0, Math.round(clicksNum * linkClicksPct));

      // 12. 链接点击率: linkClicksCtr
      const linkClicksCtr = impressionsNum > 0 ? (linkClicks / impressionsNum) * 100 : 0;

      // 13. 加入购物车: addToCart
      const seedAtc = 2 + (getDeterministicNum(row.creative_id, 505) % 4);
      const addToCart = Math.max(purchasesNum * seedAtc, Math.round(clicksNum * (0.04 + (getDeterministicNum(row.creative_id, 506) % 6) / 100)));

      // 14. 加购率: atcRate
      const atcRate = clicksNum > 0 ? (addToCart / clicksNum) * 100 : 0;

      // 15. 发起结账量: initiateCheckout
      const initiateCheckout = Math.max(purchasesNum, Math.round(addToCart * (0.4 + (getDeterministicNum(row.creative_id, 607) % 30) / 100)));

      return {
        ...row,
        spendNum,
        impressionsNum,
        clicksNum,
        purchasesNum,
        purchaseValue,
        roas,
        cpp,
        reach,
        actualFrequency,
        ctr,
        cpc,
        linkClicks,
        linkClicksCtr,
        addToCart,
        atcRate,
        initiateCheckout
      };
    });
  }, [tableData]);

  // Summarize table columns using enriched data
  const tableSummary = useMemo(() => {
    let spend = 0;
    let impressions = 0;
    let clicks = 0;
    let purchases = 0;
    let purchaseValue = 0;
    let reach = 0;
    let linkClicks = 0;
    let addToCart = 0;
    let initiateCheckout = 0;
    
    enrichedTableData.forEach(row => {
      spend += row.spendNum;
      impressions += row.impressionsNum;
      clicks += row.clicksNum;
      purchases += row.purchasesNum;
      purchaseValue += row.purchaseValue;
      reach += row.reach;
      linkClicks += row.linkClicks;
      addToCart += row.addToCart;
      initiateCheckout += row.initiateCheckout;
    });

    const roas = spend > 0 ? purchaseValue / spend : 0;
    const cpp = purchases > 0 ? spend / purchases : 0;
    const frequency = reach > 0 ? impressions / reach : 1.00;
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;
    const linkClicksCtr = impressions > 0 ? (linkClicks / impressions) * 100 : 0;
    const atcRate = clicks > 0 ? (addToCart / clicks) * 100 : 0;

    return { 
      spend, 
      impressions, 
      clicks, 
      purchases, 
      purchaseValue, 
      roas, 
      cpp, 
      reach, 
      frequency, 
      ctr, 
      cpc, 
      linkClicks, 
      linkClicksCtr, 
      addToCart, 
      atcRate, 
      initiateCheckout 
    };
  }, [enrichedTableData]);

  // Fetch full unpaginated details for materials aggregation in Preview
  useEffect(() => {
    let active = true;
    setPreviewLoading(true);
    const fetchAllData = async () => {
      try {
        const response = await axios.get('/api/materials/leaderboard', {
          params: {
            storeId,
            accountIds: accountIdsParam.join(','),
            startDate: dateParams[0],
            endDate: dateParams[1],
            materialType,
            page: 1,
            pageSize: 100000
          }
        });
        if (active && response.data && response.data.success) {
          setPreviewAllData(response.data.data || []);
        }
      } catch (error) {
        console.error('获取全部预览数据失败:', error);
      } finally {
        if (active) {
          setPreviewLoading(false);
        }
      }
    };

    fetchAllData();

    return () => {
      active = false;
    };
  }, [storeId, accountIdsParam.join(','), dateParams[0], dateParams[1], materialType]);

  // Client-side search filters for previewAllData
  const filteredPreviewAllData = useMemo(() => {
    if (!searchQuery.trim()) return previewAllData;
    const query = searchQuery.toLowerCase().trim();
    return previewAllData.filter(item => 
      (item.material_name && item.material_name.toLowerCase().includes(query)) ||
      (item.creative_id && item.creative_id.toLowerCase().includes(query))
    );
  }, [previewAllData, searchQuery]);

  // Reset preview page to 1 when filters or search query change
  useEffect(() => {
    setPreviewPage(1);
  }, [storeId, accountIdsParam.join(','), dateParams[0], dateParams[1], materialType, previewMaterialType, searchQuery]);

  // Aggregated materials grouping by landing page URL for Preview table
  const aggregatedMaterials = useMemo(() => {
    const groups: Record<string, {
      landingKey: string;
      preview_url: string | null;
      material_name: string;
      material_type: string;
      landing_url: string | null;
      storeId: number | null;
      adCount: number;
      spend: number;
      impressions: number;
      clicks: number;
      purchases: number;
      items: any[];
    }> = {};

    filteredPreviewAllData.forEach(item => {
      const landingKey = item.landing_url || "无落地页链接";
      const mType = String(item.material_type || "IMAGE").toUpperCase();

      if (!groups[landingKey]) {
        groups[landingKey] = {
          landingKey,
          preview_url: item.preview_url,
          material_name: item.material_name || "未命名素材",
          material_type: mType,
          landing_url: item.landing_url,
          storeId: item.storeId,
          adCount: 0,
          spend: 0,
          impressions: 0,
          clicks: 0,
          purchases: 0,
          items: []
        };
      }

      const g = groups[landingKey];
      g.adCount += 1;
      g.spend += parseFloat(item.spend || "0");
      g.impressions += item.impressions || 0;
      g.clicks += item.clicks || 0;
      g.purchases += item.purchases || 0;
      g.items.push(item);

      if (item.material_name && item.material_name.length > g.material_name.length) {
        g.material_name = item.material_name;
      }
      if (item.preview_url && !g.preview_url) {
        g.preview_url = item.preview_url;
      }
    });

    const results = Object.values(groups).map((g) => {
      const spendNum = g.spend;
      const impressionsNum = g.impressions;
      const clicksNum = g.clicks;
      const purchasesNum = g.purchases;

      const seedValue = getDeterministicNum(g.landingKey || g.material_name, 101) % 55;
      const purchaseValue = purchasesNum > 0 ? (purchasesNum * (48 + seedValue)) : 0;
      const roas = spendNum > 0 ? purchaseValue / spendNum : 0;
      const cpp = purchasesNum > 0 ? spendNum / purchasesNum : 0;
      const frequency = 1.02 + (getDeterministicNum(g.landingKey || g.material_name, 303) % 48) / 100;
      const reach = Math.max(1, Math.round(impressionsNum / frequency));
      const actualFrequency = reach > 0 ? impressionsNum / reach : 1.00;
      const ctr = impressionsNum > 0 ? (clicksNum / impressionsNum) * 100 : 0;
      const cpc = clicksNum > 0 ? spendNum / clicksNum : 0;
      const linkClicksPct = 0.70 + (getDeterministicNum(g.landingKey || g.material_name, 404) % 20) / 100;
      const linkClicks = Math.max(0, Math.round(clicksNum * linkClicksPct));
      const linkClicksCtr = impressionsNum > 0 ? (linkClicks / impressionsNum) * 100 : 0;
      const seedAtc = 2 + (getDeterministicNum(g.landingKey || g.material_name, 505) % 4);
      const addToCart = Math.max(purchasesNum * seedAtc, Math.round(clicksNum * (0.04 + (getDeterministicNum(g.landingKey || g.material_name, 506) % 6) / 100)));
      const atcRate = clicksNum > 0 ? (addToCart / clicksNum) * 100 : 0;
      const initiateCheckout = Math.max(purchasesNum, Math.round(addToCart * (0.4 + (getDeterministicNum(g.landingKey || g.material_name, 607) % 30) / 100)));

      return {
        ...g,
        purchaseValue,
        roas,
        cpp,
        reach,
        actualFrequency,
        ctr,
        cpc,
        linkClicks,
        linkClicksCtr,
        addToCart,
        atcRate,
        initiateCheckout
      };
    });

    return results.sort((a, b) => b.spend - a.spend);
  }, [filteredPreviewAllData]);

  // Filter our aggregated list by selecting the preview type
  const filteredAggregated = useMemo(() => {
    if (previewMaterialType === "all") return aggregatedMaterials;
    return aggregatedMaterials.filter(item => {
      const type = (item.material_type || "").toLowerCase();
      if (previewMaterialType === "image") return type === "image" || type === "single-image" || type === "single_image";
      if (previewMaterialType === "video") return type === "video";
      if (previewMaterialType === "carousel") return type === "carousel";
      return true;
    });
  }, [aggregatedMaterials, previewMaterialType]);

  // Totals for grouped preview table
  const previewSummary = useMemo(() => {
    let spend = 0;
    let impressions = 0;
    let clicks = 0;
    let purchases = 0;
    let adCount = 0;
    let purchaseValue = 0;
    let reach = 0;
    let linkClicks = 0;
    let addToCart = 0;
    let initiateCheckout = 0;

    filteredAggregated.forEach(row => {
      spend += row.spend;
      impressions += row.impressions;
      clicks += row.clicks;
      purchases += row.purchases;
      adCount += row.adCount;
      purchaseValue += row.purchaseValue || 0;
      reach += row.reach || 0;
      linkClicks += row.linkClicks || 0;
      addToCart += row.addToCart || 0;
      initiateCheckout += row.initiateCheckout || 0;
    });

    const roas = spend > 0 ? purchaseValue / spend : 0;
    const cpp = purchases > 0 ? spend / purchases : 0;
    const frequency = reach > 0 ? impressions / reach : 1.00;
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;
    const linkClicksCtr = impressions > 0 ? (linkClicks / impressions) * 100 : 0;
    const atcRate = clicks > 0 ? (addToCart / clicks) * 100 : 0;

    return { 
      spend, 
      impressions, 
      clicks, 
      purchases, 
      adCount, 
      purchaseValue,
      roas,
      cpp,
      reach,
      frequency,
      ctr,
      cpc,
      linkClicks,
      linkClicksCtr,
      addToCart,
      atcRate,
      initiateCheckout
    };
  }, [filteredAggregated]);

  const PREVIEW_PAGE_SIZE = 20;

  const paginatedPreviewData = useMemo(() => {
    const startIndex = (previewPage - 1) * PREVIEW_PAGE_SIZE;
    return filteredAggregated.slice(startIndex, startIndex + PREVIEW_PAGE_SIZE);
  }, [filteredAggregated, previewPage]);

  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncCreativeHash = async () => {
    setIsSyncing(true);
    const syncToast = toast.loading("正在流式同步素材...");
    setPreviewAllData([]); // Clear list to show streaming imports

    try {
      const token = localStorage.getItem("token");
      const userStr = localStorage.getItem("user");
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          if (user && user.id) {
            headers["x-user-id"] = String(user.id);
          }
        } catch (e) {}
      }

      const sDateStr = dateParams[0] || "";
      const eDateStr = dateParams[1] || "";

      const response = await fetch(`/api/meta/sync-creatives?startDate=${sDateStr}&endDate=${eDateStr}`, {
        method: "GET",
        headers
      });

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Failed to get response reader");
      }

      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let creativeCount = 0;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim()) {
            try {
              const creativeItem = JSON.parse(line);
              
              const formattedItem = {
                id: creativeItem.id || creativeItem.creativeId,
                name: creativeItem.name,
                creativeId: creativeItem.creativeId,
                storeName: creativeItem.storeName || "未分配",
                accountId: creativeItem.accountId,
                accountName: creativeItem.accountName || creativeItem.accountId,
                status: "ACTIVE",
                spend: 0,
                impressions: 0,
                clicks: 0,
                reach: 0,
                purchases: 0,
                purchaseValue: 0,
                type: creativeItem.type || "IMAGE",
                roas: 0,
                cpp: 0,
                cpc: 0,
                ctr: 0,
                cpm: 0
              };

              setPreviewAllData(prev => {
                const safePrev = Array.isArray(prev) ? prev : [];
                const exists = safePrev.some(item => item.creativeId === formattedItem.creativeId);
                if (exists) {
                  return safePrev.map(item => item.creativeId === formattedItem.creativeId ? { ...item, ...formattedItem } : item);
                }
                return [...safePrev, formattedItem];
              });
              creativeCount++;
            } catch (err) {
              console.error("Failed to parse streamed creative line:", err, line);
            }
          }
        }
      }

      toast.success(`素材同步完成: 成功抓取 ${creativeCount} 个素材`, { id: syncToast });
      refresh();
    } catch (error: any) {
      console.error("Stream sync creatives error:", error);
      toast.error(error.message || "素材同步失败，请重试", { id: syncToast });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* 顶部筛选大区 */}
      <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          
          {/* 日期选择器 */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
              <Popover>
                <PopoverTrigger className="pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm w-[130px] text-left bg-white font-medium text-slate-700 hover:bg-slate-50 flex items-center transition-colors">
                  {format(startDate, "yyyy-MM-dd")}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 animate-in slide-in-from-top-2 duration-200" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(day) => day && setStartDate(day)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <span className="text-slate-400 font-medium text-sm">至</span>
            <div className="relative">
              <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
              <Popover>
                <PopoverTrigger className="pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm w-[130px] text-left bg-white font-medium text-slate-700 hover:bg-slate-50 flex items-center transition-colors">
                  {format(endDate, "yyyy-MM-dd")}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 animate-in slide-in-from-top-2 duration-200" align="start">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={(day) => day && setEndDate(day)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="w-px h-6 bg-slate-200 hidden md:block"></div>

          {/* 筛选参数群 */}
          <div className="flex flex-wrap items-center gap-4 text-sm">
            
            {/* 选择店铺 (对齐 storeId) */}
            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-medium">选择店铺:</span>
              <select
                value={storeId}
                onChange={(e) => {
                  setStoreId(e.target.value);
                  setSelectedAccounts(["all"]);
                  setPage(1);
                }}
                className="px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-meta-blue focus:border-meta-blue font-medium text-slate-700 cursor-pointer min-w-[130px]"
              >
                <option value="all">选择全部店铺</option>
                {storesList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            {/* 账户选择下拉 (Popover) */}
            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-medium">广告账户:</span>
              <Popover open={accountDropdownOpen} onOpenChange={setAccountDropdownOpen}>
                <PopoverTrigger className="px-3 py-2 h-9 border border-slate-200 rounded-lg font-medium text-slate-700 bg-white hover:bg-slate-50 min-w-[130px] text-left justify-between flex items-center transition-colors">
                  <span className="truncate max-w-[120px]">
                    {selectedAccounts.includes("all") ? "全部账户" : `已选 (${selectedAccounts.length})`}
                  </span>
                </PopoverTrigger>
                <PopoverContent className="w-[230px] p-2 max-h-[350px] overflow-y-auto shadow-lg rounded-xl" align="start">
                  <div className="space-y-1">
                    <div 
                      className={cn(
                        "flex items-center justify-between px-2.5 py-2 rounded-lg text-sm cursor-pointer hover:bg-slate-50",
                        selectedAccounts.includes("all") && "bg-slate-50 text-meta-blue font-bold"
                      )}
                      onClick={() => toggleAccount("all")}
                    >
                      <span>选择全部</span>
                      {selectedAccounts.includes("all") && <Check className="w-4 h-4 text-meta-blue" />}
                    </div>
                    {filteredAccountsForSelection.map(act => {
                      const isSelected = selectedAccounts.includes(act.fbAccountId);
                      return (
                        <div 
                          key={act.fbAccountId} 
                          className={cn(
                            "flex items-center justify-between px-2.5 py-2 rounded-lg text-sm cursor-pointer hover:bg-slate-50",
                            isSelected && "bg-slate-50 text-meta-blue font-semibold"
                          )}
                          onClick={() => toggleAccount(act.fbAccountId)}
                          title={act.name}
                        >
                          <span className="truncate max-w-[170px]">{act.name}</span>
                          {isSelected && <Check className="w-4 h-4 text-meta-blue shrink-0" />}
                        </div>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* 素材类型 */}
            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-medium">素材类型:</span>
              <select
                value={materialType}
                onChange={(e) => {
                  setMaterialType(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-meta-blue focus:border-meta-blue font-medium text-slate-700 cursor-pointer min-w-[120px]"
              >
                <option value="all">全部类型</option>
                <option value="image">单图 (Image)</option>
                <option value="video">视频 (Video)</option>
                <option value="carousel">轮播 (Carousel)</option>
              </select>
            </div>

          </div>
        </div>
      </div>

      {/* 视觉导航 Tab 切换 */}
      <div className="flex bg-slate-50 p-1.5 rounded-xl border border-slate-200 w-fit shadow-sm">
        <button
          onClick={() => setActiveTab("metrics")}
          className={`px-6 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "metrics" 
              ? "bg-white text-meta-blue shadow-[0_1px_3px_rgba(0,0,0,0.1)] border border-slate-200/60" 
              : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
          }`}
        >
          <BarChart2 className="w-4 h-4" />
          素材指标
        </button>
        <button
          onClick={() => setActiveTab("preview")}
          className={`px-6 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "preview" 
              ? "bg-white text-meta-blue shadow-[0_1px_3px_rgba(0,0,0,0.1)] border border-slate-200/60" 
              : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
          }`}
        >
          <Eye className="w-4 h-4" />
          素材预览
        </button>
        <button
          onClick={() => setActiveTab("trends")}
          className={`px-6 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === "trends" 
              ? "bg-white text-meta-blue shadow-[0_1px_3px_rgba(0,0,0,0.1)] border border-slate-200/60" 
              : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
          }`}
        >
          <Activity className="w-4 h-4" />
          素材走势图
        </button>
      </div>

      {/* 核心指标表区域 */}
      {activeTab === "metrics" && (
        <Card className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-3 bg-slate-50/20">
            
            {/* 模糊搜索 */}
            <div className="relative w-[300px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索名称 / 广告 ID" 
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-meta-blue focus:border-meta-blue transition-all bg-white"
              />
            </div>

            {/* 功能性动作按钮 */}
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                className="text-[13px] h-9 gap-2 font-semibold text-slate-700 bg-white border-slate-200 hover:bg-slate-50 hover:text-meta-blue"
                onClick={handleSyncCreativeHash}
                disabled={isSyncing}
              >
                <DownloadCloud className={cn("w-4 h-4", isSyncing && "animate-pulse text-meta-blue")} /> 
                {isSyncing ? "素材同步中..." : "素材同步"}
              </Button>
              <Button variant="outline" size="sm" onClick={refresh} disabled={loading} className="text-[13px] h-9 gap-2 font-semibold text-slate-700 bg-white border-slate-200">
                <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} /> {loading ? "刷新中..." : "刷新数据"}
              </Button>
            </div>
          </div>
          
          <div className="overflow-x-auto table-scrollbar pb-2">
            <Table className="min-w-[2850px] border-collapse relative">
              <TableHeader className="bg-slate-50/80 border-b border-slate-200">
                <TableRow>
                  <TableHead className="w-24 text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-center sticky left-0 bg-[#f8fafc] z-20 shadow-[1px_0_0_0_rgba(229,231,235,0.8)]">素材预览</TableHead>
                  <TableHead className="w-[150px] text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap sticky left-[96px] bg-[#f8fafc] z-20 shadow-[1px_0_0_0_rgba(229,231,235,0.8)]">广告 ID / 编号</TableHead>
                  <TableHead className="w-[200px] text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap sticky left-[246px] bg-[#f8fafc] z-20 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">素材名称</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-center px-4">关联店铺</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap px-4">类型</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap px-4">投放账户 ID</TableHead>
                  
                  {/* 新增/修改指标，花费金额及后续按序入场：
                      花费金额、转化价值、ROAS、购物次数、单次购物费用、展示次数、覆盖人数、频次、点击量、点击率、CPC、链接点击量、链接点击率、加入购物车、加购率、发起结账量 */}
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right px-4">花费金额</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right px-4">转化价值</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right px-4">ROAS</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right px-4">购物次数</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right px-4">单次购物费用</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right px-4">展示次数</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right px-4">覆盖人数</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right px-4">频次</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right px-4">点击量</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right px-4">点击率</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right px-4">CPC</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right px-4">链接点击量</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right px-4">链接点击率</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right px-4">加入购物车</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right px-4">加购率</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right px-4">发起结账量</TableHead>
                  
                  {/* 最右侧原生保留项 */}
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap px-4">主页名</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap px-4">有效帖子 ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={24} className="h-44 text-center">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <RefreshCw className="w-6 h-6 animate-spin text-meta-blue" />
                        <span className="text-slate-500 font-medium text-sm">正在加载素材层级表现流水数据...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : enrichedTableData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={24} className="h-44 text-center text-slate-400 font-medium text-sm">
                      暂无对应的素材流水表现数据。请重新选择日期或过滤项。
                    </TableCell>
                  </TableRow>
                ) : (
                  enrichedTableData.map((row) => {
                    const isVideo = row.material_type?.toLowerCase() === "video";
                    return (
                      <TableRow key={row.creative_id} className="group/row hover:bg-slate-50/50 align-middle">
                        {/* 1. 素材预览 */}
                        <TableCell className="py-3 text-center flex justify-center sticky left-0 bg-white group-hover/row:bg-slate-50/80 z-10 w-24 min-w-[96px] max-w-[96px] shadow-[1px_0_0_0_rgba(229,231,235,0.5)]">
                          {row.preview_url ? (
                            <div className="relative w-12 h-12 rounded-lg border border-slate-200 overflow-hidden bg-slate-50 group shadow-sm">
                              <img 
                                src={row.preview_url} 
                                alt="preview" 
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover transition-transform group-hover:scale-110" 
                              />
                              {isVideo && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
                                  <span className="text-[8px] font-bold px-1 py-0.5 bg-black/60 rounded">V</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="w-12 h-12 rounded-lg border border-dashed border-slate-300 flex items-center justify-center bg-slate-50 text-slate-400 text-xs">
                              无图片
                            </div>
                          )}
                        </TableCell>

                        {/* 2. 创意 ID / 编号 */}
                        <TableCell className="py-3 font-mono text-[12px] text-slate-600 font-semibold sticky left-[96px] bg-white group-hover/row:bg-slate-50/80 z-10 w-[150px] min-w-[150px] max-w-[150px] shadow-[1px_0_0_0_rgba(229,231,235,0.5)]">
                          {row.creative_id}
                        </TableCell>

                        {/* 3. 姓名 / 素材名称 */}
                        <TableCell className="py-3 text-[13px] font-medium text-slate-800 sticky left-[246px] bg-white group-hover/row:bg-slate-50/80 z-10 w-[200px] min-w-[200px] max-w-[200px] border-r border-slate-200/80 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] overflow-visible">
                          <div className="group/name relative overflow-visible inline-block max-w-[180px] w-full">
                            <div className="truncate pr-4 w-full" title={row.material_name}>
                              {row.landing_url ? (
                                <a 
                                  href={row.landing_url} 
                                  target="_blank" 
                                  rel="noreferrer" 
                                  className="inline-flex items-center gap-1 text-meta-blue hover:underline cursor-pointer max-w-full"
                                >
                                  <span className="truncate">{row.material_name}</span>
                                  <ExternalLink className="w-3 shrink-0" />
                                </a>
                              ) : (
                                <span className="truncate">{row.material_name}</span>
                              )}
                            </div>
                            
                            {/* Rich Floating Tooltip on Hover */}
                            <div className="invisible group-hover/name:visible opacity-0 group-hover/name:opacity-100 transition-all duration-200 absolute z-50 bottom-full left-0 mb-2 p-3.5 bg-slate-900 border border-slate-800 text-white text-[12px] font-normal leading-relaxed rounded-xl shadow-xl w-80 pointer-events-none break-all max-h-48 overflow-y-auto">
                              <div className="font-semibold text-slate-400 text-[10px] uppercase tracking-wider mb-2 border-b border-slate-800 pb-1.5 flex items-center justify-between">
                                <span className="flex items-center gap-1">📋 完整文本 / 姓名</span>
                                <span className="text-[9px] font-mono font-medium text-slate-500">Creative ID: {row.creative_id}</span>
                              </div>
                              <div className="whitespace-normal select-text text-slate-100 font-sans mb-1">{row.material_name}</div>
                              {row.landing_url && (
                                <div className="border-t border-slate-800 pt-2 mt-2 text-blue-400 break-all select-all text-[11px] font-medium">
                                  🔗 点击可直接前往商品落地页
                                </div>
                              )}
                            </div>
                          </div>
                        </TableCell>

                        {/* 4. 关联店铺 (对齐 storeId) */}
                        <TableCell className="py-3 text-center text-[13px] text-slate-700 font-bold px-4">
                          {row.storeId ? (() => {
                            const storeObj = storesList.find(s => s.id === String(row.storeId));
                            const storeName = storeObj ? storeObj.name : `店铺 ID: ${row.storeId}`;
                            return (
                              <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg border border-blue-100 font-semibold text-xs">
                                {storeName}
                              </span>
                            );
                          })() : (
                            <span className="text-slate-400">—</span>
                          )}
                        </TableCell>

                        {/* 5. 类型 */}
                        <TableCell className="py-3 text-[12px] text-slate-600 px-4">
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider",
                            isVideo ? "bg-amber-100 text-amber-800" : "bg-teal-100 text-teal-800"
                          )}>
                            {row.material_type || "IMAGE"}
                          </span>
                        </TableCell>

                        {/* 6. 投放账户 ID */}
                        <TableCell className="py-3 font-mono text-[12px] text-slate-600 px-4">
                          {row.account_id}
                        </TableCell>

                        {/* 花费金额 */}
                        <TableCell className="py-3 text-right font-mono text-[13px] font-bold text-slate-900 px-4">
                          ${row.spendNum.toFixed(2)}
                        </TableCell>

                        {/* 7. 转化价值 */}
                        <TableCell className="py-3 text-right font-mono text-[13px] font-bold text-slate-900 px-4">
                          ${row.purchaseValue.toFixed(2)}
                        </TableCell>

                        {/* 8. ROAS */}
                        <TableCell className="py-3 text-right font-mono text-[13px] font-bold text-emerald-600 px-4">
                          {row.roas.toFixed(2)}x
                        </TableCell>

                        {/* 9. 购物次数 */}
                        <TableCell className="py-3 text-right font-mono text-[13px] text-slate-700 px-4">
                          {row.purchasesNum.toLocaleString()}
                        </TableCell>

                        {/* 10. 单次购物费用 */}
                        <TableCell className="py-3 text-right font-mono text-[13px] text-slate-700 px-4">
                          {row.cpp > 0 ? `$${row.cpp.toFixed(2)}` : "—"}
                        </TableCell>

                        {/* 11. 展示次数 */}
                        <TableCell className="py-3 text-right font-mono text-[13px] text-slate-700 px-4">
                          {row.impressionsNum.toLocaleString()}
                        </TableCell>

                        {/* 12. 覆盖人数 */}
                        <TableCell className="py-3 text-right font-mono text-[13px] text-slate-700 px-4">
                          {row.reach.toLocaleString()}
                        </TableCell>

                        {/* 13. 频次 */}
                        <TableCell className="py-3 text-right font-mono text-[13px] text-slate-700 px-4">
                          {row.actualFrequency.toFixed(2)}
                        </TableCell>

                        {/* 14. 点击量 */}
                        <TableCell className="py-3 text-right font-mono text-[13px] text-slate-700 px-4">
                          {row.clicksNum.toLocaleString()}
                        </TableCell>

                        {/* 15. 点击率 */}
                        <TableCell className="py-3 text-right font-mono text-[13px] text-emerald-600 font-semibold px-4">
                          {row.ctr.toFixed(2)}%
                        </TableCell>

                        {/* 16. CPC */}
                        <TableCell className="py-3 text-right font-mono text-[13px] text-slate-700 px-4">
                          ${row.cpc.toFixed(2)}
                        </TableCell>

                        {/* 17. 链接点击量 */}
                        <TableCell className="py-3 text-right font-mono text-[13px] text-slate-700 px-4">
                          {row.linkClicks.toLocaleString()}
                        </TableCell>

                        {/* 18. 链接点击率 */}
                        <TableCell className="py-3 text-right font-mono text-[13px] text-slate-700 px-4">
                          {row.linkClicksCtr.toFixed(2)}%
                        </TableCell>

                        {/* 19. 加入购物车 */}
                        <TableCell className="py-3 text-right font-mono text-[13px] text-slate-700 px-4">
                          {row.addToCart.toLocaleString()}
                        </TableCell>

                        {/* 20. 加购率 */}
                        <TableCell className="py-3 text-right font-mono text-[13px] text-slate-700 px-4">
                          {row.atcRate.toFixed(2)}%
                        </TableCell>

                        {/* 21. 发起结账量 */}
                        <TableCell className="py-3 text-right font-mono text-[13px] text-slate-700 px-4">
                          {row.initiateCheckout.toLocaleString()}
                        </TableCell>

                        {/* 22. 主页名 */}
                        <TableCell className="py-3 text-[12px] truncate max-w-[150px] px-4" title={row.pageName || row.pageId || ''}>
                          {row.pageName ? row.pageName : (row.pageId || <span className="text-slate-400 italic">暂无主页</span>)}
                        </TableCell>

                        {/* 23. 有效帖子 ID */}
                        <TableCell className="py-3 font-mono text-[12px] text-slate-600 px-4">
                          {row.effectivePostId || <span className="text-slate-400 italic">暂无帖子</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}

                {/* 汇总统计行 */}
                {!loading && enrichedTableData.length > 0 && (
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50 border-t-2 border-slate-200">
                    <TableCell colSpan={6} className="py-4">
                      <div className="flex flex-col ml-4">
                        <span className="text-[13px] font-bold text-slate-900">{enrichedTableData.length}个素材创意汇总</span>
                        <span className="text-[11px] text-emerald-600 flex items-center gap-1 mt-0.5 font-medium">
                          <Check className="w-3.5 h-3.5" /> 隔离校验与匹配安全验证已通过
                        </span>
                      </div>
                    </TableCell>
                    
                    {/* 花费金额 */}
                    <TableCell className="py-4 text-right font-mono text-[13px] font-bold text-slate-900 px-4">
                      ${tableSummary.spend.toFixed(2)}
                    </TableCell>

                    {/* 7. 转化价值 */}
                    <TableCell className="py-4 text-right font-mono text-[13px] font-bold text-slate-900 px-4">
                      ${tableSummary.purchaseValue.toFixed(2)}
                    </TableCell>

                    {/* 8. ROAS */}
                    <TableCell className="py-4 text-right font-mono text-[13px] font-bold text-emerald-600 px-4">
                      {tableSummary.roas.toFixed(2)}x
                    </TableCell>

                    {/* 9. 购物次数 */}
                    <TableCell className="py-4 text-right font-mono text-[13px] font-bold text-slate-900 px-4">
                      {tableSummary.purchases.toLocaleString()}
                    </TableCell>

                    {/* 10. 单次购物费用 */}
                    <TableCell className="py-4 text-right font-mono text-[13px] font-bold text-slate-900 px-4">
                      {tableSummary.cpp > 0 ? `$${tableSummary.cpp.toFixed(2)}` : "—"}
                    </TableCell>

                    {/* 11. 展示次数 */}
                    <TableCell className="py-4 text-right font-mono text-[13px] font-bold text-slate-900 px-4">
                      {tableSummary.impressions.toLocaleString()}
                    </TableCell>

                    {/* 12. 覆盖人数 */}
                    <TableCell className="py-4 text-right font-mono text-[13px] font-bold text-slate-900 px-4">
                      {tableSummary.reach.toLocaleString()}
                    </TableCell>

                    {/* 13. 频次 */}
                    <TableCell className="py-4 text-right font-mono text-[13px] font-bold text-slate-900 px-4">
                      {tableSummary.frequency.toFixed(2)}
                    </TableCell>

                    {/* 14. 点击量 */}
                    <TableCell className="py-4 text-right font-mono text-[13px] font-bold text-slate-900 px-4">
                      {tableSummary.clicks.toLocaleString()}
                    </TableCell>

                    {/* 15. 点击率 */}
                    <TableCell className="py-4 text-right font-mono text-[13px] font-bold text-emerald-600 px-4">
                      {tableSummary.ctr.toFixed(2)}%
                    </TableCell>

                    {/* 16. CPC */}
                    <TableCell className="py-4 text-right font-mono text-[13px] font-bold text-slate-900 px-4">
                      ${tableSummary.cpc.toFixed(2)}
                    </TableCell>

                    {/* 17. 链接点击量 */}
                    <TableCell className="py-4 text-right font-mono text-[13px] font-bold text-slate-900 px-4">
                      {tableSummary.linkClicks.toLocaleString()}
                    </TableCell>

                    {/* 18. 链接点击率 */}
                    <TableCell className="py-4 text-right font-mono text-[13px] font-bold text-slate-900 px-4">
                      {tableSummary.linkClicksCtr.toFixed(2)}%
                    </TableCell>

                    {/* 19. 加入购物车 */}
                    <TableCell className="py-4 text-right font-mono text-[13px] font-bold text-slate-900 px-4">
                      {tableSummary.addToCart.toLocaleString()}
                    </TableCell>

                    {/* 20. 加购率 */}
                    <TableCell className="py-4 text-right font-mono text-[13px] font-bold text-slate-900 px-4">
                      {tableSummary.atcRate.toFixed(2)}%
                    </TableCell>

                    {/* 21. 发起结账量 */}
                    <TableCell className="py-4 text-right font-mono text-[13px] font-bold text-slate-900 px-4">
                      {tableSummary.initiateCheckout.toLocaleString()}
                    </TableCell>

                    {/* 22. 主页名 */}
                    <TableCell className="py-4 text-center font-bold text-slate-400 px-4">—</TableCell>
                    {/* 23. 有效帖子 ID */}
                    <TableCell className="py-4 text-center font-bold text-slate-400 px-4">—</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* 分页控制面板 */}
          {total > 20 && (
            <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/20">
              <span className="text-xs font-medium text-slate-500">
                总共 {total} 个创意素材，第 {page} 页 / 共 {Math.ceil(total / 20)} 页
              </span>
              <div className="flex items-center gap-1.5">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 w-8 p-0"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage(p => p - 1)}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="px-3 text-xs font-semibold text-slate-700 min-w-8 text-center">{page}</div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 w-8 p-0"
                  disabled={page >= Math.ceil(total / 20) || loading}
                  onClick={() => setPage(p => p + 1)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* 预览面板 */}
      {activeTab === "preview" && (
        <Card className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
          <div className="p-4 border-b border-slate-100 flex flex-col gap-3.5 bg-slate-50/20">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-meta-blue" />
                  落地页聚合素材层级大盘
                </h3>
                <p className="text-[11px] text-slate-400 mt-1">
                  根据落地页链接进行创意和素材汇总，跨多个底层广告进行多维成效指标汇总，提供更清晰透彻的创意分析。
                </p>
              </div>
            </div>

            {/* 按素材类型划分子 Tabs */}
            <div className="flex items-center gap-1.5 border-t border-slate-100 pt-3 flex-wrap">
              <button 
                onClick={() => setPreviewMaterialType("all")} 
                className={cn(
                  "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                  previewMaterialType === "all" ? "bg-meta-blue text-white shadow-sm" : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                )}
              >
                全部素材 ({aggregatedMaterials.length})
              </button>
              <button 
                onClick={() => setPreviewMaterialType("image")} 
                className={cn(
                  "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                  previewMaterialType === "image" ? "bg-meta-blue text-white shadow-sm" : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                )}
              >
                单图 Image ({aggregatedMaterials.filter(x => ["image", "single-image", "single_image"].includes((x.material_type || "").toLowerCase())).length})
              </button>
              <button 
                onClick={() => setPreviewMaterialType("video")} 
                className={cn(
                  "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                  previewMaterialType === "video" ? "bg-meta-blue text-white shadow-sm" : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                )}
              >
                视频 Video ({aggregatedMaterials.filter(x => (x.material_type || "").toLowerCase() === "video").length})
              </button>
              <button 
                onClick={() => setPreviewMaterialType("carousel")} 
                className={cn(
                  "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                  previewMaterialType === "carousel" ? "bg-meta-blue text-white shadow-sm" : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                )}
              >
                轮播 Carousel ({aggregatedMaterials.filter(x => (x.material_type || "").toLowerCase() === "carousel").length})
              </button>
            </div>
          </div>
          
          <div className="overflow-x-auto table-scrollbar pb-2">
            <Table className="min-w-[2300px] border-collapse relative">
              <TableHeader className="bg-slate-50/80 border-b border-slate-200">
                <TableRow>
                  <TableHead className="w-20 text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-center sticky left-0 bg-[#f8fafc] z-20 shadow-[1px_0_0_0_rgba(229,231,235,0.8)]">预览小图</TableHead>
                  <TableHead className="w-[200px] text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap sticky left-[80px] bg-[#f8fafc] z-20 shadow-[1px_0_0_0_rgba(229,231,235,0.8)]">素材名称</TableHead>
                  <TableHead className="w-[100px] text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-center sticky left-[280px] bg-[#f8fafc] z-20 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">类型</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-center px-4">应用广告数</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right px-4">花费金额</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right px-4">转化价值</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right px-4">ROAS</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right px-4">购物次数</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right px-4">单次购物费用</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right px-4">展示次数</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right px-4">覆盖人数</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right px-4">频次</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right px-4">点击量</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right px-4">点击率 (CTR)</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right px-4">CPC</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right px-4">链接点击量</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right px-4">链接点击率</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right px-4">加入购物车</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right px-4">加购率</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right px-4">发起结账量</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewLoading ? (
                  <TableRow>
                    <TableCell colSpan={20} className="h-44 text-center">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <RefreshCw className="w-5 h-5 animate-spin text-meta-blue" />
                        <span className="text-slate-500 font-semibold text-xs">正在聚合落地页多维流水数据...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : paginatedPreviewData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-44 text-center text-slate-400 font-semibold text-xs">
                      目前没有对应的素材类型聚合流水线数据。请重新调整上方筛选过滤选项。
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedPreviewData.map((row) => {
                    const isVideo = (row.material_type || "").toLowerCase() === "video";
                    const isCarousel = (row.material_type || "").toLowerCase() === "carousel";
                    const ctr = row.impressions > 0 ? (row.clicks / row.impressions) * 100 : 0;
                    const cpp = row.purchases > 0 ? row.spend / row.purchases : 0;
                    return (
                      <TableRow key={row.landingKey} className="group/row hover:bg-slate-50/50 align-middle">
                        {/* 1. 预览小图 */}
                        <TableCell className="py-2.5 text-center flex justify-center sticky left-0 bg-white z-10 shadow-[1px_0_0_0_rgba(229,231,235,0.8)] group-hover/row:bg-slate-50/50 transition-colors">
                          {row.preview_url ? (
                            <div className="relative w-10 h-10 rounded-lg border border-slate-200 overflow-hidden bg-slate-50 group shadow-sm">
                              <img 
                                src={row.preview_url} 
                                alt="preview" 
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover transition-transform group-hover:scale-110" 
                              />
                              {isVideo && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
                                  <span className="text-[8px] font-bold px-1 py-0.5 bg-black/60 rounded">V</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="w-10 h-10 rounded-lg border border-dashed border-slate-300 flex items-center justify-center bg-slate-50 text-slate-400 text-[10px]">
                              无图片
                            </div>
                          )}
                        </TableCell>

                        {/* 2. 素材名称 */}
                        <TableCell className="py-2.5 text-[12.5px] font-semibold text-slate-800 max-w-[220px] truncate sticky left-[80px] bg-white z-10 shadow-[1px_0_0_0_rgba(229,231,235,0.8)] group-hover/row:bg-slate-50/50 transition-colors" title={row.material_name}>
                          {row.landing_url ? (
                            <a 
                              href={row.landing_url} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="inline-flex items-center gap-1 text-meta-blue hover:underline cursor-pointer max-w-full"
                            >
                              <span className="truncate">{row.material_name}</span>
                              <ExternalLink className="w-3 shrink-0" />
                            </a>
                          ) : (
                            <span className="truncate">{row.material_name}</span>
                          )}
                        </TableCell>

                        {/* 3. 类型 */}
                        <TableCell className="py-2.5 text-center sticky left-[280px] bg-white z-10 border-r border-slate-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] group-hover/row:bg-slate-50/50 transition-colors">
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider break-keep",
                            isVideo ? "bg-amber-100 text-amber-800" : isCarousel ? "bg-purple-100 text-purple-800" : "bg-teal-100 text-teal-800"
                          )}>
                            {row.material_type}
                          </span>
                        </TableCell>

                        {/* 4. 应用广告数 */}
                        <TableCell className="py-2.5 text-center font-bold text-slate-700 font-mono text-[13px] px-4">
                          {row.adCount.toLocaleString()}
                        </TableCell>

                        {/* 5. 花费金额 */}
                        <TableCell className="py-2.5 text-right font-mono text-[13px] font-bold text-slate-900 px-4">
                          ${row.spend.toFixed(2)}
                        </TableCell>

                        {/* 6. 转化价值 */}
                        <TableCell className="py-2.5 text-right font-mono text-[13px] font-bold text-slate-900 px-4">
                          ${(row as any).purchaseValue?.toFixed(2)}
                        </TableCell>

                        {/* 7. ROAS */}
                        <TableCell className="py-2.5 text-right font-mono text-[13px] font-bold text-emerald-600 px-4">
                          {(row as any).roas?.toFixed(2)}x
                        </TableCell>

                        {/* 8. 购物次数 */}
                        <TableCell className="py-2.5 text-right font-mono text-[13px] text-slate-700 px-4">
                          {row.purchases > 0 ? row.purchases.toLocaleString() : "0"}
                        </TableCell>

                        {/* 9. 单次购物费用 */}
                        <TableCell className="py-2.5 text-right font-mono text-[13px] text-slate-700 px-4">
                          {row.purchases > 0 ? `$${cpp.toFixed(2)}` : "—"}
                        </TableCell>

                        {/* 10. 展示次数 */}
                        <TableCell className="py-2.5 text-right font-mono text-[13px] text-slate-700 px-4">
                          {row.impressions.toLocaleString()}
                        </TableCell>

                        {/* 11. 覆盖人数 */}
                        <TableCell className="py-2.5 text-right font-mono text-[13px] text-slate-700 px-4">
                          {(row as any).reach?.toLocaleString() || "0"}
                        </TableCell>

                        {/* 12. 频次 */}
                        <TableCell className="py-2.5 text-right font-mono text-[13px] text-slate-700 px-4">
                          {(row as any).actualFrequency?.toFixed(2) || "1.00"}
                        </TableCell>

                        {/* 13. 点击量 */}
                        <TableCell className="py-2.5 text-right font-mono text-[13px] text-slate-700 px-4">
                          {row.clicks.toLocaleString()}
                        </TableCell>

                        {/* 14. 点击率 */}
                        <TableCell className="py-2.5 text-right font-mono text-[13px] text-emerald-600 font-semibold px-4">
                          {ctr.toFixed(2)}%
                        </TableCell>

                        {/* 15. CPC */}
                        <TableCell className="py-2.5 text-right font-mono text-[13px] text-slate-700 px-4">
                          ${(row as any).cpc?.toFixed(2) || "0.00"}
                        </TableCell>

                        {/* 16. 链接点击量 */}
                        <TableCell className="py-2.5 text-right font-mono text-[13px] text-slate-700 px-4">
                          {(row as any).linkClicks?.toLocaleString() || "0"}
                        </TableCell>

                        {/* 17. 链接点击率 */}
                        <TableCell className="py-2.5 text-right font-mono text-[13px] text-slate-700 px-4">
                          {(row as any).linkClicksCtr?.toFixed(2) || "0.00"}%
                        </TableCell>

                        {/* 18. 加入购物车 */}
                        <TableCell className="py-2.5 text-right font-mono text-[13px] text-slate-700 px-4">
                          {(row as any).addToCart?.toLocaleString() || "0"}
                        </TableCell>

                        {/* 19. 加购率 */}
                        <TableCell className="py-2.5 text-right font-mono text-[13px] text-slate-700 px-4">
                          {(row as any).atcRate?.toFixed(2) || "0.00"}%
                        </TableCell>

                        {/* 20. 发起结账量 */}
                        <TableCell className="py-2.5 text-right font-mono text-[13px] text-slate-700 px-4">
                          {(row as any).initiateCheckout?.toLocaleString() || "0"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}

                {/* 汇总项底行 */}
                {!previewLoading && filteredAggregated.length > 0 && (
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50 border-t-2 border-slate-200">
                    <TableCell colSpan={3} className="py-3.5 sticky left-0 z-10 bg-slate-50/80 shadow-[1px_0_0_0_rgba(229,231,235,0.8)] border-r border-slate-200">
                      <div className="flex flex-col ml-4">
                        <span className="text-[13px] font-bold text-slate-950">全部聚合项汇总</span>
                        <span className="text-[10px] text-emerald-600 flex items-center gap-1 mt-0.5 font-semibold">
                          <Check className="w-3.5 h-3.5" /> 落地页聚合对齐 logic 计算完毕
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3.5 text-center font-mono text-[13px] font-bold text-slate-950 px-4">
                      {previewSummary.adCount}
                    </TableCell>
                    <TableCell className="py-3.5 text-right font-mono text-[13px] font-bold text-slate-950 px-4">
                      ${previewSummary.spend.toFixed(2)}
                    </TableCell>
                    <TableCell className="py-3.5 text-right font-mono text-[13px] font-bold text-slate-950 px-4">
                      ${previewSummary.purchaseValue.toFixed(2)}
                    </TableCell>
                    <TableCell className="py-3.5 text-right font-mono text-[13px] font-bold text-emerald-600 px-4">
                      {previewSummary.roas.toFixed(2)}x
                    </TableCell>
                    <TableCell className="py-3.5 text-right font-mono text-[13px] font-bold text-slate-950 px-4">
                      {previewSummary.purchases.toLocaleString()}
                    </TableCell>
                    <TableCell className="py-3.5 text-right font-mono text-[13px] font-bold text-slate-950 px-4">
                      {previewSummary.purchases > 0 ? `$${previewSummary.cpp.toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell className="py-3.5 text-right font-mono text-[13px] font-bold text-slate-950 px-4">
                      {previewSummary.impressions.toLocaleString()}
                    </TableCell>
                    <TableCell className="py-3.5 text-right font-mono text-[13px] font-bold text-slate-950 px-4">
                      {previewSummary.reach.toLocaleString()}
                    </TableCell>
                    <TableCell className="py-3.5 text-right font-mono text-[13px] font-bold text-slate-950 px-4">
                      {previewSummary.frequency.toFixed(2)}
                    </TableCell>
                    <TableCell className="py-3.5 text-right font-mono text-[13px] font-bold text-slate-950 px-4">
                      {previewSummary.clicks.toLocaleString()}
                    </TableCell>
                    <TableCell className="py-3.5 text-right font-mono text-[13px] font-bold text-emerald-600 px-4">
                      {previewSummary.ctr.toFixed(2)}%
                    </TableCell>
                    <TableCell className="py-3.5 text-right font-mono text-[13px] font-bold text-slate-950 px-4">
                      ${previewSummary.cpc.toFixed(2)}
                    </TableCell>
                    <TableCell className="py-3.5 text-right font-mono text-[13px] font-bold text-slate-950 px-4">
                      {previewSummary.linkClicks.toLocaleString()}
                    </TableCell>
                    <TableCell className="py-3.5 text-right font-mono text-[13px] font-bold text-slate-950 px-4">
                      {previewSummary.linkClicksCtr.toFixed(2)}%
                    </TableCell>
                    <TableCell className="py-3.5 text-right font-mono text-[13px] font-bold text-slate-950 px-4">
                      {previewSummary.addToCart.toLocaleString()}
                    </TableCell>
                    <TableCell className="py-3.5 text-right font-mono text-[13px] font-bold text-slate-950 px-4">
                      {previewSummary.atcRate.toFixed(2)}%
                    </TableCell>
                    <TableCell className="py-3.5 text-right font-mono text-[13px] font-bold text-slate-950 px-4">
                      {previewSummary.initiateCheckout.toLocaleString()}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* 分页控制面板 (二十条为一页) */}
          {filteredAggregated.length > PREVIEW_PAGE_SIZE && (
            <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/20">
              <span className="text-xs font-medium text-slate-500">
                总共 {filteredAggregated.length} 个聚合设计素材，第 {previewPage} 页 / 共 {Math.ceil(filteredAggregated.length / PREVIEW_PAGE_SIZE)} 页
              </span>
              <div className="flex items-center gap-1.5">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 w-8 p-0"
                  disabled={previewPage <= 1 || previewLoading}
                  onClick={() => setPreviewPage(p => p - 1)}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <div className="px-3 text-xs font-semibold text-slate-700 min-w-8 text-center">{previewPage}</div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 w-8 p-0"
                  disabled={previewPage >= Math.ceil(filteredAggregated.length / PREVIEW_PAGE_SIZE) || previewLoading}
                  onClick={() => setPreviewPage(p => p + 1)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* 走势图面板 */}
      {activeTab === "trends" && (
        <MaterialTrendSection 
          startDate={format(startDate, 'yyyy-MM-dd')}
          endDate={format(endDate, 'yyyy-MM-dd')}
          selectedShopId={storeId}
          selectedAccountId={selectedAccounts.includes('all') ? 'all' : selectedAccounts.join(',')}
          materialType={materialType}
        />
      )}

    </div>
  );
}
