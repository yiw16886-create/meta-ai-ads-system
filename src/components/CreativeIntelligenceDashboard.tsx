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
  storeFilter = "all",
  projectFilter = "all",
  ownerFilter = "all"
}: { 
  data: any[], 
  startDate?: Date, 
  endDate?: Date,
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

  const fetchCreatives = async () => {
    try {
      setLoading(true);
      const startStr = startDate ? format(startDate, "yyyy-MM-dd") : format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd");
      const endStr = endDate ? format(endDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd");

      const [resGrouped, resDaily, resStores] = await Promise.all([
        axios.get("/api/intelligence/creatives", {
          params: { startDate: startStr, endDate: endStr }
        }),
        axios.get("/api/intelligence/creatives/daily", {
          params: { startDate: startStr, endDate: endStr }
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
    
    return storesList.filter(s => matchedNames.has(s.name.toLowerCase()));
  }, [data, projectFilter, localStoreFilter, ownerFilter, storesList]);

  const activeStoreIds = React.useMemo(() => {
    return activeStores.map(s => s.id);
  }, [activeStores]);

  // Account filtration coupled with active filter store configurations
  const filteredCreatives = React.useMemo(() => {
    return creatives.filter(c => {
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
      <div className="bg-white px-6 py-4 rounded-xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-meta-blue/10 text-meta-blue">
              <Sparkles className="w-5 h-5 text-meta-blue" />
            </span>
            素材智能决策中心
          </h1>
          <p className="text-xs text-gray-500 mt-1">
            已同步当前选定账户店铺：
            <span className="font-bold text-meta-blue bg-blue-50 px-2 py-0.5 rounded ml-1 mr-1 font-mono">
              {localStoreFilter === "all" ? "全部店铺" : localStoreFilter}
            </span> 
            | 项目: <span className="font-semibold text-gray-700">{projectFilter === "all" ? "全部" : projectFilter}</span>
          </p>
        </div>
        
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
              {storesList.map(s => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center h-9 bg-gray-50 border border-gray-200 text-gray-700 px-3 rounded-lg text-xs gap-2">
            <Calendar className="w-3.5 h-3.5 text-gray-400 mr-0.5" />
            <span>
              {startDate ? format(startDate, "yyyy-MM-dd") : "过去30天"} ~ {endDate ? format(endDate, "yyyy-MM-dd") : "当天"}
            </span>
          </div>
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

      {/* THREE SECONDARY TABS KEPT ONLY */}
      <div className="flex border border-slate-150 bg-white p-1 rounded-xl shadow-sm gap-1">
        <button
          onClick={() => setActiveSubTab("preview")}
          className={`flex-1 py-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeSubTab === "preview" ? "bg-slate-900 text-white shadow" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50 bg-transparent"}`}
        >
          <Maximize2 className="w-4 h-4" /> (1) 素材预览 (Creative Preview)
        </button>
        <button
          onClick={() => setActiveSubTab("metrics")}
          className={`flex-1 py-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeSubTab === "metrics" ? "bg-slate-900 text-white shadow" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50 bg-transparent"}`}
        >
          <Award className="w-4 h-4" /> (2) 素材表现指标 (Performance Metrics)
        </button>
        <button
          onClick={() => setActiveSubTab("trends")}
          className={`flex-1 py-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${activeSubTab === "trends" ? "bg-slate-900 text-white shadow" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50 bg-transparent"}`}
        >
          <BarChart2 className="w-4 h-4" /> (3) 素材趋势图表 (Trend Charts)
        </button>
      </div>

      {loading ? (
        <Card className="p-16 flex flex-col items-center justify-center space-y-4 bg-white border border-gray-100">
          <Activity className="w-8 h-8 animate-spin text-slate-900" />
          <p className="text-gray-400 text-xs font-mono">正在分析素材层级与天级性能诊断记录中...</p>
        </Card>
      ) : (
        <div className="space-y-4">
          
          {/* TAB 1: 素材预览 (Creative Preview) */}
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
                    className="h-9 text-xs bg-white border border-slate-200 rounded-lg px-2.5 outline-none focus:ring-1 focus:ring-slate-900"
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                  >
                    <option value="ALL">全部格式 (ALL)</option>
                    <option value="IMAGE">单图 (IMAGE)</option>
                    <option value="VIDEO">视频 (VIDEO)</option>
                    <option value="CAROUSEL">轮播 (CAROUSEL)</option>
                  </select>
                </div>

                <div className="text-xs text-slate-400 font-medium">
                  符合筛选条件素材: <b className="text-slate-800">{filteredCreatives.length} / {creatives.length}</b> 个
                </div>
              </div>

              {filteredCreatives.length === 0 ? (
                <Card className="py-20 text-center text-slate-400 text-xs font-mono border-slate-100 bg-white">
                  未匹配到符合条件的素材或当前该账户名下暂无同步的数据
                </Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {filteredCreatives.map(c => {
                    const fatigue = evaluateSingleFatigue(c.id, c.creativeName, c.type);
                    return (
                      <Card 
                        key={c.id} 
                        className="bg-white border border-slate-100 hover:shadow-md transition-all rounded-xl overflow-hidden flex flex-col justify-between group"
                      >
                        <div className="p-3 bg-slate-50/50">
                          <div onClick={() => {
                            setSelectedPreviewCreative(c);
                            setPreviewModalOpen(true);
                          }}>
                            {generateMockThumbnail(c.id, c.type)}
                          </div>
                          
                          <div className="mt-3">
                            <h4 className="font-extrabold text-slate-800 text-xs truncate" title={c.creativeName}>{c.creativeName}</h4>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">ID: {c.id}</p>
                          </div>
                        </div>

                        {/* Primary Performance Indicators */}
                        <div className="border-t border-b border-slate-50 bg-white px-3 py-2 grid grid-cols-3 text-center text-xs font-mono">
                          <div>
                            <p className="text-[9px] text-slate-450 uppercase font-bold">花费</p>
                            <p className="font-bold text-slate-800">${c.spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-slate-450 uppercase font-bold">ROAS</p>
                            <p className={`font-bold ${c.roas >= 1.5 ? 'text-blue-600' : 'text-slate-800'}`}>{c.roas.toFixed(2)}x</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-slate-450 uppercase font-bold">点击率</p>
                            <p className="font-bold text-slate-700">{c.ctr.toFixed(2)}%</p>
                          </div>
                        </div>

                        {/* Action details footer */}
                        <div className="p-3 pt-2 bg-slate-50/30 flex items-center justify-between border-t border-slate-50">
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold border ${fatigue.riskBg}`}>
                            {fatigue.riskLevel}
                          </span>
                          
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-meta-blue hover:text-blue-750 font-bold flex items-center gap-1"
                            onClick={() => {
                              setSelectedPreviewCreative(c);
                              setPreviewModalOpen(true);
                            }}
                          >
                            深度诊断 <ChevronRight className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: 素材表现指标 (Performance Metrics) */}
          {activeSubTab === "metrics" && (
            <div className="space-y-6">
              <div className="bg-white p-4 rounded-xl border border-slate-100 flex items-center gap-3 text-xs text-slate-600 leading-relaxed">
                <Info className="w-4 h-4 text-meta-blue shrink-0 animate-pulse" />
                <p>
                  以下表现指标基于当前选定的店铺与过滤区间实时排名。通过 <b>2x2 深度大盘</b> 多向对齐，便于敏捷锁定最具转化能效的核心素材。
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* 1. Star Creatives by ROAS */}
                <Card className="bg-white border border-slate-100 rounded-xl overflow-hidden shadow-sm">
                  <div className="p-4 border-b border-slate-100 bg-slate-50/40 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-amber-500" /> ⭐ 投产之星高产回报素材排行 (Top ROAS)
                    </span>
                    <span className="text-[10px] text-slate-400">ROAS 降序比对</span>
                  </div>
                  <div className="p-4 divide-y divide-slate-100 space-y-2">
                    {getLeaderboards().topRoas.length === 0 ? (
                      <p className="text-center py-10 text-slate-400 text-xs">当前无数据</p>
                    ) : (
                      getLeaderboards().topRoas.map((c, idx) => (
                        <div key={c.id} className="py-2.5 flex items-center justify-between text-xs hover:bg-slate-50/50 px-1 rounded transition-colors last:pb-0 first:pt-0">
                          <div className="flex items-center gap-3 overflow-hidden">
                            <span className={`w-5 h-5 flex items-center justify-center text-[10px] font-extrabold rounded-full ${idx === 0 ? 'bg-amber-400 text-white' : idx === 1 ? 'bg-slate-300 text-slate-800' : idx === 2 ? 'bg-orange-300 text-white' : 'bg-slate-100 text-slate-500'}`}>
                              {idx + 1}
                            </span>
                            <div className="overflow-hidden">
                              <span 
                                onClick={() => { setSelectedPreviewCreative(c); setPreviewModalOpen(true); }}
                                className="font-extrabold text-slate-800 hover:underline cursor-pointer truncate max-w-[220px] block"
                              >
                                {c.creativeName}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">ID: {c.id}</span>
                            </div>
                          </div>
                          
                          <div className="text-right shrink-0">
                            <p className="font-mono font-bold text-blue-650 text-[13px]">{c.roas.toFixed(2)}x</p>
                            <p className="text-[9px] text-slate-450 font-mono">Spend: ${c.spend.toFixed(0)}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </Card>

                {/* 2. Top Engagement by CTR */}
                <Card className="bg-white border border-slate-100 rounded-xl overflow-hidden shadow-sm">
                  <div className="p-4 border-b border-slate-100 bg-slate-50/40 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Percent className="w-4 h-4 text-indigo-500" /> 🎯 视觉先锋点击留存排行 (Top CTR)
                    </span>
                    <span className="text-[10px] text-slate-400">点击率降序比对</span>
                  </div>
                  <div className="p-4 divide-y divide-slate-100 space-y-2">
                    {getLeaderboards().topCtr.length === 0 ? (
                      <p className="text-center py-10 text-slate-400 text-xs">当前无数据</p>
                    ) : (
                      getLeaderboards().topCtr.map((c, idx) => (
                        <div key={c.id} className="py-2.5 flex items-center justify-between text-xs hover:bg-slate-50/50 px-1 rounded transition-colors last:pb-0 first:pt-0">
                          <div className="flex items-center gap-3 overflow-hidden">
                            <span className="w-5 h-5 flex items-center justify-center text-[10px] font-bold bg-slate-100 text-slate-600 rounded">
                              {idx + 1}
                            </span>
                            <div className="overflow-hidden">
                              <span 
                                onClick={() => { setSelectedPreviewCreative(c); setPreviewModalOpen(true); }}
                                className="font-bold text-slate-800 hover:underline cursor-pointer truncate max-w-[220px] block"
                              >
                                {c.creativeName}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono inline-flex items-center gap-1 mt-0.5">
                                {getTypeBadge(c.type)}
                              </span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <p className="font-mono font-bold text-emerald-600 text-[13px]">{c.ctr.toFixed(2)}%</p>
                            <p className="text-[9px] text-slate-400 font-mono">CPM: ${c.cpm.toFixed(1)}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </Card>

                {/* 3. Budget Leaks Indicator */}
                <Card className="bg-white border border-slate-100 rounded-xl overflow-hidden shadow-sm">
                  <div className="p-4 border-b border-slate-100 bg-slate-50/40 flex items-center justify-between">
                    <span className="text-xs font-bold text-red-800 flex items-center gap-1.5">
                      <XCircle className="w-4 h-4 text-red-500" /> ⚠️ 资金高耗低转警告提醒 (ROAS &lt; 1.1)
                    </span>
                    <span className="text-[10px] text-red-500 font-bold">空烧风险监控</span>
                  </div>
                  <div className="p-4 divide-y divide-slate-100 space-y-2">
                    {getLeaderboards().topWaste.length === 0 ? (
                      <div className="text-center py-10 text-slate-400 text-xs">
                        🎉 太棒了，当前没有花费超 $100 且 ROAS &lt; 1.1 的低效损耗素材。
                      </div>
                    ) : (
                      getLeaderboards().topWaste.map((c, idx) => (
                        <div key={c.id} className="py-2.5 flex items-center justify-between text-xs hover:bg-red-50/20 px-1 rounded transition-colors last:pb-0 first:pt-0">
                          <div className="flex items-center gap-3 overflow-hidden">
                            <span className="w-5 h-5 flex items-center justify-center text-[10px] font-bold bg-red-100 text-red-700 rounded-full shrink-0">
                              !
                            </span>
                            <div className="overflow-hidden">
                              <span 
                                onClick={() => { setSelectedPreviewCreative(c); setPreviewModalOpen(true); }}
                                className="font-extrabold text-red-950 hover:underline cursor-pointer truncate max-w-[200px] block"
                              >
                                {c.creativeName}
                              </span>
                              <span className="text-[10px] text-red-500 font-bold font-mono">浪费支出: ${c.spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <p className="font-mono font-extrabold text-red-600 text-[13px]">{c.roas.toFixed(2)}x</p>
                            <p className="text-[9px] text-slate-400 font-mono">订单: {c.purchases}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </Card>

                {/* 4. Best Video Hook Rating */}
                <Card className="bg-white border border-slate-100 rounded-xl overflow-hidden shadow-sm">
                  <div className="p-4 border-b border-slate-100 bg-slate-50/40 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Video className="w-4 h-4 text-blue-600" /> 📹 视频 3s 视线挂钩留存率 (Hook Speed)
                    </span>
                    <span className="text-[10px] text-slate-400">前 3 秒吸引率</span>
                  </div>
                  <div className="p-4 divide-y divide-slate-100 space-y-2">
                    {getLeaderboards().topHook.length === 0 ? (
                      <p className="text-center py-10 text-slate-400 text-xs">没有匹配到视频素材</p>
                    ) : (
                      getLeaderboards().topHook.map((c, idx) => (
                        <div key={c.id} className="py-2.5 flex items-center justify-between text-xs hover:bg-slate-50/50 px-1 rounded transition-colors last:pb-0 first:pt-0">
                          <div className="flex items-center gap-3 overflow-hidden">
                            <span className="w-5 h-5 flex items-center justify-center text-[10px] font-bold bg-blue-50 text-blue-700 rounded-full shrink-0">
                              VK
                            </span>
                            <div className="overflow-hidden">
                              <span 
                                onClick={() => { setSelectedPreviewCreative(c); setPreviewModalOpen(true); }}
                                className="font-bold text-slate-800 hover:underline cursor-pointer truncate max-w-[200px] block"
                              >
                                {c.creativeName}
                              </span>
                              <span className="text-[10px] text-slate-450 font-mono">转化订单: {c.purchases}</span>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <p className="font-mono font-bold text-indigo-600 text-[13px]">{c.hookRate.toFixed(1)}%</p>
                            <p className="text-[9px] text-slate-400">完播意愿良好</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </Card>

              </div>
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
                            className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
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
                      onClick={() => setTrendMetric("roas")}
                      className={`h-9 px-3 rounded-lg border text-left font-bold transition-all ${trendMetric === "roas" ? 'bg-slate-900 border-slate-900 text-white font-extrabold' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                      🌟 回报率 ROAS (x)
                    </button>
                    <button 
                      onClick={() => setTrendMetric("spend")}
                      className={`h-9 px-3 rounded-lg border text-left font-bold transition-all ${trendMetric === "spend" ? 'bg-slate-900 border-slate-900 text-white font-extrabold' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                      💰 每日花费 Spend ($)
                    </button>
                    <button 
                      onClick={() => setTrendMetric("ctr")}
                      className={`h-9 px-3 rounded-lg border text-left font-bold transition-all ${trendMetric === "ctr" ? 'bg-slate-900 border-slate-900 text-white font-extrabold' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                      📈 点击率 CTR (%)
                    </button>
                    <button 
                      onClick={() => setTrendMetric("cpm")}
                      className={`h-9 px-3 rounded-lg border text-left font-bold transition-all ${trendMetric === "cpm" ? 'bg-slate-900 border-slate-900 text-white font-extrabold' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                    >
                      🎯 CPM 展现成本 ($)
                    </button>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl text-xs space-y-2 flex flex-col justify-between">
                  <div>
                    <h5 className="font-bold text-slate-800">趋势对比说明:</h5>
                    <p className="text-slate-500 mt-1 leading-relaxed">
                      折线图动态自适应整合天级监控走势历史记录。勾选上方素材即可对比它们在同一周期内的成效波动。
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
      )}

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
