import React, { useState, useEffect, useMemo } from "react";
import { format, subDays } from "date-fns";
import axios from "axios";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import {
  BarChart3,
  LayoutDashboard,
  LayoutGrid,
  Settings,
  Download,
  RefreshCcw,
  Search,
  Calendar as CalendarIcon,
  ChevronRight,
  TrendingUp,
  LogOut,
  ArrowUpDown,
  Upload,
  Store,
  Flag,
  Users,
  Trash2,
  Mail,
  X,
  HelpCircle,
  AlertTriangle,
  ShoppingCart,
  Image as ImageIcon,
  ChevronDown,
  Building2
} from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { StoresDashboard } from "./StoresDashboard";
import { PageCommentManager } from "./PageCommentManager";
import { MonitoringDashboard } from "./MonitoringDashboard";
import { OverviewDashboard } from "./OverviewDashboard";
import { CreativeIntelligenceDashboard } from "./CreativeIntelligenceDashboard";
import { AudienceAnalysisDashboard } from "./AudienceAnalysisDashboard";
import { CampaignStructureDashboard } from "./CampaignStructureDashboard";
import { StoreDataDashboard } from "./StoreDataDashboard";
import { MaterialPerformanceTable } from "./MaterialPerformanceTable";
import { BusinessManagerDashboard } from "./BusinessManagerDashboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";

export interface AdInsight {
  id: number;
  accountId: string;
  date: string;
  accountName: string;
  reach: number;
  impressions: number;
  clicks: number;
  spend: number;
  addToCart: number;
  initiateCheckout: number;
  purchases: number;
  purchaseValue: number;
  cpc: number;
  ctr: number;
  atcRate: number;
  checkoutRate: number;
  cpp: number;
  roas: number;
}

interface DashboardProps {
  onLogout: () => void;
}

export function Dashboard({ onLogout }: DashboardProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const initialTab = new URLSearchParams(location.search).get("tab") as
    | "dashboard"
    | "campaign_structure"
    | "audience_analysis"
    | "creative_analysis"
    | "store_data"
    | "settings"
    | "category"
    | "accounts"
    | "stores"
    | "monitoring"
    | "users"
    | "overview"
    | "product_intelligence"
    | "creative_intelligence"
    | "pages"
    | "bms"
    || "overview";

  const [currentTab, setCurrentTab] = useState<
    "dashboard" | "campaign_structure" | "audience_analysis" | "creative_analysis" | "store_data" | "settings" | "category" | "accounts" | "stores" | "users" | "monitoring" | "overview" | "product_intelligence" | "creative_intelligence" | "pages" | "bms"
  >(initialTab);

  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");
  const isAdmin = currentUser.role === "admin";
  
  const [settingsExpanded, setSettingsExpanded] = useState<boolean>(
    initialTab === "settings" || initialTab === "users"
  );
  const [dashboardExpanded, setDashboardExpanded] = useState<boolean>(
    initialTab === "dashboard" || initialTab === "campaign_structure" || initialTab === "audience_analysis" || initialTab === "creative_analysis" || initialTab === "store_data"
  );

  useEffect(() => {
    const tab = new URLSearchParams(location.search).get("tab") as any;
    if (tab && tab !== currentTab) {
      setCurrentTab(tab);
    }
  }, [location.search]);

  const [startDate, setStartDate] = useState<Date>(() => {
    try {
      const saved = localStorage.getItem("META_DASHBOARD_START_DATE");
      if (saved) {
        const parsed = new Date(saved);
        if (!isNaN(parsed.getTime())) return parsed;
      }
    } catch (e) {}
    return subDays(new Date(), 1);
  });
  const [endDate, setEndDate] = useState<Date>(() => {
    try {
      const saved = localStorage.getItem("META_DASHBOARD_END_DATE");
      if (saved) {
        const parsed = new Date(saved);
        if (!isNaN(parsed.getTime())) return parsed;
      }
    } catch (e) {}
    return subDays(new Date(), 1);
  });

  useEffect(() => {
    if (startDate) {
      localStorage.setItem("META_DASHBOARD_START_DATE", startDate.toISOString());
    }
  }, [startDate]);

  useEffect(() => {
    if (endDate) {
      localStorage.setItem("META_DASHBOARD_END_DATE", endDate.toISOString());
    }
  }, [endDate]);
  const [search, setSearch] = useState("");
  const [viewDimension, setViewDimension] = useState<"account" | "date" | "date_account">("account");
  const [data, setData] = useState<AdInsight[]>([]);
  const [storeSummaries, setStoreSummaries] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncProduct, setSyncProduct] = useState(false);
  const [syncCreative, setSyncCreative] = useState(false);
  const [mappings, setMappings] = useState<Record<string, any>>({});

  const fetchMappings = async () => {
    try {
      const response = await axios.get("/api/mappings");
      if (Array.isArray(response.data)) {
        const mappingMap: Record<string, any> = {};
        response.data.forEach((m: any) => {
          mappingMap[m.accountId] = m;
        });
        setMappings(mappingMap);
        // Also sync to localStorage as a local cache/fallback
        try {
          localStorage.setItem("META_ACCOUNT_MAPPINGS", JSON.stringify(mappingMap));
        } catch (e) {}
      }
    } catch (error) {
      console.error("Failed to fetch mappings:", error);
      // Fallback to local storage if API fails
      try {
        const stored = localStorage.getItem("META_ACCOUNT_MAPPINGS");
        if (stored) setMappings(JSON.parse(stored));
      } catch (e) {}
    }
  };

  const syncMappingsToDb = async (newMappings: Record<string, any>) => {
    try {
      // Sync to local storage immediately for UI responsiveness
      setMappings(newMappings);
      try {
        localStorage.setItem("META_ACCOUNT_MAPPINGS", JSON.stringify(newMappings));
      } catch (e) {}

      // Send to server
      const mappingList = Object.values(newMappings);
      await axios.post("/api/mappings/batch", { mappings: mappingList });
    } catch (error) {
      console.error("Failed to sync mappings to server:", error);
      toast.error("同步映射到服务器失败，仅保存到本地");
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const dateParams = {
        startDate: format(startDate, "yyyy-MM-dd"),
        endDate: format(endDate, "yyyy-MM-dd"),
      };

      const [response, summariesRes] = await Promise.all([
        axios.get("/api/insights", { params: dateParams }),
        axios.get("/api/stores/all-dashboard-summary", { params: dateParams }).catch(err => {
          console.error("Failed to fetch store summaries", err);
          return { data: {} };
        })
      ]);

      if (typeof response.data === 'string' && response.data.trim().toLowerCase().startsWith('<!doctype html>')) {
        toast.error("系统正在启动或重启，请稍候...");
        setData([]);
      } else if (Array.isArray(response.data)) {
        setData(response.data);
      } else {
        console.error(
          "API Error: Expected an array of insights, got",
          response.data,
        );
        toast.error(typeof response.data?.error === 'string' ? response.data.error : "数据加载失败，请检查数据库连接或确认数据格式");
        setData([]);
      }
      
      setStoreSummaries(summariesRes.data || {});
    } catch (error: any) {
      console.error("fetchData error:", error.response?.data || error);
      const errMsg = error.response?.data?.error;
      toast.error(typeof errMsg === 'string' ? errMsg : "数据加载失败，请检查数据库连接");
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchMappings();
  }, [startDate, endDate]);

  const handleSync = async () => {
    setSyncing(true);
    const syncToast = toast.loading("正在同步 Meta 数据...");
    try {
      const response = await axios.post("/api/sync", {
        startDate: format(startDate, "yyyy-MM-dd"),
        endDate: format(endDate, "yyyy-MM-dd"),
        syncProduct,
        syncCreative
      });
      toast.success(`同步成功: ${response.data.count} 条记录`, {
        id: syncToast,
      });
      fetchData();
    } catch (error: any) {
      const respErr = error.response?.data?.error;
      const errMsg = typeof respErr === 'string' ? respErr : (respErr?.message || "同步失败");
      toast.error(errMsg, { id: syncToast });
    } finally {
      setSyncing(false);
    }
  };

  const aggregatedData = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];
    const grouped = safeData.reduce(
      (acc, curr) => {
        if (
          search &&
          !(curr.accountName || "").toLowerCase().includes((search || "").toLowerCase())
        ) {
          return acc;
        }
        
        let key = "";
        if (viewDimension === "account") {
          key = curr.accountId;
        } else if (viewDimension === "date") {
          key = curr.date;
        } else {
          key = `${curr.date}_${curr.accountId}`;
        }

        if (!acc[key]) {
          acc[key] = {
            ...curr,
            id: key, // dynamic identifier
            reach: 0,
            impressions: 0,
            clicks: 0,
            spend: 0,
            addToCart: 0,
            initiateCheckout: 0,
            purchases: 0,
            purchaseValue: 0,
          };
        }
        acc[key].reach += curr.reach;
        acc[key].impressions += curr.impressions;
        acc[key].clicks += curr.clicks;
        acc[key].spend += curr.spend;
        acc[key].addToCart += curr.addToCart;
        acc[key].initiateCheckout += curr.initiateCheckout;
        acc[key].purchases += curr.purchases;
        acc[key].purchaseValue += curr.purchaseValue;
        return acc;
      },
      {} as Record<string, any>,
    );

    const mappedData = Object.values(grouped).map((item) => ({
      ...item,
      cpc: item.clicks > 0 ? item.spend / item.clicks : 0,
      ctr: item.impressions > 0 ? (item.clicks / item.impressions) * 100 : 0,
      atcRate: item.clicks > 0 ? (item.addToCart / item.clicks) * 100 : 0,
      checkoutRate:
        item.clicks > 0 ? (item.initiateCheckout / item.clicks) * 100 : 0,
      cpp: item.purchases > 0 ? item.spend / item.purchases : 0,
      roas: item.spend > 0 ? item.purchaseValue / item.spend : 0,
    }));
    
    // 底层最优先级逻辑：根据日期查询有消耗的账户数据。没有消耗的才需要隐藏
    return mappedData.filter(item => item.spend > 0);
  }, [data, search, viewDimension]);

  const [sortConfig, setSortConfig] = useState<{ key: keyof AdInsight; direction: "asc" | "desc" } | null>(null);

  const requestSort = (key: keyof AdInsight) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const sortedAggregatedData = useMemo(() => {
    if (!sortConfig) return aggregatedData;
    return [...aggregatedData].sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];
      if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [aggregatedData, sortConfig]);

  const totals = useMemo(() => {
    if (!Array.isArray(sortedAggregatedData))
      return { spend: 0, purchaseValue: 0, purchases: 0 };
    return sortedAggregatedData.reduce(
      (acc, curr) => ({
        spend: acc.spend + curr.spend,
        purchaseValue: acc.purchaseValue + curr.purchaseValue,
        purchases: acc.purchases + curr.purchases,
      }),
      { spend: 0, purchaseValue: 0, purchases: 0 },
    );
  }, [sortedAggregatedData]);

  const avgRoi = totals.spend > 0 ? totals.purchaseValue / totals.spend : 0;

  const handleExport = () => {
    const exportData = sortedAggregatedData.map((item) => {
      const row: any = {};
      if (viewDimension === "date" || viewDimension === "date_account") {
        row["日期"] = item.date;
      }
      if (viewDimension === "account" || viewDimension === "date_account") {
        row["帐户名称"] = item.accountName;
      }
      return {
        ...row,
        覆盖人数: item.reach,
        展示次数: item.impressions,
        点击: item.clicks,
        "CPC（全部）": `$${item.cpc.toFixed(2)}`,
        "点击率（全部）%": `${item.ctr.toFixed(2)}%`,
        已花费金额: `$${item.spend.toFixed(2)}`,
        加入购物车: item.addToCart,
        加购率: `${item.atcRate.toFixed(2)}%`,
        结账发起次数: item.initiateCheckout,
        结账发起率: `${item.checkoutRate.toFixed(2)}%`,
        成效: item.purchases,
        单次成效费用: `$${item.cpp.toFixed(2)}`,
        购物转化价值: `$${item.purchaseValue.toFixed(2)}`,
        ROAS: item.roas.toFixed(2),
      };
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ad Insights");
    XLSX.writeFile(wb, `Meta_Ads_Data_${viewDimension}_${format(new Date(), "yyyyMMdd")}.xlsx`);
    toast.success("导出成功！");
  };

  return (
    <div className="flex min-h-screen bg-meta-bg">
      <aside className="w-[200px] bg-meta-dark text-white hidden md:flex flex-col fixed left-0 top-0 h-screen z-30">
        <div className="p-[20px] mb-[20px]">
          <div className="flex items-center gap-2 text-meta-blue text-[18px] font-bold">
            <BarChart3 className="w-5 h-5" />
            <span>Meta Insights Pro</span>
          </div>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          <button
            onClick={() => navigate(`/?tab=overview`)}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-[8px] text-[14px] transition-colors cursor-pointer",
              currentTab === "overview"
                ? "bg-meta-nav text-white"
                : "text-meta-text-muted hover:text-white hover:bg-meta-nav",
            )}
          >
            <BarChart3 className="w-4 h-4" />
            数据总览
          </button>

          <div>
            <button
              onClick={() => setDashboardExpanded(!dashboardExpanded)}
              className={cn(
                "w-full flex items-center justify-between px-4 py-3 rounded-[8px] text-[14px] transition-colors cursor-pointer",
                (currentTab === "dashboard" || currentTab === "campaign_structure" || currentTab === "audience_analysis" || currentTab === "creative_analysis" || currentTab === "store_data")
                  ? "text-white"
                  : "text-meta-text-muted hover:text-white hover:bg-meta-nav"
              )}
            >
              <div className="flex items-center gap-3">
                <LayoutDashboard className="w-4 h-4" />
                <span>数据中心</span>
              </div>
              <ChevronDown className={cn("w-4 h-4 transition-transform", dashboardExpanded ? "rotate-180" : "")} />
            </button>
            
            {dashboardExpanded && (
              <div className="pl-11 pr-4 py-1 space-y-1">
                <button
                  onClick={() => navigate("/?tab=dashboard")}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-[6px] text-[13px] transition-colors cursor-pointer text-left",
                    currentTab === "dashboard"
                      ? "bg-meta-nav text-white"
                      : "text-meta-text-muted hover:text-white hover:bg-meta-nav",
                  )}
                >
                  数据明细
                </button>
                <button
                  onClick={() => navigate("/?tab=campaign_structure")}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-[6px] text-[13px] transition-colors cursor-pointer text-left",
                    currentTab === "campaign_structure"
                      ? "bg-meta-nav text-white"
                      : "text-meta-text-muted hover:text-white hover:bg-meta-nav",
                  )}
                >
                  广告系列结构
                </button>
                <button
                  onClick={() => navigate("/?tab=audience_analysis")}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-[6px] text-[13px] transition-colors cursor-pointer text-left",
                    currentTab === "audience_analysis"
                      ? "bg-meta-nav text-white"
                      : "text-meta-text-muted hover:text-white hover:bg-meta-nav",
                  )}
                >
                  受众
                </button>
                <button
                  onClick={() => navigate("/?tab=creative_analysis")}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-[6px] text-[13px] transition-colors cursor-pointer text-left",
                    currentTab === "creative_analysis"
                      ? "bg-meta-nav text-white"
                      : "text-meta-text-muted hover:text-white hover:bg-meta-nav",
                  )}
                >
                  素材
                </button>
                <button
                  onClick={() => navigate("/?tab=store_data")}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-[6px] text-[13px] transition-colors cursor-pointer text-left",
                    currentTab === "store_data"
                      ? "bg-meta-nav text-white"
                      : "text-meta-text-muted hover:text-white hover:bg-meta-nav",
                  )}
                >
                  店铺数据
                </button>
              </div>
            )}
          </div>

          {[
            { id: "category", icon: LayoutGrid, label: "项目类别看板" },
            { id: "monitoring", icon: TrendingUp, label: "账户健康监控" },
            { id: "bms", icon: Building2, label: "BM 批量管理" },
            { id: "stores", icon: Store, label: "店铺管理" },
            { id: "pages", icon: Flag, label: "公共主页管理" },
          ].filter(Boolean).map((item: any) => (
            <button
              key={item.id}
              onClick={() => navigate(`/?tab=${item.id}`)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-[8px] text-[14px] transition-colors cursor-pointer",
                currentTab === item.id
                  ? "bg-meta-nav text-white"
                  : "text-meta-text-muted hover:text-white hover:bg-meta-nav",
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="mt-auto p-4 space-y-1 border-t border-gray-800">
          <div>
            <button
              onClick={() => setSettingsExpanded(!settingsExpanded)}
              className={cn(
                "w-full flex items-center justify-between px-4 py-3 rounded-[8px] text-[14px] transition-colors cursor-pointer",
                (currentTab === "settings" || currentTab === "users")
                  ? "text-white"
                  : "text-meta-text-muted hover:text-white hover:bg-meta-nav"
              )}
            >
              <div className="flex items-center gap-3">
                <Settings className="w-4 h-4" />
                <span>系统设置</span>
              </div>
              <ChevronDown className={cn("w-4 h-4 transition-transform", settingsExpanded ? "rotate-180" : "")} />
            </button>
            
            {settingsExpanded && (
              <div className="pl-11 pr-4 py-1 space-y-1">
                <button
                  onClick={() => navigate("/?tab=settings")}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-[6px] text-[13px] transition-colors cursor-pointer text-left",
                    currentTab === "settings"
                      ? "bg-meta-nav text-white"
                      : "text-meta-text-muted hover:text-white hover:bg-meta-nav",
                  )}
                >
                  系统参数配置
                </button>
                {isAdmin && (
                  <button
                    onClick={() => navigate("/?tab=users")}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-[6px] text-[13px] transition-colors cursor-pointer text-left",
                      currentTab === "users"
                        ? "bg-meta-nav text-white"
                        : "text-meta-text-muted hover:text-white hover:bg-meta-nav",
                    )}
                  >
                    成员管理
                  </button>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => {
              try {
                localStorage.removeItem("isAuthenticated");
              } catch (e) {}
              toast.success("已安全退出");
              onLogout();
            }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-[8px] text-[14px] text-red-400 hover:text-red-300 hover:bg-red-900/20 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            退出登录
          </button>
          <div className="flex items-center gap-3 px-2 py-4 mt-2 border-t border-gray-800/50">
            <div className={`w-8 h-8 rounded-full ${isAdmin ? 'bg-meta-blue' : 'bg-gray-700'} flex items-center justify-center text-[10px]`}>
              {isAdmin ? 'ADMIN' : 'USER'}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-[12px] font-medium truncate">{currentUser.email || 'Admin User'}</p>
            </div>
          </div>
        </div>
      </aside>
      <main className="flex-1 ml-[200px] p-[24px] overflow-x-hidden flex flex-col h-screen box-border">
        {currentTab === "overview" || currentTab === "dashboard" || currentTab === "product_intelligence" || currentTab === "creative_intelligence" || currentTab === "campaign_structure" || currentTab === "audience_analysis" || currentTab === "creative_analysis" || currentTab === "store_data" ? (
          <>
            {currentTab !== "creative_analysis" && currentTab !== "creative_intelligence" && (
              <div className="bg-white p-[16px] rounded-[12px] flex items-center gap-[12px] mb-[20px] shadow-[0_1px_3px_rgba(0,0,0,0.1)]">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-meta-text-muted z-10" />
                  <Popover>
                    <PopoverTrigger className="pl-8 pr-3 py-2 border border-[#e5e7eb] rounded-[6px] text-[13px] w-[140px] text-left bg-white flex items-center">
                      {startDate ? format(startDate, "yyyy-MM-dd") : "开始日期"}
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-auto p-0"
                      align="start"
                      sideOffset={8}
                    >
                      <Calendar
                        mode="single"
                        selected={startDate}
                        onSelect={(day) => {
                          if (day) {
                            setStartDate(day);
                          }
                        }}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <span className="text-meta-text-muted text-[13px]">至</span>
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-meta-text-muted z-10" />
                  <Popover>
                    <PopoverTrigger className="pl-8 pr-3 py-2 border border-[#e5e7eb] rounded-[6px] text-[13px] w-[140px] text-left bg-white flex items-center">
                      {endDate ? format(endDate, "yyyy-MM-dd") : "结束日期"}
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-auto p-0"
                      align="start"
                      sideOffset={8}
                    >
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
              <div className="relative flex-grow">
                {currentTab === "dashboard" ? (
                  <>
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-meta-text-muted" />
                    <Input
                      placeholder="搜索账户名称"
                      className="pl-10 h-9 rounded-[6px] border-[#e5e7eb] text-[13px]"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </>
                ) : (
                  <div className="text-[13px] font-semibold text-meta-dark flex items-center gap-1.5 pl-3 border-l-2 border-meta-blue">
                    <span>Meta Insights Pro</span>
                    <span className="text-[11px] font-normal text-meta-text-muted">（数据范围内的总支出消耗、各店铺与负责人汇总大盘）</span>
                  </div>
                )}
              </div>
              {isAdmin && (
                <Button
                  className="bg-meta-blue hover:bg-blue-600 text-white h-9 px-4 rounded-[6px] font-semibold text-[13px] flex items-center gap-[6px]"
                  onClick={handleSync}
                  disabled={syncing}
                >
                  <RefreshCcw
                    className={cn("w-4 h-4", syncing && "animate-spin")}
                  />
                  同步 Meta 数据
                </Button>
              )}
            </div>
            )}

            {currentTab === "overview" ? (
              <OverviewDashboard data={data} mappings={mappings} storeSummaries={storeSummaries} />
            ) : currentTab === "store_data" ? (
              <StoreDataDashboard data={data} mappings={mappings} storeSummaries={storeSummaries} />
            ) : currentTab === "creative_intelligence" ? (
              <MaterialPerformanceTable />
            ) : currentTab === "campaign_structure" ? (
              <CampaignStructureDashboard startDate={startDate} endDate={endDate} />
            ) : currentTab === "audience_analysis" ? (
              <AudienceAnalysisDashboard startDate={startDate} endDate={endDate} />
            ) : currentTab === "creative_analysis" ? (
              <MaterialPerformanceTable />
            ) : (
              <>
                <div className="grid grid-cols-4 gap-[16px] mb-[20px]">
              <MetricCard
                title="总支出消耗"
                value={`$${(totals.spend || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                subValue="投放消耗金额"
              />
              <MetricCard
                title="总转化价值"
                value={`$${(totals.purchaseValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                subValue="全渠道营收"
              />
              <MetricCard
                title="平均 ROI"
                value={`${avgRoi.toFixed(2)}x`}
                subValue="广告投资回报"
              />
              <MetricCard
                title="总成效"
                value={(totals.purchases || 0).toLocaleString()}
                subValue="购买转化次数"
              />
            </div>
            <Card className="border-none shadow-[0_1px_3px_rgba(0,0,0,0.1)] rounded-[12px] flex-grow flex flex-col overflow-hidden bg-white">
              <div className="px-[16px] py-[12px] border-b border-meta-bg flex items-center justify-between">
                <span className="font-semibold text-[14px] text-meta-dark">
                  广告账户详情明细
                </span>
                <div className="flex items-center gap-[12px]">
                  <div className="flex items-center bg-gray-100 p-0.5 rounded-[8px] border border-gray-200">
                    <button
                      className={cn(
                        "px-3 py-1 text-[11px] font-medium rounded-[6px] transition-all",
                        viewDimension === "account"
                          ? "bg-white text-meta-dark shadow-sm"
                          : "text-meta-text-muted hover:text-meta-dark"
                      )}
                      onClick={() => setViewDimension("account")}
                    >
                      按账户汇总
                    </button>
                    <button
                      className={cn(
                        "px-3 py-1 text-[11px] font-medium rounded-[6px] transition-all",
                        viewDimension === "date"
                          ? "bg-white text-meta-dark shadow-sm"
                          : "text-meta-text-muted hover:text-meta-dark"
                      )}
                      onClick={() => {
                        setViewDimension("date");
                        if (sortConfig?.key !== 'date') {
                          setSortConfig({ key: 'date' as any, direction: 'desc' });
                        }
                      }}
                    >
                      按日期汇总
                    </button>
                    <button
                      className={cn(
                        "px-3 py-1 text-[11px] font-medium rounded-[6px] transition-all",
                        viewDimension === "date_account"
                          ? "bg-white text-meta-dark shadow-sm"
                          : "text-meta-text-muted hover:text-meta-dark"
                      )}
                      onClick={() => {
                        setViewDimension("date_account");
                        if (sortConfig?.key !== 'date') {
                          setSortConfig({ key: 'date' as any, direction: 'desc' });
                        }
                      }}
                    >
                      按日期与账户明细
                    </button>
                  </div>
                  <Button
                    variant="outline"
                    className="h-[32px] px-3 rounded-[6px] border-[#e5e7eb] text-[12px] text-[#374151]"
                    onClick={handleExport}
                  >
                    <Download className="w-3.5 h-3.5 mr-2" />
                    导出报表
                  </Button>
                </div>
              </div>
              <div className="flex-grow overflow-hidden flex flex-col">
                <div className="flex-grow w-full overflow-auto max-h-[650px] relative border-b">
                  <Table className="text-[12px] w-max-content border-collapse relative">
                    <TableHeader className="sticky top-0 z-20 shadow-[0_1px_0_rgba(0,0,0,0.05)]">
                      <TableRow className="bg-[#f9fafb] hover:bg-[#f9fafb]">
                    <TableHead 
                      className={cn(
                        "sticky left-0 top-0 z-30 bg-[#f9fafb] border-r-2 border-[#e5e7eb] font-semibold text-[#374151] h-11 px-4 cursor-pointer hover:bg-gray-100",
                        viewDimension === "date_account" ? "w-[240px]" : "w-[180px]"
                      )}
                      onClick={() => requestSort(viewDimension === "date" ? "date" : "accountName")}
                    >
                      <div className="flex items-center gap-1">
                        {viewDimension === "account" && "帐户名称"}
                        {viewDimension === "date" && "日期"}
                        {viewDimension === "date_account" && "日期 | 帐户名称"}
                        <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === (viewDimension === "date" ? 'date' : 'accountName') ? 'text-meta-blue' : 'text-gray-300'}`}/>
                      </div>
                    </TableHead>
                    <TableHead 
                      className="px-4 text-[#374151] font-semibold h-11 whitespace-nowrap sticky top-0 bg-[#f9fafb] cursor-pointer hover:bg-gray-100"
                      onClick={() => requestSort("reach")}
                    >
                      <div className="flex items-center gap-1">
                        覆盖人数 <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === 'reach' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                      </div>
                    </TableHead>
                    <TableHead 
                      className="px-4 text-[#374151] font-semibold h-11 whitespace-nowrap sticky top-0 bg-[#f9fafb] cursor-pointer hover:bg-gray-100"
                      onClick={() => requestSort("impressions")}
                    >
                      <div className="flex items-center gap-1">
                        展示次数 <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === 'impressions' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                      </div>
                    </TableHead>
                    <TableHead 
                      className="px-4 text-[#374151] font-semibold h-11 whitespace-nowrap sticky top-0 bg-[#f9fafb] cursor-pointer hover:bg-gray-100"
                      onClick={() => requestSort("clicks")}
                    >
                      <div className="flex items-center gap-1">
                        点击 <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === 'clicks' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                      </div>
                    </TableHead>
                    <TableHead 
                      className="px-4 text-[#374151] font-semibold h-11 whitespace-nowrap sticky top-0 bg-[#f9fafb] cursor-pointer hover:bg-gray-100"
                      onClick={() => requestSort("cpc")}
                    >
                      <div className="flex items-center gap-1">
                        CPC <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === 'cpc' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                      </div>
                    </TableHead>
                    <TableHead 
                      className="px-4 text-[#374151] font-semibold h-11 whitespace-nowrap sticky top-0 bg-[#f9fafb] cursor-pointer hover:bg-gray-100"
                      onClick={() => requestSort("ctr")}
                    >
                      <div className="flex items-center gap-1">
                        点击率 % <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === 'ctr' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                      </div>
                    </TableHead>
                    <TableHead 
                      className="px-4 text-[#374151] font-semibold h-11 whitespace-nowrap sticky top-0 bg-[#f9fafb] cursor-pointer hover:bg-gray-100"
                      onClick={() => requestSort("spend")}
                    >
                      <div className="flex items-center gap-1">
                        已花费金额 <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === 'spend' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                      </div>
                    </TableHead>
                    <TableHead 
                      className="px-4 text-[#374151] font-semibold h-11 whitespace-nowrap sticky top-0 bg-[#f9fafb] cursor-pointer hover:bg-gray-100"
                      onClick={() => requestSort("addToCart")}
                    >
                      <div className="flex items-center gap-1">
                        加购 <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === 'addToCart' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                      </div>
                    </TableHead>
                    <TableHead 
                      className="px-4 text-[#374151] font-semibold h-11 whitespace-nowrap sticky top-0 bg-[#f9fafb] cursor-pointer hover:bg-gray-100"
                      onClick={() => requestSort("atcRate")}
                    >
                      <div className="flex items-center gap-1">
                        加购率 <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === 'atcRate' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                      </div>
                    </TableHead>
                    <TableHead 
                      className="px-4 text-[#374151] font-semibold h-11 whitespace-nowrap sticky top-0 bg-[#f9fafb] cursor-pointer hover:bg-gray-100"
                      onClick={() => requestSort("initiateCheckout")}
                    >
                      <div className="flex items-center gap-1">
                        结账发起 <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === 'initiateCheckout' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                      </div>
                    </TableHead>
                    <TableHead 
                      className="px-4 text-[#374151] font-semibold h-11 whitespace-nowrap sticky top-0 bg-[#f9fafb] cursor-pointer hover:bg-gray-100"
                      onClick={() => requestSort("checkoutRate")}
                    >
                      <div className="flex items-center gap-1">
                        结账率 <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === 'checkoutRate' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                      </div>
                    </TableHead>
                    <TableHead 
                      className="px-4 text-[#374151] font-semibold h-11 whitespace-nowrap sticky top-0 bg-[#f9fafb] cursor-pointer hover:bg-gray-100"
                      onClick={() => requestSort("purchases")}
                    >
                      <div className="flex items-center gap-1">
                        成效 <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === 'purchases' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                      </div>
                    </TableHead>
                    <TableHead 
                      className="px-4 text-[#374151] font-semibold h-11 whitespace-nowrap sticky top-0 bg-[#f9fafb] cursor-pointer hover:bg-gray-100"
                      onClick={() => requestSort("cpp")}
                    >
                      <div className="flex items-center gap-1">
                        单次费用 <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === 'cpp' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                      </div>
                    </TableHead>
                    <TableHead 
                      className="px-4 text-[#374151] font-semibold h-11 whitespace-nowrap sticky top-0 bg-[#f9fafb] cursor-pointer hover:bg-gray-100"
                      onClick={() => requestSort("purchaseValue")}
                    >
                      <div className="flex items-center gap-1">
                        转化价值 <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === 'purchaseValue' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                      </div>
                    </TableHead>
                    <TableHead 
                      className="px-4 text-[#374151] font-semibold h-11 whitespace-nowrap sticky top-0 bg-[#f9fafb] cursor-pointer hover:bg-gray-100"
                      onClick={() => requestSort("roas")}
                    >
                      <div className="flex items-center gap-1">
                        ROAS <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === 'roas' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                      </div>
                    </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedAggregatedData.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={15}
                            className="h-32 text-center text-meta-text-grey"
                          >
                            {loading ? "正在加载数据..." : "暂无数据"}
                          </TableCell>
                        </TableRow>
                      ) : (
                        sortedAggregatedData.map((item) => (
                          <TableRow
                            key={item.id || item.accountId}
                            className="hover:bg-gray-50 transition-colors border-b border-[#f3f4f6]"
                          >
                            <TableCell className="sticky left-0 z-10 bg-white border-r-2 border-[#f3f4f6] px-4 py-[10px] whitespace-nowrap font-medium text-meta-dark">
                              {viewDimension === "account" && (
                                <button
                                  onClick={() => navigate(`/account/${item.accountId}`)}
                                  className="hover:text-blue-600 hover:underline text-left outline-none"
                                >
                                  {item.accountName}
                                </button>
                              )}
                              {viewDimension === "date" && (
                                <span className="text-[#374151]">{item.date}</span>
                              )}
                              {viewDimension === "date_account" && (
                                <div className="flex items-center gap-1.5 text-xs text-meta-dark">
                                  <span className="text-gray-500 font-normal">{item.date}</span>
                                  <span className="text-gray-300">|</span>
                                  <button
                                    onClick={() => navigate(`/account/${item.accountId}`)}
                                    className="hover:text-blue-600 hover:underline text-left outline-none font-medium"
                                  >
                                    {item.accountName}
                                  </button>
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="px-4 py-[10px] whitespace-nowrap text-[#374151]">
                              {(item.reach || 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="px-4 py-[10px] whitespace-nowrap text-[#374151]">
                              {(item.impressions || 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="px-4 py-[10px] whitespace-nowrap text-[#374151]">
                              {(item.clicks || 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="px-4 py-[10px] whitespace-nowrap text-[#374151]">
                              ${item.cpc.toFixed(2)}
                            </TableCell>
                            <TableCell className="px-4 py-[10px] whitespace-nowrap text-[#374151]">
                              {item.ctr.toFixed(2)}%
                            </TableCell>
                            <TableCell className="px-4 py-[10px] whitespace-nowrap text-[#374151] font-medium">
                              ${item.spend.toFixed(2)}
                            </TableCell>
                            <TableCell className="px-4 py-[10px] whitespace-nowrap text-[#374151]">
                              {(item.addToCart || 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="px-4 py-[10px] whitespace-nowrap text-[#374151]">
                              {item.atcRate.toFixed(2)}%
                            </TableCell>
                            <TableCell className="px-4 py-[10px] whitespace-nowrap text-[#374151]">
                              {(item.initiateCheckout || 0).toLocaleString()}
                            </TableCell>
                            <TableCell className="px-4 py-[10px] whitespace-nowrap text-[#374151]">
                              {item.checkoutRate.toFixed(2)}%
                            </TableCell>
                            <TableCell className="px-4 py-[10px] whitespace-nowrap text-[#374151]">
                              {item.purchases}
                            </TableCell>
                            <TableCell className="px-4 py-[10px] whitespace-nowrap text-[#374151]">
                              ${item.cpp.toFixed(2)}
                            </TableCell>
                            <TableCell className="px-4 py-[10px] whitespace-nowrap text-[#374151] font-semibold text-green-600">
                              ${item.purchaseValue.toFixed(2)}
                            </TableCell>
                            <TableCell className="px-4 py-[10px] whitespace-nowrap font-bold text-meta-blue">
                              {item.roas.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
              <div className="p-3 text-[11px] text-meta-text-muted text-right border-t border-meta-bg">
                * 统计数据已按 account_id 自动聚合计算
              </div>
            </Card>
              </>
            )}
          </>
        ) : currentTab === "category" ? (
          <CategoryDashboard
            mappings={mappings}
            onManageAccounts={() => navigate("/?tab=accounts")}
          />
        ) : currentTab === "stores" ? (
          <StoresDashboard startDate={startDate} endDate={endDate} />
        ) : currentTab === "bms" ? (
          <BusinessManagerDashboard />
        ) : currentTab === "pages" ? (
          <PageCommentManager />
        ) : currentTab === "monitoring" ? (
          <MonitoringDashboard />
        ) : currentTab === "accounts" ? (
          <AccountManagementPage mappings={mappings} onMappingsChange={syncMappingsToDb} />
        ) : currentTab === "users" ? (
          <UsersManagementPage />
        ) : (
          <SettingsPage />
        )}
      </main>
    </div>
  );
}

function AccountManagementPage({ mappings, onMappingsChange }: { mappings: Record<string, any>, onMappingsChange: (m: Record<string, any>) => void }) {
  const [fetching, setFetching] = useState(true);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [batchProject, setBatchProject] = useState("");
  const [batchStore, setBatchStore] = useState("");
  const [batchOwner, setBatchOwner] = useState("");
  const [selectedAccountsForBatch, setSelectedAccountsForBatch] = useState<
    any[]
  >([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tempSelectedAccountIds, setTempSelectedAccountIds] = useState<
    string[]
  >([]);
  const [submittingBatch, setSubmittingBatch] = useState(false);
  const [accountSearch, setAccountSearch] = useState("");

  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>({ key: 'accountName', direction: 'asc' });

  const requestSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const handleExportMappings = () => {
    if (Object.keys(mappings).length === 0) {
      toast.error("当前无映射配置可导出");
      return;
    }

    const dataToExport = Object.values(mappings).map((m: any) => ({
      账户ID: m.accountId,
      账户名称: m.accountName || "",
      项目: m.project || "",
      店铺: m.store || "",
      负责人: m.owner || "",
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Mappings");

    XLSX.writeFile(
      wb,
      `Meta_Account_Mappings_${format(new Date(), "yyyyMMdd")}.xlsx`,
    );
    toast.success("配置导出成功 (.xlsx)");
  };

  const handleImportMappings = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const bstr = event.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        const newMappings: any = { ...mappings };
        let count = 0;

        data.forEach((row) => {
          const keys = Object.keys(row);
          
          // Dynamically map column headers (supporting English or Chinese, case-insensitive, ignores spaces etc.)
          const accountIdKey = keys.find(k => /账户\s*ID|帐户\s*ID|账户|帐户|Account\s*ID|id/i.test(k)) || keys[0];
          const accountId = accountIdKey ? row[accountIdKey]?.toString()?.trim() : null;

          if (accountId) {
            const existing = mappings[accountId] || {};
            
            const accountNameKey = keys.find(k => /账户名称|帐户名称|账户\s*Name|Account\s*Name|名称|Name/i.test(k));
            const projectKey = keys.find(k => /项目|Project|Proj/i.test(k));
            const storeKey = keys.find(k => /店铺|Store/i.test(k));
            const ownerKey = keys.find(k => /负责人|Owner/i.test(k));

            newMappings[accountId] = {
              accountId,
              accountName: accountNameKey !== undefined && row[accountNameKey] !== undefined ? String(row[accountNameKey]).trim() : (existing.accountName || ""),
              project: projectKey !== undefined && row[projectKey] !== undefined ? String(row[projectKey]).trim() : (existing.project || ""),
              store: storeKey !== undefined && row[storeKey] !== undefined ? String(row[storeKey]).trim() : (existing.store || ""),
              owner: ownerKey !== undefined && row[ownerKey] !== undefined ? String(row[ownerKey]).trim() : (existing.owner || ""),
            };
            count++;
          }
        });

        if (count > 0) {
          await onMappingsChange(newMappings);
          toast.success(`成功导入 ${count} 条账户映射记录！已同步到服务器。`);
        } else {
          toast.error(
            "未在文件中找到有效的映射数据（请确保文件包含账户和对应数据）",
          );
        }
      } catch (err) {
        console.error("Import error:", err);
        toast.error("导入失败：文件格式不正确或解析出错");
      }
    };
    reader.readAsBinaryString(file);
  };

  const init = async () => {
    try {
      const accountsRes = await axios.get("/api/accounts/list");
      if (Array.isArray(accountsRes.data)) {
        setAccounts(accountsRes.data);
      } else {
        console.error("Invalid accounts format, got:", accountsRes.data);
        toast.error("账户数据加载失败，请检查数据库连接或确认数据格式");
        setAccounts([]);
      }
    } catch (err) {
      console.error("Account list fetch failed:", err);
      toast.error("系统繁忙或数据库连接失败，无法获取账户");
      setAccounts([]);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    init();
  }, []);

  const handleOpenModal = () => {
    setTempSelectedAccountIds(selectedAccountsForBatch.map((a) => a.accountId));
    setAccountSearch("");
    setIsModalOpen(true);
  };

  const confirmSelection = () => {
    const safeAccounts = Array.isArray(accounts) ? accounts : [];
    const selected = safeAccounts.filter((acc) =>
      tempSelectedAccountIds.includes(acc.accountId),
    );
    setSelectedAccountsForBatch(selected);
    setIsModalOpen(false);
  };

  const toggleAccountSelection = (accountId: string) => {
    setTempSelectedAccountIds((prev) => {
      const safePrev = Array.isArray(prev) ? prev : [];
      return safePrev.includes(accountId)
        ? safePrev.filter((id) => id !== accountId)
        : [...safePrev, accountId];
    });
  };

  const removeAccountFromBatch = (accountId: string) => {
    setSelectedAccountsForBatch((prev) => {
      const safePrev = Array.isArray(prev) ? prev : [];
      return safePrev.filter((a) => a.accountId !== accountId);
    });
  };

  const sortedSelectedAccounts = useMemo(() => {
    const safeSelected = Array.isArray(selectedAccountsForBatch) ? selectedAccountsForBatch : [];
    if (!sortConfig) return safeSelected;
    return [...safeSelected].sort((a, b) => {
      const aValue = a[sortConfig.key] || "";
      const bValue = b[sortConfig.key] || "";
      if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [selectedAccountsForBatch, sortConfig]);

  const filteredAccounts = useMemo(() => {
    const safeAccounts = Array.isArray(accounts) ? accounts : [];
    return safeAccounts.filter(
      (acc) =>
        (acc?.accountName || "").toLowerCase().includes((accountSearch || "").toLowerCase()) ||
        (acc?.accountId || "").toLowerCase().includes((accountSearch || "").toLowerCase()),
    );
  }, [accounts, accountSearch]);

  const sortedFilteredAccounts = useMemo(() => {
    if (!sortConfig) return filteredAccounts;
    return [...filteredAccounts].sort((a, b) => {
      const aValue = a[sortConfig.key] || "";
      const bValue = b[sortConfig.key] || "";
      if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredAccounts, sortConfig]);

  const toggleSelectAll = () => {
    const filteredIds = filteredAccounts.map((a) => a.accountId);
    const allFilteredSelected = filteredIds.every((id) =>
      tempSelectedAccountIds.includes(id),
    );

    if (allFilteredSelected) {
      setTempSelectedAccountIds((prev) => {
        const safePrev = Array.isArray(prev) ? prev : [];
        return safePrev.filter((id) => !filteredIds.includes(id));
      });
    } else {
      setTempSelectedAccountIds((prev) => {
        const safePrev = Array.isArray(prev) ? prev : [];
        return Array.from(new Set([...safePrev, ...filteredIds]));
      });
    }
  };

  const handleBatchSubmit = async () => {
    if (selectedAccountsForBatch.length === 0) {
      toast.error("请至少选择一个广告账户");
      return;
    }
    setSubmittingBatch(true);
    try {
      const newMappings = { ...mappings };

      selectedAccountsForBatch.forEach((acc) => {
        newMappings[acc.accountId] = {
          accountId: acc.accountId,
          accountName: acc.accountName,
          project:
            batchProject || mappings[acc.accountId]?.project || "",
          store: batchStore || mappings[acc.accountId]?.store || "",
          owner: batchOwner || mappings[acc.accountId]?.owner || "",
        };
      });

      await onMappingsChange(newMappings);

      toast.success(
        `成功更新 ${selectedAccountsForBatch.length} 个账户的绑定关系，已同步至服务器。`,
      );
      setBatchProject("");
      setBatchStore("");
      setBatchOwner("");
      setSelectedAccountsForBatch([]);
    } catch (err) {
      toast.error("保存绑定失败");
    } finally {
      setSubmittingBatch(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white rounded-[12px]">
        <RefreshCcw className="w-6 h-6 text-meta-blue animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-6 pb-12">
      <Card className="border-none shadow-sm rounded-[12px] overflow-hidden">
        <CardHeader className="border-b bg-gray-50/50 flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-xl">账户管理 (SaaS Manager)</CardTitle>
            <p className="text-sm text-meta-text-muted">
              您可以一次性为多个广告账户分配相同的项目、店铺或负责人
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="border-meta-blue text-meta-blue hover:bg-meta-blue/5 h-9"
              onClick={handleExportMappings}
            >
              <Download className="w-4 h-4 mr-2" />
              导出映射 (.xlsx)
            </Button>
            <div className="relative">
              <Input
                type="file"
                accept=".xlsx, .xls"
                onChange={handleImportMappings}
                className="absolute inset-0 opacity-0 cursor-pointer z-10"
              />
              <Button
                variant="outline"
                size="sm"
                className="border-green-600 text-green-600 hover:bg-green-50 pointer-events-none h-9"
              >
                <Upload className="w-4 h-4 mr-2" />
                导入映射 (.xlsx)
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-8">
          <div className="grid grid-cols-3 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                分配项目 (Project)
              </label>
              <Input
                placeholder="例如: 运动器材线"
                value={batchProject}
                onChange={(e) => setBatchProject(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                分配店铺 (Store)
              </label>
              <Input
                placeholder="例如: Amazon_US"
                value={batchStore}
                onChange={(e) => setBatchStore(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                负责人 (Owner)
              </label>
              <Input
                placeholder="例如: 张三"
                value={batchOwner}
                onChange={(e) => setBatchOwner(e.target.value)}
                className="h-10"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-[14px] font-bold flex items-center gap-2">
                当前待绑定账户列表
                <span className="bg-meta-blue/10 text-meta-blue text-[10px] px-2 py-0.5 rounded-full">
                  {selectedAccountsForBatch.length}
                </span>
              </h4>
              <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogTrigger
                  render={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleOpenModal}
                      className="border-meta-blue text-meta-blue hover:bg-meta-blue/5"
                    >
                      ➕ 添加广告账户
                    </Button>
                  }
                />
                <DialogContent className="max-w-[700px] max-h-[85vh] flex flex-col p-6">
                  <DialogHeader>
                    <DialogTitle>选择 Meta 广告账户</DialogTitle>
                    <p className="text-xs text-gray-500">
                      已自动过滤出系统中存在消费记录的所有账户
                    </p>
                  </DialogHeader>
                  <div className="mt-4 relative mb-4">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      placeholder="按账户名称或 ID 搜索..."
                      className="pl-10 h-10"
                      value={accountSearch}
                      onChange={(e) => setAccountSearch(e.target.value)}
                    />
                  </div>
                  <div className="flex-grow overflow-auto py-2 border rounded-md">
                    <Table>
                      <TableHeader className="bg-gray-50 sticky top-0 z-10">
                        <TableRow>
                          <TableHead className="w-[80px]">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={
                                  filteredAccounts.length > 0 &&
                                  filteredAccounts.every((a) =>
                                    tempSelectedAccountIds.includes(
                                      a.accountId,
                                    ),
                                  )
                                }
                                onCheckedChange={toggleSelectAll}
                              />
                              <span className="text-[10px]">全选</span>
                            </div>
                          </TableHead>
                          <TableHead className="cursor-pointer hover:bg-gray-100" onClick={() => requestSort('accountName')}>
                            <div className="flex items-center gap-1">
                              账户名称 <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === 'accountName' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                            </div>
                          </TableHead>
                          <TableHead className="cursor-pointer hover:bg-gray-100" onClick={() => requestSort('accountId')}>
                            <div className="flex items-center gap-1">
                              账户 ID <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === 'accountId' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                            </div>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedFilteredAccounts.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={3}
                              className="h-32 text-center text-gray-400"
                            >
                              无匹配账户
                            </TableCell>
                          </TableRow>
                        ) : (
                          sortedFilteredAccounts.map((acc) => (
                            <TableRow
                              key={acc.accountId}
                              className="cursor-pointer hover:bg-gray-50 transition-colors"
                              onClick={() =>
                                toggleAccountSelection(acc.accountId)
                              }
                            >
                              <TableCell onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={tempSelectedAccountIds.includes(
                                    acc.accountId,
                                  )}
                                  onCheckedChange={() =>
                                    toggleAccountSelection(acc.accountId)
                                  }
                                />
                              </TableCell>
                              <TableCell className="font-medium text-[13px]">
                                {acc.accountName || "Unknown"}
                              </TableCell>
                              <TableCell className="font-mono text-[11px] text-gray-500">
                                {acc.accountId}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex justify-between items-center pt-6">
                    <span className="text-sm font-medium">
                      已选择: {tempSelectedAccountIds.length} 个账户
                    </span>
                    <div className="flex gap-3">
                      <Button
                        variant="ghost"
                        onClick={() => setIsModalOpen(false)}
                      >
                        取消
                      </Button>
                      <Button
                        className="bg-meta-blue hover:bg-blue-600 px-6 font-bold"
                        onClick={confirmSelection}
                      >
                        确认并在下方展示
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="border rounded-[8px] overflow-hidden min-h-[200px] bg-gray-50/30">
              <Table>
                <TableHeader className="bg-white">
                  <TableRow>
                    <TableHead className="cursor-pointer hover:bg-gray-100" onClick={() => requestSort('accountName')}>
                      <div className="flex items-center gap-1">
                        账户名称 <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === 'accountName' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer hover:bg-gray-100" onClick={() => requestSort('accountId')}>
                      <div className="flex items-center gap-1">
                        账户 ID <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === 'accountId' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                      </div>
                    </TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedSelectedAccounts.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="text-center py-16 text-gray-400 italic"
                      >
                        尚未选择账户，请点击右上方按钮添加
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedSelectedAccounts.map((acc) => (
                      <TableRow key={acc.accountId} className="bg-white">
                        <TableCell className="font-medium">
                          {acc.accountName || "Unknown"}
                        </TableCell>
                        <TableCell className="font-mono text-[12px] text-gray-500">
                          {acc.accountId}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-600 hover:bg-red-50"
                            onClick={() =>
                              removeAccountFromBatch(acc.accountId)
                            }
                          >
                            移除
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="flex justify-center pt-8 border-t">
            <Button
              className="w-[280px] h-14 bg-meta-blue hover:bg-blue-600 shadow-xl text-xl font-bold rounded-full transition-all active:scale-95"
              disabled={
                submittingBatch || selectedAccountsForBatch.length === 0
              }
              onClick={handleBatchSubmit}
            >
              {submittingBatch ? (
                <RefreshCcw className="animate-spin w-5 h-5 mr-2" />
              ) : (
                "💾 保存批量绑定"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function UsersManagementPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviting, setInviting] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showSmtpModal, setShowSmtpModal] = useState(false);
  const [lastInviteData, setLastInviteData] = useState<any>(null);
  const [smtpConfig, setSmtpConfig] = useState({
    SMTP_HOST: "",
    SMTP_PORT: "465",
    SMTP_USER: "",
    SMTP_PASS: "",
    SMTP_FROM: ""
  });
  const [savingSmtp, setSavingSmtp] = useState(false);
  
  // Custom delete confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; id: string | number | null; email: string; isPending: boolean }>({
    open: false,
    id: null,
    email: "",
    isPending: false
  });
  const [isDeleting, setIsDeleting] = useState(false);
  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");

  const fetchUsers = async () => {
    setFetching(true);
    try {
      const [usersRes, settingsRes] = await Promise.all([
        axios.get("/api/users"),
        axios.get("/api/settings")
      ]);
      
      if (usersRes.data.success) {
        setUsers(usersRes.data.data);
      }
      
      if (settingsRes.data) {
        setSmtpConfig({
          SMTP_HOST: settingsRes.data.SMTP_HOST || "",
          SMTP_PORT: settingsRes.data.SMTP_PORT || "465",
          SMTP_USER: settingsRes.data.SMTP_USER || "",
          SMTP_PASS: settingsRes.data.SMTP_PASS || "",
          SMTP_FROM: settingsRes.data.SMTP_FROM || ""
        });
      }
    } catch (e) {
      console.error("Failed to fetch users or settings", e);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleInvite = async () => {
    if (!inviteEmail) return toast.error("请输入邀请邮箱");
    setInviting(true);
    setLastInviteData(null);
    try {
      const res = await axios.post("/api/users", { email: inviteEmail, role: inviteRole });
      if (res.data.success) {
        if (res.data.emailed) {
          toast.success(`邀请已发送至 ${inviteEmail}`);
          setInviteEmail("");
          fetchUsers();
        } else {
          const detail = res.data.recommendation || res.data.emailError || "请检查 SMTP 设置";
          toast.warning(`邀请已创建，但邮件发送失败: ${detail}`, { duration: 6000 });
          setLastInviteData(res.data.data);
          setShowInviteModal(true);
          fetchUsers();
        }
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || "邀请失败");
    } finally {
      setInviting(false);
    }
  };

  const handleUpdateRole = async (userId: string | number, newRole: string) => {
    // Cannot update role for pending invitations via this endpoint yet (server logic needs update)
    if (typeof userId === 'string' && userId.startsWith('inv_')) {
      return toast.info("请先撤销邀请后重新发送");
    }
    try {
      const res = await axios.put(`/api/users/${userId}`, { role: newRole });
      if (res.data.success) {
        toast.success("权限已更新");
        fetchUsers();
      }
    } catch (e) {
      toast.error("更新权限失败");
    }
  };

  const handleDeleteClick = (user: any) => {
    const isPending = typeof user.id === 'string' && String(user.id).startsWith('inv_');
    setDeleteConfirm({
      open: true,
      id: user.id,
      email: user.email,
      isPending
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm.id) return;
    
    const { id, isPending } = deleteConfirm;
    setIsDeleting(true);
    const toastId = toast.loading(isPending ? "正在撤销..." : "正在删除...");
    
    try {
      console.log(`[Dashboard] 📤 Sending DELETE request for ID: ${id}`);
      const res = await axios.delete(`/api/users/${id}`);
      
      if (res.data.success) {
        toast.success(res.data.message || (isPending ? "邀请已撤回" : "删除成功"), { id: toastId });
        setDeleteConfirm({ open: false, id: null, email: "", isPending: false });
        fetchUsers();
      } else {
        toast.error(res.data.error || "操作被拒绝", { id: toastId });
      }
    } catch (err: any) {
      console.error("[Dashboard] ❌ Deletion failed:", err);
      toast.error(err.response?.data?.error || "操作失败", { id: toastId });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteUser = async (userId: string | number) => {
    // Kept for backward compatibility if needed, but we prefer handleConfirmDelete
    console.warn("handleDeleteUser called directly, expected handleConfirmDelete flow");
  };

  const handleSaveSmtp = async () => {
    setSavingSmtp(true);
    try {
      await Promise.all([
        axios.post("/api/settings", { key: "SMTP_HOST", value: smtpConfig.SMTP_HOST }),
        axios.post("/api/settings", { key: "SMTP_PORT", value: smtpConfig.SMTP_PORT }),
        axios.post("/api/settings", { key: "SMTP_USER", value: smtpConfig.SMTP_USER }),
        axios.post("/api/settings", { key: "SMTP_PASS", value: smtpConfig.SMTP_PASS }),
        axios.post("/api/settings", { key: "SMTP_FROM", value: smtpConfig.SMTP_FROM }),
      ]);
      toast.success("邮箱配置已保存");
      setShowSmtpModal(false);
    } catch (err) {
      toast.error("保存失败，请检查设置");
    } finally {
      setSavingSmtp(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white rounded-[12px]">
        <RefreshCcw className="w-6 h-6 text-meta-blue animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-6 pb-12">
      <Card className="border-none shadow-sm rounded-[12px] overflow-hidden">
        <CardHeader className="border-b pb-4 bg-gray-50/50">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-5 h-5 text-meta-blue" />
                <CardTitle className="text-xl">成员与权限管理</CardTitle>
              </div>
              <p className="text-sm text-meta-text-muted">
                邀请新成员通过邮箱注册并分配角色权限，控制多账户访问安全
              </p>
            </div>
            <Button 
              variant="outline" 
              className="flex items-center gap-2 border-meta-blue text-meta-blue hover:bg-meta-blue hover:text-white transition-all shadow-sm"
              onClick={() => setShowSmtpModal(true)}
            >
              <Mail className="w-4 h-4" />
              邮箱设置
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-6 space-y-8">
          <div className="flex gap-4 items-end bg-gray-50 p-6 rounded-xl border border-gray-100">
            <div className="space-y-2 flex-grow">
              <label className="text-sm font-semibold text-gray-700">邀请邮箱</label>
              <Input
                placeholder="输入邀请成员的邮箱地址"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="bg-white h-11 border-gray-200"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">分配权限</label>
              <select
                className="flex h-11 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm ring-offset-background focus:ring-2 focus:ring-meta-blue outline-none"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
              >
                <option value="member">普通成员 (Member)</option>
                <option value="admin">管理员 (Admin)</option>
              </select>
            </div>
            <Button onClick={handleInvite} disabled={inviting} className="bg-meta-blue hover:bg-blue-600 h-11 px-8 shadow-sm text-white font-medium transition-all hover:translate-y-[-1px]">
              {inviting ? "发送中..." : "发送邀请链接"}
            </Button>
          </div>

          <div className="border rounded-xl bg-white overflow-hidden shadow-sm">
            <Table>
              <TableHeader className="bg-[#f9fafb]">
                <TableRow className="border-b border-gray-100">
                  <TableHead className="font-semibold px-6 py-4 text-gray-700">账号/邮箱</TableHead>
                  <TableHead className="font-semibold text-gray-700">权限角色</TableHead>
                  <TableHead className="font-semibold text-gray-700">加入时间</TableHead>
                  <TableHead className="font-semibold text-right pr-6 text-gray-700">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(u => (
                  <TableRow key={u.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                    <TableCell className="px-6">
                      <div className="flex flex-col">
                        <span className="font-medium text-gray-900">{u.email}</span>
                        {u.status === 'pending' && (
                          <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded w-fit mt-1">等候激活 (Pending)</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <select
                        className="bg-white border border-gray-200 text-sm rounded-md focus:ring-2 focus:ring-meta-blue block p-1.5 min-w-[120px] outline-none"
                        value={u.role}
                        onChange={(e) => handleUpdateRole(u.id, e.target.value)}
                        disabled={(u.email === currentUser.email && u.role === "admin") || u.status === 'pending'}
                      >
                        <option value="member">成员 (Member)</option>
                        <option value="admin">管理员 (Admin)</option>
                      </select>
                    </TableCell>
                    <TableCell className="text-gray-500 font-mono text-xs">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right pr-6">
                      <Button
                        variant="destructive"
                        size="sm"
                        className={cn(
                          "border-none px-4 font-medium",
                          u.status === 'pending' 
                            ? "bg-amber-50 text-amber-600 hover:bg-amber-100 hover:text-amber-700"
                            : "bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700"
                        )}
                        onClick={() => handleDeleteClick(u)}
                        disabled={u.email === currentUser.email}
                      >
                        {u.status === 'pending' ? "撤回邀请" : "移除"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Custom Delete Confirmation Modal */}
      {deleteConfirm.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden"
          >
            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center",
                  deleteConfirm.isPending ? "bg-amber-100 text-amber-600" : "bg-red-100 text-red-600"
                )}>
                  {deleteConfirm.isPending ? <Mail className="w-6 h-6" /> : <Trash2 className="w-6 h-6" />}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    {deleteConfirm.isPending ? "撤销成员邀请" : "确认移除成员"}
                  </h3>
                  <p className="text-sm text-gray-500">此操作不可撤销</p>
                </div>
              </div>
              
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <p className="text-sm text-gray-600 mb-1">即将对以下账户执行操作：</p>
                <code className="text-sm font-mono font-semibold text-gray-900 break-all">{deleteConfirm.email}</code>
              </div>
              
              <p className="text-sm text-gray-600">
                {deleteConfirm.isPending 
                  ? "该邀请链接将失效，该成员将无法通过此渠道加入系统。" 
                  : "该成员将立即失去所有系统访问权限，所有关联会话将被强制断开。"}
              </p>
            </div>
            
            <div className="flex items-center justify-end gap-3 p-6 bg-gray-50 border-t border-gray-100">
              <Button 
                variant="outline" 
                onClick={() => setDeleteConfirm({ open: false, id: null, email: "", isPending: false })}
                disabled={isDeleting}
              >
                取消
              </Button>
              <Button 
                variant={deleteConfirm.isPending ? "default" : "destructive"}
                className={cn(deleteConfirm.isPending && "bg-amber-600 hover:bg-amber-700")}
                onClick={handleConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <RefreshCcw className="w-4 h-4 animate-spin mr-2" />
                ) : null}
                {deleteConfirm.isPending ? "确认撤销" : "执行移除"}
              </Button>
            </div>
          </motion.div>
        </div>
      )}

      <Dialog open={showInviteModal} onOpenChange={setShowInviteModal}>
        <DialogContent className="max-w-[500px]">
          <DialogHeader>
            <DialogTitle>手动发送邀请链接</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-gray-600">由于邮箱服务未完全配置，请手动将以下链接发送给成员：</p>
            <div className="p-4 bg-gray-100 rounded-lg break-all font-mono text-xs select-all">
              {`${window.location.origin}/?token=${lastInviteData?.token}`}
            </div>
            <Button className="w-full" onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/?token=${lastInviteData?.token}`);
              toast.success("链接已复制");
            }}>
              复制邀请链接
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showSmtpModal} onOpenChange={setShowSmtpModal}>
        <DialogContent className="max-w-[600px]">
          <DialogHeader className="border-b pb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-meta-blue/10 flex items-center justify-center">
                <Mail className="w-4 h-4 text-meta-blue" />
              </div>
              <div>
                <DialogTitle className="text-xl">SMTP 邮件服务配置</DialogTitle>
                <p className="text-xs text-gray-500 mt-1">配置 SMTP 服务器以便系统自动发送邀请激活邮件</p>
              </div>
            </div>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-6">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">SMTP 主机 (Host)</label>
              <Input
                placeholder="smtp.gmail.com"
                value={smtpConfig.SMTP_HOST}
                onChange={(e) => setSmtpConfig({...smtpConfig, SMTP_HOST: e.target.value})}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">端口 (Port)</label>
              <Input
                placeholder="465"
                value={smtpConfig.SMTP_PORT}
                onChange={(e) => setSmtpConfig({...smtpConfig, SMTP_PORT: e.target.value})}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">发件账号 (User)</label>
              <Input
                placeholder="your-email@example.com"
                value={smtpConfig.SMTP_USER}
                onChange={(e) => setSmtpConfig({...smtpConfig, SMTP_USER: e.target.value})}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">发件密码 (Password/App Password)</label>
              <Input
                type="password"
                placeholder="••••••••"
                value={smtpConfig.SMTP_PASS}
                onChange={(e) => setSmtpConfig({...smtpConfig, SMTP_PASS: e.target.value})}
                className="h-10"
              />
            </div>
            <div className="space-y-2 col-span-2">
              <label className="text-sm font-semibold text-gray-700">发件人显示的邮箱 (From Address)</label>
              <Input
                placeholder="Meta Insights <no-reply@insights.com>"
                value={smtpConfig.SMTP_FROM}
                onChange={(e) => setSmtpConfig({...smtpConfig, SMTP_FROM: e.target.value})}
                className="h-10"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setShowSmtpModal(false)} disabled={savingSmtp}>取消</Button>
            <Button 
              onClick={handleSaveSmtp} 
              disabled={savingSmtp}
              className="bg-meta-blue hover:bg-blue-600 px-6"
            >
              {savingSmtp ? <RefreshCcw className="w-4 h-4 animate-spin mr-2" /> : null}
              保存配置
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SettingsPage() {
  const [metaToken, setMetaToken] = useState("");
  const [hasMetaToken, setHasMetaToken] = useState(false);
  const [metaTokenUpdatedAt, setMetaTokenUpdatedAt] = useState<string | null>(null);
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [geminiModel, setGeminiModel] = useState("gemini-3.5-flash");
  
  const [loadingAI, setLoadingAI] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [fetching, setFetching] = useState(true);

  // Facebook App Config & OAuth States
  const [fbClientId, setFbClientId] = useState("");
  const [fbClientSecret, setFbClientSecret] = useState("");
  const [fbConfigId, setFbConfigId] = useState("");
  const [hasFbClientSecret, setHasFbClientSecret] = useState(false);
  const [fbUserId, setFbUserId] = useState("");
  const [loadingFbSave, setLoadingFbSave] = useState(false);
  const [loadingFbDisconnect, setLoadingFbDisconnect] = useState(false);
  const [loadingFbDeleteLocal, setLoadingFbDeleteLocal] = useState(false);
  const [showFbModal, setShowFbModal] = useState(false);

  // Modal states
  const [showAIModal, setShowAIModal] = useState(false);
  const [showMetaModal, setShowMetaModal] = useState(false);
  const [showMetaHelpModal, setShowMetaHelpModal] = useState(false);

  const reloadSettings = async () => {
    try {
      const settingsRes = await axios.get("/api/settings");
      if (settingsRes.data.META_ACCESS_TOKEN) {
        setHasMetaToken(true);
      } else {
        setHasMetaToken(false);
      }
      if (settingsRes.data.META_TOKEN_UPDATED_AT) {
        setMetaTokenUpdatedAt(settingsRes.data.META_TOKEN_UPDATED_AT);
      } else {
        setMetaTokenUpdatedAt(null);
      }
      if (settingsRes.data.FACEBOOK_CLIENT_ID) {
        setFbClientId(settingsRes.data.FACEBOOK_CLIENT_ID);
      } else {
        setFbClientId("");
      }
      if (settingsRes.data.FACEBOOK_CONFIG_ID) {
        setFbConfigId(settingsRes.data.FACEBOOK_CONFIG_ID);
      } else {
        setFbConfigId("");
      }
      if (settingsRes.data.hasFbClientSecret === "true") {
        setHasFbClientSecret(true);
      } else {
        setHasFbClientSecret(false);
      }
      if (settingsRes.data.FB_AUTHORIZED_USER_ID) {
        setFbUserId(settingsRes.data.FB_AUTHORIZED_USER_ID);
      } else {
        setFbUserId("");
      }
    } catch (err) {
      console.error("Failed to reload settings", err);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const settingsRes = await axios.get("/api/settings");
        if (settingsRes.data.META_ACCESS_TOKEN) {
          setHasMetaToken(true);
        }
        if (settingsRes.data.META_TOKEN_UPDATED_AT) {
          setMetaTokenUpdatedAt(settingsRes.data.META_TOKEN_UPDATED_AT);
        }
        if (settingsRes.data.GEMINI_API_KEY) {
          setGeminiApiKey(settingsRes.data.GEMINI_API_KEY);
        }
        if (settingsRes.data.GEMINI_MODEL) {
          setGeminiModel(settingsRes.data.GEMINI_MODEL);
        }
        if (settingsRes.data.FACEBOOK_CLIENT_ID) {
          setFbClientId(settingsRes.data.FACEBOOK_CLIENT_ID);
        }
        if (settingsRes.data.FACEBOOK_CONFIG_ID) {
          setFbConfigId(settingsRes.data.FACEBOOK_CONFIG_ID);
        }
        if (settingsRes.data.hasFbClientSecret === "true") {
          setHasFbClientSecret(true);
        }
        if (settingsRes.data.FB_AUTHORIZED_USER_ID) {
          setFbUserId(settingsRes.data.FB_AUTHORIZED_USER_ID);
        }
      } catch (err) {
        toast.error("加载设置失败");
      } finally {
        setFetching(false);
      }
    };
    init();
  }, []);

  // Listen for popup postMessage events to handle popup auth flow seamlessly
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith(".run.app") && !origin.includes("localhost") && !origin.includes("vercel.app")) {
        return;
      }
      if (event.data?.type === "OAUTH_AUTH_SUCCESS" || event.data?.type === "FB_AUTH_SUCCESS") {
        toast.success("Facebook 账户绑定成功！已拉取 60 天长效访问令牌。");
        reloadSettings();
      } else if (event.data?.type === "FB_AUTH_ERROR") {
        toast.error(event.data.message || "Facebook 授权失败，请检查开发者配置！");
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Listen for URL query params on mount to capture full-page redirect status
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    const message = params.get("message");
    if (status === "success") {
      toast.success("Facebook 账户绑定成功！已拉取 60 天长效访问令牌。");
      window.history.replaceState({}, document.title, window.location.pathname + "?tab=settings");
      reloadSettings();
    } else if (status === "error") {
      toast.error(message || "Facebook 绑定失败，请检查开发者应用配置！");
      window.history.replaceState({}, document.title, window.location.pathname + "?tab=settings");
    }
  }, []);

  const handleSaveSetting = async (key: string, value: string) => {
    try {
      await axios.post("/api/settings", { key, value });
    } catch (err) {
      console.error(`Save ${key} failed`);
      throw err;
    }
  };

  const handleSaveAIConfig = async () => {
    setLoadingAI(true);
    try {
      await handleSaveSetting("GEMINI_API_KEY", geminiApiKey);
      await handleSaveSetting("GEMINI_MODEL", geminiModel);
      toast.success("AI 助手配置已保存");
      setShowAIModal(false);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "保存 AI 配置失败");
    } finally {
      setLoadingAI(false);
    }
  };

  const handleSaveMetaConfig = async () => {
    if (!metaToken) {
      toast.error("请输入访问令牌");
      return;
    }
    setLoadingMeta(true);
    try {
      const res = await axios.post("/api/settings/meta-token", { token: metaToken });
      
      setMetaTokenUpdatedAt(res.data.timestamp);
      setHasMetaToken(true);
      setMetaToken(""); // clear it so it doesn't show
      toast.success(`Meta API 配置已保存${res.data.updatedAccountsCount ? `，并覆盖更新了 ${res.data.updatedAccountsCount} 个广告账户` : ''}`);
      setShowMetaModal(false);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "保存 Meta API 配置失败");
    } finally {
      setLoadingMeta(false);
    }
  };

  const handleSaveFbConfig = async () => {
    if (!fbClientId) {
      toast.error("请输入 Facebook App ID");
      return;
    }
    if (!fbConfigId) {
      toast.error("请输入 Meta 登录配置 ID (config_id)");
      return;
    }
    setLoadingFbSave(true);
    try {
      await handleSaveSetting("FACEBOOK_CLIENT_ID", fbClientId);
      await handleSaveSetting("FACEBOOK_CONFIG_ID", fbConfigId);
      if (fbClientSecret) {
        await handleSaveSetting("FACEBOOK_CLIENT_SECRET", fbClientSecret);
        setHasFbClientSecret(true);
        setFbClientSecret(""); // clear it
      }
      toast.success("Facebook 开发者应用配置已保存");
      setShowFbModal(false);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "保存 Facebook 配置失败");
    } finally {
      setLoadingFbSave(false);
    }
  };

  const handleFbConnect = () => {
    if (!fbClientId) {
      toast.error("请先点击【配置开发者应用】输入 Facebook App ID！");
      return;
    }
    if (!fbConfigId) {
      toast.error("请先点击【配置开发者应用】输入 Meta 登录配置 ID (config_id)！");
      return;
    }
    // Open OAuth provider directly in popup window
    const redirectUri = "https://1-eight-azure.vercel.app/api/auth/facebook/callback";
    const authUrl = `https://www.facebook.com/v20.0/dialog/oauth?client_id=${fbClientId}&config_id=${fbConfigId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code`;

    const popup = window.open(
      authUrl,
      "facebook_oauth_popup",
      "width=650,height=700,status=no,resizable=yes,scrollbars=yes"
    );

    if (!popup) {
      // Fallback to full-page redirect if popup is blocked
      toast.warning("弹出窗口已被浏览器拦截，已为您切换为当前页面跳转...");
      setTimeout(() => {
        window.location.href = authUrl;
      }, 1000);
    }
  };

  const handleFbDisconnect = async () => {
    if (!confirm("确认要解除与 Facebook 账户的绑定吗？系统将移除存储在数据库中的长效访问令牌，且无法再自动同步广告账户。")) {
      return;
    }
    setLoadingFbDisconnect(true);
    try {
      await axios.post("/api/auth/facebook/disconnect");
      toast.success("已成功解除 Facebook 账户绑定并清空相关令牌");
      setFbUserId("");
      setHasMetaToken(false);
      setMetaTokenUpdatedAt(null);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "解除绑定失败");
    } finally {
      setLoadingFbDisconnect(false);
    }
  };

  const handleFbDeleteLocal = async () => {
    if (!confirm("确认要本地解绑并登出 Facebook 账户吗？这将会清空系统内缓存的令牌、广告账户及 BM 同步数据。")) {
      return;
    }
    setLoadingFbDeleteLocal(true);
    try {
      await axios.post("/api/auth/facebook/delete-local", { fbUserId });
      toast.success("本地解绑成功，如需彻底清除 Meta 缓存，请前往 Facebook 个人后台设置");
      setFbUserId("");
      setHasMetaToken(false);
      setMetaTokenUpdatedAt(null);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "解绑/登出失败");
    } finally {
      setLoadingFbDeleteLocal(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white rounded-[12px]">
        <RefreshCcw className="w-6 h-6 text-meta-blue animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#F7F9FC] p-8 -m-6 h-[calc(100%+3rem)]">
      <div className="mb-6">
        <h2 className="text-[16px] font-medium text-gray-700">系统参数配置</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

        {/* AI Config Card */}
        <div className="bg-white rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-gray-100 p-8 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-4 text-meta-blue">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>
          </div>
          <h3 className="text-[15px] font-medium text-gray-800 mb-2">AI 诊断与助手配置</h3>
          <p className="text-[12px] text-gray-500 mb-6 flex-1">
            配置用于广告诊断和策略回答的 AI 模型及 API 密钥
          </p>
          <Button 
            className="w-[180px] bg-[#3B82F6] hover:bg-blue-600 font-normal rounded-[4px] h-9"
            onClick={() => setShowAIModal(true)}
          >
            修改 AI 配置
          </Button>

          {/* AI Config Modal */}
          <Dialog open={showAIModal} onOpenChange={setShowAIModal}>
            <DialogContent className="max-w-[450px] p-0 overflow-hidden bg-white rounded-lg border-0 shadow-2xl">
              <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
                <h3 className="text-[16px] font-medium text-gray-800">修改 AI 配置</h3>
                <button onClick={() => setShowAIModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="px-8 py-6 space-y-5">
                <div className="flex items-center gap-4">
                  <label className="text-[13px] text-gray-600 w-24 text-right shrink-0">
                    * 模型选择:
                  </label>
                  <select
                    value={geminiModel}
                    onChange={(e) => setGeminiModel(e.target.value)}
                    className="flex-1 h-9 rounded-[4px] border border-gray-200 bg-white px-3 text-[13px] text-gray-800 outline-none focus:border-blue-500 transition-colors"
                  >
                    <option value="gemini-3.5-flash">Gemini 3.5 Flash</option>
                    <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro Preview</option>
                    <option value="gemini-3.1-flash-lite">Gemini 3.1 Flash Lite</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1 w-full">
                  <div className="flex items-center gap-4">
                    <label className="text-[13px] text-gray-600 w-24 text-right shrink-0">
                      * API Key:
                    </label>
                    <Input
                      type="password"
                      placeholder="AI_zaSy..."
                      value={geminiApiKey}
                      onChange={(e) => setGeminiApiKey(e.target.value)}
                      className="flex-1 h-9 rounded-[4px] border border-gray-200 text-[13px] focus-visible:ring-0 focus-visible:border-blue-500 placeholder:text-gray-400"
                    />
                  </div>
                  <div className="pl-[112px]">
                    <p className="text-[12px] text-gray-400 mt-1">
                      前往 <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">Google AI Studio</a> 获取 API Key。
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex justify-center gap-3 px-6 py-5 border-t border-gray-100 bg-gray-50/50">
                <Button 
                  variant="outline" 
                  onClick={() => setShowAIModal(false)}
                  className="w-[88px] h-9 text-[13px] font-normal border-gray-200 shadow-sm"
                >
                  取消
                </Button>
                <Button 
                  onClick={handleSaveAIConfig}
                  disabled={loadingAI}
                  className="w-[88px] h-9 text-[13px] font-normal bg-[#3B82F6] hover:bg-blue-600 text-white shadow-sm"
                >
                  {loadingAI ? <RefreshCcw className="w-4 h-4 animate-spin" /> : "确定"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Meta Config Card */}
        <div className="bg-white rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-gray-100 p-8 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mb-4 text-white">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
          </div>
          <h3 className="text-[15px] font-medium text-gray-800 mb-2">Meta API 配置</h3>
          <p className="text-[12px] text-gray-500 mb-4 flex-1">
            配置 Meta Graph API，授权应用安全获取广告数据
          </p>

          {hasMetaToken && metaTokenUpdatedAt && (
             <div className="mb-6 w-full text-left text-[12px] bg-slate-50 p-3 rounded-md border border-slate-100">
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-gray-500 font-medium">状态</span>
                  <span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-sm">已绑定</span>
                </div>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-gray-500">更新时间</span>
                  <span className="text-gray-700 font-mono">{format(new Date(metaTokenUpdatedAt), 'yyyy-MM-dd HH:mm')}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">预计失效</span>
                  <span className="text-gray-700 font-mono">{format(new Date(new Date(metaTokenUpdatedAt).getTime() + 60 * 24 * 3600 * 1000), 'yyyy-MM-dd HH:mm')}</span>
                </div>
                {new Date(metaTokenUpdatedAt).getTime() + 60 * 24 * 3600 * 1000 - Date.now() < 3 * 24 * 3600 * 1000 && (
                  <div className="mt-3 text-red-600 font-medium flex items-center gap-1.5 bg-red-50 p-2 rounded border border-red-100">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>Meta API 即将失效请更新</span>
                  </div>
                )}
             </div>
          )}

          <div className="flex items-center gap-3 mt-auto">
            <Button 
              className="w-[180px] bg-[#3B82F6] hover:bg-blue-600 font-normal rounded-[4px] h-9"
              onClick={() => setShowMetaModal(true)}
            >
              修改 Meta 配置
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="w-9 h-9 border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-200 shadow-sm shrink-0 rounded-[4px]"
              onClick={() => setShowMetaHelpModal(true)}
              title="如何获取长效 Token"
            >
              <HelpCircle className="w-5 h-5" />
            </Button>
          </div>

          {/* Meta Config Modal */}
          <Dialog open={showMetaModal} onOpenChange={setShowMetaModal}>
            <DialogContent className="max-w-[500px] p-0 overflow-hidden bg-white rounded-lg border-0 shadow-2xl">
              <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
                <h3 className="text-[16px] font-medium text-gray-800">修改 Meta 配置</h3>
                <button onClick={() => setShowMetaModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="px-8 py-6 space-y-5">
                <div className="flex flex-col gap-1 w-full">
                  <div className="flex items-center gap-4">
                    <label className="text-[13px] text-gray-600 w-24 text-right shrink-0">
                      * 访问令牌:
                    </label>
                    <Input
                      type="password"
                      placeholder="EAAP... (长效访问令牌)"
                      value={metaToken}
                      onChange={(e) => setMetaToken(e.target.value)}
                      className="flex-1 h-9 rounded-[4px] border border-gray-200 text-[13px] focus-visible:ring-0 focus-visible:border-blue-500 placeholder:text-gray-400"
                    />
                  </div>
                  <div className="pl-[112px]">
                    <p className="text-[11px] text-gray-400 mt-2 leading-relaxed text-left">
                      访问令牌持久化存储在数据库中，优先级高于环境变量。请保持口令的长效性以确保后台任务正常运行。
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex justify-center gap-3 px-6 py-5 border-t border-gray-100 bg-gray-50/50">
                <Button 
                  variant="outline" 
                  onClick={() => setShowMetaModal(false)}
                  className="w-[88px] h-9 text-[13px] font-normal border-gray-200 shadow-sm"
                >
                  取消
                </Button>
                <Button 
                  onClick={handleSaveMetaConfig}
                  disabled={loadingMeta}
                  className="w-[88px] h-9 text-[13px] font-normal bg-[#3B82F6] hover:bg-blue-600 text-white shadow-sm"
                >
                  {loadingMeta ? <RefreshCcw className="w-4 h-4 animate-spin" /> : "确定"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Facebook Login Config Card */}
        <div className="bg-white rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-gray-100 p-8 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center mb-4 text-white">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
          </div>
          <h3 className="text-[15px] font-medium text-gray-800 mb-2">Facebook 账户绑定 (OAuth 2.0)</h3>
          <p className="text-[12px] text-gray-500 mb-4 flex-1">
            集成标准 Facebook OAuth 2.0 授权流程，安全拉取 60 天长效用户访问令牌，并解锁广告账户管理及 BM 健康同步。
          </p>

          {/* Binding Status Info */}
          <div className="mb-6 w-full text-left text-[12px] bg-blue-50/50 p-3 rounded-md border border-blue-100">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-gray-500 font-medium">绑定状态</span>
              <div className="flex items-center gap-1.5">
                {hasMetaToken && fbUserId ? (
                  <>
                    <span className="text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded-sm">OAuth 已绑定</span>
                    <button 
                      onClick={handleFbDeleteLocal} 
                      disabled={loadingFbDeleteLocal}
                      className="text-red-500 hover:text-red-700 text-[10px] font-medium underline ml-1 cursor-pointer disabled:opacity-50"
                      title="本地解绑并清除缓存"
                    >
                      {loadingFbDeleteLocal ? "处理中..." : "解绑/登出"}
                    </button>
                  </>
                ) : hasMetaToken ? (
                  <span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-sm">手动 Token 已配置</span>
                ) : (
                  <span className="text-gray-400 font-bold bg-gray-50 px-2 py-0.5 rounded-sm">未绑定</span>
                )}
              </div>
            </div>
            
            {fbUserId && (
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-gray-500">Facebook 用户 ID</span>
                <span className="text-gray-700 font-mono">{fbUserId}</span>
              </div>
            )}

            <div className="flex justify-between items-center mb-1.5">
              <span className="text-gray-500">开发者应用 ID</span>
              <span className="text-gray-700 font-mono">{fbClientId ? `${fbClientId.slice(0, 4)}***${fbClientId.slice(-4)}` : "未配置"}</span>
            </div>

            <div className="flex justify-between items-center mb-1.5">
              <span className="text-gray-500">登录配置 ID (config_id)</span>
              <span className="text-gray-700 font-mono">{fbConfigId ? fbConfigId : "未配置"}</span>
            </div>

            {metaTokenUpdatedAt && (
              <div className="flex justify-between items-center">
                <span className="text-gray-500">最近授权</span>
                <span className="text-gray-700 font-mono">{format(new Date(metaTokenUpdatedAt), 'yyyy-MM-dd HH:mm')}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 w-full mt-auto">
            {hasMetaToken && fbUserId ? (
              <div className="flex flex-col gap-1.5 w-full">
                <Button 
                  variant="destructive"
                  className="w-full font-normal rounded-[4px] h-9 text-[13px]"
                  disabled={loadingFbDisconnect}
                  onClick={handleFbDisconnect}
                >
                  {loadingFbDisconnect ? <RefreshCcw className="w-4 h-4 animate-spin" /> : "解除 Facebook 绑定"}
                </Button>
                <Button 
                  variant="outline"
                  className="w-full font-normal rounded-[4px] h-9 text-[13px] border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  disabled={loadingFbDeleteLocal}
                  onClick={handleFbDeleteLocal}
                >
                  {loadingFbDeleteLocal ? <RefreshCcw className="w-4 h-4 animate-spin" /> : "解绑并登出 Facebook"}
                </Button>
              </div>
            ) : (
              <Button 
                className="w-full bg-[#1877F2] hover:bg-blue-700 text-white font-semibold rounded-[4px] h-9 text-[13px] flex items-center justify-center gap-1.5 shadow-sm"
                onClick={handleFbConnect}
              >
                绑定 Facebook 账户
              </Button>
            )}
            
            <Button 
              variant="outline"
              className="w-full font-normal rounded-[4px] h-9 text-[13px] text-gray-600 border-gray-200 hover:bg-gray-50"
              onClick={() => setShowFbModal(true)}
            >
              配置开发者应用
            </Button>
          </div>

          {/* Facebook App Config Modal */}
          <Dialog open={showFbModal} onOpenChange={setShowFbModal}>
            <DialogContent className="max-w-[450px] p-0 overflow-hidden bg-white rounded-lg border-0 shadow-2xl">
              <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
                <h3 className="text-[16px] font-medium text-gray-800">配置 Facebook 开发者应用</h3>
                <button onClick={() => setShowFbModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="px-8 py-6 space-y-5">
                <div className="text-[11px] text-gray-400 space-y-2 text-left leading-relaxed">
                  <p>
                    在进行 OAuth 绑定前，请在 Facebook 开发者平台创建应用，并配置企业版登录。
                  </p>
                  <p className="bg-amber-50 text-amber-800 p-2 rounded border border-amber-100 font-medium">
                    提示：请确保在应用后台的【用户数据删除类型】中，切换为“数据删除说明网址”，并填入下面的隐私政策链接：<br />
                    <code className="bg-white px-1 py-0.5 rounded font-mono text-[10px] select-all border border-amber-200 break-all">https://1-eight-azure.vercel.app/privacy</code>
                  </p>
                  <p>
                    回调重定向 URI 固定为：<code className="bg-gray-100 px-1 py-0.5 rounded font-mono text-[10px] break-all">https://1-eight-azure.vercel.app/api/auth/facebook/callback</code>
                  </p>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <label className="text-[13px] text-gray-600 w-24 text-right shrink-0">
                      * App ID:
                    </label>
                    <Input
                      placeholder="输入 Facebook Client ID"
                      value={fbClientId}
                      onChange={(e) => setFbClientId(e.target.value)}
                      className="flex-1 h-9 rounded-[4px] border border-gray-200 text-[13px] focus-visible:ring-0 focus-visible:border-blue-500"
                    />
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="text-[13px] text-gray-600 w-24 text-right shrink-0">
                      * Config ID:
                    </label>
                    <Input
                      placeholder="输入 Meta 登录配置 ID (config_id)"
                      value={fbConfigId}
                      onChange={(e) => setFbConfigId(e.target.value)}
                      className="flex-1 h-9 rounded-[4px] border border-gray-200 text-[13px] focus-visible:ring-0 focus-visible:border-blue-500"
                    />
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="text-[13px] text-gray-600 w-24 text-right shrink-0">
                      App Secret:
                    </label>
                    <Input
                      type="password"
                      placeholder={hasFbClientSecret ? "•••••••••••• (已保存)" : "输入 App Client Secret"}
                      value={fbClientSecret}
                      onChange={(e) => setFbClientSecret(e.target.value)}
                      className="flex-1 h-9 rounded-[4px] border border-gray-200 text-[13px] focus-visible:ring-0 focus-visible:border-blue-500"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-center gap-3 px-6 py-5 border-t border-gray-100 bg-gray-50/50">
                <Button 
                  variant="outline" 
                  onClick={() => setShowFbModal(false)}
                  className="w-[88px] h-9 text-[13px] font-normal border-gray-200 shadow-sm"
                >
                  取消
                </Button>
                <Button 
                  onClick={handleSaveFbConfig}
                  disabled={loadingFbSave}
                  className="w-[88px] h-9 text-[13px] font-normal bg-[#3B82F6] hover:bg-blue-600 text-white shadow-sm"
                >
                  {loadingFbSave ? <RefreshCcw className="w-4 h-4 animate-spin" /> : "确定"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

      </div>

      <Dialog open={showMetaHelpModal} onOpenChange={setShowMetaHelpModal}>
        <DialogContent className="max-w-[700px] p-0 overflow-hidden bg-white rounded-lg border-0 shadow-2xl">
          <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <div>
              <h3 className="text-[16px] font-medium text-gray-800">如何获取 60 天长效 Meta Token？</h3>
              <p className="text-[12px] text-gray-500 mt-1">请严格按照以下步骤操作，以确保数据同步功能的稳定性</p>
            </div>
            <button onClick={() => setShowMetaHelpModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
            <div className="flex gap-4">
              <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-[13px] shrink-0">
                1
              </div>
              <div>
                <h4 className="font-medium text-[13px] mb-1 text-gray-800">访问 Meta Graph API Explorer</h4>
                <p className="text-[12px] text-gray-500 mb-2">
                  进入开发者工具面板进行初步授权
                </p>
                <a
                  href="https://developers.facebook.com/tools/explorer/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-500 hover:underline text-[12px] inline-flex items-center gap-1"
                >
                  点击访问 Graph API Explorer <ChevronRight className="w-3 h-3" />
                </a>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-[13px] shrink-0">
                2
              </div>
              <div>
                <h4 className="font-medium text-[13px] mb-1 text-gray-800">选择权限并生成口令</h4>
                <p className="text-[12px] text-gray-500">
                  在右侧 Permissions 框中搜索并勾选 <code className="bg-gray-50 px-1 py-0.5 rounded text-red-500 border border-gray-100">ads_read</code> 和 <code className="bg-gray-50 px-1 py-0.5 rounded text-red-500 border border-gray-100">read_insights</code>，然后点击 <span className="font-medium text-gray-700">Generate Access Token</span>。
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-[13px] shrink-0">
                3
              </div>
              <div>
                <h4 className="font-medium text-[13px] mb-1 text-gray-800">进入访问口令工具</h4>
                <p className="text-[12px] text-gray-500">
                  点击 Token 字符串旁边的蓝色 <span className="text-blue-500 font-bold">i</span> 图标，在弹出的小窗中点击底部的 <span className="font-medium text-gray-700">Open in Access Token Tool</span>。
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-7 h-7 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-[13px] shrink-0">
                4
              </div>
              <div>
                <h4 className="font-medium text-[13px] mb-1 text-gray-800">延长访问口令</h4>
                <p className="text-[12px] text-gray-500">
                  在跳转后的新页面底部，找到 <span className="font-medium text-blue-600">Extend Access Token</span> 蓝色按钮并点击，您将获得一个有效期为 60 天的长效令牌。
                </p>
              </div>
            </div>
            <div className="flex gap-4 py-3 bg-blue-50/50 rounded-lg px-4 border border-blue-100/50">
              <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[13px] shrink-0">
                5
              </div>
              <div>
                <h4 className="font-medium text-[13px] mb-1 text-blue-800">复制并保存</h4>
                <p className="text-[12px] text-blue-700/80">
                  复制生成的以 <span className="font-mono bg-white px-1 py-0.5 rounded border border-blue-100">EAAP</span> 开头的长字符串，粘贴到配置表单中，最后点击保存。
                </p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CategoryDashboard({ mappings, onManageAccounts }: { mappings: Record<string, any>, onManageAccounts: () => void }) {
  const navigate = useNavigate();
  const [startDate, setStartDate] = useState<Date>(() => {
    try {
      const saved = localStorage.getItem("META_DASHBOARD_START_DATE");
      if (saved) {
        const parsed = new Date(saved);
        if (!isNaN(parsed.getTime())) return parsed;
      }
    } catch (e) {}
    return subDays(new Date(), 1);
  });
  const [endDate, setEndDate] = useState<Date>(() => {
    try {
      const saved = localStorage.getItem("META_DASHBOARD_END_DATE");
      if (saved) {
        const parsed = new Date(saved);
        if (!isNaN(parsed.getTime())) return parsed;
      }
    } catch (e) {}
    return subDays(new Date(), 1);
  });

  useEffect(() => {
    if (startDate) {
      localStorage.setItem("META_DASHBOARD_START_DATE", startDate.toISOString());
    }
  }, [startDate]);

  useEffect(() => {
    if (endDate) {
      localStorage.setItem("META_DASHBOARD_END_DATE", endDate.toISOString());
    }
  }, [endDate]);
  const [rawInsights, setRawInsights] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [projectFilter, setProjectFilter] = useState("all");
  const [storeFilter, setStoreFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");

  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);

  const requestSort = (key: string) => {
    let direction: "asc" | "desc" = "asc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "asc") {
      direction = "desc";
    }
    setSortConfig({ key, direction });
  };

  const fetchCategoryData = async () => {
    setLoading(true);
    try {
      const res = await axios.get("/api/insights", {
        params: {
          startDate: format(startDate, "yyyy-MM-dd"),
          endDate: format(endDate, "yyyy-MM-dd"),
        },
      });

      if (typeof res.data === 'string' && res.data.trim().toLowerCase().startsWith('<!doctype html>')) {
        toast.error("系统正在启动或重启，请稍候...");
        setRawInsights([]);
        return;
      }

      const data = Array.isArray(res.data) ? res.data : [];
      if (!Array.isArray(res.data)) {
        console.error("API Error: Expected array, got", res.data);
        toast.error("数据加载失败，请检查数据库连接或确认数据格式");
      }
      setRawInsights(data);
    } catch (err) {
      toast.error("数据加载失败，请检查数据库连接");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategoryData();
  }, [startDate, endDate]);

  const data = useMemo(() => {
    const grouped = rawInsights.reduce((acc: any, curr: any) => {
      const key = curr.accountId;
      if (!acc[key]) {
        acc[key] = {
          accountId: curr.accountId,
          accountName: curr.accountName,
          spend: 0,
          purchaseValue: 0,
          purchases: 0,
        };
      }
      acc[key].spend += curr.spend;
      acc[key].purchaseValue += curr.purchaseValue;
      acc[key].purchases += curr.purchases;
      return acc;
    }, {});

    return Object.values(grouped).map((item: any) => {
      const mapping = mappings[item.accountId];
      const spend = item.spend || 0;
      const purchaseValue = item.purchaseValue || 0;
      const roas = spend > 0 ? purchaseValue / spend : 0;

      return {
        ...item,
        project: mapping?.project || "未分配",
        store: mapping?.store || "未分配",
        owner: mapping?.owner || "未分配",
        roas,
        hasMapping: !!mapping
      };
    }).filter((item: any) => item.spend > 0);
  }, [rawInsights, mappings]);

  const projects = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];
    return [
      "all",
      ...Array.from(new Set(safeData.map((d) => d.project).filter(Boolean))),
    ].sort();
  }, [data]);
  const stores = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];
    const storeSpends: Record<string, number> = {};
    safeData.forEach((d) => {
      if (d.store) {
        storeSpends[d.store] = (storeSpends[d.store] || 0) + (d.spend || 0);
      }
    });
    const activeList = Array.from(new Set(safeData.map((d) => d.store).filter(Boolean)))
      .filter((storeName) => (storeSpends[storeName] || 0) > 0);
    return [
      "all",
      ...activeList,
    ].sort();
  }, [data]);
  const owners = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];
    return [
      "all",
      ...Array.from(new Set(safeData.map((d) => d.owner).filter(Boolean))),
    ].sort();
  }, [data]);

  const filteredData = useMemo(() => {
    const safeData = Array.isArray(data) ? data : [];
    const filtered = safeData.filter((item) => {
      const matchProject =
        projectFilter === "all" || item.project === projectFilter;
      const matchStore = storeFilter === "all" || item.store === storeFilter;
      const matchOwner = ownerFilter === "all" || item.owner === ownerFilter;
      return matchProject && matchStore && matchOwner;
    });

    if (!sortConfig) return filtered;

    return [...filtered].sort((a, b) => {
      const aValue = a[sortConfig.key] || "";
      const bValue = b[sortConfig.key] || "";
      if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [data, projectFilter, storeFilter, ownerFilter, sortConfig]);

  const totals = useMemo(() => {
    const safeData = Array.isArray(filteredData) ? filteredData : [];
    return safeData.reduce(
      (acc, curr) => {
        acc.spend += curr.spend || 0;
        acc.purchaseValue += curr.purchaseValue || 0;
        return acc;
      },
      { spend: 0, purchaseValue: 0 },
    );
  }, [filteredData]);

  const totalRoas = totals.spend > 0 ? totals.purchaseValue / totals.spend : 0;

  const handleExport = () => {
    const exportData = filteredData.map((item) => ({
      项目: item.project,
      店铺: item.store,
      负责人: item.owner,
      广告账户: item.accountName,
      已花费金额: `$${item.spend.toFixed(2)}`,
      购物转化价值: `$${item.purchaseValue.toFixed(2)}`,
      ROAS: item.roas.toFixed(2),
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Category Insights");
    XLSX.writeFile(
      wb,
      `Category_Insights_${format(new Date(), "yyyyMMdd")}.xlsx`,
    );
    toast.success("导出成功！");
  };

  return (
    <div className="flex-grow flex flex-col space-y-4">
      <div className="bg-white p-[16px] rounded-[12px] flex flex-wrap items-center gap-[12px] shadow-sm">
        <div className="flex items-center gap-2">
          <div className="relative">
            <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-meta-text-muted z-10" />
            <Popover>
              <PopoverTrigger className="pl-8 pr-3 py-2 border border-[#e5e7eb] rounded-[6px] text-[13px] w-[140px] text-left bg-white flex items-center font-normal">
                {startDate ? format(startDate, "yyyy-MM-dd") : "开始日期"}
              </PopoverTrigger>
              <PopoverContent
                className="w-auto p-0"
                align="start"
                sideOffset={8}
              >
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={(day) => {
                    if (day) {
                      setStartDate(day);
                    }
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <span className="text-meta-text-muted text-[13px]">至</span>
          <div className="relative">
            <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-meta-text-muted z-10" />
            <Popover>
              <PopoverTrigger className="pl-8 pr-3 py-2 border border-[#e5e7eb] rounded-[6px] text-[13px] w-[140px] text-left bg-white flex items-center font-normal">
                {endDate ? format(endDate, "yyyy-MM-dd") : "结束日期"}
              </PopoverTrigger>
              <PopoverContent
                className="w-auto p-0"
                align="start"
                sideOffset={8}
              >
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

        <div className="h-4 w-px bg-gray-200 mx-2"></div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-[12px] text-gray-500 whitespace-nowrap">
              项目:
            </span>
            <select
              className="border border-[#e5e7eb] rounded-[6px] text-[13px] px-2 py-1 bg-white outline-none focus:border-meta-blue"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
            >
              {projects.map((p) => (
                <option key={p} value={p}>
                  {p === "all" ? "全部" : p}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[12px] text-gray-500 whitespace-nowrap">
              店铺:
            </span>
            <select
              className="border border-[#e5e7eb] rounded-[6px] text-[13px] px-2 py-1 bg-white outline-none focus:border-meta-blue"
              value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value)}
            >
              {stores.map((s) => (
                <option key={s} value={s}>
                  {s === "all" ? "全部" : s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[12px] text-gray-500 whitespace-nowrap">
              负责人:
            </span>
            <select
              className="border border-[#e5e7eb] rounded-[6px] text-[13px] px-2 py-1 bg-white outline-none focus:border-meta-blue"
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
            >
              {owners.map((o) => (
                <option key={o} value={o}>
                  {o === "all" ? "全部" : o}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex-grow"></div>
        <Button
          variant="outline"
          className="h-9 px-4 rounded-[6px] border-[#e5e7eb] text-[13px] text-[#374151] hover:bg-gray-50"
          onClick={onManageAccounts}
        >
          <Settings className="w-4 h-4 mr-2" />
          添加分组
        </Button>
        <Button
          variant="outline"
          className="h-9 px-4 rounded-[6px] border-[#e5e7eb] text-[13px] text-[#374151]"
          onClick={handleExport}
        >
          <Download className="w-4 h-4 mr-2" />
          导出看板数据
        </Button>
      </div>

      <Card className="border-none shadow-sm rounded-[12px] flex-grow flex flex-col overflow-hidden bg-white">
        <div className="px-[16px] py-[12px] border-b border-meta-bg font-semibold text-[14px] flex justify-between items-center">
          <span>项目类别融合看板</span>
          <span className="text-[12px] font-normal text-gray-500">
            已显示 {filteredData.length} 条记录
          </span>
        </div>
        <div className="flex-grow overflow-auto relative">
          <Table className="text-[12px] relative">
            <TableHeader className="sticky top-0 z-20 bg-[#f9fafb]">
              <TableRow>
                <TableHead className="font-semibold text-[#374151] cursor-pointer hover:bg-gray-100" onClick={() => requestSort('project')}>
                  <div className="flex items-center gap-1">
                    项目 <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === 'project' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                  </div>
                </TableHead>
                <TableHead className="font-semibold text-[#374151] cursor-pointer hover:bg-gray-100" onClick={() => requestSort('store')}>
                  <div className="flex items-center gap-1">
                    店铺 <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === 'store' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                  </div>
                </TableHead>
                <TableHead className="font-semibold text-[#374151] cursor-pointer hover:bg-gray-100" onClick={() => requestSort('owner')}>
                  <div className="flex items-center gap-1">
                    负责人 <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === 'owner' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                  </div>
                </TableHead>
                <TableHead className="font-semibold text-[#374151] cursor-pointer hover:bg-gray-100" onClick={() => requestSort('accountName')}>
                  <div className="flex items-center gap-1">
                    广告账户 <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === 'accountName' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                  </div>
                </TableHead>
                <TableHead className="font-semibold text-[#374151] cursor-pointer hover:bg-gray-100" onClick={() => requestSort('spend')}>
                  <div className="flex items-center gap-1">
                    已花费金额 <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === 'spend' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                  </div>
                </TableHead>
                <TableHead className="font-semibold text-[#374151] cursor-pointer hover:bg-gray-100" onClick={() => requestSort('purchaseValue')}>
                  <div className="flex items-center gap-1">
                    购物转化价值 <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === 'purchaseValue' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                  </div>
                </TableHead>
                <TableHead className="font-semibold text-[#374151] cursor-pointer hover:bg-gray-100" onClick={() => requestSort('roas')}>
                  <div className="flex items-center gap-1">
                    ROAS <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === 'roas' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="h-32 text-center text-meta-text-grey animate-pulse"
                  >
                    正在融合处理数据...
                  </TableCell>
                </TableRow>
              ) : filteredData.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="h-32 text-center text-meta-text-grey"
                  >
                    无匹配条件的消费记录
                  </TableCell>
                </TableRow>
              ) : (
                filteredData.map((item, idx) => (
                  <TableRow
                    key={`${item.accountId}-${idx}`}
                    className="hover:bg-gray-50 border-b border-[#f3f4f6]"
                  >
                    <TableCell className="font-medium text-meta-blue">
                      {item.project}
                    </TableCell>
                    <TableCell 
                      className="text-blue-600 font-medium cursor-pointer"
                      onClick={() => navigate(`/store/${encodeURIComponent(item.store)}`)}
                    >
                      {item.store}
                    </TableCell>
                    <TableCell className="text-gray-600">
                      {item.owner}
                    </TableCell>
                    <TableCell
                      className="text-gray-500 font-mono text-[11px] truncate max-w-[150px]"
                      title={item.accountName}
                    >
                      <button
                        onClick={() => navigate(`/account/${item.accountId}`)}
                        className="hover:text-blue-600 hover:underline text-left outline-none"
                      >
                        {item.accountName}
                      </button>
                    </TableCell>
                    <TableCell className="font-medium font-mono">
                      $
                      {(item.spend || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </TableCell>
                    <TableCell className="font-medium font-mono text-green-600">
                      $
                      {(item.purchaseValue || 0).toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </TableCell>
                    <TableCell className="font-bold text-meta-blue">
                      {item.roas.toFixed(2)}x
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            {filteredData.length > 0 && !loading && (
              <tfoot className="bg-gray-100 font-bold sticky bottom-0 z-20 border-t-2 border-gray-200">
                <TableRow className="hover:bg-gray-100">
                  <TableCell
                    colSpan={4}
                    className="py-4 text-right pr-6 text-[14px]"
                  >
                    总计 (Total):
                  </TableCell>
                  <TableCell className="py-4 text-gray-900 text-[14px] font-bold font-mono">
                    $
                    {(totals.spend || 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </TableCell>
                  <TableCell className="py-4 text-green-600 text-[14px] font-bold font-mono">
                    $
                    {(totals.purchaseValue || 0).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </TableCell>
                  <TableCell className="py-4 text-meta-blue text-[14px] font-bold">
                    {totalRoas.toFixed(2)}x
                  </TableCell>
                </TableRow>
              </tfoot>
            )}
          </Table>
        </div>
      </Card>
    </div>
  );
}

function MetricCard({
  title,
  value,
  subValue,
}: {
  title: string;
  value: string;
  subValue: string;
}) {
  return (
    <Card className="bg-white p-[16px] rounded-[12px] shadow-[0_1px_3px_rgba(0,0,0,0.1)] border-none">
      <div className="text-[12px] text-meta-text-grey mb-[4px]">{title}</div>
      <div className="text-[22px] font-bold text-meta-dark mb-1">{value}</div>
      <div className="text-[10px] text-meta-text-muted flex items-center gap-1 uppercase tracking-wider">
        <TrendingUp className="w-3 h-3 text-green-500" />
        {subValue}
      </div>
    </Card>
  );
}
