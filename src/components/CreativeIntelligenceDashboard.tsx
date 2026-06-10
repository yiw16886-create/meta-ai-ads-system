import React, { useState, useMemo } from "react";
import axios from "axios";
import { toast } from "sonner";
import { 
  Sparkles, 
  Calendar as CalendarIcon, 
  Download, 
  RefreshCw, 
  BarChart2, 
  Eye, 
  Activity,
  Layers,
  Search,
  Filter,
  Check,
  DownloadCloud
} from "lucide-react";
import { format } from "date-fns";
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

export function CreativeIntelligenceDashboard({ 
  data = [], 
  startDate, 
  endDate,
  onStartDateChange,
  onEndDateChange,
}: { 
  data?: any[], 
  startDate?: Date, 
  endDate?: Date,
  onStartDateChange?: (date: Date) => void,
  onEndDateChange?: (date: Date) => void,
}) {
  const [activeTab, setActiveTab] = useState<"metrics" | "preview" | "trends">("metrics");
  const [creativeType, setCreativeType] = useState<string>("all");
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(["all"]);
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Mocked filtering options based on expected usage
  const creativeTypes = [
    { value: "all", label: "全部" },
    { value: "image", label: "单图 (Image)" },
    { value: "video", label: "视频 (Video)" },
    { value: "carousel", label: "轮播 (Carousel)" }
  ];

  const [storesList, setStoresList] = useState<{value: string, label: string}[]>([{ value: "all", label: "全部" }]);
  const [availableAccounts, setAvailableAccounts] = useState<{value: string, label: string, storeName: string}[]>([{ value: "all", label: "全部", storeName: "all" }]);

  React.useEffect(() => {
    const fetchStores = async () => {
      try {
        const { data } = await axios.get("/api/mappings");
        
        const storeSet = new Set<string>();
        const newAccounts = [{ value: "all", label: "全部", storeName: "all" }];
        
        data.forEach((m: any) => {
          if (m.store && m.store !== "未分配") {
            storeSet.add(m.store);
          }
          newAccounts.push({
             value: m.accountId,
             label: m.accountName || m.accountId,
             storeName: m.store || "未分配"
          });
        });
        
        const newStores = [{ value: "all", label: "全部" }];
        Array.from(storeSet).sort().forEach(s => {
          newStores.push({ value: s, label: s });
        });

        setStoresList(newStores);
        setAvailableAccounts(newAccounts);
      } catch (err) {
        console.error("Failed to load stores/accounts mapping", err);
      }
    };
    fetchStores();
  }, []);

  const filteredAccounts = useMemo(() => {
    if (storeFilter === "all") return availableAccounts;
    return availableAccounts.filter(a => a.value === "all" || a.storeName === storeFilter);
  }, [storeFilter, availableAccounts]);

  // Adjust selectedAccounts when store Filter changes, if selected account isn't in filteredAccounts anymore
  React.useEffect(() => {
    if (storeFilter !== "all" && !selectedAccounts.includes("all")) {
        const validIds = filteredAccounts.map(a => a.value);
        const newSelected = selectedAccounts.filter(id => validIds.includes(id));
        if (newSelected.length === 0) {
            setSelectedAccounts(["all"]);
        } else if (newSelected.length !== selectedAccounts.length) {
            setSelectedAccounts(newSelected);
        }
    }
  }, [storeFilter, filteredAccounts, selectedAccounts]);



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
      newSelected = ["all"]; // default fallback
    }
    setSelectedAccounts(newSelected);
  };

  const [creativeData, setCreativeData] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchCreativeData = async () => {
    if (!startDate || !endDate) return;
    setIsLoading(true);
    try {
      const res = await axios.get("/api/intelligence/creatives", {
        params: {
          startDate: format(startDate, 'yyyy-MM-dd'),
          endDate: format(endDate, 'yyyy-MM-dd'),
          storeFilter: storeFilter
        }
      });
      // The API streams chunks but Axios will reassemble it if we let it
      // if it's chunked, res.data might be string or parsed.
      const parsedData = typeof res.data === 'string' ? JSON.parse(res.data) : res.data;
      setCreativeData(parsedData || []);
      toast.success("素材数据已刷新");
    } catch (e: any) {
      toast.error("加载素材数据失败");
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    fetchCreativeData();
  }, [startDate, endDate, storeFilter]);

  const filteredTableData = useMemo(() => {
    return creativeData.filter(item => {
      // Filter by search query
      if (searchQuery.trim() !== "") {
        const query = searchQuery.toLowerCase().trim();
        const matchesName = item.name && item.name.toLowerCase().includes(query);
        const matchesId = item.creativeId && item.creativeId.toLowerCase().includes(query);
        if (!matchesName && !matchesId) return false;
      }

      // Filter by account
      if (!selectedAccounts.includes("all")) {
        // Here selectedAccounts contain account IDs
        if (!selectedAccounts.includes(item.accountId)) {
           return false;
        }
      }
      
      // Filter by creative type
      if (creativeType !== "all") {
        const t = (item.type || "IMAGE").toLowerCase();
        if (creativeType === "image" && t !== "image") return false;
        if (creativeType === "video" && t !== "video") return false;
        if (creativeType === "carousel" && t !== "carousel") return false;
      }
      
      return true;
    });
  }, [creativeData, selectedAccounts, creativeType, searchQuery]);

  const tableSummary = useMemo(() => {
      let spend = 0;
      let purchaseValue = 0;
      let purchases = 0;
      let impressions = 0;
      let reach = 0;
      
      filteredTableData.forEach(r => {
          spend += r.spend || 0;
          purchaseValue += r.purchaseValue || 0;
          purchases += r.purchases || 0;
          impressions += r.impressions || 0;
          reach += r.reach || 0;
      });
      
      return { spend, purchaseValue, purchases, impressions, reach, roas: spend > 0 ? purchaseValue / spend : 0, cpp: purchases > 0 ? spend / purchases : 0 };
  }, [filteredTableData]);

  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncCreativeHash = async () => {
    setIsSyncing(true);
    try {
      const res = await axios.post("/api/sync-creative-hash");
      toast.success(res.data.message || "素材特征抓取已在后台开始运行");
    } catch (error: any) {
      toast.error(error.response?.data?.error || "同步请求失败");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      
      {/* 头部样式：参考图三 */}
      <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm flex flex-wrap items-center gap-4">
        {/* 日期选择 */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
            <Popover>
              <PopoverTrigger className="pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm w-[130px] text-left bg-white font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                {startDate ? format(startDate, "yyyy-MM-dd") : "开始日期"}
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={(day) => day && onStartDateChange && onStartDateChange(day)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          <span className="text-slate-400 font-medium text-sm">至</span>
          <div className="relative">
            <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
            <Popover>
              <PopoverTrigger className="pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm w-[130px] text-left bg-white font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                {endDate ? format(endDate, "yyyy-MM-dd") : "结束日期"}
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={(day) => day && onEndDateChange && onEndDateChange(day)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="w-px h-6 bg-slate-200 mx-2"></div>

        {/* 过滤项群 */}
        <div className="flex items-center gap-4 text-sm">
          {/* 店铺 (单选) */}
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">店铺:</span>
            <select
              value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-meta-blue focus:border-meta-blue font-medium text-slate-700 cursor-pointer min-w-[120px]"
            >
              {storesList.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          {/* 账户 (多选模拟 dropdown) */}
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">账户:</span>
            <Popover open={accountDropdownOpen} onOpenChange={setAccountDropdownOpen}>
              <PopoverTrigger className="px-3 py-2 bg-white border border-slate-200 rounded-lg font-medium text-slate-700 hover:bg-slate-50 transition-colors min-w-[120px] text-left flex items-center justify-between">
                <span className="truncate max-w-[120px]">
                  {selectedAccounts.includes("all") ? "全部" : `已选 (${selectedAccounts.length})`}
                </span>
              </PopoverTrigger>
              <PopoverContent className="w-[200px] p-2 max-h-[400px] overflow-y-auto" align="start">
                <div className="space-y-1">
                  {filteredAccounts.map(act => {
                    const isSelected = selectedAccounts.includes(act.value);
                    return (
                      <div 
                        key={act.value} 
                        className={cn(
                          "flex items-center justify-between px-2 py-1.5 rounded-md text-sm cursor-pointer hover:bg-slate-100",
                          isSelected && "bg-slate-50 text-meta-blue font-medium"
                        )}
                        onClick={() => toggleAccount(act.value)}
                        title={act.label}
                      >
                        <span className="truncate">{act.label}</span>
                        {isSelected && <Check className="shrink-0 w-4 h-4 text-meta-blue" />}
                      </div>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* 素材类型 (单选) */}
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">素材类型:</span>
            <select
              value={creativeType}
              onChange={(e) => setCreativeType(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-meta-blue focus:border-meta-blue font-medium text-slate-700 cursor-pointer min-w-[120px]"
            >
              {creativeTypes.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Tabs 样式：参考图二，加上底部卡片 */}
      <div className="space-y-4">
        <div className="flex bg-slate-50 p-1.5 rounded-xl border border-slate-200 mb-6 w-fit shadow-sm">
          <button
            onClick={() => setActiveTab("metrics")}
            className={`px-6 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center gap-2.5 cursor-pointer select-none ${
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
            className={`px-6 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center gap-2.5 cursor-pointer select-none ${
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
            className={`px-6 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center gap-2.5 cursor-pointer select-none ${
              activeTab === "trends" 
                ? "bg-white text-meta-blue shadow-[0_1px_3px_rgba(0,0,0,0.1)] border border-slate-200/60" 
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
            }`}
          >
            <Activity className="w-4 h-4" />
            素材走势图
          </button>
        </div>

        {/* --- Tab Contents --- */}
        {activeTab === "metrics" && (
          <Card className="border border-slate-200 rounded-xl overflow-hidden shadow-sm bg-white">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative w-[300px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="搜索名称 / 广告创意 ID" 
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-meta-blue transition-colors"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  className="text-sm h-9 gap-2 font-medium text-slate-700 bg-white border-slate-200 hover:bg-slate-50 hover:text-meta-blue transition-colors"
                  onClick={handleSyncCreativeHash}
                  disabled={isSyncing}
                >
                  <DownloadCloud className={cn("w-4 h-4", isSyncing && "animate-pulse text-meta-blue")} /> 
                  {isSyncing ? "同步中..." : "素材同步"}
                </Button>
                <Button variant="outline" onClick={fetchCreativeData} disabled={isLoading} className="text-sm h-9 gap-2 font-medium text-slate-700 bg-white border-slate-200">
                  <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} /> {isLoading ? "加载中" : "刷新数据"}
                </Button>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/80 border-b border-slate-100">
                  <TableRow>
                    <TableHead className="w-12 text-center">
                      <input type="checkbox" className="rounded border-slate-300 text-meta-blue focus:ring-meta-blue cursor-pointer" />
                    </TableHead>
                    <TableHead className="text-[13px] font-bold text-slate-700 h-11 whitespace-nowrap">名称</TableHead>
                    <TableHead className="text-[13px] font-bold text-slate-700 h-11 whitespace-nowrap">广告创意 ID</TableHead>
                    <TableHead className="text-[13px] font-bold text-slate-700 h-11 whitespace-nowrap">店铺</TableHead>
                    <TableHead className="text-[13px] font-bold text-slate-700 h-11 whitespace-nowrap">账户</TableHead>
                    <TableHead className="text-[13px] font-bold text-slate-700 h-11 whitespace-nowrap text-center">投放状态</TableHead>
                    <TableHead className="text-[13px] font-bold text-slate-700 h-11 whitespace-nowrap text-right">花费金额</TableHead>
                    <TableHead className="text-[13px] font-bold text-slate-700 h-11 whitespace-nowrap text-right">转化价值</TableHead>
                    <TableHead className="text-[13px] font-bold text-slate-700 h-11 whitespace-nowrap text-right">ROAS</TableHead>
                    <TableHead className="text-[13px] font-bold text-slate-700 h-11 whitespace-nowrap text-center">购物量</TableHead>
                    <TableHead className="text-[13px] font-bold text-slate-700 h-11 whitespace-nowrap text-right">单次购物费用</TableHead>
                    <TableHead className="text-[13px] font-bold text-slate-700 h-11 whitespace-nowrap">预算</TableHead>
                    <TableHead className="text-[13px] font-bold text-slate-700 h-11 whitespace-nowrap text-right">展示次数</TableHead>
                    <TableHead className="text-[13px] font-bold text-slate-700 h-11 whitespace-nowrap text-right">覆盖人数</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTableData.map((row) => (
                    <TableRow key={row.id} className="hover:bg-slate-50/50 align-middle">
                      <TableCell className="text-center py-2.5">
                        <input type="checkbox" className="rounded border-slate-300 text-meta-blue focus:ring-meta-blue cursor-pointer" />
                      </TableCell>
                      <TableCell className="py-2.5 text-[13px] text-meta-blue cursor-pointer font-medium hover:underline whitespace-nowrap max-w-[200px] truncate" title={row.name}>
                        {row.name}
                      </TableCell>
                      <TableCell className="py-2.5 px-4 font-mono text-[12px] text-slate-600 bg-slate-50/50 rounded-md">
                        {row.creativeId}
                      </TableCell>
                      <TableCell className="py-2.5 text-[13px] text-slate-700">
                        {row.storeName || "未分配"}
                      </TableCell>
                      <TableCell className="py-2.5 text-[13px] text-slate-700 whitespace-nowrap">
                        {row.accountName || "未分配"}
                      </TableCell>
                      <TableCell className="py-2.5 text-center">
                        <span className={cn(
                          "text-[10px] font-extrabold px-2 py-0.5 rounded-full inline-flex tracking-wide",
                          row.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                        )}>
                          {row.status}
                        </span>
                      </TableCell>
                      <TableCell className="py-2.5 text-right font-mono text-[13px] text-slate-800">
                        ${(row.spend || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="py-2.5 text-right font-mono text-[13px] text-blue-600">
                        ${(row.purchaseValue || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="py-2.5 text-right font-mono text-[13px] font-bold text-slate-900">
                        {(row.roas || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="py-2.5 text-center font-mono text-[13px] text-slate-800">
                        {row.purchases || 0}
                      </TableCell>
                      <TableCell className="py-2.5 text-right font-mono text-[13px] text-slate-800">
                        ${(row.cpp || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="py-2.5 text-[12px] text-slate-500 whitespace-nowrap text-center">
                        —
                      </TableCell>
                      <TableCell className="py-2.5 text-right font-mono text-[13px] text-slate-700">
                        {row.impressions || 0}
                      </TableCell>
                      <TableCell className="py-2.5 text-right font-mono text-[13px] text-slate-700">
                        {row.reach || 0}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Summary Row */}
                  {filteredTableData.length > 0 && (
                  <TableRow className="bg-slate-50 hover:bg-slate-50 border-t-2 border-slate-200">
                    <TableCell colSpan={5} className="py-4">
                      <div className="flex flex-col ml-8">
                        <span className="text-[13px] font-bold text-slate-900">{filteredTableData.length} 个数据的汇总</span>
                        <span className="text-[11px] text-slate-500 text-left">成功运行</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-4 text-center font-bold text-slate-400">—</TableCell>
                    <TableCell className="py-4 text-right font-mono text-[13px] font-bold text-slate-900">${tableSummary.spend.toFixed(2)}</TableCell>
                    <TableCell className="py-4 text-right font-mono text-[13px] font-bold text-blue-600">${tableSummary.purchaseValue.toFixed(2)}</TableCell>
                    <TableCell className="py-4 text-right font-mono text-[13px] font-bold text-slate-900">{tableSummary.roas.toFixed(2)}x</TableCell>
                    <TableCell className="py-4 text-center font-mono text-[13px] font-bold text-slate-900">{tableSummary.purchases}</TableCell>
                    <TableCell className="py-4 text-right font-mono text-[13px] font-bold text-slate-900">${tableSummary.cpp.toFixed(2)}</TableCell>
                    <TableCell className="py-4 text-center font-bold text-slate-400">—</TableCell>
                    <TableCell className="py-4 text-right font-mono text-[13px] font-bold text-slate-900">{tableSummary.impressions}</TableCell>
                    <TableCell className="py-4 text-right font-mono text-[13px] font-bold text-slate-900">{tableSummary.reach}</TableCell>
                  </TableRow>
                  )}
                  {filteredTableData.length === 0 && !isLoading && (
                    <TableRow>
                      <TableCell colSpan={14} className="h-32 text-center text-slate-500 font-medium">
                        暂无数据。请重新选择日期或过滤项。
                      </TableCell>
                    </TableRow>
                  )}
                  {isLoading && (
                    <TableRow>
                      <TableCell colSpan={14} className="h-32 text-center text-slate-500 font-medium">
                        <div className="flex flex-col items-center justify-center gap-2">
                           <RefreshCw className="w-5 h-5 animate-spin text-slate-400" />
                           <p>正在加载指标数据...</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}

        {/* ... remaining empty panels for future implementation ... */}
        {activeTab === "preview" && (
          <div className="bg-white border border-slate-100 rounded-xl p-16 text-center shadow-sm">
            <div className="max-w-md mx-auto space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mx-auto text-slate-400 border border-slate-100">
                <Eye className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-slate-800 mt-4">素材预览面板</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                此处将按您的需求展示具体的素材图片/视频预览画布。
              </p>
            </div>
          </div>
        )}

        {activeTab === "trends" && (
          <div className="bg-white border border-slate-100 rounded-xl p-16 text-center shadow-sm">
            <div className="max-w-md mx-auto space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mx-auto text-slate-400 border border-slate-100">
                <Activity className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-slate-800 mt-4">素材走势图表</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                此处将按您的需求展示单选或多选对比的素材数据折线分析图表。
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

