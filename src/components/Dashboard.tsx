import React, { useState, useEffect, useMemo } from "react";
import { format, subDays } from "date-fns";
import axios from "axios";
import { useNavigate } from "react-router-dom";
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
} from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
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
  const [currentTab, setCurrentTab] = useState<
    "dashboard" | "settings" | "category" | "accounts"
  >("dashboard");
  const [startDate, setStartDate] = useState<Date>(subDays(new Date(), 7));
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [search, setSearch] = useState("");
  const [data, setData] = useState<AdInsight[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
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
      const response = await axios.get("/api/insights", {
        params: {
          startDate: format(startDate, "yyyy-MM-dd"),
          endDate: format(endDate, "yyyy-MM-dd"),
        },
      });
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
          !curr.accountName?.toLowerCase()?.includes(search.toLowerCase())
        ) {
          return acc;
        }
        const key = curr.accountId;
        if (!acc[key]) {
          acc[key] = {
            ...curr,
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
      {} as Record<string, AdInsight>,
    );

    return Object.values(grouped).map((item) => ({
      ...item,
      cpc: item.clicks > 0 ? item.spend / item.clicks : 0,
      ctr: item.impressions > 0 ? (item.clicks / item.impressions) * 100 : 0,
      atcRate: item.clicks > 0 ? (item.addToCart / item.clicks) * 100 : 0,
      checkoutRate:
        item.clicks > 0 ? (item.initiateCheckout / item.clicks) * 100 : 0,
      cpp: item.purchases > 0 ? item.spend / item.purchases : 0,
      roas: item.spend > 0 ? item.purchaseValue / item.spend : 0,
    }));
  }, [data, search]);

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
    const exportData = sortedAggregatedData.map((item) => ({
      帐户名称: item.accountName,
      抵达: item.reach,
      印象: item.impressions,
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
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ad Insights");
    XLSX.writeFile(wb, `Meta_Ads_Data_${format(new Date(), "yyyyMMdd")}.xlsx`);
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
          {[
            { id: "dashboard", icon: LayoutDashboard, label: "总览看板" },
            { id: "category", icon: LayoutGrid, label: "项目类别看板" },
            { id: "accounts", icon: Settings, label: "账户管理" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id as any)}
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
          <button
            onClick={() => setCurrentTab("settings")}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-[8px] text-[14px] transition-colors cursor-pointer",
              currentTab === "settings"
                ? "bg-meta-nav text-white"
                : "text-meta-text-muted hover:text-white hover:bg-meta-nav",
            )}
          >
            <Settings className="w-4 h-4" />
            系统设置
          </button>
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
            <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-[10px]">
              ADMIN
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-[12px] font-medium truncate">Admin User</p>
            </div>
          </div>
        </div>
      </aside>
      <main className="flex-1 ml-[200px] p-[24px] overflow-x-hidden flex flex-col h-screen box-border">
        {currentTab === "dashboard" ? (
          <>
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
                        onSelect={(day) => day && setStartDate(day)}
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
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-meta-text-muted" />
                <Input
                  placeholder="搜索账户名称"
                  className="pl-10 h-9 rounded-[6px] border-[#e5e7eb] text-[13px]"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
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
            </div>
            <div className="grid grid-cols-4 gap-[16px] mb-[20px]">
              <MetricCard
                title="总支出消耗"
                value={`$${totals.spend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                subValue="投放消耗金额"
              />
              <MetricCard
                title="总转化价值"
                value={`$${totals.purchaseValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                subValue="全渠道营收"
              />
              <MetricCard
                title="平均 ROI"
                value={`${avgRoi.toFixed(2)}x`}
                subValue="广告投资回报"
              />
              <MetricCard
                title="总成效"
                value={totals.purchases.toLocaleString()}
                subValue="购买转化次数"
              />
            </div>
            <Card className="border-none shadow-[0_1px_3px_rgba(0,0,0,0.1)] rounded-[12px] flex-grow flex flex-col overflow-hidden bg-white">
              <div className="px-[16px] py-[12px] border-b border-meta-bg flex items-center justify-between">
                <span className="font-semibold text-[14px] text-meta-dark">
                  广告账户详情明细
                </span>
                <Button
                  variant="outline"
                  className="h-[32px] px-3 rounded-[6px] border-[#e5e7eb] text-[12px] text-[#374151]"
                  onClick={handleExport}
                >
                  <Download className="w-3.5 h-3.5 mr-2" />
                  导出报表
                </Button>
              </div>
              <div className="flex-grow overflow-hidden flex flex-col">
                <div className="flex-grow w-full overflow-auto max-h-[650px] relative border-b">
                  <Table className="text-[12px] w-max-content border-collapse relative">
                    <TableHeader className="sticky top-0 z-20 shadow-[0_1px_0_rgba(0,0,0,0.05)]">
                      <TableRow className="bg-[#f9fafb] hover:bg-[#f9fafb]">
                    <TableHead 
                      className="w-[180px] sticky left-0 top-0 z-30 bg-[#f9fafb] border-r-2 border-[#e5e7eb] font-semibold text-[#374151] h-11 px-4 cursor-pointer hover:bg-gray-100"
                      onClick={() => requestSort("accountName")}
                    >
                      <div className="flex items-center gap-1">
                        帐户名称 <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === 'accountName' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                      </div>
                    </TableHead>
                    <TableHead 
                      className="px-4 text-[#374151] font-semibold h-11 whitespace-nowrap sticky top-0 bg-[#f9fafb] cursor-pointer hover:bg-gray-100"
                      onClick={() => requestSort("reach")}
                    >
                      <div className="flex items-center gap-1">
                        抵达 <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === 'reach' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                      </div>
                    </TableHead>
                    <TableHead 
                      className="px-4 text-[#374151] font-semibold h-11 whitespace-nowrap sticky top-0 bg-[#f9fafb] cursor-pointer hover:bg-gray-100"
                      onClick={() => requestSort("impressions")}
                    >
                      <div className="flex items-center gap-1">
                        印象 <ArrowUpDown className={`w-3 h-3 ${sortConfig?.key === 'impressions' ? 'text-meta-blue' : 'text-gray-300'}`}/>
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
                            key={item.accountId}
                            className="hover:bg-gray-50 transition-colors border-b border-[#f3f4f6]"
                          >
                            <TableCell className="sticky left-0 z-10 bg-white border-r-2 border-[#f3f4f6] px-4 py-[10px] whitespace-nowrap font-medium text-meta-dark">
                              <button
                                onClick={() => navigate(`/account/${item.accountId}`)}
                                className="hover:text-blue-600 hover:underline text-left outline-none"
                              >
                                {item.accountName}
                              </button>
                            </TableCell>
                            <TableCell className="px-4 py-[10px] whitespace-nowrap text-[#374151]">
                              {item.reach.toLocaleString()}
                            </TableCell>
                            <TableCell className="px-4 py-[10px] whitespace-nowrap text-[#374151]">
                              {item.impressions.toLocaleString()}
                            </TableCell>
                            <TableCell className="px-4 py-[10px] whitespace-nowrap text-[#374151]">
                              {item.clicks.toLocaleString()}
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
                              {item.addToCart.toLocaleString()}
                            </TableCell>
                            <TableCell className="px-4 py-[10px] whitespace-nowrap text-[#374151]">
                              {item.atcRate.toFixed(2)}%
                            </TableCell>
                            <TableCell className="px-4 py-[10px] whitespace-nowrap text-[#374151]">
                              {item.initiateCheckout.toLocaleString()}
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
        ) : currentTab === "category" ? (
          <CategoryDashboard mappings={mappings} />
        ) : currentTab === "accounts" ? (
          <AccountManagementPage mappings={mappings} onMappingsChange={syncMappingsToDb} />
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
          const accountId = row["账户ID"]?.toString();
          if (accountId) {
            newMappings[accountId] = {
              accountId,
              accountName: row["账户名称"] || "",
              project: row["项目"] || "",
              store: row["店铺"] || "",
              owner: row["负责人"] || "",
            };
            count++;
          }
        });

        if (count > 0) {
          await onMappingsChange(newMappings);
          toast.success(`成功导入 ${count} 条账户映射记录！已同步到服务器。`);
        } else {
          toast.error(
            "未在文件中找到有效的映射数据（请检查列名：账户ID, 项目, 店铺, 负责人）",
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

function SettingsPage() {
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        const settingsRes = await axios.get("/api/settings");
        if (settingsRes.data.META_ACCESS_TOKEN) {
          setToken(settingsRes.data.META_ACCESS_TOKEN);
        }
      } catch (err) {
        toast.error("加载设置失败");
      } finally {
        setFetching(false);
      }
    };
    init();
  }, []);

  const handleSaveToken = async () => {
    setLoading(true);
    try {
      await axios.post("/api/settings", {
        key: "META_ACCESS_TOKEN",
        value: token,
      });
      toast.success("配置已保存");
    } catch (err: any) {
      toast.error(err.response?.data?.error || "保存失败");
    } finally {
      setLoading(false);
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
      <Card className="border-none shadow-sm rounded-[12px]">
        <CardHeader>
          <CardTitle className="text-xl">系统核心参数配置</CardTitle>
          <p className="text-sm text-meta-text-muted">
            Meta API 访问令牌将持久化存储在服务器数据库中，优先级高于环境变量
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Meta Access Token (EAAP...)
            </label>
            <div className="flex gap-4">
              <Input
                type="password"
                placeholder="请输入您的长效访问令牌"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="flex-1 h-11"
              />
              <Button
                onClick={handleSaveToken}
                className="bg-meta-blue hover:bg-blue-600 px-8 h-11"
                disabled={loading}
              >
                {loading ? (
                  <RefreshCcw className="animate-spin w-4 h-4 mr-2" />
                ) : (
                  "保存配置"
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm rounded-[12px]">
        <CardHeader className="border-b pb-4">
          <CardTitle className="text-xl">
            如何获取 60 天长效 Meta Token？
          </CardTitle>
          <p className="text-sm text-meta-text-muted">
            请严格按照以下步骤操作，以确保数据同步功能的稳定性
          </p>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-8">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-meta-blue/10 text-meta-blue flex items-center justify-center font-bold text-sm shrink-0">
                1
              </div>
              <div>
                <h4 className="font-bold mb-1">访问 Meta Graph API Explorer</h4>
                <p className="text-sm text-meta-text-muted mb-2">
                  进入开发者工具面板进行初步授权
                </p>
                <a
                  href="https://developers.facebook.com/tools/explorer/"
                  target="_blank"
                  rel="noreferrer"
                  className="text-meta-blue hover:underline text-sm font-medium inline-flex items-center gap-1"
                >
                  点击访问 Graph API Explorer{" "}
                  <ChevronRight className="w-3 h-3" />
                </a>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-meta-blue/10 text-meta-blue flex items-center justify-center font-bold text-sm shrink-0">
                2
              </div>
              <div>
                <h4 className="font-bold mb-1">选择权限并生成口令</h4>
                <p className="text-sm text-meta-text-muted">
                  在右侧 Permissions 框中搜索并勾选{" "}
                  <code className="bg-gray-100 px-1 rounded text-red-500">
                    ads_read
                  </code>{" "}
                  和{" "}
                  <code className="bg-gray-100 px-1 rounded text-red-500">
                    read_insights
                  </code>
                  ，然后点击{" "}
                  <span className="font-bold text-gray-800">
                    Generate Access Token
                  </span>
                  。
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-meta-blue/10 text-meta-blue flex items-center justify-center font-bold text-sm shrink-0">
                3
              </div>
              <div>
                <h4 className="font-bold mb-1">进入访问口令工具</h4>
                <p className="text-sm text-meta-text-muted">
                  点击 Token 字符串旁边的蓝色{" "}
                  <span className="text-meta-blue font-bold">i</span>{" "}
                  图标，在弹出的小窗中点击底部的{" "}
                  <span className="font-bold">Open in Access Token Tool</span>。
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-meta-blue/10 text-meta-blue flex items-center justify-center font-bold text-sm shrink-0">
                4
              </div>
              <div>
                <h4 className="font-bold mb-1">延长访问口令</h4>
                <p className="text-sm text-meta-text-muted">
                  在跳转后的新页面底部，找到{" "}
                  <span className="font-bold text-blue-600">
                    Extend Access Token
                  </span>{" "}
                  蓝色按钮并点击，您将获得一个有效期为 60 天的长效令牌。
                </p>
              </div>
            </div>
            <div className="flex gap-4 py-4 bg-yellow-50 rounded-lg px-4 border border-yellow-100">
              <div className="w-8 h-8 rounded-full bg-yellow-100 text-yellow-700 flex items-center justify-center font-bold text-sm shrink-0">
                5
              </div>
              <div>
                <h4 className="font-bold mb-1 text-yellow-800">复制并保存</h4>
                <p className="text-sm text-yellow-700">
                  复制生成的以{" "}
                  <span className="font-mono bg-white px-1">EAAP</span>{" "}
                  开头的长字符串，粘贴到本页上方的输入框中，最后点击{" "}
                  <span className="font-bold">保存配置</span>。
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CategoryDashboard({ mappings }: { mappings: Record<string, any> }) {
  const navigate = useNavigate();
  const [startDate, setStartDate] = useState<Date>(subDays(new Date(), 7));
  const [endDate, setEndDate] = useState<Date>(new Date());
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
      };
    });
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
    return [
      "all",
      ...Array.from(new Set(safeData.map((d) => d.store).filter(Boolean))),
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
                  onSelect={(day) => day && setStartDate(day)}
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
                    <TableCell className="text-gray-600">
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
                      {item.spend.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </TableCell>
                    <TableCell className="font-medium font-mono text-green-600">
                      $
                      {item.purchaseValue.toLocaleString(undefined, {
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
                    {totals.spend.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </TableCell>
                  <TableCell className="py-4 text-green-600 text-[14px] font-bold font-mono">
                    $
                    {totals.purchaseValue.toLocaleString(undefined, {
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
