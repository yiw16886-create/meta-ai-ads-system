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
  Package,
  Activity,
  Lightbulb
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

interface ProductData {
  id: string;
  storeId: string;
  productName: string;
  sku: string;
  category: string;
  revenue: number;
  orders: number;
  profit: number;
  adSpend: number;
  productRoas: number;
  profitRoas: number;
  ctr: number;
  cpc: number;
  cpm: number;
  frequency: number;
  refundRate: number;
  inventory: number;
  topRegion: string;
  topCampaign: string;
  topCreative: string;
  aiRiskStatus: "SAFE" | "WARNING" | "CRITICAL";
  trendStatus: "UP" | "DOWN" | "STABLE";
  aiSuggestion: string;
}

export function ProductIntelligenceDashboard({ data, startDate, endDate }: { data: any[], startDate?: Date, endDate?: Date }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: keyof ProductData; direction: "asc" | "desc" } | null>(null);
  const [products, setProducts] = useState<ProductData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const res = await axios.get("/api/intelligence/products", {
        params: {
          startDate: startDate ? format(startDate, "yyyy-MM-dd") : format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"),
          endDate: endDate ? format(endDate, "yyyy-MM-dd") : format(new Date(), "yyyy-MM-dd")
        }
      });
      setProducts(res.data || []);
    } catch (err: any) {
      toast.error("加载商品分析数据失败");
      // Fallback
      setProducts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, [data, startDate, endDate]);

  const handleExport = () => {
    const exportData = products.map(p => ({
      'Store ID': p.storeId,
      'Product Name': p.productName,
      'SKU': p.sku,
      'Category': p.category,
      'Revenue': p.revenue,
      'Orders': p.orders,
      'Profit': p.profit,
      'Ad Spend': p.adSpend,
      'Product ROAS': p.productRoas,
      'Profit ROAS': p.profitRoas,
      'CTR %': p.ctr,
      'CPC': p.cpc,
      'CPM': p.cpm,
      'Frequency': p.frequency,
      'Refund Rate %': p.refundRate,
      'Inventory': p.inventory,
      'Top Region': p.topRegion,
      'Top Campaign': p.topCampaign,
      'Top Creative': p.topCreative,
      'AI Status': p.aiRiskStatus,
      'Trend': p.trendStatus
    }));
    
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Product Intelligence");
    XLSX.writeFile(wb, `Product_Intelligence_${format(new Date(), "yyyyMMdd")}.xlsx`);
    toast.success("商品分析报表导出成功！");
  };

  const getRiskBadge = (status: string) => {
    switch(status) {
      case "SAFE": return <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700 ring-1 ring-inset ring-green-600/20">健康</span>;
      case "WARNING": return <span className="inline-flex items-center rounded-full bg-yellow-50 px-2 py-0.5 text-[11px] font-medium text-yellow-800 ring-1 ring-inset ring-yellow-600/20">预警</span>;
      case "CRITICAL": return <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700 ring-1 ring-inset ring-red-600/20">危险</span>;
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
  }

  const sortedData = [...products].sort((a, b) => {
    if (!sortConfig) return 0;
    const aVal = a[sortConfig.key];
    const bVal = b[sortConfig.key];
    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const requestSort = (key: keyof ProductData) => {
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
            总商品营收
            <Package className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-[24px] font-bold text-gray-900">$37,900.00</div>
          <div className="text-[12px] text-green-600 font-medium mt-1">↑ 12.5% 较上周期</div>
        </Card>
        <Card className="p-4 rounded-[12px] shadow-sm border-gray-200">
          <div className="text-[13px] text-gray-500 mb-1 flex justify-between items-center">
            总利润
            <Activity className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-[24px] font-bold text-gray-900">$13,900.00</div>
          <div className="text-[12px] text-green-600 font-medium mt-1">↑ 8.2% 较上周期</div>
        </Card>
        <Card className="p-4 rounded-[12px] shadow-sm border-gray-200">
          <div className="text-[13px] text-gray-500 mb-1 flex justify-between items-center">
            平均商品 ROAS
            <TrendingUp className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-[24px] font-bold text-gray-900">3.85</div>
          <div className="text-[12px] text-red-500 font-medium mt-1">↓ 0.2 较上周期</div>
        </Card>
        <Card className="p-4 rounded-[12px] shadow-sm border-gray-200">
          <div className="text-[13px] text-gray-500 mb-1 flex justify-between items-center">
            风险预警商品
            <AlertTriangle className="w-4 h-4 text-gray-400" />
          </div>
          <div className="text-[24px] font-bold text-red-600">2</div>
          <div className="text-[12px] text-gray-500 font-medium mt-1">需立即干预</div>
        </Card>
      </div>

      {/* Main Table Card */}
      <Card className="border-none shadow-[0_1px_3px_rgba(0,0,0,0.1)] rounded-[12px] flex-grow flex flex-col overflow-hidden bg-white">
        <div className="px-[16px] py-[12px] border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span className="font-semibold text-[15px] text-gray-900 flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              商品智能分析引擎
            </span>
            <Input 
              placeholder="搜索商品名称或 SKU..." 
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
                 <TableHead className="px-4 font-semibold text-blue-700 bg-blue-50/50 sticky left-0 z-30 min-w-[200px] border-r border-[#e5e7eb]">
                  <div className="flex items-center gap-1"><Lightbulb className="w-3.5 h-3.5" /> AI 洞察建议 (只读)</div>
                </TableHead>
                <TableHead className="px-4 font-semibold text-gray-700 bg-[#f8fafc] whitespace-nowrap" onClick={() => requestSort("aiRiskStatus")}>
                  <div className="flex items-center gap-1 cursor-pointer">风险状态 <ArrowUpDown className="w-3 h-3 text-gray-400"/></div>
                </TableHead>
                
                {/* Product Info */}
                <TableHead className="px-4 font-semibold text-gray-700 bg-[#f8fafc] whitespace-nowrap" onClick={() => requestSort("storeId")}>Store Context</TableHead>
                <TableHead className="px-4 font-semibold text-gray-700 bg-[#f8fafc] whitespace-nowrap min-w-[180px]" onClick={() => requestSort("productName")}>
                  <div className="flex items-center gap-1 cursor-pointer">商品名称 <ArrowUpDown className="w-3 h-3 text-gray-400"/></div>
                </TableHead>
                <TableHead className="px-4 font-semibold text-gray-700 bg-[#f8fafc] whitespace-nowrap" onClick={() => requestSort("sku")}>SKU</TableHead>
                <TableHead className="px-4 font-semibold text-gray-700 bg-[#f8fafc] whitespace-nowrap" onClick={() => requestSort("category")}>类别</TableHead>
                <TableHead className="px-4 font-semibold text-gray-700 bg-[#f8fafc] whitespace-nowrap" onClick={() => requestSort("trendStatus")}>趋势</TableHead>
                
                {/* Financials / Value */}
                <TableHead className="px-4 font-semibold text-gray-700 bg-[#f8fafc] whitespace-nowrap text-right" onClick={() => requestSort("revenue")}>
                  <div className="flex items-center gap-1 justify-end cursor-pointer">营收 <ArrowUpDown className="w-3 h-3 text-gray-400"/></div>
                </TableHead>
                <TableHead className="px-4 font-semibold text-gray-700 bg-[#f8fafc] whitespace-nowrap text-right" onClick={() => requestSort("profit")}>
                  <div className="flex items-center gap-1 justify-end cursor-pointer">利润 <ArrowUpDown className="w-3 h-3 text-gray-400"/></div>
                </TableHead>
                <TableHead className="px-4 font-semibold text-gray-700 bg-[#f8fafc] whitespace-nowrap text-right" onClick={() => requestSort("adSpend")}>
                  <div className="flex items-center gap-1 justify-end cursor-pointer">广告耗费 <ArrowUpDown className="w-3 h-3 text-gray-400"/></div>
                </TableHead>
                <TableHead className="px-4 font-semibold text-gray-700 bg-[#f8fafc] whitespace-nowrap text-right" onClick={() => requestSort("orders")}>订单数</TableHead>
                
                {/* ROAS & Efficiency */}
                <TableHead className="px-4 font-semibold text-gray-700 bg-[#f8fafc] whitespace-nowrap text-right" onClick={() => requestSort("productRoas")}>
                  <div className="flex items-center gap-1 justify-end cursor-pointer">商品 ROAS <ArrowUpDown className="w-3 h-3 text-gray-400"/></div>
                </TableHead>
                <TableHead className="px-4 font-semibold text-gray-700 bg-[#f8fafc] whitespace-nowrap text-right" onClick={() => requestSort("profitRoas")}>
                  <div className="flex items-center gap-1 justify-end cursor-pointer">利润 ROAS <ArrowUpDown className="w-3 h-3 text-gray-400"/></div>
                </TableHead>

                {/* Ad Metrics */}
                <TableHead className="px-4 font-semibold text-gray-700 bg-[#f8fafc] whitespace-nowrap text-right" onClick={() => requestSort("ctr")}>CTR</TableHead>
                <TableHead className="px-4 font-semibold text-gray-700 bg-[#f8fafc] whitespace-nowrap text-right" onClick={() => requestSort("cpc")}>CPC</TableHead>
                <TableHead className="px-4 font-semibold text-gray-700 bg-[#f8fafc] whitespace-nowrap text-right" onClick={() => requestSort("cpm")}>CPM</TableHead>
                <TableHead className="px-4 font-semibold text-gray-700 bg-[#f8fafc] whitespace-nowrap text-right" onClick={() => requestSort("frequency")}>展示频率</TableHead>
                
                {/* Operational */}
                <TableHead className="px-4 font-semibold text-gray-700 bg-[#f8fafc] whitespace-nowrap text-right" onClick={() => requestSort("refundRate")}>
                  <div className="flex items-center gap-1 justify-end cursor-pointer">退款率 <ArrowUpDown className="w-3 h-3 text-gray-400"/></div>
                </TableHead>
                <TableHead className="px-4 font-semibold text-gray-700 bg-[#f8fafc] whitespace-nowrap text-right" onClick={() => requestSort("inventory")}>库存</TableHead>
                <TableHead className="px-4 font-semibold text-gray-700 bg-[#f8fafc] whitespace-nowrap">表现最佳 地域</TableHead>
                <TableHead className="px-4 font-semibold text-gray-700 bg-[#f8fafc] whitespace-nowrap">表现最佳 Campaign</TableHead>
                <TableHead className="px-4 font-semibold text-gray-700 bg-[#f8fafc] whitespace-nowrap">表现最佳 素材</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TooltipProvider>
                {sortedData.filter(p => (p.productName || "").toLowerCase().includes((searchTerm || "").toLowerCase()) || (p.sku || "").toLowerCase().includes((searchTerm || "").toLowerCase())).map((product) => (
                  <TableRow key={product.id} className="hover:bg-gray-50">
                    {/* AI intelligence Column */}
                    <TableCell className="px-4 py-3 sticky left-0 z-10 bg-blue-50/20 border-r border-gray-100 font-medium text-blue-800 text-[12px] whitespace-normal min-w-[200px]">
                      {product.aiSuggestion}
                    </TableCell>
                    <TableCell className="px-4 py-3 whitespace-nowrap">
                      {getRiskBadge(product.aiRiskStatus)}
                    </TableCell>
                    
                    <TableCell className="px-4 py-3 font-mono text-gray-500 whitespace-nowrap bg-gray-50/50 border-r border-l border-gray-100">
                      {product.storeId}
                    </TableCell>

                    <TableCell className="px-4 py-3 font-medium text-gray-900 border-l border-gray-100">
                      {product.productName}
                    </TableCell>
                    <TableCell className="px-4 py-3 font-mono text-gray-500 whitespace-nowrap">{product.sku}</TableCell>
                    <TableCell className="px-4 py-3 text-gray-500 whitespace-nowrap">{product.category}</TableCell>
                    <TableCell className="px-4 py-3">
                      {getTrendIcon(product.trendStatus)}
                    </TableCell>

                    <TableCell className="px-4 py-3 font-mono text-right font-medium text-gray-900">${(product.revenue || 0).toLocaleString()}</TableCell>
                    <TableCell className="px-4 py-3 font-mono text-right font-medium text-green-700">${(product.profit || 0).toLocaleString()}</TableCell>
                    <TableCell className="px-4 py-3 font-mono text-right text-gray-600">${(product.adSpend || 0).toLocaleString()}</TableCell>
                    <TableCell className="px-4 py-3 font-mono text-right">{(product.orders || 0).toLocaleString()}</TableCell>

                    <TableCell className={`px-4 py-3 font-mono text-right font-bold ${product.productRoas < 2 ? 'text-red-600' : 'text-blue-600'}`}>
                      {product.productRoas.toFixed(2)}
                    </TableCell>
                    <TableCell className={`px-4 py-3 font-mono text-right font-bold ${product.profitRoas < 1 ? 'text-red-600' : 'text-green-600'}`}>
                      {product.profitRoas.toFixed(2)}
                    </TableCell>

                    <TableCell className="px-4 py-3 font-mono text-right text-gray-600">{product.ctr.toFixed(2)}%</TableCell>
                    <TableCell className="px-4 py-3 font-mono text-right text-gray-600">${product.cpc.toFixed(2)}</TableCell>
                    <TableCell className="px-4 py-3 font-mono text-right text-gray-600">${product.cpm.toFixed(2)}</TableCell>
                    
                    <TableCell className="px-4 py-3 text-right">
                      <Tooltip>
                        <TooltipTrigger className={`font-mono underline decoration-dashed ${product.frequency > 3 ? 'text-orange-600 font-bold' : 'text-gray-600'}`}>
                          {product.frequency.toFixed(1)}
                        </TooltipTrigger>
                        <TooltipContent>
                          {product.frequency > 3 ? "展示频率较高，可能存在素材疲劳" : "展示频率正常"}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>

                    <TableCell className="px-4 py-3 text-right">
                      <Tooltip>
                        <TooltipTrigger className={`font-mono underline decoration-dashed ${product.refundRate > 5 ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                          {product.refundRate.toFixed(1)}%
                        </TooltipTrigger>
                        <TooltipContent>
                          {product.refundRate > 5 ? "退款率警告，建议下架或排查质量" : "退款率正常"}
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell className={`px-4 py-3 font-mono text-right ${product.inventory < 50 ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                      {(product.inventory || 0).toLocaleString()}
                    </TableCell>
                    
                    <TableCell className="px-4 py-3 text-gray-500 whitespace-nowrap text-center text-xs">
                      {product.topRegion}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-gray-500 whitespace-nowrap text-[11px] truncate max-w-[120px] hover:max-w-none hover:bg-white z-20" title={product.topCampaign}>
                      {product.topCampaign}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-gray-500 whitespace-nowrap text-[11px] truncate max-w-[120px] hover:max-w-none hover:bg-white z-20" title={product.topCreative}>
                      {product.topCreative}
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
