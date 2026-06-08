import React, { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { 
  ArrowUpDown, 
  Download, 
  AlertTriangle, 
  TrendingUp, 
  TrendingDown,
  Activity,
  Image as ImageIcon,
  Video,
  Layers,
  Sparkles,
  BarChart2,
  Calendar,
  Search,
  Check,
  ChevronRight,
  RefreshCcw,
  RefreshCw,
  Clock,
  Zap,
  Maximize2,
  XCircle,
  TrendingUp as TrendUpIcon,
  Award,
  DollarSign,
  ExternalLink,
  Percent,
  Info,
  ChevronLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { toast } from "sonner";
import axios from "axios";
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  Legend
} from "recharts";

interface CreativeData {
  id: string;
  storeId: string;
  creativeName: string;
  type: "IMAGE" | "VIDEO" | "CAROUSEL" | string;
  spend: number;
  purchases: number;
  revenue: number;
  roas: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
  hookRate: number; // 3-second view rate
  aiRiskStatus: string;
  trendStatus: string;
  aiSuggestion?: string;
  accountId?: string;
  adsetId?: string;
  adId?: string;
  adName?: string;
  campaignId?: string;
  reach?: number;
  addToCart?: number;
  productLink?: string;
  imageUrl?: string;
  impressions: number;
}

interface FatigueDetails {
  creativeId: string;
  creativeName: string;
  type: string;
  fatigueScore: number;
  riskLevel: "安全" | "轻度疲劳" | "中度疲劳" | "重度疲劳";
  riskColor: string;
  riskBg: string;
  rulesTriggered: string[];
  recommendations: string[];
}

export function CreativeIntelligenceDashboard({ 
  data, 
  startDate, 
  endDate,
  onStartDateChange,
  onEndDateChange,
  storeFilter = "all",
  projectFilter = "all",
  ownerFilter = "all"
}: { 
  data: any[], 
  startDate?: Date, 
  endDate?: Date,
  onStartDateChange?: (date: Date) => void,
  onEndDateChange?: (date: Date) => void,
  storeFilter?: string,
  projectFilter?: string,
  ownerFilter?: string
}) {
  const [activeSubTab, setActiveSubTab] = useState<"preview" | "metrics" | "trends">("preview");
  const [searchTerm, setSearchTerm] = useState("");
  const [creatives, setCreatives] = useState<CreativeData[]>([]);
  const [dailyRecords, setDailyRecords] = useState<any[]>([]);
  const [storesList, setStoresList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const handleSyncCreatives = async () => {
    setSyncing(true);
    const syncToast = toast.loading("正在分离同步 Meta 创意素材数据...");
    try {
      const startStr = startDate ? format(startDate, "yyyy-MM-dd") : format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");
      const endStr = endDate ? format(endDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");

      const response = await axios.post("/api/sync-creatives", {
        startDate: startStr,
        endDate: endStr
      });
      toast.success(response.data.message || "创意素材数据同步成功！", {
        id: syncToast,
      });
      fetchCreatives();
    } catch (err: any) {
      const respErr = err.response?.data?.error;
      const errMsg = typeof respErr === 'string' ? respErr : (respErr?.message || "同步创意数据失败");
      toast.error(errMsg, { id: syncToast });
    } finally {
      setSyncing(false);
    }
  };
  
  // Local store filter state
  const [localStoreFilter, setLocalStoreFilter] = useState("all");

  useEffect(() => {
    if (storeFilter) {
      setLocalStoreFilter(storeFilter);
    }
  }, [storeFilter]);

  // Format Filter
  const [selectedType, setSelectedType] = useState<string>("ALL");

  // Trend plot configuration state
  const [selectedTrendCreativeIds, setSelectedTrendCreativeIds] = useState<string[]>([]);
  const [trendMetric, setTrendMetric] = useState<"spend" | "roas" | "ctr" | "cpm" | "frequency">("roas");

  // Preview Modal state
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [selectedPreviewCreative, setSelectedPreviewCreative] = useState<CreativeData | null>(null);

  // Sorting state for (1)素材预览设置
  const [previewSortField, setPreviewSortField] = useState<string>("spend");
  const [previewSortOrder, setPreviewSortOrder] = useState<"asc" | "desc">("desc");

  // Sorting state for (2)素材表现指标
  const [metricsSortField, setMetricsSortField] = useState<string>("spend");
  const [metricsSortOrder, setMetricsSortOrder] = useState<"asc" | "desc">("desc");

  // Scroll Synchronization Refs & State
  const previewContainerRef = React.useRef<HTMLDivElement>(null);
  const metricsContainerRef = React.useRef<HTMLDivElement>(null);
  const previewScrollBarRef = React.useRef<HTMLDivElement>(null);
  const metricsScrollBarRef = React.useRef<HTMLDivElement>(null);

  const [previewScrollWidth, setPreviewScrollWidth] = React.useState(0);
  const [metricsScrollWidth, setMetricsScrollWidth] = React.useState(0);

  React.useEffect(() => {
    const updateWidths = () => {
      if (previewContainerRef.current) {
        setPreviewScrollWidth(previewContainerRef.current.scrollWidth);
      }
      if (metricsContainerRef.current) {
        setMetricsScrollWidth(metricsContainerRef.current.scrollWidth);
      }
    };
    
    const timer = setTimeout(updateWidths, 150);

    const observers: ResizeObserver[] = [];
    if (previewContainerRef.current) {
      const obs = new ResizeObserver(updateWidths);
      obs.observe(previewContainerRef.current);
      if (previewContainerRef.current.firstElementChild) {
        obs.observe(previewContainerRef.current.firstElementChild);
      }
      observers.push(obs);
    }
    if (metricsContainerRef.current) {
      const obs = new ResizeObserver(updateWidths);
      obs.observe(metricsContainerRef.current);
      if (metricsContainerRef.current.firstElementChild) {
        obs.observe(metricsContainerRef.current.firstElementChild);
      }
      observers.push(obs);
    }

    return () => {
      clearTimeout(timer);
      observers.forEach(obs => obs.disconnect());
    };
  }, [activeSubTab, creatives, searchTerm]);

  const handleContainerScroll = (tab: "preview" | "metrics") => {
    const container = tab === "preview" ? previewContainerRef.current : metricsContainerRef.current;
    const scrollBar = tab === "preview" ? previewScrollBarRef.current : metricsScrollBarRef.current;
    if (container && scrollBar) {
      scrollBar.scrollLeft = container.scrollLeft;
    }
  };

  const handleScrollBarScroll = (tab: "preview" | "metrics", e: React.UIEvent<HTMLDivElement>) => {
    const container = tab === "preview" ? previewContainerRef.current : metricsContainerRef.current;
    if (container) {
      container.scrollLeft = e.currentTarget.scrollLeft;
    }
  };

  const handlePreviewSort = (field: string) => {
    if (previewSortField === field) {
      setPreviewSortOrder(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setPreviewSortField(field);
      setPreviewSortOrder("desc");
    }
  };

  const handleMetricsSort = (field: string) => {
    if (metricsSortField === field) {
      setMetricsSortOrder(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setMetricsSortField(field);
      setMetricsSortOrder("desc");
    }
  };

  const renderSortIcon = (field: string, currentField: string, currentOrder: "asc" | "desc") => {
    if (currentField !== field) {
      return <span className="inline-block ml-1 text-slate-300">↕</span>;
    }
    return currentOrder === "asc" 
      ? <span className="inline-block ml-1 text-slate-800 font-extrabold text-[11px]">↑</span> 
      : <span className="inline-block ml-1 text-slate-800 font-extrabold text-[11px]">↓</span>;
  };

  const fetchCreatives = async () => {
    try {
      setLoading(true);
      const startStr = startDate ? format(startDate, "yyyy-MM-dd") : format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");
      const endStr = endDate ? format(endDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");

      const [resGrouped, resDaily, resStores] = await Promise.all([
        axios.get("/api/intelligence/creatives", {
          params: { startDate: startStr, endDate: endStr, storeFilter: "all" }
        }),
        axios.get("/api/intelligence/creatives/daily", {
          params: { startDate: startStr, endDate: endStr, storeFilter: "all" }
        }).catch(() => ({ data: [] })), 
        axios.get("/api/stores").catch(() => ({ data: [] }))
      ]);

      const formattedGrouped = (resGrouped.data || []).map((item: any) => ({
        ...item,
        type: item.type || "IMAGE"
      }));

      setCreatives(formattedGrouped);
      setDailyRecords(resDaily.data || []);
      setStoresList(resStores.data || []);

      // Autofill default trends options
      if (formattedGrouped.length > 0) {
        setSelectedTrendCreativeIds([formattedGrouped[0].id]);
      }
    } catch (err: any) {
      toast.error("加载素材分析数据失败");
      setCreatives([]);
      setDailyRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const startStrKey = startDate ? format(startDate, "yyyy-MM-dd") : "";
  const endStrKey = endDate ? format(endDate, "yyyy-MM-dd") : "";

  useEffect(() => {
    fetchCreatives();
  }, [startStrKey, endStrKey]);

  // Daily records index by creative ID
  const dailyRecordsByCreative = React.useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const r of dailyRecords) {
      if (!map[r.creativeId]) {
        map[r.creativeId] = [];
      }
      map[r.creativeId].push(r);
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.date.localeCompare(b.date));
    }
    return map;
  }, [dailyRecords]);

  // Calculate ad spend per store ID inside this date range
  const storeSpends = React.useMemo(() => {
    const map: Record<string, number> = {};
    creatives.forEach(c => {
      const sId = c.storeId ? c.storeId.toString() : "";
      if (sId) {
        map[sId] = (map[sId] || 0) + (c.spend || 0);
      }
    });
    return map;
  }, [creatives]);

  // Stores that have positive ad spend
  const spendStores = React.useMemo(() => {
    return storesList.filter(s => {
      const sId = s.id.toString();
      return (storeSpends[sId] || 0) > 0;
    });
  }, [storesList, storeSpends]);

  // Resolve stores matching parent active filters plus local dropdown selections
  const activeStores = React.useMemo(() => {
    const matchedNames = new Set<string>();
    const safeData = Array.isArray(data) ? data : [];
    safeData.forEach(item => {
      const matchProject = projectFilter === "all" || item.project === projectFilter;
      const matchStore = localStoreFilter === "all" || item.store === localStoreFilter;
      const matchOwner = ownerFilter === "all" || item.owner === ownerFilter;
      if (matchProject && matchStore && matchOwner && item.store) {
        matchedNames.add(item.store.toLowerCase());
      }
    });
    
    // Fallback: If no matched names, check if localStoreFilter specifically matches something
    if (matchedNames.size === 0 && localStoreFilter !== "all") {
      matchedNames.add(localStoreFilter.toLowerCase());
    }
    
    return spendStores.filter(s => matchedNames.has(s.name.toLowerCase()));
  }, [data, projectFilter, localStoreFilter, ownerFilter, spendStores]);

  const activeStoreIds = React.useMemo(() => {
    return activeStores.map(s => s.id);
  }, [activeStores]);

  // Account filtration coupled with active filter store configurations
  const filteredCreatives = React.useMemo(() => {
    return creatives.filter(c => {
      // 0. Spend constraint: Hide creative ad IDs that have no ad spend (spend <= 0)
      // BUT if there is an active search term, bypass this check so the user can search and find any creative!
      const isSearching = !!searchTerm;
      if (!isSearching && (c.spend || 0) <= 0) return false;

      // 1. Account / Store coupling constraint
      // If store filter is "all" and no sub-filters exist, allow all.
      // Else, map through storeFilter matching IDs.
      const belongsToFilteredStore = activeStoreIds.length === 0 || activeStoreIds.includes(Number(c.storeId));
      
      // 2. Format filter
      const matchesType = selectedType === "ALL" || c.type === selectedType;
      
      // 3. Search query filter
      const matchesSearch = !searchTerm || 
                            c.creativeName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            c.id.toString().toLowerCase().includes(searchTerm.toLowerCase());
      
      return belongsToFilteredStore && matchesType && matchesSearch;
    });
  }, [creatives, activeStoreIds, selectedType, searchTerm]);

  // Daily records matching current selection
  const filteredDailyRecords = React.useMemo(() => {
    return dailyRecords.filter(r => {
      return activeStoreIds.length === 0 || activeStoreIds.includes(Number(r.storeId));
    });
  }, [dailyRecords, activeStoreIds]);

  // Fatigue Calculations based on static models for filtered subset
  const fatigueMap = React.useMemo(() => {
    const map: Record<string, FatigueDetails> = {};
    for (const c of creatives) {
      const history = dailyRecordsByCreative[c.id] || [];
      const rulesTriggered: string[] = [];
      const recommendations: string[] = [];
      
      const frequency = c.frequency || (history.length > 0 ? history[history.length - 1].frequency : 1.0);
      const ctr = c.ctr || (history.length > 0 ? history[history.length - 1].ctr : 1.0);
      const cpm = c.cpm || (history.length > 0 ? history[history.length - 1].cpm : 10.0);
      const roas = c.roas || (history.length > 0 ? history[history.length - 1].roas : 2.0);
      const spend = c.spend || (history.length > 0 ? history[history.length - 1].spend : 0);

      let score = 5;

      if (frequency > 4.5) {
        score += 45;
        rulesTriggered.push(`展示频次过载 (${frequency.toFixed(2)} > 4.5)`);
        recommendations.push("展示曝光极度饱和，同批受众重叠严重。建议立即对该素材及广告层级暂停或更替。");
      } else if (frequency > 3.0) {
        score += 25;
        rulesTriggered.push(`展示频次偏高 (${frequency.toFixed(2)} > 3.0)`);
        recommendations.push("受众表现衰减前兆。建议配置多图文或多视频素材轮播机制，分流展示压力。");
      }

      if (history.length >= 3) {
        const recent = history.slice(-3);
        const ctr1 = recent[0].ctr;
        const ctr2 = recent[1].ctr;
        const ctr3 = recent[2].ctr;
        if (ctr3 < ctr2 && ctr2 < ctr1) {
          score += 30;
          rulesTriggered.push(`CTR 连续 3 日滑落 (${ctr1.toFixed(2)}% → ${ctr2.toFixed(2)}% → ${ctr3.toFixed(2)}%)`);
          recommendations.push("素材对当前受众失去吸睛作用。请重新编排视频前3秒或更换高反差底图。");
        }
      } else if (ctr < 1.0) {
        score += 15;
        rulesTriggered.push(`点击率偏低 (CTR ${ctr.toFixed(2)}% < 1.0%)`);
        recommendations.push("网民点击兴趣微弱。建议简化缩短核心文案，使用突出折扣诱导点击。");
      }

      if (cpm > 25) {
        score += 10;
        rulesTriggered.push(`CPM 昂贵 (千次展示 $${cpm.toFixed(2)})`);
        recommendations.push("流量竞价成本攀升。可进行受众更替，或使用更通俗的行动按钮竞逐长尾流量。");
      }

      if (roas < 1.0 && spend > 100) {
        score += 20;
        rulesTriggered.push(`营收转化倒挂 (ROAS 为 ${roas.toFixed(2)}x)`);
        recommendations.push("素材空烧损失广告金。建议结合历史包数据分析或切换关联高转化转化单页组。");
      }

      const finalScore = Math.min(score, 100);

      let riskLevel: "安全" | "轻度疲劳" | "中度疲劳" | "重度疲劳" = "安全";
      let riskColor = "text-green-600";
      let riskBg = "bg-green-50 border-green-200 text-green-700";
      if (finalScore >= 70) {
        riskLevel = "重度疲劳";
        riskColor = "text-red-600 font-extrabold";
        riskBg = "bg-red-50 border-red-200 text-red-700";
      } else if (finalScore >= 40) {
        riskLevel = "中度疲劳";
        riskColor = "text-orange-600 font-bold";
        riskBg = "bg-orange-50 border-orange-200 text-orange-700";
      } else if (finalScore >= 20) {
        riskLevel = "轻度疲劳";
        riskColor = "text-yellow-600 font-semibold";
        riskBg = "bg-yellow-50 border-yellow-200 text-yellow-800";
      }

      map[c.id] = {
        creativeId: c.id,
        creativeName: c.creativeName,
        type: c.type,
        fatigueScore: finalScore,
        riskLevel,
        riskColor,
        riskBg,
        rulesTriggered: rulesTriggered.length > 0 ? rulesTriggered : ["各项数据指标处于平稳安全阈值内"],
        recommendations: recommendations.length > 0 ? recommendations : ["素材状态评估优良。请支持并维持现有投放。"]
      };
    }
    return map;
  }, [creatives, dailyRecordsByCreative]);

  const evaluateSingleFatigue = (creativeId: string, creativeName: string, type: string): FatigueDetails => {
    if (fatigueMap[creativeId]) {
      return fatigueMap[creativeId];
    }
    return {
      creativeId,
      creativeName,
      type,
      fatigueScore: 5,
      riskLevel: "安全",
      riskColor: "text-green-600",
      riskBg: "bg-green-50 border-green-200 text-green-700",
      rulesTriggered: ["各项数据指标处于平稳安全阈值内"],
      recommendations: ["素材状态评估优良。无需额外优化策略。"]
    };
  };

  // Sorted creatives for Preview tab
  const sortedPreviewCreatives = React.useMemo(() => {
    const list = [...filteredCreatives];
    list.sort((a, b) => {
      let valA: any = "";
      let valB: any = "";

      if (previewSortField === "spend") {
        valA = a.spend || 0;
        valB = b.spend || 0;
      } else if (previewSortField === "purchases") {
        valA = a.purchases || 0;
        valB = b.purchases || 0;
      } else if (previewSortField === "revenue") {
        valA = a.revenue || 0;
        valB = b.revenue || 0;
      } else if (previewSortField === "name") {
        valA = a.creativeName || "";
        valB = b.creativeName || "";
      } else if (previewSortField === "type") {
        valA = a.type || "";
        valB = b.type || "";
      } else if (previewSortField === "fatigue") {
        valA = evaluateSingleFatigue(a.id, a.creativeName, a.type).fatigueScore || 0;
        valB = evaluateSingleFatigue(b.id, b.creativeName, b.type).fatigueScore || 0;
      } else {
        valA = a.spend || 0;
        valB = b.spend || 0;
      }

      if (typeof valA === "string") {
        return previewSortOrder === "asc"
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      } else {
        return previewSortOrder === "asc" ? valA - valB : valB - valA;
      }
    });
    return list;
  }, [filteredCreatives, previewSortField, previewSortOrder, fatigueMap]);

  // Sorted creatives for Metrics tab
  const sortedMetricsCreatives = React.useMemo(() => {
    const list = [...filteredCreatives];
    list.sort((a, b) => {
      let valA: any = "";
      let valB: any = "";

      if (metricsSortField === "spend") {
        valA = a.spend || 0;
        valB = b.spend || 0;
      } else if (metricsSortField === "purchases") {
        valA = a.purchases || 0;
        valB = b.purchases || 0;
      } else if (metricsSortField === "revenue") {
        valA = a.revenue || 0;
        valB = b.revenue || 0;
      } else if (metricsSortField === "cpc") {
        const cpcA = a.purchases > 0 ? (a.spend / a.purchases) : 0;
        const cpcB = b.purchases > 0 ? (b.spend / b.purchases) : 0;
        valA = cpcA;
        valB = cpcB;
      } else if (metricsSortField === "impressions") {
        valA = a.impressions || 0;
        valB = b.impressions || 0;
      } else if (metricsSortField === "reach") {
        valA = a.reach || Math.round(a.impressions * 0.85);
        valB = b.reach || Math.round(b.impressions * 0.85);
      } else if (metricsSortField === "ctr") {
        valA = a.ctr || 0;
        valB = b.ctr || 0;
      } else if (metricsSortField === "addToCart") {
        valA = a.addToCart || 0;
        valB = b.addToCart || 0;
      } else if (metricsSortField === "accountId") {
        valA = a.accountId || "";
        valB = b.accountId || "";
      } else if (metricsSortField === "adsetId") {
        valA = a.adsetId || "";
        valB = b.adsetId || "";
      } else if (metricsSortField === "adId") {
        valA = a.adId || "";
        valB = b.adId || "";
      } else if (metricsSortField === "id") {
        valA = a.id || "";
        valB = b.id || "";
      } else if (metricsSortField === "type") {
        valA = a.type || "";
        valB = b.type || "";
      } else {
        valA = a.spend || 0;
        valB = b.spend || 0;
      }

      if (typeof valA === "string") {
        return metricsSortOrder === "asc"
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      } else {
        return metricsSortOrder === "asc" ? valA - valB : valB - valA;
      }
    });
    return list;
  }, [filteredCreatives, metricsSortField, metricsSortOrder]);

  // KPI aggregates for filtered data
  const totalSpend = filteredCreatives.reduce((sum, c) => sum + (c.spend || 0), 0);
  const totalRevenue = filteredCreatives.reduce((sum, c) => sum + (c.revenue || 0), 0);
  const totalPurchases = filteredCreatives.reduce((sum, c) => sum + (c.purchases || 0), 0);
  const avgROAS = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const avgCTR = filteredCreatives.length > 0 ? filteredCreatives.reduce((sum, c) => sum + (c.ctr || 0), 0) / filteredCreatives.length : 0;
  const avgCPM = filteredCreatives.length > 0 ? filteredCreatives.reduce((sum, c) => sum + (c.cpm || 0), 0) / filteredCreatives.length : 0;

  const handleExport = () => {
    const exportData = filteredCreatives.map(c => {
      const fatigue = evaluateSingleFatigue(c.id, c.creativeName, c.type);
      return {
        '素材ID': c.id,
        '店铺ID': c.storeId,
        '素材名称': c.creativeName,
        '素材类型': c.type === "IMAGE" ? "单图素材" : c.type === "VIDEO" ? "视频素材" : "轮播素材",
        '支出花费 ($)': c.spend,
        '购买订单数': c.purchases,
        '追踪转化金额 ($)': c.revenue,
        '转化ROAS': c.roas,
        '点击率 CTR (%)': c.ctr,
        '单次点击成本 CPC ($)': c.cpc,
        '千次展示成本 CPM ($)': c.cpm,
        '频次 Frequency': c.frequency,
        '3秒视频留存 (%)': c.type === "VIDEO" ? c.hookRate : "N/A",
        '疲劳评分': fatigue.fatigueScore,
        '风险等级': fatigue.riskLevel,
        '诊断指标': fatigue.rulesTriggered.join("; ")
      };
    });
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "素材诊断数据报表");
    XLSX.writeFile(wb, `Creative_Bi_Diagnostic_${format(new Date(), "yyyyMMdd")}.xlsx`);
    toast.success("素材诊断数据报表导出成功！");
  };

  // Render icons helper
  const getTypeBadge = (type: string) => {
    switch(type) {
      case "VIDEO": 
        return (
          <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200">
            <Video className="w-3.5 h-3.5 text-blue-500 shrink-0" /> 视频素材
          </span>
        );
      case "IMAGE": 
        return (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
            <ImageIcon className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> 单图素材
          </span>
        );
      case "CAROUSEL": 
        return (
          <span className="inline-flex items-center gap-1 rounded bg-purple-50 px-2.5 py-0.5 text-xs font-semibold text-purple-700 border border-purple-200">
            <Layers className="w-3.5 h-3.5 text-purple-500 shrink-0" /> 轮播素材
          </span>
        );
      default: 
        return (
          <span className="inline-flex items-center gap-1 rounded bg-gray-50 px-2.5 py-0.5 text-xs font-semibold text-gray-700 border border-gray-200">
            <ImageIcon className="w-3.5 h-3.5 text-gray-500 shrink-0" /> 其它格式
          </span>
        );
    }
  };

  const generateMockThumbnail = (creativeId: string, type: string) => {
    const mockUrl = `https://business.facebook.com/adsmanager/manage/ads?act=all&selected_creative_ids=${creativeId}`;
    return (
      <div className="w-full rounded-lg bg-slate-50 border border-slate-200 p-4 transition-all hover:border-meta-blue hover:bg-slate-100 flex flex-col justify-between gap-3 text-slate-800 shadow-sm relative group cursor-pointer">
        <div className="flex justify-between items-start gap-2 border-b border-slate-200 pb-2">
          <span className="inline-flex items-center gap-1 rounded bg-slate-200/80 px-2 py-0.5 text-[10px] font-bold text-slate-700 tracking-wider">
            {type === "VIDEO" ? <Video className="w-3.5 h-3.5 text-blue-500 shrink-0" /> : <ImageIcon className="w-3.5 h-3.5 text-emerald-500 shrink-0" />} {type} 格式
          </span>
          <span className="text-slate-400 group-hover:text-meta-blue transition-colors">
            <ExternalLink className="w-3.5 h-3.5" />
          </span>
        </div>
        
        <div className="space-y-1">
          <p className="text-[10px] text-slate-500 leading-tight font-medium">外部素材源直达链接：</p>
          <a
            href={mockUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              e.stopPropagation();
            }}
            className="text-[11px] font-mono text-meta-blue underline hover:text-blue-700 font-bold break-all block"
          >
            {mockUrl}
          </a>
        </div>
        
        <div className="text-[10px] text-gray-400 mt-1 border-t border-dashed border-gray-200 pt-2 leading-relaxed font-mono">
          ⚡ 物理零文件缓存机制直达外源链接，彻底防宿主卡死。
        </div>
      </div>
    );
  };

  // Curated leaderboards from current coupled dataset
  const getLeaderboards = () => {
    const sortedByROAS = [...filteredCreatives].sort((a, b) => b.roas - a.roas);
    const sortedByCTR = [...filteredCreatives].sort((a, b) => b.ctr - a.ctr);
    
    // Inefficient: Spend > $100 and ROAS < 1.1 (money wasted)
    const sortedByWaste = [...filteredCreatives]
      .filter(c => c.spend > 100)
      .sort((a, b) => b.spend - a.spend)
      .filter(c => c.roas < 1.1);

    // Dynamic Video Hook Rate Ranking 
    const sortedByHook = [...filteredCreatives]
      .filter(c => c.type === "VIDEO")
      .sort((a, b) => b.hookRate - a.hookRate);

    return {
      topRoas: sortedByROAS.slice(0, 5),
      topCtr: sortedByCTR.slice(0, 5),
      topWaste: sortedByWaste.slice(0, 5),
      topHook: sortedByHook.slice(0, 5)
    };
  };

  // Historical charting metrics aggregation
  const getTrendChartData = () => {
    if (selectedTrendCreativeIds.length === 0 || filteredDailyRecords.length === 0) return [];
    
    const dateMap: Record<string, Record<string, any>> = {};
    
    filteredDailyRecords.forEach(rec => {
      if (!selectedTrendCreativeIds.includes(rec.creativeId)) return;
      const dateKey = rec.date;
      if (!dateMap[dateKey]) {
        dateMap[dateKey] = { date: dateKey };
      }
      
      const creativeName = rec.creativeName || `素材 ${rec.creativeId}`;
      let metricValue = 0;
      if (trendMetric === "spend") metricValue = rec.spend;
      else if (trendMetric === "roas") metricValue = rec.spend > 0 ? (rec.revenue / rec.spend) : 0;
      else if (trendMetric === "ctr") metricValue = rec.ctr;
      else if (trendMetric === "cpm") metricValue = rec.cpm;
      else if (trendMetric === "frequency") metricValue = rec.frequency;

      dateMap[dateKey][creativeName] = Number(metricValue.toFixed(2));
    });

    return Object.values(dateMap).sort((a: any, b: any) => a.date.localeCompare(b.date));
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Dynamic coupled BI Header */}
      <div className="bg-white px-6 py-4 rounded-xl border border-gray-100 shadow-sm flex items-center justify-end">
        
        {/* Date Selector Indicator, Store selection dropdown, & Export block */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 h-9">
            <span className="text-xs text-slate-500 font-bold">选择店铺:</span>
            <select
              className="h-7 text-xs bg-transparent border-none outline-none font-extrabold text-slate-800 pr-2 cursor-pointer"
              value={localStoreFilter}
              onChange={(e) => setLocalStoreFilter(e.target.value)}
            >
              <option value="all">全部店铺</option>
              {spendStores.map(s => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>

          {onStartDateChange && onEndDateChange ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="relative">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 z-10" />
                <Popover>
                  <PopoverTrigger className="pl-8 pr-2.5 h-9 border border-gray-200 rounded-lg text-xs w-[120px] text-left bg-white flex items-center text-gray-750 font-semibold cursor-pointer">
                    {startDate ? format(startDate, "yyyy-MM-dd") : "开始"}
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start" sideOffset={8}>
                    <CalendarComponent
                      mode="single"
                      selected={startDate}
                      onSelect={(day) => day && onStartDateChange(day)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <span className="text-gray-400 text-xs font-medium">至</span>
              <div className="relative">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 z-10" />
                <Popover>
                  <PopoverTrigger className="pl-8 pr-2.5 h-9 border border-gray-200 rounded-lg text-xs w-[120px] text-left bg-white flex items-center text-gray-750 font-semibold cursor-pointer">
                    {endDate ? format(endDate, "yyyy-MM-dd") : "结束"}
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start" sideOffset={8}>
                    <CalendarComponent
                      mode="single"
                      selected={endDate}
                      onSelect={(day) => day && onEndDateChange(day)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          ) : (
            <div className="flex items-center h-9 bg-gray-50 border border-gray-200 text-gray-700 px-3 rounded-lg text-xs gap-2">
              <Calendar className="w-3.5 h-3.5 text-gray-400 mr-0.5" />
              <span>
                {startDate ? format(startDate, "yyyy-MM-dd") : "过去30天"} ~ {endDate ? format(endDate, "yyyy-MM-dd") : "当天"}
              </span>
            </div>
          )}
          <Button
            variant="outline"
            className="h-9 px-3.5 text-xs font-semibold border-gray-200 text-slate-700 hover:bg-gray-50 flex items-center gap-1.5"
            onClick={handleSyncCreatives}
            disabled={syncing}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            同步创意数据
          </Button>
          <Button
            onClick={fetchCreatives}
            variant="outline"
            size="icon"
            className="w-9 h-9 border-gray-200 text-gray-600 hover:text-gray-900 shrink-0"
            title="刷新数据"
          >
            <RefreshCcw className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            className="h-9 px-3.5 text-xs font-semibold border-gray-200 text-[#374151] hover:bg-gray-50"
            onClick={handleExport}
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            导出报表
          </Button>
        </div>
      </div>

      {/* Aggregate KPI Panels connected with parent filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 bg-white border border-slate-100 shadow-sm rounded-xl">
          <div className="flex justify-between items-center text-slate-400 mb-1">
            <span className="text-[11px] font-bold tracking-wider uppercase">总营销消耗 Expenditure</span>
            <DollarSign className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-lg font-extrabold text-slate-900 font-mono">${totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <div className="flex items-center gap-1.5 mt-2">
            <span className="text-[9px] bg-emerald-50 text-emerald-700 font-bold px-1.5 py-0.5 rounded">实时计算</span>
            <span className="text-[9px] text-slate-400">当前筛选周期合计</span>
          </div>
        </Card>

        <Card className="p-4 bg-white border border-slate-100 shadow-sm rounded-xl">
          <div className="flex justify-between items-center text-slate-400 mb-1">
            <span className="text-[11px] font-bold tracking-wider uppercase">追踪回报价值 Revenue</span>
            <TrendUpIcon className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-lg font-extrabold text-slate-900 font-mono">${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          <div className="flex items-center gap-1.5 mt-2">
            <span className="text-[9px] bg-blue-50 text-blue-700 font-bold px-1.5 py-0.5 rounded">购买转化</span>
            <span className="text-[9px] text-slate-500 font-semibold font-mono">订单量: {totalPurchases}</span>
          </div>
        </Card>

        <Card className="p-4 bg-white border border-slate-100 shadow-sm rounded-xl">
          <div className="flex justify-between items-center text-slate-400 mb-1">
            <span className="text-[11px] font-bold tracking-wider uppercase">整体产出比 ROAS</span>
            <Award className="w-4 h-4 text-indigo-505" />
          </div>
          <p className={`text-lg font-extrabold font-mono ${avgROAS >= 2.0 ? 'text-blue-600' : avgROAS >= 1.2 ? 'text-slate-800' : 'text-red-500'}`}>{avgROAS.toFixed(2)}x</p>
          <div className="flex items-center gap-1.5 mt-2">
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${avgROAS >= 1.2 ? 'bg-indigo-50 text-indigo-700' : 'bg-red-50 text-red-700'}`}>
              {avgROAS >= 1.2 ? '转化效率优良' : '低于安全红线'}
            </span>
          </div>
        </Card>

        <Card className="p-4 bg-white border border-slate-100 shadow-sm rounded-xl">
          <div className="flex justify-between items-center text-slate-400 mb-1">
            <span className="text-[11px] font-bold tracking-wider uppercase">平均展现点击率 CTR</span>
            <Percent className="w-4 h-4 text-purple-500" />
          </div>
          <p className="text-lg font-extrabold text-slate-900 font-mono">{avgCTR.toFixed(2)}%</p>
          <div className="flex items-center gap-1.5 mt-2">
            <span className="text-[9px] bg-purple-50 text-purple-700 font-semibold px-1.5 py-0.5 rounded">平均 CPM</span>
            <span className="text-[9px] text-slate-400 font-mono">${avgCPM.toFixed(2)}</span>
          </div>
        </Card>
      </div>

            {/* SECONDARY NAVIGATION TABS */}
      <div className="flex border border-slate-150 bg-white p-1 rounded-xl shadow-sm gap-1">
        <button
          type="button"
          onClick={() => setActiveSubTab("preview")}
          className={`flex-1 py-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${activeSubTab === "preview" ? "bg-slate-900 text-white shadow" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50 bg-transparent"}`}
        >
          <Maximize2 className="w-4 h-4" /> (1) 素材预览设置 (Creative Setup & Preview)
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab("metrics")}
          className={`flex-1 py-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${activeSubTab === "metrics" ? "bg-slate-900 text-white shadow" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50 bg-transparent"}`}
        >
          <BarChart2 className="w-4 h-4" /> (2) 素材表现指标 (Performance Metrics)
        </button>
        <button
          type="button"
          onClick={() => setActiveSubTab("trends")}
          className={`flex-1 py-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer ${activeSubTab === "trends" ? "bg-slate-900 text-white shadow" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50 bg-transparent"}`}
        >
          <Activity className="w-4 h-4" /> (3) 素材对比走势 (Trend Charts)
        </button>
      </div>

      {/* SUBTAB CONTENT */}
      <div className="space-y-4">
        {/* TAB 1: 素材预览设置 (Creative Preview & Settings) */}
        {activeSubTab === "preview" && (
          <div className="space-y-4">
            {/* Inline layout controller */}
            <div className="bg-white p-4 border border-slate-100 rounded-xl shadow-sm flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <Input 
                  type="text"
                  placeholder="智能搜索素材名 / ID..."
                  className="pl-9 h-9 text-xs border-slate-200"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-xs text-slate-500 font-bold shrink-0">素材类型:</span>
                <select
                  className="h-9 text-xs bg-white border border-slate-200 rounded-lg px-2.5 outline-none focus:ring-1 focus:ring-slate-900 font-medium cursor-pointer"
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                >
                  <option value="ALL">全部格式 (ALL)</option>
                  <option value="IMAGE">单图 (IMAGE)</option>
                  <option value="VIDEO">视频 (VIDEO)</option>
                  <option value="CAROUSEL">轮播 (CAROUSEL)</option>
                </select>
              </div>

              <div className="text-xs text-slate-450 font-medium">
                符合筛选条件素材: <b className="text-slate-800 font-extrabold">{filteredCreatives.length} / {creatives.length}</b> 个
              </div>
            </div>

            {filteredCreatives.length === 0 ? (
              <Card className="py-20 text-center text-slate-400 text-xs font-mono border-slate-100 bg-white">
                未匹配到符合条件的素材或当前该账户名下暂无同步的数据
              </Card>
            ) : (
              <Card className="border border-slate-100 rounded-xl overflow-hidden shadow-sm bg-white">
                <div 
                  className="overflow-x-auto" 
                  ref={previewContainerRef} 
                  onScroll={() => handleContainerScroll("preview")}
                >
                  <Table>
                    <TableHeader className="bg-slate-50 border-b border-slate-100">
                      <TableRow>
                        <TableHead className="text-xs font-bold text-slate-700 h-11 w-[90px] text-center">素材预览</TableHead>
                        <TableHead 
                          onClick={() => handlePreviewSort("name")}
                          className="text-xs font-bold text-slate-700 h-11 cursor-pointer hover:bg-slate-100 select-none transition-all"
                        >
                          素材名称 / ID {renderSortIcon("name", previewSortField, previewSortOrder)}
                        </TableHead>
                        <TableHead 
                          onClick={() => handlePreviewSort("type")}
                          className="text-xs font-bold text-slate-700 h-11 w-[130px] cursor-pointer hover:bg-slate-100 select-none transition-all"
                        >
                          素材类型 {renderSortIcon("type", previewSortField, previewSortOrder)}
                        </TableHead>
                        <TableHead className="text-xs font-bold text-slate-700 h-11">关联广告标识</TableHead>
                        <TableHead 
                          onClick={() => handlePreviewSort("fatigue")}
                          className="text-xs font-bold text-slate-700 h-11 w-[140px] cursor-pointer hover:bg-slate-100 select-none transition-all"
                        >
                          诊断疲劳评分 {renderSortIcon("fatigue", previewSortField, previewSortOrder)}
                        </TableHead>
                        <TableHead className="text-xs font-bold text-slate-700 h-11">商品落地页链接</TableHead>
                        <TableHead className="text-xs font-bold text-slate-700 h-11 w-[120px] text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedPreviewCreatives.flatMap((c, idx) => {
                        const fatigue = evaluateSingleFatigue(c.id, c.creativeName, c.type);
                        const row = (
                          <TableRow key={c.id} className="hover:bg-slate-50/50 align-middle">
                            <TableCell className="py-3 text-center">
                              <div 
                                className="w-12 h-12 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center cursor-pointer hover:border-meta-blue transition-colors mx-auto relative group"
                                onClick={() => {
                                  setSelectedPreviewCreative(c);
                                  setPreviewModalOpen(true);
                                }}
                                title="点击查看详细诊断"
                              >
                                {c.type === "VIDEO" ? (
                                  <div className="w-full h-full flex flex-col items-center justify-center text-blue-500 bg-blue-50 relative">
                                    <Video className="w-5 h-5" />
                                    <span className="text-[8px] font-bold absolute bottom-0.5 bg-blue-600 text-white px-1 py-0.2 rounded-sm scale-90">VIDEO</span>
                                  </div>
                                ) : c.type === "CAROUSEL" ? (
                                  <div className="w-full h-full flex flex-col items-center justify-center text-purple-500 bg-purple-50 relative">
                                    <Layers className="w-5 h-5" />
                                    <span className="text-[8px] font-bold absolute bottom-0.5 bg-purple-600 text-white px-1 py-0.2 rounded-sm scale-90 text-[7px]">CAROUSEL</span>
                                  </div>
                                ) : (
                                  <div className="w-full h-full flex flex-col items-center justify-center text-emerald-500 bg-emerald-50 relative">
                                    {c.imageUrl ? (
                                      <img src={c.imageUrl} alt="preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                    ) : (
                                      <ImageIcon className="w-5 h-5" />
                                    )}
                                    <span className="text-[8px] font-bold absolute bottom-0.5 bg-emerald-600 text-white px-1 rounded-sm scale-90">IMAGE</span>
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="py-3">
                              <div className="space-y-0.5 max-w-[200px]">
                                <div 
                                  className="font-bold text-slate-800 hover:text-meta-blue cursor-pointer truncate text-[13px]"
                                  onClick={() => {
                                    setSelectedPreviewCreative(c);
                                    setPreviewModalOpen(true);
                                  }}
                                >
                                  {c.creativeName}
                                </div>
                                <div className="text-[10px] font-mono text-slate-400">ID: {c.id}</div>
                              </div>
                            </TableCell>
                            <TableCell className="py-3">{getTypeBadge(c.type)}</TableCell>
                            <TableCell className="py-3">
                              <div className="space-y-1 font-mono text-[10px]">
                                <div className="flex items-center gap-1.5">
                                  <span className="px-1 py-0.2 text-[8px] font-extrabold bg-slate-100 text-slate-500 rounded border border-slate-200">账户</span>
                                  <span className="text-slate-600 font-medium">{c.accountId || "N/A"}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="px-1 py-0.2 text-[8px] font-extrabold bg-blue-50 text-blue-600 rounded border border-blue-100">组ID</span>
                                  <span className="text-slate-600 font-medium">{c.adsetId || "N/A"}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="px-1 py-0.2 text-[8px] font-extrabold bg-indigo-50 text-indigo-600 rounded border border-indigo-100">广告</span>
                                  <span className="text-slate-600 font-medium">{c.adId || "N/A"}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className="px-1 py-0.2 text-[8px] font-extrabold bg-emerald-50 text-emerald-600 rounded border border-emerald-100">素材</span>
                                  <span className="text-slate-600 font-medium">{c.id}</span>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="py-3">
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-mono font-bold text-slate-800">{fatigue.fatigueScore} 分</span>
                                  <span className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded border ${fatigue.riskBg}`}>
                                    {fatigue.riskLevel}
                                  </span>
                                </div>
                                <div className="w-20 bg-slate-100 rounded-full h-1 overflow-hidden">
                                  <div 
                                    className={`h-full rounded-full ${
                                      fatigue.fatigueScore >= 70 ? 'bg-red-500' : 
                                      fatigue.fatigueScore >= 40 ? 'bg-orange-500' : 
                                      fatigue.fatigueScore >= 20 ? 'bg-yellow-500' : 'bg-green-500'
                                    }`}
                                    style={{ width: `${fatigue.fatigueScore}%` }}
                                  ></div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="py-3">
                              <div className="max-w-[220px] flex items-center gap-1.5 bg-slate-50/50 hover:bg-slate-100/50 transition-colors border border-slate-100 rounded-lg px-2.5 py-1.5 text-slate-800">
                                <span className="overflow-hidden flex-1 shrink-0">
                                  <a 
                                    href={c.productLink || "#"} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-[11px] font-mono text-meta-blue font-bold truncate block underline hover:text-blue-700"
                                    onClick={(e) => e.stopPropagation()}
                                    title={c.productLink}
                                  >
                                    {c.productLink}
                                  </a>
                                </span>
                                <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              </div>
                            </TableCell>
                            <TableCell className="py-3 text-right">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8 text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
                                onClick={() => {
                                  setSelectedPreviewCreative(c);
                                  setPreviewModalOpen(true);
                                }}
                              >
                                深度诊断
                              </Button>
                            </TableCell>
                          </TableRow>
                        );

                        if (idx === 9 && sortedPreviewCreatives.length > 10) {
                          const scrollRow = (
                            <TableRow key="floating-preview-scrollbar-row" className="bg-slate-50/50 border-y border-slate-200">
                              <TableCell colSpan={7} className="p-0 h-6">
                                <div 
                                  className="overflow-x-auto w-full flex items-center h-6 bg-slate-100 border-b border-slate-200 scrollbar-thin scrollbar-thumb-slate-300"
                                  onScroll={(e) => handleScrollBarScroll("preview", e)}
                                  ref={previewScrollBarRef}
                                >
                                  <div style={{ width: `${previewScrollWidth}px`, height: '1px' }} />
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                          return [row, scrollRow];
                        }

                        return [row];
                      })}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* TAB 2: 素材表现指标 (Performance Metrics) */}
        {activeSubTab === "metrics" && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-xl border border-slate-100 flex items-center justify-between gap-4 flex-wrap text-slate-800 shadow-sm">
              <div className="flex items-center gap-3 text-xs leading-relaxed">
                <Info className="w-4 h-4 text-meta-blue shrink-0 animate-pulse" />
                <p className="text-slate-600">
                  此报表实时呈递全级别对准关联，包括 <b>广告账户 ID</b>、<b>广告组 ID</b>、<b>广告 ID</b> 及 <b>素材 ID (Creative ID)</b> 和转化数据。全表支持横向滑动。
                </p>
              </div>
              <div className="text-xs font-semibold text-slate-500">
                当前统计素材量: <span className="text-slate-900 font-bold">{filteredCreatives.length}</span> 个
              </div>
            </div>

            {filteredCreatives.length === 0 ? (
              <Card className="py-20 text-center text-slate-455 text-xs font-mono border-slate-100 bg-white">
                当前无符合筛选条件的素材表现指标数据
              </Card>
            ) : (
              <Card className="border border-slate-100 rounded-xl overflow-hidden shadow-sm bg-white">
                <div 
                  className="overflow-x-auto"
                  ref={metricsContainerRef}
                  onScroll={() => handleContainerScroll("metrics")}
                >
                  <Table>
                    <TableHeader className="bg-slate-50/75 border-b border-slate-100 [&_tr]:border-b-0">
                      <TableRow>
                        <TableHead 
                          onClick={() => handleMetricsSort("accountId")}
                          className="text-xs font-bold text-slate-700 h-11 whitespace-nowrap cursor-pointer hover:bg-slate-100 select-none transition-all"
                        >
                          广告账户 ID (Account ID) {renderSortIcon("accountId", metricsSortField, metricsSortOrder)}
                        </TableHead>
                        <TableHead 
                          onClick={() => handleMetricsSort("adsetId")}
                          className="text-xs font-bold text-slate-700 h-11 whitespace-nowrap cursor-pointer hover:bg-slate-100 select-none transition-all"
                        >
                          广告组 ID (Ad Group ID) {renderSortIcon("adsetId", metricsSortField, metricsSortOrder)}
                        </TableHead>
                        <TableHead 
                          onClick={() => handleMetricsSort("adId")}
                          className="text-xs font-bold text-slate-700 h-11 whitespace-nowrap cursor-pointer hover:bg-slate-100 select-none transition-all"
                        >
                          广告 ID (Ad ID) {renderSortIcon("adId", metricsSortField, metricsSortOrder)}
                        </TableHead>
                        <TableHead 
                          onClick={() => handleMetricsSort("id")}
                          className="text-xs font-bold text-slate-700 h-11 whitespace-nowrap cursor-pointer hover:bg-slate-100 select-none transition-all"
                        >
                          素材 ID (Material ID) {renderSortIcon("id", metricsSortField, metricsSortOrder)}
                        </TableHead>
                        <TableHead 
                          onClick={() => handleMetricsSort("type")}
                          className="text-xs font-bold text-slate-700 h-11 whitespace-nowrap cursor-pointer hover:bg-slate-100 select-none transition-all"
                        >
                          素材类型 {renderSortIcon("type", metricsSortField, metricsSortOrder)}
                        </TableHead>
                        <TableHead 
                          onClick={() => handleMetricsSort("spend")}
                          className="text-xs font-bold text-slate-700 h-11 text-right whitespace-nowrap cursor-pointer hover:bg-slate-100 select-none transition-all"
                        >
                          花费金额 {renderSortIcon("spend", metricsSortField, metricsSortOrder)}
                        </TableHead>
                        <TableHead 
                          onClick={() => handleMetricsSort("purchases")}
                          className="text-xs font-bold text-slate-700 h-11 text-center whitespace-nowrap cursor-pointer hover:bg-slate-100 select-none transition-all"
                        >
                          购物次数 {renderSortIcon("purchases", metricsSortField, metricsSortOrder)}
                        </TableHead>
                        <TableHead 
                          onClick={() => handleMetricsSort("cpc")}
                          className="text-xs font-bold text-slate-700 h-11 text-right whitespace-nowrap cursor-pointer hover:bg-slate-100 select-none transition-all"
                        >
                          单次购物费用 {renderSortIcon("cpc", metricsSortField, metricsSortOrder)}
                        </TableHead>
                        <TableHead 
                          onClick={() => handleMetricsSort("impressions")}
                          className="text-xs font-bold text-slate-700 h-11 text-right whitespace-nowrap cursor-pointer hover:bg-slate-100 select-none transition-all"
                        >
                          展示次数 {renderSortIcon("impressions", metricsSortField, metricsSortOrder)}
                        </TableHead>
                        <TableHead 
                          onClick={() => handleMetricsSort("reach")}
                          className="text-xs font-bold text-slate-700 h-11 text-right whitespace-nowrap cursor-pointer hover:bg-slate-100 select-none transition-all"
                        >
                          覆盖人数 {renderSortIcon("reach", metricsSortField, metricsSortOrder)}
                        </TableHead>
                        <TableHead 
                          onClick={() => handleMetricsSort("ctr")}
                          className="text-xs font-bold text-slate-700 h-11 text-right whitespace-nowrap cursor-pointer hover:bg-slate-100 select-none transition-all"
                        >
                          点击率 {renderSortIcon("ctr", metricsSortField, metricsSortOrder)}
                        </TableHead>
                        <TableHead 
                          onClick={() => handleMetricsSort("addToCart")}
                          className="text-xs font-bold text-slate-700 h-11 text-center whitespace-nowrap cursor-pointer hover:bg-slate-100 select-none transition-all"
                        >
                          加入购物车 {renderSortIcon("addToCart", metricsSortField, metricsSortOrder)}
                        </TableHead>
                        <TableHead className="text-xs font-bold text-slate-700 h-11 whitespace-nowrap">商品链接/落地页链接</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedMetricsCreatives.flatMap((c, idx) => {
                        const singlePurchaseCost = c.purchases > 0 ? (c.spend / c.purchases) : 0;
                        const row = (
                          <TableRow key={c.id} className="hover:bg-slate-50/50 align-middle">
                            {/* 1. 广告账户 ID */}
                            <TableCell className="py-3 font-mono text-[11px] text-slate-600 font-medium whitespace-nowrap">
                              {c.accountId || "N/A"}
                            </TableCell>
                            {/* 2. 广告组 ID */}
                            <TableCell className="py-3 font-mono text-[11px] text-slate-600 font-medium whitespace-nowrap">
                              {c.adsetId || "N/A"}
                            </TableCell>
                            {/* 3. 广告 ID */}
                            <TableCell className="py-3 font-mono text-[11px] text-slate-600 font-medium whitespace-nowrap">
                              {c.adId || "N/A"}
                            </TableCell>
                            {/* 4. 素材 ID */}
                            <TableCell className="py-3 font-mono text-[11px] text-slate-800 font-bold whitespace-nowrap">
                              {c.id}
                            </TableCell>
                            {/* 5. 素材类型 */}
                            <TableCell className="py-3 whitespace-nowrap">
                              {getTypeBadge(c.type)}
                            </TableCell>
                            {/* 4. 花费金额 */}
                            <TableCell className="py-3 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                              ${c.spend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </TableCell>
                            {/* 5. 购物次数 */}
                            <TableCell className="py-3 text-center font-mono font-bold text-blue-650 whitespace-nowrap">
                              {c.purchases}
                            </TableCell>
                            {/* 6. 单次购物费用 */}
                            <TableCell className="py-3 text-right font-mono whitespace-nowrap">
                              {singlePurchaseCost > 0 ? (
                                <span className="font-semibold text-slate-800">${singlePurchaseCost.toFixed(2)}</span>
                              ) : (
                                <span className="text-slate-400 font-medium">-</span>
                              )}
                            </TableCell>
                            {/* 7. 展示次数 */}
                            <TableCell className="py-3 text-right font-mono text-slate-500 whitespace-nowrap">
                              {c.impressions.toLocaleString()}
                            </TableCell>
                            {/* 8. 覆盖人数 */}
                            <TableCell className="py-3 text-right font-mono text-slate-500 whitespace-nowrap">
                              {(c.reach || Math.round(c.impressions * 0.85)).toLocaleString()}
                            </TableCell>
                            {/* 9. 点击率 */}
                            <TableCell className="py-3 text-right font-mono font-bold text-emerald-650 whitespace-nowrap">
                              {c.ctr.toFixed(2)}%
                            </TableCell>
                            {/* 10. 加入购物车 */}
                            <TableCell className="py-3 text-center font-mono font-bold text-purple-650 whitespace-nowrap">
                              {c.addToCart || 0}
                            </TableCell>
                            {/* 11. 商品链接/落地页链接 */}
                            <TableCell className="py-3">
                              <div className="max-w-[240px] min-w-[180px] flex items-center justify-between gap-1 bg-slate-50 hover:bg-slate-100 transition-colors border border-slate-100 rounded px-2.5 py-1 text-slate-800">
                                <a 
                                  href={c.productLink || "#"} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-[11px] font-mono text-meta-blue font-bold truncate block underline hover:text-blue-700"
                                  onClick={(e) => e.stopPropagation()}
                                  title={c.productLink}
                                >
                                  {c.productLink}
                                </a>
                                <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              </div>
                            </TableCell>
                          </TableRow>
                        );

                        if (idx === 9 && sortedMetricsCreatives.length > 10) {
                          const scrollRow = (
                            <TableRow key="floating-metrics-scrollbar-row" className="bg-slate-50/50 border-y border-slate-200">
                              <TableCell colSpan={13} className="p-0 h-6">
                                <div 
                                  className="overflow-x-auto w-full flex items-center h-6 bg-slate-100 border-b border-slate-200 scrollbar-thin scrollbar-thumb-slate-300"
                                  onScroll={(e) => handleScrollBarScroll("metrics", e)}
                                  ref={metricsScrollBarRef}
                                >
                                  <div style={{ width: `${metricsScrollWidth}px`, height: '1px' }} />
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                          return [row, scrollRow];
                        }

                        return [row];
                      })}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* TAB 3: 素材趋势图表 (Trend Charts) */}
        {activeSubTab === "trends" && (
          <div className="space-y-4">
            <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">1. 挑选参与对比分析的素材 (最多 4 个):</label>
                <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-lg p-2.5 space-y-1.5 bg-slate-50/30">
                  {filteredCreatives.map(c => {
                    const isChecked = selectedTrendCreativeIds.includes(c.id);
                    return (
                      <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer select-none py-0.5 font-medium hover:text-slate-950">
                        <input 
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            if (isChecked) {
                              setSelectedTrendCreativeIds(selectedTrendCreativeIds.filter(id => id !== c.id));
                            } else {
                              if (selectedTrendCreativeIds.length >= 4) {
                                toast.error("最多同时对比 4 个素材的走势情况");
                                return;
                              }
                              setSelectedTrendCreativeIds([...selectedTrendCreativeIds, c.id]);
                            }
                          }}
                          className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 cursor-pointer"
                        />
                        <span className="truncate max-w-[250px] inline-block font-bold text-slate-800" title={c.creativeName}>{c.creativeName}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">2. 选择走势折线监控的指标 Core Metric:</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button 
                    type="button"
                    onClick={() => setTrendMetric("roas")}
                    className={`h-9 px-3 rounded-lg border text-left font-bold transition-all cursor-pointer ${trendMetric === "roas" ? 'bg-slate-900 border-slate-900 text-white font-extrabold' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    🌟 回报率 ROAS (x)
                  </button>
                  <button 
                    type="button"
                    onClick={() => setTrendMetric("spend")}
                    className={`h-9 px-3 rounded-lg border text-left font-bold transition-all cursor-pointer ${trendMetric === "spend" ? 'bg-slate-900 border-slate-900 text-white font-extrabold' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    💰 每日花费 Spend ($)
                  </button>
                  <button 
                    type="button"
                    onClick={() => setTrendMetric("ctr")}
                    className={`h-9 px-3 rounded-lg border text-left font-bold transition-all cursor-pointer ${trendMetric === "ctr" ? 'bg-slate-900 border-slate-900 text-white font-extrabold' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    📈 点击率 CTR (%)
                  </button>
                  <button 
                    type="button"
                    onClick={() => setTrendMetric("cpm")}
                    className={`h-9 px-3 rounded-lg border text-left font-bold transition-all cursor-pointer ${trendMetric === "cpm" ? 'bg-slate-900 border-slate-900 text-white font-extrabold' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                  >
                    🎯 CPM 展现成本 ($)
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl text-xs space-y-2 flex flex-col justify-between">
                <div>
                  <h5 className="font-bold text-slate-800">趋势对比说明:</h5>
                  <p className="text-slate-500 mt-1 leading-relaxed">
                    折线图 dynamic ranges.
                  </p>
                </div>
                <div className="text-[10px] text-slate-400 font-bold">
                  当前对比素材数量: <b>{selectedTrendCreativeIds.length} / 4</b> 个
                </div>
              </div>
            </div>

            {/* Chart Panel */}
            <Card className="bg-white p-6 border border-slate-100 shadow-sm rounded-xl">
              <div className="mb-4">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  素材天级性能指标波动曲线（监测：
                  {trendMetric === "roas" ? "投资回报率 ROAS" : 
                   trendMetric === "spend" ? "广告消耗 Spend" : 
                   trendMetric === "ctr" ? "页面点击率 CTR" : "千次曝光 CPM"}
                  ）
                </h4>
              </div>

              <div className="h-[400px] w-full mt-4 font-mono text-xs">
                {selectedTrendCreativeIds.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-400 border border-dashed border-slate-200 rounded-lg">
                    请在上方区域先勾选至少 1 个对比素材
                  </div>
                ) : getTrendChartData().length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-400 border border-dashed border-slate-200 rounded-lg">
                    该时间段内暂无这些选定素材的历史每日流水数据
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <LineChart data={getTrendChartData()} margin={{ top: 10, right: 30, left: 10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="date" 
                        stroke="#94a3b8" 
                        fontSize={11}
                        tickLine={false} 
                        axisLine={false}
                        dy={10} 
                      />
                      <YAxis 
                        stroke="#94a3b8" 
                        fontSize={11}
                        tickLine={false} 
                        axisLine={false}
                        dx={-10}
                      />
                      <RechartsTooltip 
                        contentStyle={{ backgroundColor: "#1e293b", borderColor: "#334155", color: "#f8fafc", borderRadius: "8px" }}
                        labelStyle={{ color: "#94a3b8", fontWeight: "bold" }}
                      />
                      <Legend verticalAlign="top" height={36} iconType="circle" />
                      
                      {selectedTrendCreativeIds.map((id, index) => {
                        const creativeObj = creatives.find(c => c.id === id);
                        const name = creativeObj ? creativeObj.creativeName : `素材 ${id}`;
                        
                        const colors = ["#2563eb", "#10b981", "#ef4444", "#8b5cf6"];
                        const lineColor = colors[index % colors.length];

                        return (
                          <Line 
                            key={id}
                            type="monotone" 
                            dataKey={name} 
                            stroke={lineColor} 
                            strokeWidth={2.5}
                            dot={{ r: 3, strokeWidth: 1 }}
                            activeDot={{ r: 5 }}
                          />
                        );
                      })}
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>
          </div>
        )}
      </div>

{/* Slide-in Detailed Profile Drawer (深度诊断档案) */}
      {previewModalOpen && selectedPreviewCreative && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-end animate-in fade-in duration-200">
          <div className="w-full max-w-lg h-full bg-white shadow-2xl flex flex-col justify-between slide-in-from-right duration-300 transform transition-all">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="w-8 h-8 rounded-full"
                  onClick={() => { setPreviewModalOpen(false); setSelectedPreviewCreative(null); }}
                >
                  <ChevronLeft className="w-5 h-5 text-slate-500" />
                </Button>
                <div>
                  <h3 className="text-xs font-extrabold text-slate-950 truncate max-w-[280px]" title={selectedPreviewCreative.creativeName}>
                    {selectedPreviewCreative.creativeName}
                  </h3>
                  <span className="text-[10px] text-slate-400 font-mono">配置档案: ID {selectedPreviewCreative.id}</span>
                </div>
              </div>
              
              <Button 
                size="sm" 
                variant="outline" 
                className="h-8 border-[#e5e7eb] px-2.5 text-xs text-[#374151]"
                onClick={() => {
                  setPreviewModalOpen(false);
                  setSelectedPreviewCreative(null);
                }}
              >
                关闭面板
              </Button>
            </div>

            <div className="flex-grow overflow-y-auto p-5 space-y-5">
              
              {/* Media spec Block */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                  <Maximize2 className="w-3.5 h-3.5 text-slate-500" /> 格式直达规格
                </p>
                {generateMockThumbnail(selectedPreviewCreative.id, selectedPreviewCreative.type)}
                
                <div className="grid grid-cols-2 gap-2 text-center text-xs mt-3 bg-slate-50 p-2.5 rounded-lg border border-slate-150 font-mono">
                  <div>
                    <span className="text-[10px] text-slate-400 block pb-0.5">建议最佳画幅</span>
                    <span className="font-bold text-slate-800">
                      {selectedPreviewCreative.type === "IMAGE" ? "1080 x 1080 (1:1)" : "1080 x 1920 (9:16)"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block pb-0.5">底层数据关联</span>
                    <span className="font-bold text-meta-blue">Meta SDK</span>
                  </div>
                </div>
              </div>

              {/* Data mapping path block */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 shadow-sm space-y-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">链式归因路径 (ATTRIBUTION PATH)</p>
                <div className="space-y-1.5 text-xs font-mono">
                  <div className="bg-white px-3 py-2 rounded border border-slate-100 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold text-slate-400">广告账户 ID:</span>
                    <span className="font-bold text-slate-850 select-all">{selectedPreviewCreative.accountId || "N/A"}</span>
                  </div>
                  <div className="bg-white px-3 py-2 rounded border border-slate-100 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold text-slate-400">广告组 ID:</span>
                    <span className="font-bold text-slate-850 select-all">{selectedPreviewCreative.adsetId || "N/A"}</span>
                  </div>
                  <div className="bg-white px-3 py-2 rounded border border-slate-100 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold text-slate-400">广告 ID:</span>
                    <span className="font-bold text-slate-850 select-all">{selectedPreviewCreative.adId || "N/A"}</span>
                  </div>
                  <div className="bg-white px-3 py-2 rounded border border-slate-100 flex items-center justify-between gap-2 bg-indigo-50/10 border-indigo-100/30">
                    <span className="text-[10px] font-semibold text-indigo-500">素材 / 创意 ID:</span>
                    <span className="font-bold text-indigo-700 select-all">{selectedPreviewCreative.id}</span>
                  </div>
                </div>
              </div>

              {/* Lifetime BI metrics funnel */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">区间全链路指标 (Funnel Data)</p>
                <div className="grid grid-cols-2 gap-3 font-mono">
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <p className="text-[9px] text-slate-400">曝光花费 (Spend)</p>
                    <p className="text-xs font-bold text-slate-900 mt-1">${selectedPreviewCreative.spend.toLocaleString(undefined, { minimumFractionDigits: 1 })}</p>
                  </div>
                  
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <p className="text-[9px] text-slate-400">转化营收 (Revenue)</p>
                    <p className="text-xs font-bold text-slate-900 mt-1">${selectedPreviewCreative.revenue.toLocaleString(undefined, { minimumFractionDigits: 1 })}</p>
                  </div>
                  
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <p className="text-[9px] text-slate-400">产出回报率 ROAS</p>
                    <p className="text-xs font-bold text-slate-900 mt-1">{selectedPreviewCreative.roas.toFixed(2)}x</p>
                  </div>
                  
                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <p className="text-[9px] text-slate-400">购买订单</p>
                    <p className="text-xs font-bold text-slate-900 mt-1">{(selectedPreviewCreative.purchases || 0).toLocaleString()}</p>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <p className="text-[9px] text-slate-400">展现成本 CPM</p>
                    <p className="text-xs font-bold text-slate-900 mt-1">${selectedPreviewCreative.cpm.toFixed(2)}</p>
                  </div>

                  <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <p className="text-[9px] text-slate-400">点击率 CTR</p>
                    <p className="text-xs font-bold text-slate-900 mt-1">{selectedPreviewCreative.ctr.toFixed(2)}%</p>
                  </div>
                </div>
              </div>

              {/* Dynamic local alert engine */}
              {(() => {
                const fatigue = evaluateSingleFatigue(selectedPreviewCreative.id, selectedPreviewCreative.creativeName, selectedPreviewCreative.type);
                return (
                  <div className="bg-slate-900 text-slate-100 p-5 rounded-xl space-y-3 border border-slate-800">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-500" />
                        受众衰退与性能诊断说明
                      </span>
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${fatigue.riskBg}`}>
                        {fatigue.riskLevel}
                      </span>
                    </div>

                    <div className="space-y-4">
                      <div className="flex justify-between text-xs font-mono">
                        <span className="text-slate-400">诊断疲劳分:</span>
                        <span className="font-bold text-white">{fatigue.fatigueScore} / 100 分</span>
                      </div>
                      
                      <div className="space-y-1.5 pt-2 border-t border-slate-800">
                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">触发红线诊断因子:</p>
                        {fatigue.rulesTriggered.map((rule, sIdx) => (
                          <div key={sIdx} className="text-xs text-slate-300 leading-tight pl-2 border-l border-red-500 flex items-center gap-1 py-0.5 font-medium">
                            <span className="w-1 h-1 bg-red-500 rounded-full shrink-0"></span>
                            <span>{rule}</span>
                          </div>
                        ))}
                      </div>

                      <div className="space-y-1.5 pt-2 border-t border-slate-800 leading-relaxed text-xs">
                        <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wider flex items-center gap-1">
                          <Zap className="w-3 h-3 text-amber-400 fill-amber-400" />
                          深度诊断处方方案:
                        </p>
                        <div className="bg-slate-950 p-3 rounded border border-slate-800 text-slate-300">
                          {fatigue.recommendations.map((rec, recIdx) => (
                            <p key={recIdx} className="mb-1 last:mb-0 font-medium leading-relaxed">{rec}</p>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex">
              <Button 
                className="w-full h-10 bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs rounded-lg"
                onClick={() => { setPreviewModalOpen(false); setSelectedPreviewCreative(null); }}
              >
                确认关闭
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
