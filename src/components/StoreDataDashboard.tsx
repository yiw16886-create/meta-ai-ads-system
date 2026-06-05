import React, { useMemo, useState } from "react";
import { 
  Store as StoreIcon, 
  Search, 
  ArrowUpDown, 
  TrendingUp, 
  ShoppingBag, 
  Coins, 
  Layers 
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface AdInsight {
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
}

interface StoreDataDashboardProps {
  data: AdInsight[];
  mappings: Record<string, any>;
  storeSummaries?: Record<string, any>;
}

type SortField = "store" | "accountsCount" | "spend" | "purchases" | "purchaseValue" | "totalRefunded" | "avgRoi";
type SortOrder = "asc" | "desc";

export function StoreDataDashboard({ data = [], mappings = {}, storeSummaries = {} }: StoreDataDashboardProps) {
  const safeData = useMemo(() => Array.isArray(data) ? data : [], [data]);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<SortField>("spend");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // 1. Calculate and aggregate stats by store
  const storeStats = useMemo(() => {
    const storeMap: Record<string, {
      store: string;
      spend: number;
      purchaseValue: number;
      purchases: number;
      accountIds: Set<string>;
      impressions: number;
      clicks: number;
      addToCart: number;
      initiateCheckout: number;
    }> = {};

    safeData.forEach((d) => {
      const mapping = mappings[d.accountId];
      const storeName = mapping?.store || "未分配";
      if (!storeMap[storeName]) {
        storeMap[storeName] = {
          store: storeName,
          spend: 0,
          purchaseValue: 0,
          purchases: 0,
          accountIds: new Set<string>(),
          impressions: 0,
          clicks: 0,
          addToCart: 0,
          initiateCheckout: 0
        };
      }
      storeMap[storeName].spend += d.spend || 0;
      storeMap[storeName].purchaseValue += d.purchaseValue || 0;
      storeMap[storeName].purchases += d.purchases || 0;
      storeMap[storeName].impressions += d.impressions || 0;
      storeMap[storeName].clicks += d.clicks || 0;
      storeMap[storeName].addToCart += d.addToCart || 0;
      storeMap[storeName].initiateCheckout += d.initiateCheckout || 0;
      storeMap[storeName].accountIds.add(d.accountId);
    });

    return Object.values(storeMap).map((item) => {
      let finalPurchaseValue = item.purchaseValue;
      let finalPurchases = item.purchases;
      let finalTotalRefunded = 0;
      
      // Look up case-insensitively in storeSummaries
      const summaryKey = Object.keys(storeSummaries).find(
        (k) => (k || "").toLowerCase() === (item.store || "").toLowerCase()
      );
      const summary = summaryKey ? storeSummaries[summaryKey] : null;

      if (summary && summary.isConfigured && !summary.error) {
        finalPurchaseValue = summary.totalSales;
        finalPurchases = summary.ordersCount;
        finalTotalRefunded = summary.totalRefunded || 0;
      }

      return {
        ...item,
        purchaseValue: finalPurchaseValue,
        purchases: finalPurchases,
        totalRefunded: finalTotalRefunded,
        avgRoi: item.spend > 0 ? finalPurchaseValue / item.spend : 0,
        accountsCount: item.accountIds.size
      };
    });
  }, [safeData, mappings, storeSummaries]);

  // 2. Compute aggregated metrics for the overview cards
  const totalSummary = useMemo(() => {
    let spend = 0;
    let purchaseValue = 0;
    let purchases = 0;
    let totalRefunded = 0;
    
    storeStats.forEach((s) => {
      spend += s.spend;
      purchaseValue += s.purchaseValue;
      purchases += s.purchases;
      totalRefunded += s.totalRefunded || 0;
    });

    const avgRoi = spend > 0 ? purchaseValue / spend : 0;
    return {
      storesCount: storeStats.length,
      spend,
      purchaseValue,
      purchases,
      totalRefunded,
      avgRoi
    };
  }, [storeStats]);

  // 3. Handle Sort and Filter
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const filteredAndSortedStats = useMemo(() => {
    let result = storeStats.filter(item => 
      item.store.toLowerCase().includes(searchTerm.toLowerCase())
    );

    result.sort((a, b) => {
      let valA: any = a[sortField];
      let valB: any = b[sortField];

      // Handle case-insensitive sorting for string field
      if (typeof valA === "string" && typeof valB === "string") {
        return sortOrder === "asc" 
          ? valA.localeCompare(valB) 
          : valB.localeCompare(valA);
      }

      // Handle numeric sorting
      return sortOrder === "asc" ? valA - valB : valB - valA;
    });

    return result;
  }, [storeStats, searchTerm, sortField, sortOrder]);

  return (
    <div className="space-y-6">
      {/* 📋 Metrics Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-none shadow-[0_1px_3px_rgba(0,0,0,0.06)] bg-white rounded-[12px]">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">已关联店铺数</span>
              <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">{totalSummary.storesCount} 个</h3>
            </div>
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-[8px]">
              <StoreIcon className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-[0_1px_3px_rgba(0,0,0,0.06)] bg-white rounded-[12px]">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">广告支出消耗</span>
              <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">
                ${totalSummary.spend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
            </div>
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-[8px]">
              <Coins className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-[0_1px_3px_rgba(0,0,0,0.06)] bg-white rounded-[12px]">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">店铺全渠道订单</span>
              <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">
                {totalSummary.purchases.toLocaleString()} 单
              </h3>
            </div>
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-[8px]">
              <ShoppingBag className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-[0_1px_3px_rgba(0,0,0,0.06)] bg-white rounded-[12px]">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500">综合平均 ROI</span>
              <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">
                {totalSummary.avgRoi.toFixed(2)}x
              </h3>
            </div>
            <div className="p-2.5 bg-amber-50 text-amber-600 rounded-[8px]">
              <TrendingUp className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 📊 Main Store Data Table */}
      <Card className="border-none shadow-[0_1px_3px_rgba(0,0,0,0.06)] bg-white rounded-[12px] overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50/50 to-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <StoreIcon className="w-4 h-4 text-indigo-500" />
            <span className="font-bold text-[15px] text-slate-900">店铺数据列表</span>
          </div>
          
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              type="text"
              placeholder="搜索店铺名称..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 text-xs h-9 bg-slate-50/50 border-slate-200 focus-visible:ring-indigo-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table className="text-[13px] whitespace-nowrap">
            <TableHeader className="bg-slate-50/70">
              <TableRow className="border-b border-slate-100">
                <TableHead 
                  onClick={() => handleSort("store")}
                  className="font-semibold py-3 px-5 text-slate-600 select-none cursor-pointer hover:bg-slate-100/50 transition-colors"
                >
                  <div className="flex items-center gap-1">
                    店铺名称
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </TableHead>
                <TableHead 
                  onClick={() => handleSort("accountsCount")}
                  className="font-semibold text-center py-3 select-none cursor-pointer hover:bg-slate-100/50 transition-colors text-slate-600"
                >
                  <div className="flex items-center justify-center gap-1">
                    账户数量
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </TableHead>
                <TableHead 
                  onClick={() => handleSort("spend")}
                  className="font-semibold text-right py-3 select-none cursor-pointer hover:bg-slate-100/50 transition-colors text-slate-600"
                >
                  <div className="flex items-center justify-end gap-1">
                    消耗金额
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </TableHead>
                <TableHead 
                  onClick={() => handleSort("purchases")}
                  className="font-semibold text-right py-3 select-none cursor-pointer hover:bg-slate-100/50 transition-colors text-slate-600"
                >
                  <div className="flex items-center justify-end gap-1">
                    店铺订单
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </TableHead>
                <TableHead 
                  onClick={() => handleSort("purchaseValue")}
                  className="font-semibold text-right py-3 select-none cursor-pointer hover:bg-slate-100/50 transition-colors text-slate-600"
                >
                  <div className="flex items-center justify-end gap-1">
                    全渠道销售额
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </TableHead>
                <TableHead 
                  onClick={() => handleSort("totalRefunded")}
                  className="font-semibold text-right py-3 select-none cursor-pointer hover:bg-slate-100/50 transition-colors text-slate-600"
                >
                  <div className="flex items-center justify-end gap-1">
                    已退款金额
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </TableHead>
                <TableHead 
                  onClick={() => handleSort("avgRoi")}
                  className="font-semibold text-right py-3 px-5 select-none cursor-pointer hover:bg-slate-100/50 transition-colors text-slate-600"
                >
                  <div className="flex items-center justify-end gap-1">
                    投资回报 ROI
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            
            <TableBody>
              {filteredAndSortedStats.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-slate-400">
                    没有找到符合条件的店铺数据
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedStats.map((item) => (
                  <TableRow key={item.store} className="hover:bg-slate-50/40 border-b border-slate-100/60 font-medium">
                    <TableCell className="font-bold text-slate-900 py-3.5 px-5 select-all">
                      {item.store}
                    </TableCell>
                    <TableCell className="text-center py-3.5">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">
                        {item.accountsCount} 个账户
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-bold text-slate-950 py-3.5 font-mono">
                      ${(item.spend || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right text-slate-700 py-3.5 font-mono">
                      {(item.purchases || 0).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-emerald-600 font-bold py-3.5 font-mono">
                      ${(item.purchaseValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right text-rose-600 font-bold py-3.5 font-mono">
                      ${(item.totalRefunded || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right py-3.5 px-5 font-mono">
                      <span className={cn(
                        "inline-block px-2 py-0.5 rounded-[4px] font-extrabold text-[12px]",
                        item.avgRoi >= 1.0 
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                          : "bg-amber-50 text-amber-700 border border-amber-100"
                      )}>
                        {item.avgRoi.toFixed(2)}x
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
