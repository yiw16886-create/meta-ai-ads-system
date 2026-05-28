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
  Lightbulb,
  Image as ImageIcon,
  Video,
  Eye,
  MousePointerClick
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { toast } from "sonner";
import axios from "axios";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface CreativeData {
  id: string;
  storeId: string;
  creativeName: string;
  type: "IMAGE" | "VIDEO" | "CAROUSEL";
  spend: number;
  purchases: number;
  revenue: number;
  roas: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
  hookRate: number; // Video specific, e.g., 3-second view rate
  aiRiskStatus: "SAFE" | "FATIGUE" | "LOW_CTR" | "HIGH_CPM" | "HIGH_ROAS" | "INEFFICIENT";
  trendStatus: "UP" | "DOWN" | "STABLE";
  aiSuggestion: string;
}

export function CreativeIntelligenceDashboard({ data, startDate, endDate }: { data: any[], startDate?: Date, endDate?: Date }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: keyof CreativeData; direction: "asc" | "desc" } | null>(null);
  const [creatives, setCreatives] = useState<CreativeData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCreatives = async () => {
    try {
      setLoading(true);
      const res = await axios.get("/api/intelligence/creatives", {
        params: {
          startDate: startDate ? format(startDate, "yyyy-MM-dd") : format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"),
          endDate: endDate ? format(endDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd")
        }
      });
      setCreatives(res.data || []);
    } catch (err: any) {
      toast.error("加载素材分析数据失败");
      // Fallback
      setCreatives([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCreatives();
  }, [data, startDate, endDate]);

  const handleExport = () => {
    const exportData = creatives.map(c => ({
      'Store ID': c.storeId,
      'Creative Name': c.creativeName,
      'Type': c.type,
      'Spend': c.spend,
      'Purchases': c.purchases,
      'Revenue': c.revenue,
      'ROAS': c.roas,
      'CTR %': c.ctr,
      'CPC': c.cpc,
      'CPM': c.cpm,
      'Frequency': c.frequency,
      'Hook Rate %': c.hookRate,
      'AI Status': c.aiRiskStatus,
      'Trend': c.trendStatus
    }));
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Creative Intelligence");
    XLSX.writeFile(wb, `Creative_Intelligence_${format(new Date(), "yyyyMMdd")}.xlsx`);
    toast.success("素材分析报表导出成功！");
  };

  const getRiskBadge = (status: string) => {
    switch(status) {
      case "SAFE": return <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700 ring-1 ring-inset ring-green-600/20">健康运行</span>;
      case "HIGH_ROAS": return <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20">高回报素材</span>;
      case "FATIGUE": return <span className="inline-flex items-center rounded-full bg-yellow-50 px-2 py-0.5 text-[11px] font-medium text-yellow-800 ring-1 ring-inset ring-yellow-600/20">素材疲劳</span>;
      case "LOW_CTR": return <span className="inline-flex items-center rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-medium text-orange-800 ring-1 ring-inset ring-orange-600/20">CTR骤降</span>;
      case "HIGH_CPM": return <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 ring-1 ring-inset ring-red-600/20">CPM暴涨</span>;
      case "INEFFICIENT": return <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 ring-1 ring-inset ring-red-600/20">高花费低转化</span>;
      default: return null;
    }
  };

  const getTrendIcon = (trend: string) => {
    switch(trend) {
      case "UP": return <TrendingUp className="w-4 h-4 text-green-600" />;
      case "DOWN": return <TrendingDown className="w-4 h-4 text-red-600" />;
      case "STABLE": return <Activity className="w-4 h-4 text-blue-600" />;
      default: return null;
    }
  };

  const getTypeIcon = (type: string) => {
    switch(type) {
      case "VIDEO": return <Video className="w-3.5 h-3.5 text-blue-500" />;
      case "IMAGE": return <ImageIcon className="w-3.5 h-3.5 text-emerald-500" />;
      case "CAROUSEL": return <Eye className="w-3.5 h-3.5 text-purple-500" />;
      default: return <ImageIcon className="w-3.5 h-3.5 text-gray-500" />;
    }
  };

  const sortedData = [...creatives].sort((a, b) => {
    if (!sortConfig) return 0;
    const aVal = a[sortConfig.key];
    const bVal = b[sortConfig.key];
    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const requestSort = (key: keyof CreativeData) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Metric Cards */}
      <div className="grid grid-cols-4 gap-[16px]">
        <Card className="p-4 rounded-[12px] shadow-sm border-gray-200">
          <div className="text-[13px] text-gray-500 mb-1 flex justify-between items-center">
            总素材消耗
            <Activity className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-[24px] font-bold text-gray-900">$43,500.00</div>
          <div className="text-[12px] text-green-600 font-medium mt-1">↑ 5.2% 较上月</div>
        </Card>
        <Card className="p-4 rounded-[12px] shadow-sm border-gray-200">
          <div className="text-[13px] text-gray-500 mb-1 flex justify-between items-center">
            全局素材 CTR
            <MousePointerClick className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-[24px] font-bold text-gray-900">2.45%</div>
          <div className="text-[12px] text-red-500 font-medium mt-1">↓ 0.1% 较上月</div>
        </Card>
        <Card className="p-4 rounded-[12px] shadow-sm border-gray-200">
          <div className="text-[13px] text-gray-500 mb-1 flex justify-between items-center">
            全局素材 ROAS
            <TrendingUp className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-[24px] font-bold text-gray-900">2.85</div>
          <div className="text-[12px] text-green-600 font-medium mt-1">↑ 0.15 较上月</div>
        </Card>
        <Card className="p-4 rounded-[12px] shadow-sm border-gray-200">
          <div className="text-[13px] text-gray-500 mb-1 flex justify-between items-center">
            需优化素材警报
            <AlertTriangle className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-[24px] font-bold text-red-600">3</div>
          <div className="text-[12px] text-gray-500 font-medium mt-1">包含疲劳、高CPM</div>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="border-none shadow-[0_1px_3px_rgba(0,0,0,0.1)] rounded-[12px] flex-grow flex flex-col overflow-hidden bg-white">
        <div className="px-[16px] py-[12px] border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="font-semibold text-[15px] text-gray-900 flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-purple-600" />
              素材智能分析系统
            </span>
            <Input 
              placeholder="搜索素材名称或 Store ID..." 
              className="h-8 w-64 text-[13px]"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            className="h-[32px] px-3 rounded-[6px] border-[#e5e7eb] text-[12px] text-[#374151]"
            onClick={handleExport}
          >
            <Download className="w-3.5 h-3.5 mr-2" />
            导出分析报表
          </Button>
        </div>
        <div className="flex-grow overflow-auto relative">
          <Table className="text-[12px] w-max-content border-collapse relative">
            <TableHeader className="sticky top-0 z-20 shadow-[0_1px_0_rgba(0,0,0,0.05)]">
              <TableRow className="bg-[#f8fafc] hover:bg-[#f8fafc]">
                 {/* AI Intelligence Columns */}
                 <TableHead className="px-4 font-semibold text-purple-700 bg-purple-50/50 sticky left-0 z-30 min-w-[200px] border-r border-[#e5e7eb]">
                  <div className="flex items-center gap-1"><Lightbulb className="w-3.5 h-3.5" /> 素材 AI 洞察诊断</div>
                </TableHead>
                <TableHead className="px-4 font-semibold text-gray-700 bg-[#f8fafc] whitespace-nowrap" onClick={() => requestSort("aiRiskStatus")}>
                  <div className="flex items-center gap-1 cursor-pointer">分析标签 <ArrowUpDown className="w-3 h-3 text-gray-400"/></div>
                </TableHead>
                
                {/* Meta & Context */}
                <TableHead className="px-4 font-semibold text-gray-700 bg-[#f8fafc] whitespace-nowrap" onClick={() => requestSort("storeId")}>Store Context</TableHead>
                <TableHead className="px-4 font-semibold text-gray-700 bg-[#f8fafc] whitespace-nowrap min-w-[200px]" onClick={() => requestSort("creativeName")}>
                  <div className="flex items-center gap-1 cursor-pointer">素材名称 <ArrowUpDown className="w-3 h-3 text-gray-400"/></div>
                </TableHead>
                <TableHead className="px-4 font-semibold text-gray-700 bg-[#f8fafc] whitespace-nowrap" onClick={() => requestSort("type")}>组/格式</TableHead>
                <TableHead className="px-4 font-semibold text-gray-700 bg-[#f8fafc] whitespace-nowrap" onClick={() => requestSort("trendStatus")}>表现趋势</TableHead>
                
                {/* Spend & ROAS (Financials) */}
                <TableHead className="px-4 font-semibold text-gray-700 bg-[#f8fafc] whitespace-nowrap text-right" onClick={() => requestSort("spend")}>
                  <div className="flex items-center gap-1 justify-end cursor-pointer">消耗 (Spend) <ArrowUpDown className="w-3 h-3 text-gray-400"/></div>
                </TableHead>
                <TableHead className="px-4 font-semibold text-gray-700 bg-[#f8fafc] whitespace-nowrap text-right" onClick={() => requestSort("revenue")}>追踪营收</TableHead>
                <TableHead className="px-4 font-semibold text-gray-700 bg-[#f8fafc] whitespace-nowrap text-right" onClick={() => requestSort("roas")}>
                  <div className="flex items-center gap-1 justify-end cursor-pointer">ROAS <ArrowUpDown className="w-3 h-3 text-gray-400"/></div>
                </TableHead>
                <TableHead className="px-4 font-semibold text-gray-700 bg-[#f8fafc] whitespace-nowrap text-right" onClick={() => requestSort("purchases")}>购买量</TableHead>

                {/* Core Marketing Metrics */}
                <TableHead className="px-4 font-semibold text-gray-700 bg-[#f8fafc] whitespace-nowrap text-right" onClick={() => requestSort("ctr")}>
                  <div className="flex items-center gap-1 justify-end cursor-pointer">CTR <ArrowUpDown className="w-3 h-3 text-gray-400"/></div>
                </TableHead>
                <TableHead className="px-4 font-semibold text-gray-700 bg-[#f8fafc] whitespace-nowrap text-right" onClick={() => requestSort("cpc")}>CPC</TableHead>
                <TableHead className="px-4 font-semibold text-gray-700 bg-[#f8fafc] whitespace-nowrap text-right" onClick={() => requestSort("cpm")}>
                  <div className="flex items-center gap-1 justify-end cursor-pointer">CPM <ArrowUpDown className="w-3 h-3 text-gray-400"/></div>
                </TableHead>
                <TableHead className="px-4 font-semibold text-gray-700 bg-[#f8fafc] whitespace-nowrap text-right" onClick={() => requestSort("frequency")}>
                  <div className="flex items-center gap-1 justify-end cursor-pointer">展示频率 <ArrowUpDown className="w-3 h-3 text-gray-400"/></div>
                </TableHead>
                <TableHead className="px-4 font-semibold text-gray-700 bg-[#f8fafc] whitespace-nowrap text-right" onClick={() => requestSort("hookRate")}>
                  <div className="flex items-center gap-1 justify-end cursor-pointer">Hook Rate (3s) <ArrowUpDown className="w-3 h-3 text-gray-400"/></div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TooltipProvider>
                {sortedData.filter(c => (c.creativeName || "").toLowerCase().includes((searchTerm || "").toLowerCase()) || (c.storeId || "").toString().toLowerCase().includes((searchTerm || "").toLowerCase())).map((creative) => (
                  <TableRow key={creative.id} className="hover:bg-gray-50">
                    {/* AI intelligence Column */}
                    <TableCell className="px-4 py-3 sticky left-0 z-10 bg-purple-50/20 border-r border-gray-100 font-medium text-purple-800 text-[12px] whitespace-normal min-w-[200px]">
                      {creative.aiSuggestion}
                    </TableCell>
                    <TableCell className="px-4 py-3 whitespace-nowrap">
                      {getRiskBadge(creative.aiRiskStatus)}
                    </TableCell>
                    
                    <TableCell className="px-4 py-3 font-mono text-gray-500 whitespace-nowrap bg-gray-50/50 border-r border-l border-gray-100">
                      {creative.storeId}
                    </TableCell>

                    <TableCell className="px-4 py-3 font-medium text-gray-900 border-r border-gray-100">
                      <div className="flex items-center gap-2">
                        {getTypeIcon(creative.type)}
                        {creative.creativeName}
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-gray-500 whitespace-nowrap font-mono text-[11px]">{creative.type}</TableCell>
                    <TableCell className="px-4 py-3 border-r border-gray-100">
                      {getTrendIcon(creative.trendStatus)}
                    </TableCell>

                    <TableCell className="px-4 py-3 font-mono text-right font-medium text-gray-900">${(creative.spend || 0).toLocaleString()}</TableCell>
                    <TableCell className="px-4 py-3 font-mono text-right text-gray-600">${(creative.revenue || 0).toLocaleString()}</TableCell>
                    
                    <TableCell className={`px-4 py-3 font-mono text-right font-bold ${creative.roas < 2 ? 'text-red-600' : 'text-blue-600'}`}>
                      {creative.roas.toFixed(2)}
                    </TableCell>
                    <TableCell className="px-4 py-3 font-mono text-right border-r border-gray-100">{(creative.purchases || 0).toLocaleString()}</TableCell>

                    <TableCell className={`px-4 py-3 font-mono text-right ${creative.ctr < 1 ? 'text-orange-600 font-bold' : 'text-gray-600'}`}>
                      {creative.ctr.toFixed(2)}%
                    </TableCell>
                    <TableCell className="px-4 py-3 font-mono text-right text-gray-600">${creative.cpc.toFixed(2)}</TableCell>
                    
                    <TableCell className="px-4 py-3 text-right">
                      <Tooltip>
                        <TooltipTrigger className={`font-mono underline decoration-dashed ${creative.cpm > 20 ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                          ${creative.cpm.toFixed(2)}
                        </TooltipTrigger>
                        <TooltipContent>
                          {creative.cpm > 20 ? "CPM 过高，竞争激烈或受众太窄" : "CPM 处于正常区间"}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>

                    <TableCell className="px-4 py-3 text-right">
                      <Tooltip>
                        <TooltipTrigger className={`font-mono underline decoration-dashed ${creative.frequency > 4 ? 'text-yellow-600 font-bold' : 'text-gray-600'}`}>
                          {creative.frequency.toFixed(1)}
                        </TooltipTrigger>
                        <TooltipContent>
                          {creative.frequency > 4 ? "高频次警告：素材已出现疲劳，建议替换" : "展示频次正常"}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>

                    <TableCell className="px-4 py-3 text-right">
                      {creative.type === "VIDEO" ? (
                         <Tooltip>
                          <TooltipTrigger className={`font-mono underline decoration-dashed ${creative.hookRate < 20 ? 'text-red-600 font-bold' : 'text-green-600 font-bold'}`}>
                            {creative.hookRate.toFixed(1)}%
                          </TooltipTrigger>
                          <TooltipContent>
                            {creative.hookRate < 20 ? "前3秒流失率极高，优化Hook片段" : "前3秒吸引力优秀"}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        <span className="text-gray-300 font-mono">—</span>
                      )}
                    </TableCell>

                  </TableRow>
                ))}
              </TooltipProvider>
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
