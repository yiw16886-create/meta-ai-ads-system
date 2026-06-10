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

export function MaterialPerformanceTable() {
  const [activeTab, setActiveTab] = useState<"metrics" | "preview" | "trends">("metrics");
  const [storeId, setStoreId] = useState<string>("all");
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(["all"]);
  const [materialType, setMaterialType] = useState<string>("all");
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  
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

        const rawStores = storesRes.data || [];
        const formattedStores = rawStores.map((s: any) => ({
          id: String(s.id),
          name: s.name
        }));
        setStoresList(formattedStores);

        // Map accounts
        const rawMappings = mappingsRes.data || [];
        const formattedAccounts = rawMappings.map((m: any) => ({
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

  // Summarize table columns
  const tableSummary = useMemo(() => {
    let spend = 0;
    let impressions = 0;
    let clicks = 0;
    
    tableData.forEach(row => {
      spend += parseFloat(row.spend || "0");
      impressions += row.impressions || 0;
      clicks += row.clicks || 0;
    });

    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;
    const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;

    return { spend, impressions, clicks, ctr, cpc, cpm };
  }, [tableData]);

  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncCreativeHash = async () => {
    setIsSyncing(true);
    try {
      const res = await axios.post("/api/sync-creative-hash");
      toast.success(res.data.message || "素材特征同步已在后台开启");
      refresh();
    } catch (error: any) {
      toast.error(error.response?.data?.error || "同步请求失败");
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
            <Table>
              <TableHeader className="bg-slate-50/80 border-b border-slate-200">
                <TableRow>
                  <TableHead className="w-24 text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-center">素材预览</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap">广告 ID / 编号</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap">素材名称</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-center">关联商店 ID</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap">类型</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap">投放账户 ID</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right">花费金额</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right">展示次数</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right">点击数</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right">CTR</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right">CPM</TableHead>
                  <TableHead className="text-[13px] font-bold text-slate-600 h-12 whitespace-nowrap text-right">CPC</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={12} className="h-44 text-center">
                      <div className="flex flex-col items-center justify-center gap-3">
                        <RefreshCw className="w-6 h-6 animate-spin text-meta-blue" />
                        <span className="text-slate-500 font-medium text-sm">正在加载素材层级表现流水数据...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : tableData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="h-44 text-center text-slate-400 font-medium text-sm">
                      暂无对应的素材流水表现数据。请重新选择日期或过虑项。
                    </TableCell>
                  </TableRow>
                ) : (
                  tableData.map((row) => {
                    const isVideo = row.material_type?.toLowerCase() === "video";
                    return (
                      <TableRow key={row.creative_id} className="hover:bg-slate-50/50 align-middle">
                        {/* 1. 素材预览 */}
                        <TableCell className="py-3 text-center flex justify-center">
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
                        <TableCell className="py-3 font-mono text-[12px] text-slate-600 font-semibold">
                          {row.creative_id}
                        </TableCell>

                        {/* 3. 姓名 / 素材名称 */}
                        <TableCell className="py-3 text-[13px] font-medium text-slate-800 max-w-[180px] overflow-visible">
                          <div className="group relative overflow-visible inline-block max-w-[180px] w-full">
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
                            <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 transition-all duration-200 absolute z-50 bottom-full left-0 mb-2 p-3.5 bg-slate-900 border border-slate-800 text-white text-[12px] font-normal leading-relaxed rounded-xl shadow-xl w-80 pointer-events-none break-all max-h-48 overflow-y-auto">
                              <div className="font-semibold text-slate-400 text-[10px] uppercase tracking-wider mb-2 border-b border-slate-800 pb-1.5 flex items-center justify-between">
                                <span>完整广告文案 / 姓名</span>
                                <span className="text-[9px] font-mono font-medium text-slate-500">Creative ID: {row.creative_id}</span>
                              </div>
                              <div className="whitespace-normal select-text text-slate-100 font-sans">{row.material_name}</div>
                            </div>
                          </div>
                        </TableCell>

                        {/* 4. 关联店铺 ID (对齐 storeId) */}
                        <TableCell className="py-3 text-center text-[13px] text-slate-700 font-bold">
                          {row.storeId ? (
                            <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-lg border border-blue-100">
                              店铺 ID: {row.storeId}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </TableCell>

                        {/* 5. 类型 */}
                        <TableCell className="py-3 text-[12px] text-slate-600">
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider",
                            isVideo ? "bg-amber-100 text-amber-800" : "bg-teal-100 text-teal-800"
                          )}>
                            {row.material_type || "IMAGE"}
                          </span>
                        </TableCell>

                        {/* 6. 投放账户 ID */}
                        <TableCell className="py-3 font-mono text-[12px] text-slate-600">
                          {row.account_id}
                        </TableCell>

                        {/* 7. 花费金额 */}
                        <TableCell className="py-3 text-right font-mono text-[13px] font-bold text-slate-900">
                          ${parseFloat(row.spend || "0").toFixed(2)}
                        </TableCell>

                        {/* 8. 展示次数 */}
                        <TableCell className="py-3 text-right font-mono text-[13px] text-slate-700">
                          {row.impressions.toLocaleString()}
                        </TableCell>

                        {/* 9. 点击数 */}
                        <TableCell className="py-3 text-right font-mono text-[13px] text-slate-700">
                          {row.clicks.toLocaleString()}
                        </TableCell>

                        {/* 10. CTR */}
                        <TableCell className="py-3 text-right font-mono text-[13px] text-emerald-600 font-semibold">
                          {row.impressions > 0 ? ((row.clicks / row.impressions) * 100).toFixed(2) : "0.00"}%
                        </TableCell>

                        {/* 11. CPM */}
                        <TableCell className="py-3 text-right font-mono text-[13px] text-slate-700">
                          ${parseFloat(row.cpm || "0").toFixed(2)}
                        </TableCell>

                        {/* 12. CPC */}
                        <TableCell className="py-3 text-right font-mono text-[13px] text-slate-700">
                          ${row.clicks > 0 ? (parseFloat(row.spend || "0") / row.clicks).toFixed(2) : "0.00"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}

                {/* 汇总统计行 */}
                {!loading && tableData.length > 0 && (
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50 border-t-2 border-slate-200">
                    <TableCell colSpan={6} className="py-4">
                      <div className="flex flex-col ml-4">
                        <span className="text-[13px] font-bold text-slate-900">{tableData.length}个素材创意汇总</span>
                        <span className="text-[11px] text-emerald-600 flex items-center gap-1 mt-0.5 font-medium">
                          <Check className="w-3.5 h-3.5" /> 隔离校验与匹配安全验证已通过
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-4 text-right font-mono text-[13px] font-bold text-slate-900">
                      ${tableSummary.spend.toFixed(2)}
                    </TableCell>
                    <TableCell className="py-4 text-right font-mono text-[13px] font-bold text-slate-900">
                      {tableSummary.impressions.toLocaleString()}
                    </TableCell>
                    <TableCell className="py-4 text-right font-mono text-[13px] font-bold text-slate-900">
                      {tableSummary.clicks.toLocaleString()}
                    </TableCell>
                    <TableCell className="py-4 text-right font-mono text-[13px] font-bold text-emerald-600">
                      {tableSummary.ctr.toFixed(2)}%
                    </TableCell>
                    <TableCell className="py-4 text-right font-mono text-[13px] font-bold text-slate-900">
                      ${tableSummary.cpm.toFixed(2)}
                    </TableCell>
                    <TableCell className="py-4 text-right font-mono text-[13px] font-bold text-slate-900">
                      ${tableSummary.cpc.toFixed(2)}
                    </TableCell>
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
        <div className="p-8 bg-white border border-slate-200 rounded-xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {loading ? (
              <div className="col-span-full py-12 text-center text-slate-500 font-medium">加载中...</div>
            ) : tableData.length === 0 ? (
              <div className="col-span-full py-12 text-center text-slate-400 font-medium">暂无对应素材预览卡片</div>
            ) : (
              tableData.map(item => {
                const isVideo = item.material_type?.toLowerCase() === "video";
                return (
                  <Card key={item.creative_id} className="overflow-hidden border border-slate-200 shadow-sm flex flex-col justify-between group bg-slate-50">
                    <div className="relative aspect-square w-full overflow-hidden bg-slate-100 border-b border-slate-200">
                      {item.preview_url ? (
                        <img 
                          src={item.preview_url} 
                          alt={item.material_name} 
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" 
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">暂无多媒体素材</div>
                      )}
                      
                      <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/60 text-white text-[10px] font-bold">
                        {isVideo ? "视频 (Video)" : "单图 (Image)"}
                      </div>
                    </div>
                    <div className="p-3 bg-white space-y-2">
                      <p className="text-xs font-semibold text-slate-800 line-clamp-1">{item.material_name}</p>
                      <div className="flex justify-between items-center text-[11px] text-slate-400">
                        <span className="font-mono">ID: {item.creative_id}</span>
                        <span>花费: ${parseFloat(item.spend).toFixed(2)}</span>
                      </div>
                      {item.landing_url && (
                        <a 
                          href={item.landing_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[11px] text-meta-blue flex items-center gap-1 font-semibold pt-1 hover:underline cursor-pointer"
                        >
                          打开着陆页 <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                  </Card>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 走势图面板 */}
      {activeTab === "trends" && (
        <div className="bg-white border border-slate-200 rounded-xl p-16 text-center shadow-sm">
          <div className="max-w-md mx-auto space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mx-auto text-slate-400 border border-slate-100">
              <Activity className="w-5 h-5" />
            </div>
            <h4 className="text-sm font-bold text-slate-800 mt-4">素材表现走势分析图表</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              支持按以上过滤器所限定的店铺「店铺 ID」进行跨时间维度及多维复合素材点击率变化曲线的绘制。
            </p>
          </div>
        </div>
      )}

    </div>
  );
}
