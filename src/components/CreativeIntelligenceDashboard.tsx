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
  Eye,
  MousePointerClick,
  Layers,
  Sparkles,
  BarChart2,
  Calendar,
  Search,
  Check,
  ChevronRight,
  RefreshCcw,
  Clock,
  Zap,
  Play,
  Maximize2,
  Sliders,
  XCircle,
  TrendingUp as TrendUpIcon,
  Award,
  DollarSign,
  Heart,
  ExternalLink,
  Percent,
  Info,
  ChevronLeft
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as XLSX from "xlsx";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import axios from "axios";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  Legend,
  BarChart,
  Bar
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

export function CreativeIntelligenceDashboard({ data, startDate, endDate }: { data: any[], startDate?: Date, endDate?: Date }) {
  const [activeSubTab, setActiveSubTab] = useState<"center" | "preview" | "fatigue" | "metrics" | "trends">("center");
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: keyof CreativeData | string; direction: "asc" | "desc" } | null>({ key: "spend", direction: "desc" });
  const [creatives, setCreatives] = useState<CreativeData[]>([]);
  const [dailyRecords, setDailyRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Active Filter state
  const [selectedType, setSelectedType] = useState<string>("ALL");
  const [selectedStore, setSelectedStore] = useState<string>("ALL");

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

      const [resGrouped, resDaily] = await Promise.all([
        axios.get("/api/intelligence/creatives", {
          params: { startDate: startStr, endDate: endStr }
        }),
        axios.get("/api/intelligence/creatives/daily", {
          params: { startDate: startStr, endDate: endStr }
        }).catch(() => ({ data: [] })) // Fallback gracefully if daily endpoint fails
      ]);

      const formattedGrouped = (resGrouped.data || []).map((item: any) => ({
        ...item,
        type: item.type || "IMAGE"
      }));

      setCreatives(formattedGrouped);
      setDailyRecords(resDaily.data || []);

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

  const handleExport = () => {
    const exportData = creatives.map(c => {
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
        '3秒流失吸引率 (%)': c.type === "VIDEO" ? c.hookRate : "N/A",
        '疲劳评分': fatigue.fatigueScore,
        '风险等级': fatigue.riskLevel,
        '诊断指标': fatigue.rulesTriggered.join("; ")
      };
    });
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "素材数据挖掘报表");
    XLSX.writeFile(wb, `Creative_SaaS_BI_Report_${format(new Date(), "yyyyMMdd")}.xlsx`);
    toast.success("素材数据挖掘报表导出成功！");
  };

  // Precompute / Index daily records by creativeId first for ultra-fast lookup
  const dailyRecordsByCreative = React.useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const r of dailyRecords) {
      if (!map[r.creativeId]) {
        map[r.creativeId] = [];
      }
      map[r.creativeId].push(r);
    }
    // Sort each group once
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.date.localeCompare(b.date));
    }
    return map;
  }, [dailyRecords]);

  // Precompute fatigue details for all creatives to achieve O(1) performance
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

      let score = 5; // Base minimum fatigue score

      // 1. Frequency Overload Rule
      if (frequency > 4.5) {
        score += 45;
        rulesTriggered.push(`展示频次过载 (${frequency.toFixed(2)} > 4.5)`);
        recommendations.push("展示曝光极度饱和，同批受众重叠洗水。建议立即对该素材及广告层级进行暂停或更替。");
      } else if (frequency > 3.0) {
        score += 25;
        rulesTriggered.push(`展示频次偏高 (${frequency.toFixed(2)} > 3.0)`);
        recommendations.push("受众表现衰减前兆。建议配置多图文或多视频素材轮播机制，分流展示压力。");
      } else if (frequency > 2.0) {
        score += 10;
        rulesTriggered.push(`频次处于震荡上涨区间 (${frequency.toFixed(2)})`);
        recommendations.push("频次略有微调。建议利用相似受众(LAL)重新扩大目标测试受众包，注入新流量。");
      }

      // 2. CTR Slope Continuous Decline Rule (using historical daily logs if possible, else simulated)
      if (history.length >= 3) {
        const recent = history.slice(-3);
        const ctr1 = recent[0].ctr;
        const ctr2 = recent[1].ctr;
        const ctr3 = recent[2].ctr;
        if (ctr3 < ctr2 && ctr2 < ctr1) {
          score += 30;
          rulesTriggered.push(`CTR 连续 3 日滑落 (${ctr1.toFixed(2)}% → ${ctr2.toFixed(2)}% → ${ctr3.toFixed(2)}%)`);
          recommendations.push("素材对当前受众群失去视觉挂勾能力。需立刻重配视频前3秒Hook视觉剪辑或换用高饱和对比度底图。");
        }
      } else if (ctr < 1.0) {
        score += 15;
        rulesTriggered.push(`整体点击率过低 (CTR ${ctr.toFixed(2)}% < 1.0%)`);
        recommendations.push("网民点击兴趣微弱。建议精简缩短文案标题，使用数字、价格折价或行动召唤按钮(如【立即去逛逛】)诱导。");
      }

      // 3. CPM Surge Rule
      if (history.length >= 3) {
        const first = history[0].cpm;
        const last = history[history.length - 1].cpm;
        if (last > first * 1.3 && last > 20) {
          score += 15;
          const pct = ((last - first) / first) * 100;
          rulesTriggered.push(`CPM 涨幅红线过快 (较投放初上浮 +${pct.toFixed(0)}%)`);
          recommendations.push("竞价重叠度过高。建议降低出价阀值，或者调整部分过于宽泛的版位投放。");
         }
      } else if (cpm > 25) {
        score += 10;
        rulesTriggered.push(`CPM 昂贵 (千次展示 $${cpm.toFixed(2)})`);
        recommendations.push("竞争环境严峻，流量拿取代价高。建议引入新素材测试更易转化的次级小语种受众或单页版块。");
      }

      // 4. ROAS Deceleration Risk Rule (ROAS Downward)
      if (roas < 1.0 && spend > 100) {
        score += 20;
        rulesTriggered.push(`营收转化倒挂 (ROAS 为 ${roas.toFixed(2)}x)`);
        recommendations.push("素材空烧无法刺激足够购买。建议关闭低效组配，并将此素材投放到已经通过测款的高转化受众组。");
      } else if (roas < 1.5) {
        score += 10;
        rulesTriggered.push(`转化投资回报紧绷 (ROAS ${roas.toFixed(2)}x)`);
        recommendations.push("投产未达优秀水准。应复核落地页支付体验，尝试组合满包邮、优惠券等卖点刺激转化。");
      }

      // Make sure Score does not exceed 100
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
        recommendations: recommendations.length > 0 ? recommendations : ["素材状态十分完美，各项诊断优良。请支持并维持现有广告预算投入。"]
      };
    }
    return map;
  }, [creatives, dailyRecordsByCreative]);

  // Fast O(1) hash map lookup instead of recursive .filter().sort() on thousands of records per item render
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
      recommendations: ["素材状态十分完美，各项诊断优良。请支持并维持现有广告预算投入。"]
    };
  };

  // Get unique stores from creatives
  const storesAvailable = Array.from(new Set(creatives.map(c => c.storeId).filter(Boolean)));

  // Filter creatives based on user filters
  const filteredCreatives = creatives.filter(c => {
    const matchesSearch = (c.creativeName || "").toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (c.id || "").toString().toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = selectedType === "ALL" || c.type === selectedType;
    const matchesStore = selectedStore === "ALL" || c.storeId.toString() === selectedStore;
    return matchesSearch && matchesType && matchesStore;
  });

  const requestSort = (key: keyof CreativeData | string) => {
    let direction: "asc" | "desc" = "desc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "desc") {
      direction = "asc";
    }
    setSortConfig({ key, direction });
  };

  const sortedData = [...filteredCreatives].sort((a: any, b: any) => {
    if (!sortConfig) return 0;
    const key = sortConfig.key;
    const aVal = a[key] ?? 0;
    const bVal = b[key] ?? 0;
    
    if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
    return 0;
  });

  // KPI aggregates for filtered data
  const totalSpend = filteredCreatives.reduce((sum, c) => sum + (c.spend || 0), 0);
  const totalRevenue = filteredCreatives.reduce((sum, c) => sum + (c.revenue || 0), 0);
  const totalPurchases = filteredCreatives.reduce((sum, c) => sum + (c.purchases || 0), 0);
  const avgROAS = totalSpend > 0 ? totalRevenue / totalSpend : 0;
  const avgCTR = filteredCreatives.length > 0 ? filteredCreatives.reduce((sum, c) => sum + (c.ctr || 0), 0) / filteredCreatives.length : 0;
  const avgCPM = filteredCreatives.length > 0 ? filteredCreatives.reduce((sum, c) => sum + (c.cpm || 0), 0) / filteredCreatives.length : 0;

  // Render icons helper
  const getTypeBadge = (type: string) => {
    switch(type) {
      case "VIDEO": 
        return (
          <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-200">
            <Video className="w-3 h-3 text-blue-500" /> 视频素材
          </span>
        );
      case "IMAGE": 
        return (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
            <ImageIcon className="w-3 h-3 text-emerald-500" /> 单图素材
          </span>
        );
      case "CAROUSEL": 
        return (
          <span className="inline-flex items-center gap-1 rounded bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700 border border-purple-200">
            <Layers className="w-3 h-3 text-purple-500" /> 轮播素材
          </span>
        );
      default: 
        return (
          <span className="inline-flex items-center gap-1 rounded bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-700 border border-gray-200">
            <ImageIcon className="w-3 h-3 text-gray-500" /> 其它格式
          </span>
        );
    }
  };

  const getTrendBadge = (trend: string) => {
    switch(trend) {
      case "UP": 
        return <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-green-600"><TrendingUp className="w-3.5 h-3.5" /> 上升</span>;
      case "DOWN": 
        return <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-red-600"><TrendingDown className="w-3.5 h-3.5" /> 下滑</span>;
      default: 
        return <span className="inline-flex items-center gap-0.5 text-xs text-gray-400 font-medium">— 平稳</span>;
    }
  };

  // Helper to render ultra-lightweight custom hyperlinks (no base64/videos cached in DB or client state)
  const generateMockThumbnail = (creativeId: string, type: string) => {
    const mockUrl = `https://business.facebook.com/adsmanager/manage/ads?act=all&selected_creative_ids=${creativeId}`;
    return (
      <div className="w-full rounded-lg bg-slate-50 border border-slate-200 p-4 transition-all hover:border-meta-blue hover:bg-slate-100 flex flex-col justify-between gap-3 text-slate-800 shadow-sm relative group">
        <div className="flex justify-between items-start gap-2 border-b border-gray-150 pb-2">
          <span className="inline-flex items-center gap-1 rounded bg-slate-200/80 px-2 py-0.5 text-[10px] font-bold text-slate-700 tracking-wider">
            {type === "VIDEO" ? <Video className="w-3.5 h-3.5 text-blue-500" /> : <ImageIcon className="w-3.5 h-3.5 text-emerald-500" />} {type} 格式
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
              // Stop propagation so clicking the hyperlink doesn't trigger parent dialogs
              e.stopPropagation();
            }}
            className="text-[11px] font-mono text-meta-blue underline hover:text-blue-700 font-bold break-all block"
            id={`link-creative-${creativeId}`}
          >
            {mockUrl}
          </a>
        </div>
        
        <div className="text-[10px] text-gray-400 mt-1 border-t border-dashed border-gray-200 pt-2 leading-relaxed">
          ⚡ <b>零媒体缓存：</b>本系统与数据库对图片/视频采取<b>物理零缓存并做轻量化重构</b>，不拉取任何多媒体源文件，仅存轻量ID与此处<b>直达超链接</b>，完美解决内存暴涨与后台卡死问题。
        </div>
      </div>
    );
  };

  // Pre-aggregated stats for Leaderboard tab
  const getLeaderboards = () => {
    const sortedByROAS = [...creatives].sort((a, b) => b.roas - a.roas);
    const sortedByCTR = [...creatives].sort((a, b) => b.ctr - a.ctr);
    // Inefficient: Spent > $100 and roas < 1.0 (waste of money)
    const sortedByWaste = [...creatives]
      .filter(c => c.spend > 100)
      .sort((a, b) => b.spend - a.spend)
      .filter(c => c.roas < 1.2);
    // Best hook rate for video
    const sortedByHook = [...creatives]
      .filter(c => c.type === "VIDEO")
      .sort((a, b) => b.hookRate - a.hookRate);

    return {
      topRoas: sortedByROAS.slice(0, 5),
      topCtr: sortedByCTR.slice(0, 5),
      topWaste: sortedByWaste.slice(0, 5),
      topHook: sortedByHook.slice(0, 5)
    };
  };

  // Historical charting aggregation state
  const getTrendChartData = () => {
    if (selectedTrendCreativeIds.length === 0 || dailyRecords.length === 0) return [];
    
    // Group daily records by Date to merge multi-creative plots
    const dateMap: Record<string, Record<string, any>> = {};
    
    dailyRecords.forEach(rec => {
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

    return Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date));
  };


  return (
    <div className="flex flex-col h-full space-y-4">
      {/* SaaS BI Header Bar */}
      <div className="bg-white px-6 py-4 rounded-xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-meta-blue/15 text-meta-blue">
              <Sparkles className="w-5 h-5 text-meta-blue" />
            </span>
            素材智能决策中心
          </h1>
          <p className="text-xs text-gray-500 mt-1">基于轻量级诊断引擎，提供全链路疲劳、漏斗指标诊断（已完成轻量化重合规机制重构，多媒体零文件缓存，防止后台与浏览器内存崩溃）</p>
        </div>
        
        {/* Date Selector Indicator */}
        <div className="flex items-center gap-3">
          <div className="flex items-center h-9 bg-gray-50 border border-gray-200 text-gray-700 px-3 rounded-lg text-xs gap-2">
            <Calendar className="w-3.5 h-3.5 text-gray-400" />
            <span>
              {startDate ? format(startDate, "yyyy年MM月dd日") : "过去 30 天"} - {endDate ? format(endDate, "yyyy年MM月dd日") : "今天"}
            </span>
          </div>
          <Button
            onClick={fetchCreatives}
            variant="outline"
            size="icon"
            className="w-9 h-9 border-gray-200 text-gray-600 hover:text-gray-900"
            title="刷新数据"
          >
            <RefreshCcw className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            className="h-9 px-4 text-xs font-semibold border-[#e5e7eb] text-[#374151] hover:bg-gray-50"
            onClick={handleExport}
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            导出挖掘报表
          </Button>
        </div>
      </div>

      {/* Segment Selector tabs - 二级导航栏：素材分析的切换 */}
      <div className="flex border-b border-gray-200 bg-white px-6 py-2 rounded-xl shadow-sm gap-1">
        <button
          onClick={() => setActiveSubTab("center")}
          className={`px-4 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${activeSubTab === "center" ? "bg-meta-blue text-white shadow" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50 bg-transparent"}`}
        >
          <Sliders className="w-3.5 h-3.5" /> 1. 素材分析 (Creative Analytics)
        </button>
        <button
          onClick={() => setActiveSubTab("preview")}
          className={`px-4 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${activeSubTab === "preview" ? "bg-meta-blue text-white shadow" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50 bg-transparent"}`}
        >
          <Maximize2 className="w-3.5 h-3.5" /> 2. 素材预览 (Creative Preview)
        </button>
        <button
          onClick={() => setActiveSubTab("fatigue")}
          className={`px-4 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${activeSubTab === "fatigue" ? "bg-meta-blue text-white shadow" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50 bg-transparent"}`}
        >
          <AlertTriangle className="w-3.5 h-3.5" /> 3. 素材疲劳分析 (Creative Fatigue)
        </button>
        <button
          onClick={() => setActiveSubTab("metrics")}
          className={`px-4 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${activeSubTab === "metrics" ? "bg-meta-blue text-white shadow" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50 bg-transparent"}`}
        >
          <Award className="w-3.5 h-3.5" /> 4. 素材表现指标 (Performance Metrics)
        </button>
        <button
          onClick={() => setActiveSubTab("trends")}
          className={`px-4 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${activeSubTab === "trends" ? "bg-meta-blue text-white shadow" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50 bg-transparent"}`}
        >
          <BarChart2 className="w-3.5 h-3.5" /> 5. 素材趋势图表 (Trend Charts)
        </button>
      </div>

      {loading ? (
        <Card className="p-16 flex flex-col items-center justify-center space-y-4 bg-white border border-gray-100">
          <Activity className="w-8 h-8 animate-spin text-meta-blue" />
          <p className="text-gray-400 text-xs font-mono">正在分析底层创意人士(creatives、ads、adInsights)相关报表数据...</p>
        </Card>
      ) : (
        <>
          {/* TAB 1: 创意中心 / 素材分析 (Creative Analytics) */}
          {activeSubTab === "center" && (
            <div className="space-y-4">
              {/* Quick Summary Filters */}
              <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <Input 
                    type="text"
                    placeholder="按素材名 / ID 过滤搜索..."
                    className="pl-9 h-9 text-xs"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 shrink-0 font-medium">素材格式:</span>
                  <select
                    className="w-full h-9 bg-gray-50 border border-gray-200 rounded-lg text-xs px-2.5 focus:outline-none focus:ring-1 focus:ring-meta-blue"
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                  >
                    <option value="ALL">全部格式</option>
                    <option value="IMAGE">单图素材 (IMAGE)</option>
                    <option value="VIDEO">视频素材 (VIDEO)</option>
                    <option value="CAROUSEL">轮播素材 (CAROUSEL)</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500 shrink-0 font-medium">关联店铺:</span>
                  <select
                    className="w-full h-9 bg-gray-50 border border-gray-200 rounded-lg text-xs px-2.5 focus:outline-none focus:ring-1 focus:ring-meta-blue font-mono"
                    value={selectedStore}
                    onChange={(e) => setSelectedStore(e.target.value)}
                  >
                    <option value="ALL">全部店铺</option>
                    {storesAvailable.map(st => (
                      <option key={st} value={st}>Store ID: {st}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2 text-center text-xs bg-slate-50/80 p-1.5 rounded-lg border border-slate-100">
                  <div>
                    <p className="text-[10px] text-gray-400">已选素材量</p>
                    <p className="font-bold text-gray-800">{filteredCreatives.length} 个</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400">过滤支出花费</p>
                    <p className="font-bold text-gray-800 font-mono">${totalSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                  </div>
                </div>
              </div>

              {/* Aggregation KPIs */}
              <div className="grid grid-cols-4 gap-4">
                <Card className="p-4 bg-white border border-gray-100 shadow-sm rounded-xl">
                  <div className="flex justify-between items-center text-gray-400 mb-1">
                    <span className="text-xs font-semibold">总广告消耗</span>
                    <DollarSign className="w-4 h-4 text-emerald-500" />
                  </div>
                  <p className="text-xl font-extrabold text-gray-900 font-mono">${totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-1.5 py-0.5 rounded">静态汇总</span>
                    <span className="text-[10px] text-gray-400">区间内累积扣款</span>
                  </div>
                </Card>

                <Card className="p-4 bg-white border border-gray-100 shadow-sm rounded-xl">
                  <div className="flex justify-between items-center text-gray-400 mb-1">
                    <span className="text-xs font-semibold">追踪总转化营收</span>
                    <TrendUpIcon className="w-4 h-4 text-blue-500" />
                  </div>
                  <p className="text-xl font-extrabold text-gray-900 font-mono">${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className="text-[10px] bg-blue-50 text-blue-700 font-bold px-1.5 py-0.5 rounded">ROI 表现</span>
                    <span className="text-[10px] text-gray-500 font-bold">ROAS: {avgROAS.toFixed(2)}x</span>
                  </div>
                </Card>

                <Card className="p-4 bg-white border border-gray-100 shadow-sm rounded-xl">
                  <div className="flex justify-between items-center text-gray-400 mb-1">
                    <span className="text-xs font-semibold">区间点击率 (平均CTR)</span>
                    <Percent className="w-4 h-4 text-indigo-500" />
                  </div>
                  <p className="text-xl font-extrabold text-gray-900 font-mono">{avgCTR.toFixed(2)}%</p>
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${avgCTR > 1.8 ? 'bg-indigo-50 text-indigo-700' : 'bg-orange-50 text-orange-700'}`}>
                      {avgCTR > 1.8 ? '表现良好' : '急需优化提升'}
                    </span>
                    <span className="text-[10px] text-gray-400">平均点击意愿比</span>
                  </div>
                </Card>

                <Card className="p-4 bg-white border border-gray-100 shadow-sm rounded-xl">
                  <div className="flex justify-between items-center text-gray-400 mb-1">
                    <span className="text-xs font-semibold">千次曝光成本 (平均CPM)</span>
                    <Activity className="w-4 h-4 text-purple-500" />
                  </div>
                  <p className="text-xl font-extrabold text-gray-900 font-mono">${avgCPM.toFixed(2)}</p>
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className="text-[10px] bg-purple-50 text-purple-700 font-bold px-1.5 py-0.5 rounded">竞价成本</span>
                    <span className="text-[10px] text-gray-400">平均展示单价</span>
                  </div>
                </Card>
              </div>

              {/* Core Table */}
              <Card className="bg-white border border-gray-100 shadow-sm rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-meta-blue"></span>
                    <h3 className="text-xs font-bold text-gray-800">素材指标明细大盘</h3>
                  </div>
                  <span className="text-[10px] text-gray-400">点击列表表头(花费、ROAS等)可以进行正逆向排序</span>
                </div>
                
                <div className="overflow-x-auto">
                  <Table className="text-xs">
                    <TableHeader>
                      <TableRow className="bg-gray-50 hover:bg-gray-50">
                        <TableHead className="py-2.5 font-bold text-gray-700">素材基本信息</TableHead>
                        <TableHead className="py-2.5 font-bold text-gray-700 text-center">类型</TableHead>
                        <TableHead className="py-2.5 font-bold text-gray-700 text-center font-mono">Store ID</TableHead>
                        <TableHead className="py-2.5 font-bold text-gray-700 text-right cursor-pointer hover:bg-gray-100" onClick={() => requestSort("spend")}>
                          <div className="flex items-center justify-end gap-1">花费 (Spend) <ArrowUpDown className="w-3 h-3 text-gray-400" /></div>
                        </TableHead>
                        <TableHead className="py-2.5 font-bold text-gray-700 text-right cursor-pointer hover:bg-gray-100" onClick={() => requestSort("revenue")}>
                          <div className="flex items-center justify-end gap-1">转化营收 <ArrowUpDown className="w-3 h-3 text-gray-400" /></div>
                        </TableHead>
                        <TableHead className="py-2.5 font-bold text-gray-700 text-right cursor-pointer hover:bg-gray-100" onClick={() => requestSort("roas")}>
                          <div className="flex items-center justify-end gap-1">投产比 ROAS <ArrowUpDown className="w-3 h-3 text-gray-400" /></div>
                        </TableHead>
                        <TableHead className="py-2.5 font-bold text-gray-700 text-right cursor-pointer hover:bg-gray-100" onClick={() => requestSort("purchases")}>
                          <div className="flex items-center justify-end gap-1">购买成效 <ArrowUpDown className="w-3 h-3 text-gray-400" /></div>
                        </TableHead>
                        <TableHead className="py-2.5 font-bold text-gray-700 text-right cursor-pointer hover:bg-gray-100" onClick={() => requestSort("ctr")}>
                          <div className="flex items-center justify-end gap-1">点击率 CTR <ArrowUpDown className="w-3 h-3 text-gray-400" /></div>
                        </TableHead>
                        <TableHead className="py-2.5 font-bold text-gray-700 text-right cursor-pointer hover:bg-gray-100" onClick={() => requestSort("cpm")}>
                          <div className="flex items-center justify-end gap-1">千次展现 CPM <ArrowUpDown className="w-3 h-3 text-gray-400" /></div>
                        </TableHead>
                        <TableHead className="py-2.5 font-bold text-gray-700 text-right cursor-pointer hover:bg-gray-100" onClick={() => requestSort("frequency")}>
                          <div className="flex items-center justify-end gap-1">展示频次 <ArrowUpDown className="w-3 h-3 text-gray-400" /></div>
                        </TableHead>
                        <TableHead className="py-2.5 font-bold text-gray-700 text-right cursor-pointer hover:bg-gray-100" onClick={() => requestSort("hookRate")}>
                          <div className="flex items-center justify-end gap-1">视频吸引率 (3s) <ArrowUpDown className="w-3 h-3 text-gray-400" /></div>
                        </TableHead>
                        <TableHead className="py-2.5 font-bold text-gray-700 text-center">趋势</TableHead>
                        <TableHead className="py-2.5 font-bold text-gray-700 text-center">疲劳诊断</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedData.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={13} className="text-center py-10 text-gray-400">
                            暂无符合筛选条件的素材数据
                          </TableCell>
                        </TableRow>
                      ) : (
                        sortedData.map((item) => {
                          const fatigue = evaluateSingleFatigue(item.id, item.creativeName, item.type);
                          return (
                            <TableRow key={item.id} className="hover:bg-gray-50 border-b">
                              {/* Meta Info */}
                              <TableCell className="py-3 font-semibold text-gray-950">
                                <span 
                                  onClick={() => {
                                    setSelectedPreviewCreative(item);
                                    setPreviewModalOpen(true);
                                  }}
                                  className="text-meta-blue hover:underline cursor-pointer font-medium block max-w-[250px] truncate"
                                  title={item.creativeName}
                                >
                                  {item.creativeName}
                                </span>
                                <span className="text-[10px] text-gray-400 block font-mono">ID: {item.id}</span>
                              </TableCell>
                              
                              {/* Format Badge */}
                              <TableCell className="py-3 text-center">
                                {getTypeBadge(item.type)}
                              </TableCell>
                              
                              {/* Store ID */}
                              <TableCell className="py-3 text-center font-mono text-gray-500 font-semibold">{item.storeId}</TableCell>
                              
                              {/* Financials & Math */}
                              <TableCell className="py-3 font-mono text-right font-medium text-gray-900">${(item.spend || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                              <TableCell className="py-3 font-mono text-right text-gray-600">${(item.revenue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                              <TableCell className={`py-3 font-mono text-right font-bold ${item.roas >= 2.0 ? 'text-blue-600' : item.roas >= 1.2 ? 'text-gray-700' : 'text-red-500'}`}>
                                {item.roas.toFixed(2)}x
                              </TableCell>
                              <TableCell className="py-3 font-mono text-right font-medium text-gray-900">{(item.purchases || 0).toLocaleString()}</TableCell>
                              
                              {/* Standard digital marketing funnels */}
                              <TableCell className="py-3 font-mono text-right text-gray-600">{item.ctr.toFixed(2)}%</TableCell>
                              <TableCell className="py-3 font-mono text-right text-gray-600">${item.cpm.toFixed(2)}</TableCell>
                              <TableCell className={`py-3 font-mono text-right font-semibold ${item.frequency > 3.0 ? 'text-amber-600' : 'text-gray-600'}`}>
                                {item.frequency.toFixed(2)}
                              </TableCell>
                              
                              {/* Hook */}
                              <TableCell className="py-3 font-mono text-right">
                                {item.type === "VIDEO" ? (
                                  <span className={`font-semibold ${item.hookRate < 20.0 ? 'text-red-500' : 'text-green-600'}`}>
                                    {item.hookRate.toFixed(1)}%
                                  </span>
                                ) : (
                                  <span className="text-gray-300">—</span>
                                )}
                              </TableCell>
                              
                              {/* Trend Status */}
                              <TableCell className="py-3 text-center">
                                {getTrendBadge(item.trendStatus)}
                              </TableCell>

                              {/* Fatigue badge */}
                              <TableCell className="py-3 text-center">
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${fatigue.riskBg}`}>
                                  {fatigue.riskLevel} ({fatigue.fatigueScore}分)
                                </span>
                              </TableCell>

                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </div>
          )}

          {/* TAB 2: 素材预览 (Creative Preview) */}
          {activeSubTab === "preview" && (
            <div className="space-y-4">
              {/* Info alert */}
              <div className="bg-blue-50/50 border border-blue-200 text-blue-800 p-4 rounded-xl text-xs flex items-center gap-3">
                <Info className="w-4 h-4 text-blue-500" />
                <p>⚡ <b>极简轻量化技术方案：</b>本板块对图片及视频实施 <b>“物理零文件缓存”</b> 机制。所有广告创意仅保留简短的基本标签属性，并通过 <b>直接超链接</b> 触达 Meta 原生后台源数据，彻底解决大容量图文、多媒体资产在客户端缓存所致的内存溢出跟卡顿风险。</p>
              </div>

              {/* Grid cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {filteredCreatives.map(c => {
                  const fatigue = evaluateSingleFatigue(c.id, c.creativeName, c.type);
                  return (
                    <Card key={c.id} className="bg-white border border-gray-100 shadow-sm rounded-xl overflow-hidden group flex flex-col justify-between hover:shadow-md transition-shadow">
                      <div className="p-3">
                        {/* Interactive thumbnail */}
                        <div onClick={() => {
                          setSelectedPreviewCreative(c);
                          setPreviewModalOpen(true);
                        }}>
                          {generateMockThumbnail(c.id, c.type)}
                        </div>

                        {/* Description */}
                        <div className="mt-3">
                          <h4 className="font-bold text-gray-900 text-xs truncate max-w-full" title={c.creativeName}>{c.creativeName}</h4>
                          <p className="text-[10px] text-gray-400 font-mono mt-0.5">ID: {c.id}</p>
                        </div>
                      </div>

                      {/* Main micro stats */}
                      <div className="px-3 py-2 border-t border-b border-gray-50 bg-gray-50/50 grid grid-cols-3 text-center text-[11px] gap-1 font-mono">
                        <div>
                          <p className="text-[9px] text-gray-400">消耗</p>
                          <p className="font-bold text-gray-800">${c.spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-gray-400">ROAS</p>
                          <p className="font-bold text-blue-600">{c.roas.toFixed(2)}x</p>
                        </div>
                        <div>
                          <p className="text-[9px] text-gray-400">CTR</p>
                          <p className="font-bold text-gray-700">{c.ctr.toFixed(2)}%</p>
                        </div>
                      </div>

                      <div className="px-3 py-2.5 flex items-center justify-between text-[11px] bg-white">
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${fatigue.riskBg}`}>
                          {fatigue.riskLevel}
                        </span>
                        
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-7 text-xs text-meta-blue hover:bg-blue-50 hover:text-blue-700 px-2 flex items-center gap-1 font-bold"
                          onClick={() => {
                            setSelectedPreviewCreative(c);
                            setPreviewModalOpen(true);
                          }}
                        >
                          深度档案 <ChevronRight className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: 疲劳监测器 (Creative Fatigue Analysis) */}
          {activeSubTab === "fatigue" && (
            <div className="space-y-4">
              {/* Explainer */}
              <div className="bg-slate-900 text-slate-100 p-6 rounded-xl shadow border border-slate-800 grid grid-cols-1 md:grid-cols-4 gap-6 items-center">
                <div className="md:col-span-3">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500 fill-amber-500/20" />
                    素材衰退规则判定引擎
                  </h3>
                  <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                    本分析完全由本地规则引擎自发运算，通过评估素材的 <b>展示频次上限 (Frequency)</b>、<b>点击转化变动率 (CTR Slope)</b>、<b>流量买入成本暴长指标 (CPM Speed)</b> 以及 <b>投产比阻尼系数 (ROAS Decel)</b>，输出 0-100 分的疲劳分。
                  </p>
                </div>
                <div className="bg-slate-800 p-3 rounded-lg text-center border border-slate-700">
                  <p className="text-[10px] text-slate-400">检测标准</p>
                  <p className="text-xs font-bold text-white mt-1">频次界限：&gt; 3.0 中, &gt; 4.5 高</p>
                  <p className="text-xs font-bold text-white mt-0.5">CTR规则：连续 3 日下跌触发</p>
                </div>
              </div>

              {/* Risk Summary grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Fatigue aggregates */}
                {(() => {
                  const fatigueList = creatives.map(c => evaluateSingleFatigue(c.id, c.creativeName, c.type));
                  const highRiskCount = fatigueList.filter(f => f.fatigueScore >= 70).length;
                  const modRiskCount = fatigueList.filter(f => f.fatigueScore >= 40 && f.fatigueScore < 70).length;
                  const lowRiskCount = fatigueList.filter(f => f.fatigueScore >= 20 && f.fatigueScore < 40).length;
                  const safeCount = fatigueList.filter(f => f.fatigueScore < 20).length;

                  return (
                    <>
                      <Card className="p-4 bg-white border border-red-100 shadow-sm rounded-xl">
                        <p className="text-xs text-red-500 font-bold flex items-center gap-1"><XCircle className="w-3.5 h-3.5 text-red-500" /> 重度受众疲劳 (Score &gt;= 70)</p>
                        <p className="text-3xl font-extrabold text-red-650 mt-1">{highRiskCount} <span className="text-xs font-normal text-gray-400">个素材</span></p>
                        <p className="text-[10px] text-gray-400 mt-1">强烈建议立即暂停、剪辑、更替文案</p>
                      </Card>
                      <Card className="p-4 bg-white border border-orange-100 shadow-sm rounded-xl">
                        <p className="text-xs text-orange-500 font-bold flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5 text-orange-500" /> 中度受众疲劳 (Score 40-70)</p>
                        <p className="text-3xl font-extrabold text-orange-650 mt-1">{modRiskCount} <span className="text-xs font-normal text-gray-400">个素材</span></p>
                        <p className="text-[10px] text-gray-400 mt-1">建议调配轮播防重叠洗劫</p>
                      </Card>
                      <Card className="p-4 bg-white border border-yellow-105 shadow-sm rounded-xl">
                        <p className="text-xs text-yellow-600 font-bold flex items-center gap-1"><Info className="w-3.5 h-3.5 text-yellow-500" /> 轻度受众疲劳 (Score 20-40)</p>
                        <p className="text-3xl font-extrabold text-yellow-600 mt-1">{lowRiskCount} <span className="text-xs font-normal text-gray-400">个素材</span></p>
                        <p className="text-[10px] text-gray-400 mt-1">建议结合新受众包拓客去重</p>
                      </Card>
                      <Card className="p-4 bg-white border border-green-100 shadow-sm rounded-xl">
                        <p className="text-xs text-green-600 font-bold flex items-center gap-1"><Check className="w-3.5 h-3.5 text-green-500" /> 指标平稳安全 (Score &lt; 20)</p>
                        <p className="text-3xl font-extrabold text-green-650 mt-1">{safeCount} <span className="text-xs font-normal text-gray-400">个素材</span></p>
                        <p className="text-[10px] text-gray-400 mt-1">可持续放大投放，健康系数高</p>
                      </Card>
                    </>
                  );
                })()}
              </div>

              {/* Risk Details List */}
              <Card className="bg-white border border-gray-100 shadow-sm rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                  <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-amber-500" /> 疲劳指数大盘与动作诊断书
                  </span>
                  <span className="text-[10px] text-gray-500 font-mono">总数据流: {creatives.length} 个监测对象</span>
                </div>

                <div className="divide-y divide-gray-100 bg-white">
                  {creatives.map(c => {
                    const fatigue = evaluateSingleFatigue(c.id, c.creativeName, c.type);
                    return (
                      <div key={c.id} className="p-4 hover:bg-gray-50/50 transition-colors grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
                        {/* Summary Block */}
                        <div className="space-y-1">
                          <h4 className="font-bold text-gray-900 text-xs truncate max-w-full" title={c.creativeName}>{c.creativeName}</h4>
                          <p className="text-[10px] text-gray-400 font-mono">ID: {c.id}</p>
                          <div className="flex gap-2.5 items-center mt-2.5">
                            {getTypeBadge(c.type)}
                            <span className="font-mono text-gray-500 text-[10px]">ROAS: {c.roas.toFixed(2)}x</span>
                          </div>
                        </div>

                        {/* Current Stats */}
                        <div className="grid grid-cols-2 gap-2 text-xs border-r border-[#e5e7eb] pr-4 font-mono">
                          <div>
                            <p className="text-[9px] text-gray-400">展示频次 Frequency</p>
                            <p className="font-bold text-gray-800">{c.frequency.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-gray-400">点击率 CTR</p>
                            <p className="font-bold text-gray-800">{c.ctr.toFixed(2)}%</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-gray-400">千次展示 CPM</p>
                            <p className="font-bold text-gray-800">${c.cpm.toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-gray-400">当前总花费</p>
                            <p className="font-bold text-gray-800">${c.spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                          </div>
                        </div>

                        {/* Trigger List */}
                        <div className="space-y-1.5 text-xs">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">触发因子及分析指标</p>
                          <div className="space-y-1">
                            {fatigue.rulesTriggered.map((rule, idx) => (
                              <div key={idx} className="flex items-center gap-1.5 text-red-650 font-medium">
                                <span className="w-1 h-1 rounded-full bg-red-500 shrink-0"></span>
                                <span className="text-[11px] text-gray-700 leading-tight">{rule}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Recommended Actions */}
                        <div className="space-y-1 bg-slate-50 border border-slate-100 p-2.5 rounded-lg text-xs leading-relaxed">
                          <p className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                            <Zap className="w-3 h-3 text-amber-500 fill-amber-500" />
                            规则排查动作建议:
                          </p>
                          <div className="text-[11px] text-slate-700 font-medium whitespace-normal mt-1">
                            {fatigue.recommendations.map((rec, rIdx) => (
                              <p key={rIdx}>{rec}</p>
                            ))}
                          </div>
                          
                          {/* Risk Badge on bottom */}
                          <div className="mt-3 flex items-center justify-between border-t border-slate-200/50 pt-2 text-[10px]">
                            <span className="text-gray-400 font-bold">排查分: {fatigue.fatigueScore}/100</span>
                            <span className={`inline-flex px-1.5 py-0.5 rounded font-bold uppercase text-[10px] ${fatigue.riskBg}`}>
                              {fatigue.riskLevel}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          )}

          {/* TAB 4: 创意指标 leaderboard (Creative Metrics) */}
          {activeSubTab === "metrics" && (
            <div className="space-y-6">
              {/* Leaderboards */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Board 1: High Return (Top ROAS) */}
                <Card className="bg-white border border-gray-100 shadow-sm rounded-xl overflow-hidden">
                  <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-blue-50/20 to-transparent flex items-center justify-between">
                    <span className="text-xs font-extrabold text-blue-800 flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-blue-600" /> 高回报明星素材排行 (Top ROAS)
                    </span>
                    <span className="text-[10px] text-gray-400">投产比排序</span>
                  </div>
                  <div className="p-3 divide-y divide-gray-100">
                    {getLeaderboards().topRoas.map((c, idx) => (
                      <div key={c.id} className="py-2.5 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2.5 overflow-hidden">
                          <span className={`w-5 h-5 flex items-center justify-center text-[10px] font-bold rounded-full text-white ${idx === 0 ? 'bg-amber-400' : idx === 1 ? 'bg-slate-300' : idx === 2 ? 'bg-orange-300' : 'bg-gray-200'}`}>{idx + 1}</span>
                          <div className="overflow-hidden">
                            <span className="font-bold text-gray-800 hover:underline cursor-pointer truncate block max-w-[200px]" onClick={() => { setSelectedPreviewCreative(c); setPreviewModalOpen(true); }} title={c.creativeName}>{c.creativeName}</span>
                            <span className="text-[9px] text-gray-400 font-mono">Spend: ${c.spend.toFixed(0)}</span>
                          </div>
                        </div>
                        <div className="text-right font-mono font-bold text-blue-600 text-[13px] shrink-0">
                          {c.roas.toFixed(2)}x <span className="text-[9px] text-gray-400 font-normal">ROAS</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                {/* Board 2: High Click Engagement (Top CTR) */}
                <Card className="bg-white border border-gray-100 shadow-sm rounded-xl overflow-hidden">
                  <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-indigo-50/20 to-transparent flex items-center justify-between">
                    <span className="text-xs font-extrabold text-indigo-800 flex items-center gap-1.5">
                      <Percent className="w-4 h-4 text-indigo-600" /> 吸睛大王点击率排行 (Top CTR)
                    </span>
                    <span className="text-[10px] text-gray-400">点击率排序</span>
                  </div>
                  <div className="p-3 divide-y divide-gray-100">
                    {getLeaderboards().topCtr.map((c, idx) => (
                      <div key={c.id} className="py-2.5 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2.5 overflow-hidden">
                          <span className={`w-5 h-5 flex items-center justify-center text-[10px] font-bold rounded-full text-white ${idx === 0 ? 'bg-amber-400' : idx === 1 ? 'bg-slate-300' : idx === 2 ? 'bg-orange-300' : 'bg-gray-200'}`}>{idx + 1}</span>
                          <div className="overflow-hidden">
                            <span className="font-bold text-gray-800 hover:underline cursor-pointer truncate block max-w-[200px]" onClick={() => { setSelectedPreviewCreative(c); setPreviewModalOpen(true); }} title={c.creativeName}>{c.creativeName}</span>
                            <span className="text-[9px] text-gray-400 font-mono">CPM: ${c.cpm.toFixed(1)}</span>
                          </div>
                        </div>
                        <div className="text-right font-mono font-bold text-indigo-650 text-[13px] shrink-0">
                          {c.ctr.toFixed(2)}% <span className="text-[9px] text-gray-400 font-normal">CTR</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                {/* Board 3: Underperforming / Budget Leaks (Top High Cost, Low Roast) */}
                <Card className="bg-white border border-gray-100 shadow-sm rounded-xl overflow-hidden">
                  <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-red-50/20 to-transparent flex items-center justify-between">
                    <span className="text-xs font-extrabold text-red-800 flex items-center gap-1.5">
                      <XCircle className="w-4 h-4 text-red-550" /> 预算高烧低投产曝光警报 (High Spend, Low ROAS)
                    </span>
                    <span className="text-[10px] text-gray-400">空烧资金排查</span>
                  </div>
                  <div className="p-3 divide-y divide-gray-100">
                    {getLeaderboards().topWaste.length === 0 ? (
                      <p className="text-center py-10 text-gray-450 text-[11px]">暂无花费超 $100 且 ROAS &lt; 1.2 的低效素材（表现良好）</p>
                    ) : (
                      getLeaderboards().topWaste.map((c, idx) => (
                        <div key={c.id} className="py-2.5 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2.5 overflow-hidden">
                            <span className="w-5 h-5 flex items-center justify-center text-[10px] font-bold rounded bg-red-100 text-red-700 shrink-0">{idx + 1}</span>
                            <div className="overflow-hidden">
                              <span className="font-bold text-gray-800 hover:underline cursor-pointer truncate block max-w-[200px]" onClick={() => { setSelectedPreviewCreative(c); setPreviewModalOpen(true); }} title={c.creativeName}>{c.creativeName}</span>
                              <span className="text-[9px] text-red-550 font-bold font-mono">浪费支出: ${c.spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                            </div>
                          </div>
                          <div className="text-right font-mono font-bold text-red-550 text-[13px] shrink-0">
                            ROAS: {c.roas.toFixed(2)}x
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </Card>

                {/* Board 4: Best Video Hook Rating (Video only) */}
                <Card className="bg-white border border-gray-100 shadow-sm rounded-xl overflow-hidden">
                  <div className="p-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50/20 to-transparent flex items-center justify-between">
                    <span className="text-xs font-extrabold text-emerald-800 flex items-center gap-1.5">
                      <Video className="w-4 h-4 text-emerald-600" /> 视频素材 Hook 挂钩前 3 秒留存排行 (Hook Speed)
                    </span>
                    <span className="text-[10px] text-gray-400">仅限视频</span>
                  </div>
                  <div className="p-3 divide-y divide-gray-100">
                    {getLeaderboards().topHook.slice(0, 5).map((c, idx) => (
                      <div key={c.id} className="py-2.5 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2.5 overflow-hidden">
                          <span className={`w-5 h-5 flex items-center justify-center text-[10px] font-bold rounded-full text-white ${idx === 0 ? 'bg-amber-400' : idx === 1 ? 'bg-slate-300' : idx === 2 ? 'bg-orange-300' : 'bg-gray-200'}`}>{idx + 1}</span>
                          <div className="overflow-hidden">
                            <span className="font-bold text-gray-800 hover:underline cursor-pointer truncate block max-w-[200px]" onClick={() => { setSelectedPreviewCreative(c); setPreviewModalOpen(true); }} title={c.creativeName}>{c.creativeName}</span>
                            <span className="text-[9px] text-gray-400 font-mono">购买订单: {c.purchases}</span>
                          </div>
                        </div>
                        <div className="text-right font-mono font-bold text-emerald-650 text-[13px] shrink-0">
                          {c.hookRate.toFixed(1)}% <span className="text-[9px] text-gray-400 font-normal">留存</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

              </div>
            </div>
          )}

          {/* TAB 5: 趋势图表 (Creative Trend Charts) */}
          {activeSubTab === "trends" && (
            <div className="space-y-4">
              {/* Controls and Selectors */}
              <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">1. 挑选参与对比/单测的素材 (最多4个):</label>
                  <div className="max-h-36 overflow-y-auto border border-gray-200 rounded-lg p-2.5 space-y-1 bg-gray-50/50">
                    {creatives.map(c => {
                      const isChecked = selectedTrendCreativeIds.includes(c.id);
                      return (
                        <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer select-none py-0.5 font-medium hover:text-gray-950">
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
                            className="rounded border-gray-300 text-meta-blue focus:ring-meta-blue"
                          />
                          <span className="truncate max-w-[250px] inline-block font-medium" title={c.creativeName}>{c.creativeName}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-2">2. 选择走势折线横向监控的指标:</label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <button 
                      onClick={() => setTrendMetric("roas")}
                      className={`h-9 px-3 rounded-lg border text-left font-bold transition-all ${trendMetric === "roas" ? 'bg-meta-blue/10 border-meta-blue text-meta-blue font-extrabold' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >
                      🌟 回报率 ROAS (x)
                    </button>
                    <button 
                      onClick={() => setTrendMetric("spend")}
                      className={`h-9 px-3 rounded-lg border text-left font-bold transition-all ${trendMetric === "spend" ? 'bg-meta-blue/10 border-meta-blue text-meta-blue font-extrabold' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >
                      💰 每日花费 Spend ($)
                    </button>
                    <button 
                      onClick={() => setTrendMetric("ctr")}
                      className={`h-9 px-3 rounded-lg border text-left font-bold transition-all ${trendMetric === "ctr" ? 'bg-meta-blue/10 border-meta-blue text-meta-blue font-extrabold' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >
                      📈 点击率 CTR (%)
                    </button>
                    <button 
                      onClick={() => setTrendMetric("cpm")}
                      className={`h-9 px-3 rounded-lg border text-left font-bold transition-all ${trendMetric === "cpm" ? 'bg-meta-blue/10 border-meta-blue text-meta-blue font-extrabold' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >
                      🎯 展现成本 CPM ($)
                    </button>
                    <button 
                      onClick={() => setTrendMetric("frequency")}
                      className={`h-9 px-3 rounded-lg border text-left font-bold transition-all col-span-2 ${trendMetric === "frequency" ? 'bg-meta-blue/10 border-meta-blue text-meta-blue font-extrabold' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >
                      🔄 展示频次 Frequency
                    </button>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl text-xs space-y-2 flex flex-col justify-between">
                  <div>
                    <h5 className="font-bold text-gray-800">趋势监控说卡:</h5>
                    <p className="text-gray-500 mt-1 leading-relaxed">
                      折线图动态整合了底层 <code>CreativePerformanceDaily</code> 按天上传的流水记录。指标纵轴刻度自适应调节。
                    </p>
                  </div>
                  <div className="text-[10px] text-gray-400">
                    已选对比素材数量: <b>{selectedTrendCreativeIds.length} 个</b>
                  </div>
                </div>
              </div>

              {/* Chart Panel */}
              <Card className="bg-white p-6 border border-gray-100 shadow-sm rounded-xl">
                <div className="mb-4">
                  <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">
                    素材天级历史监控走势趋势（监测指标：
                    {trendMetric === "roas" ? "投资回报率 ROAS" : 
                     trendMetric === "spend" ? "广告耗费金额 Spend" : 
                     trendMetric === "ctr" ? "网民点击率 CTR" : 
                     trendMetric === "cpm" ? "千次展示竞价 CPM" : "曝光频次 Frequency"}
                    ）
                  </h4>
                </div>

                <div className="h-[400px] w-full mt-4 font-mono text-xs">
                  {selectedTrendCreativeIds.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-gray-450 border border-dashed border-gray-200 rounded-lg">
                      请先在上方区域勾选至少 1 个参与分析走势的素材
                    </div>
                  ) : getTrendChartData().length === 0 ? (
                    <div className="h-full flex items-center justify-center text-gray-440 border border-dashed border-gray-200 rounded-lg">
                      所选时间段内，数据库中暂无该素材的每日历史序列流水记录
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
                          
                          // Dynamic line coloring
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
        </>
      )}

      {/* Floating detail drawer/modal (Creative Detail Profile 创意深度档案) */}
      {previewModalOpen && selectedPreviewCreative && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-end animate-in fade-in duration-200">
          <div className="w-full max-w-xl h-full bg-white shadow-2xl flex flex-col justify-between slide-in-from-right duration-300 transform transition-all">
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="w-8 h-8 rounded-full"
                  onClick={() => { setPreviewModalOpen(false); setSelectedPreviewCreative(null); }}
                >
                  <ChevronLeft className="w-5 h-5 text-gray-500" />
                </Button>
                <div>
                  <h3 className="text-sm font-bold text-gray-900 truncate max-w-[350px]" title={selectedPreviewCreative.creativeName}>
                    {selectedPreviewCreative.creativeName}
                  </h3>
                  <span className="text-[10px] text-gray-400 font-mono">底层数据架构档案: ID {selectedPreviewCreative.id}</span>
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

            {/* Modal Body */}
            <div className="flex-grow overflow-y-auto p-6 space-y-6">
              
              {/* Media Block Illustration */}
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 flex items-center gap-1">
                  <Maximize2 className="w-3.5 h-3.5 text-slate-500" /> 素材规格渲染与模拟预览
                </p>
                {generateMockThumbnail(selectedPreviewCreative.id, selectedPreviewCreative.type)}
                
                {/* Simulated specs metadata list */}
                <div className="grid grid-cols-3 gap-3 text-center text-xs mt-3 bg-gray-50 p-2.5 rounded-lg border border-gray-150 font-mono">
                  <div>
                    <span className="text-[9px] text-gray-400 block">建议最佳画幅</span>
                    <span className="font-bold text-gray-800">
                      {selectedPreviewCreative.type === "IMAGE" ? "1080 x 1080 (1:1)" : "1080 x 1920 (9:16)"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 block">封装格式</span>
                    <span className="font-bold text-gray-800">
                      {selectedPreviewCreative.type === "VIDEO" ? "MP4 / H.264" : "PNG / Progressive"}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-400 block">关联应用群组</span>
                    <span className="font-bold text-indigo-650">FB Ads SDK</span>
                  </div>
                </div>
              </div>

              {/* Life-time metrics */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">区间表现指标漏斗分析 (BI Metrics Funnel)</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 font-mono">
                    <p className="text-[10px] text-gray-400">曝光花费 (Spend)</p>
                    <p className="text-sm font-bold text-gray-900 mt-1">${selectedPreviewCreative.spend.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                  
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 font-mono">
                    <p className="text-[10px] text-gray-400">转化营收 (Revenue)</p>
                    <p className="text-sm font-bold text-gray-900 mt-1">${selectedPreviewCreative.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                  
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 font-mono">
                    <p className="text-[10px] text-gray-400">投产投资回报率 ROAS</p>
                    <p className={`text-sm font-bold mt-1 ${selectedPreviewCreative.roas >= 2.0 ? 'text-blue-600' : 'text-gray-900'}`}>{selectedPreviewCreative.roas.toFixed(2)}x</p>
                  </div>
                  
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 font-mono">
                    <p className="text-[10px] text-gray-400">购买订单购买数</p>
                    <p className="text-sm font-bold text-gray-900 mt-1">{(selectedPreviewCreative.purchases || 0).toLocaleString()}</p>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 font-mono">
                    <p className="text-[10px] text-gray-400">千次曝光竞价 CPM</p>
                    <p className="text-sm font-bold text-gray-900 mt-1">${selectedPreviewCreative.cpm.toFixed(2)}</p>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 font-mono">
                    <p className="text-[10px] text-gray-400">整体点击率 CTR / CPC</p>
                    <p className="text-sm font-bold text-gray-900 mt-1">{selectedPreviewCreative.ctr.toFixed(2)}% / ${selectedPreviewCreative.cpc.toFixed(2)}</p>
                  </div>
                </div>
              </div>

              {/* Local rules fatigue details report */}
              {(() => {
                const fatigue = evaluateSingleFatigue(selectedPreviewCreative.id, selectedPreviewCreative.creativeName, selectedPreviewCreative.type);
                return (
                  <div className="bg-slate-900 text-slate-100 p-5 rounded-xl space-y-3.5 border border-slate-800">
                    <div className="flex justify-between items-center border-b border-slate-800 pb-2.5">
                      <span className="text-xs font-bold text-white flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-amber-500" />
                        规则引擎偏好疲劳诊断书
                      </span>
                      <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${fatigue.riskBg}`}>
                        {fatigue.riskLevel}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400">总疲劳评分系数:</span>
                        <span className="font-mono font-bold text-white">{fatigue.fatigueScore} / 100 分</span>
                      </div>
                      
                      <div className="space-y-1.5 pt-1.5 border-t border-slate-850">
                        <p className="text-[10px] text-slate-450 uppercase font-bold tracking-wider">触发指标明细:</p>
                        {fatigue.rulesTriggered.map((rule, sIdx) => (
                          <div key={sIdx} className="text-xs text-slate-300 leading-tight pl-2 border-l border-red-500 flex items-center gap-1.5 py-0.5">
                            <span className="w-1 h-1 bg-red-500 rounded-full shrink-0 animate-pulse"></span>
                            <span className="font-medium text-slate-200">{rule}</span>
                          </div>
                        ))}
                      </div>

                      <div className="space-y-1.5 pt-2 border-t border-slate-850 leading-relaxed text-xs">
                        <p className="text-[10px] text-slate-450 uppercase font-bold tracking-wider flex items-center gap-1">
                          <Zap className="w-3 h-3 text-amber-400 fill-amber-400" />
                          优化决策处方:
                        </p>
                        <div className="bg-slate-950 p-2 rounded border border-slate-800 text-slate-300 whitespace-normal">
                          {fatigue.recommendations.map((rec, recIdx) => (
                            <p key={recIdx} className="mb-1 last:mb-0">{rec}</p>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
              <Button 
                className="w-full h-10 bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs"
                onClick={() => { setPreviewModalOpen(false); setSelectedPreviewCreative(null); }}
              >
                确认并返回大盘
              </Button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
