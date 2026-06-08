import React, { useState, useMemo } from "react";
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
  Check
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

  // Mocked filtering options based on expected usage
  const creativeTypes = [
    { value: "all", label: "全部" },
    { value: "image", label: "单图 (Image)" },
    { value: "video", label: "视频 (Video)" },
    { value: "carousel", label: "轮播 (Carousel)" }
  ];

  const stores = [
    { value: "all", label: "全部" },
    { value: "store_1", label: "Store 1" },
    { value: "store_2", label: "Store 2" }
  ];

  const accountsList = [
    { value: "all", label: "全选" },
    { value: "act_1", label: "YF-Kolaich-1" },
    { value: "act_2", label: "YF-Kolaich-2" },
    { value: "act_3", label: "YF-Kolaich-3" }
  ];

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

  const mockTableData: any[] = [];

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

          {/* 店铺 (单选) */}
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">店铺:</span>
            <select
              value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value)}
              className="px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-meta-blue focus:border-meta-blue font-medium text-slate-700 cursor-pointer min-w-[120px]"
            >
              {stores.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
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
              <PopoverContent className="w-[180px] p-2" align="start">
                <div className="space-y-1">
                  {accountsList.map(act => {
                    const isSelected = selectedAccounts.includes(act.value);
                    return (
                      <div 
                        key={act.value} 
                        className={cn(
                          "flex items-center justify-between px-2 py-1.5 rounded-md text-sm cursor-pointer hover:bg-slate-100",
                          isSelected && "bg-slate-50 text-meta-blue font-medium"
                        )}
                        onClick={() => toggleAccount(act.value)}
                      >
                        {act.label}
                        {isSelected && <Check className="w-4 h-4 text-meta-blue" />}
                      </div>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>
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
                    placeholder="搜索名称 / 广告创意 ID" 
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:ring-1 focus:ring-meta-blue transition-colors"
                  />
                </div>
              </div>
              <Button variant="outline" className="text-sm h-9 gap-2 font-medium text-slate-700 bg-white border-slate-200">
                <RefreshCw className="w-4 h-4" /> 刷新数据
              </Button>
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
                  {mockTableData.map((row) => (
                    <TableRow key={row.id} className="hover:bg-slate-50/50 align-middle">
                      <TableCell className="text-center py-2.5">
                        <input type="checkbox" className="rounded border-slate-300 text-meta-blue focus:ring-meta-blue cursor-pointer" />
                      </TableCell>
                      <TableCell className="py-2.5 text-[13px] text-meta-blue cursor-pointer font-medium hover:underline whitespace-nowrap">
                        {row.name}
                      </TableCell>
                      <TableCell className="py-2.5 px-4 font-mono text-[12px] text-slate-600 bg-slate-50/50 rounded-md">
                        {row.creativeId}
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
                        ${row.spend.toFixed(2)}
                      </TableCell>
                      <TableCell className="py-2.5 text-right font-mono text-[13px] text-blue-600">
                        ${row.conversionValue.toFixed(2)}
                      </TableCell>
                      <TableCell className="py-2.5 text-right font-mono text-[13px] font-bold text-slate-900">
                        {row.roas.toFixed(2)}
                      </TableCell>
                      <TableCell className="py-2.5 text-center font-mono text-[13px] text-slate-800">
                        {row.purchases}
                      </TableCell>
                      <TableCell className="py-2.5 text-right font-mono text-[13px] text-slate-800">
                        ${row.cpc.toFixed(2)}
                      </TableCell>
                      <TableCell className="py-2.5 text-[12px] text-slate-500 whitespace-nowrap">
                        {row.budget}
                      </TableCell>
                      <TableCell className="py-2.5 text-right font-mono text-[13px] text-slate-700">
                        {row.impressions}
                      </TableCell>
                      <TableCell className="py-2.5 text-right font-mono text-[13px] text-slate-700">
                        {row.reach}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Summary Row */}
                  {mockTableData.length > 0 && (
                  <TableRow className="bg-slate-50 hover:bg-slate-50">
                    <TableCell colSpan={3} className="py-4">
                      <div className="flex flex-col ml-12">
                        <span className="text-[13px] font-bold text-slate-900">{mockTableData.length} 个数据的汇总</span>
                        <span className="text-[11px] text-slate-500 text-left">成功运行</span>
                      </div>
                    </TableCell>
                    <TableCell className="py-4 text-center font-bold text-slate-400">—</TableCell>
                    <TableCell className="py-4 text-right font-mono text-[13px] font-bold text-slate-900">$0.00</TableCell>
                    <TableCell className="py-4 text-right font-mono text-[13px] font-bold text-blue-600">$0.00</TableCell>
                    <TableCell className="py-4 text-right font-mono text-[13px] font-bold text-slate-900">0.00</TableCell>
                    <TableCell className="py-4 text-center font-mono text-[13px] font-bold text-slate-900">0</TableCell>
                    <TableCell className="py-4 text-right font-mono text-[13px] font-bold text-slate-900">$0.00</TableCell>
                    <TableCell className="py-4 text-center font-bold text-slate-400">—</TableCell>
                    <TableCell className="py-4 text-right font-mono text-[13px] font-bold text-slate-900">0</TableCell>
                    <TableCell className="py-4 text-right font-mono text-[13px] font-bold text-slate-900">0</TableCell>
                  </TableRow>
                  )}
                  {mockTableData.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={12} className="h-32 text-center text-slate-500 font-medium">
                        暂无数据。请重新选择日期或过滤项。
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

