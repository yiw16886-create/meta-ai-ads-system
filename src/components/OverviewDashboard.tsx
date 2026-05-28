import React, { useMemo } from "react";
import { 
  TrendingUp, 
  ShoppingBag, 
  Percent, 
  MousePointer, 
  Eye, 
  Store as StoreIcon, 
  Layers, 
  User, 
  Coins,
  ArrowRight,
  TrendingDown
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

interface OverviewDashboardProps {
  data: AdInsight[];
  mappings: Record<string, any>;
  storeSummaries?: Record<string, any>;
}

export function OverviewDashboard({ data = [], mappings = {}, storeSummaries = {} }: OverviewDashboardProps) {
  const safeData = useMemo(() => Array.isArray(data) ? data : [], [data]);

  // 1. Aggregate Data by Store FIRST so we can merge with Shopline stats
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

    return Object.values(storeMap)
      .map((item) => {
        let finalPurchaseValue = item.purchaseValue;
        let finalPurchases = item.purchases;
        
        // Match case-insensitively since mapping names might differ from DB store names
        const summaryKey = Object.keys(storeSummaries).find(k => (k || "").toLowerCase() === (item.store || "").toLowerCase());
        const summary = summaryKey ? storeSummaries[summaryKey] : null;

        if (summary && summary.isConfigured && !summary.error) {
          finalPurchaseValue = summary.totalSales;
          finalPurchases = summary.ordersCount;
        }

        return {
          ...item,
          purchaseValue: finalPurchaseValue,
          purchases: finalPurchases,
          avgRoi: item.spend > 0 ? finalPurchaseValue / item.spend : 0,
          accountsCount: item.accountIds.size
        };
      })
      .sort((a, b) => b.spend - a.spend);
  }, [safeData, mappings, storeSummaries]);

  // 2. Calculate General Aggregated Totals based on the merged store stats
  const totals = useMemo(() => {
    let spend = 0;
    let purchaseValue = 0;
    let purchases = 0;
    let impressions = 0;
    let clicks = 0;
    let addToCart = 0;
    let initiateCheckout = 0;

    storeStats.forEach((s) => {
      spend += s.spend;
      purchaseValue += s.purchaseValue;
      purchases += s.purchases;
      impressions += s.impressions;
      clicks += s.clicks;
      addToCart += s.addToCart;
      initiateCheckout += s.initiateCheckout;
    });

    const roas = spend > 0 ? purchaseValue / spend : 0;
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;
    const atcRate = clicks > 0 ? (addToCart / clicks) * 100 : 0;

    return {
      spend,
      purchaseValue,
      purchases,
      impressions,
      clicks,
      addToCart,
      initiateCheckout,
      roas,
      ctr,
      cpc,
      atcRate
    };
  }, [storeStats]);

  // 3. Aggregate Data by Category/Project
  const categoryStats = useMemo(() => {
    const catMap: Record<string, {
      project: string;
      spend: number;
      purchaseValue: number;
      purchases: number;
      accountIds: Set<string>;
    }> = {};

    safeData.forEach((d) => {
      const mapping = mappings[d.accountId];
      const projectName = mapping?.project || "未分配";
      if (!catMap[projectName]) {
        catMap[projectName] = {
          project: projectName,
          spend: 0,
          purchaseValue: 0,
          purchases: 0,
          accountIds: new Set<string>()
        };
      }
      catMap[projectName].spend += d.spend || 0;
      catMap[projectName].purchaseValue += d.purchaseValue || 0;
      catMap[projectName].purchases += d.purchases || 0;
      catMap[projectName].accountIds.add(d.accountId);
    });

    return Object.values(catMap)
      .map((item) => ({
        ...item,
        avgRoi: item.spend > 0 ? item.purchaseValue / item.spend : 0,
        accountsCount: item.accountIds.size
      }))
      .sort((a, b) => b.spend - a.spend);
  }, [safeData, mappings]);

  // 4. Aggregate Data by Owner
  const ownerStats = useMemo(() => {
    const ownerMap: Record<string, {
      owner: string;
      spend: number;
      purchaseValue: number;
      purchases: number;
      accountIds: Set<string>;
    }> = {};

    safeData.forEach((d) => {
      const mapping = mappings[d.accountId];
      const ownerName = mapping?.owner || "未分配";
      if (!ownerMap[ownerName]) {
        ownerMap[ownerName] = {
          owner: ownerName,
          spend: 0,
          purchaseValue: 0,
          purchases: 0,
          accountIds: new Set<string>()
        };
      }
      ownerMap[ownerName].spend += d.spend || 0;
      ownerMap[ownerName].purchaseValue += d.purchaseValue || 0;
      ownerMap[ownerName].purchases += d.purchases || 0;
      ownerMap[ownerName].accountIds.add(d.accountId);
    });

    return Object.values(ownerMap)
      .map((item) => ({
        ...item,
        avgRoi: item.spend > 0 ? item.purchaseValue / item.spend : 0,
        accountsCount: item.accountIds.size
      }))
      .sort((a, b) => b.spend - a.spend);
  }, [safeData, mappings]);

  // 5. Aggregate Data by Date for Trend Sparkline Chart
  const dailyTrends = useMemo(() => {
    const trendMap: Record<string, { date: string; spend: number; purchaseValue: number }> = {};
    safeData.forEach((d) => {
      const dateKey = d.date;
      if (!trendMap[dateKey]) {
        trendMap[dateKey] = { date: dateKey, spend: 0, purchaseValue: 0 };
      }
      trendMap[dateKey].spend += d.spend || 0;
      trendMap[dateKey].purchaseValue += d.purchaseValue || 0;
    });

    return Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date));
  }, [safeData]);

  // SVG Trend Chart Dimensions
  const chartWidth = 500;
  const chartHeight = 120;
  const padding = 15;

  const spendPoints = useMemo(() => {
    if (dailyTrends.length < 2) return "";
    const maxVal = Math.max(...dailyTrends.map((t) => Math.max(t.spend, t.purchaseValue, 100)));
    const minVal = 0;
    const range = maxVal - minVal;

    return dailyTrends.map((t, idx) => {
      const x = padding + (idx / (dailyTrends.length - 1)) * (chartWidth - padding * 2);
      const y = chartHeight - padding - ((t.spend - minVal) / range) * (chartHeight - padding * 2);
      return `${x},${y}`;
    }).join(" ");
  }, [dailyTrends]);

  const valuePoints = useMemo(() => {
    if (dailyTrends.length < 2) return "";
    const maxVal = Math.max(...dailyTrends.map((t) => Math.max(t.spend, t.purchaseValue, 100)));
    const minVal = 0;
    const range = maxVal - minVal;

    return dailyTrends.map((t, idx) => {
      const x = padding + (idx / (dailyTrends.length - 1)) * (chartWidth - padding * 2);
      const y = chartHeight - padding - ((t.purchaseValue - minVal) / range) * (chartHeight - padding * 2);
      return `${x},${y}`;
    }).join(" ");
  }, [dailyTrends]);

  return (
    <div className="space-y-[24px]">
      {/* Primary KPI Summary Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-[16px]">
        <Card className="border-none shadow-[0_1px_3px_rgba(0,0,0,0.06)] bg-white rounded-[12px] p-[16px] relative overflow-hidden group hover:shadow-md transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[12px] font-medium text-meta-text-muted">总广告预算消耗</p>
              <h3 className="text-[24px] font-bold text-meta-dark tracking-tight mt-1">
                ${(totals.spend || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
            </div>
            <div className="p-2.5 rounded-lg bg-blue-50 text-[#076eff] group-hover:scale-110 transition-transform">
              <Coins className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-[#076eff] font-medium">
            <span className="px-1.5 py-0.5 rounded bg-blue-50">数据范围总合</span>
            <span>Meta账户投放总额</span>
          </div>
        </Card>

        <Card className="border-none shadow-[0_1px_3px_rgba(0,0,0,0.06)] bg-white rounded-[12px] p-[16px] relative overflow-hidden group hover:shadow-md transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[12px] font-medium text-meta-text-muted">总转化业务营收</p>
              <h3 className="text-[24px] font-bold text-[#10b981] tracking-tight mt-1">
                ${(totals.purchaseValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h3>
            </div>
            <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600 group-hover:scale-110 transition-transform">
              <ShoppingBag className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-emerald-600 font-medium">
            <span className="px-1.5 py-0.5 rounded bg-emerald-50">全渠道产出</span>
            <span>转化价值总合</span>
          </div>
        </Card>

        <Card className="border-none shadow-[0_1px_3px_rgba(0,0,0,0.06)] bg-white rounded-[12px] p-[16px] relative overflow-hidden group hover:shadow-md transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[12px] font-medium text-meta-text-muted">整体平均 ROI</p>
              <h3 className="text-[24px] font-bold text-meta-dark tracking-tight mt-1">
                {totals.roas.toFixed(2)}x
              </h3>
            </div>
            <div className="p-2.5 rounded-lg bg-violet-50 text-violet-600 group-hover:scale-110 transition-transform">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-violet-600 font-medium">
            <span className={`px-1.5 py-0.5 rounded ${totals.roas >= 1 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'}`}>
              {totals.roas >= 1.0 ? "ROI 极佳" : "ROI 待优化"}
            </span>
            <span>全账户合并投资回报率</span>
          </div>
        </Card>

        <Card className="border-none shadow-[0_1px_3px_rgba(0,0,0,0.06)] bg-white rounded-[12px] p-[16px] relative overflow-hidden group hover:shadow-md transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[12px] font-medium text-meta-text-muted">总订单成效</p>
              <h3 className="text-[24px] font-bold text-meta-dark tracking-tight mt-1">
                {(totals.purchases || 0).toLocaleString()} 次
              </h3>
            </div>
            <div className="p-2.5 rounded-lg bg-amber-50 text-amber-600 group-hover:scale-110 transition-transform">
              <Percent className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-amber-600 font-medium">
            <span className="px-1.5 py-0.5 rounded bg-amber-50">平均加购</span>
            <span>{totals.atcRate.toFixed(1)}% 加购率</span>
          </div>
        </Card>
      </div>

      {/* Traffic Metrics Dashboard Bar */}
      <div className="p-4 bg-gradient-to-r from-blue-50/50 via-indigo-50/50 to-white rounded-[12px] border border-blue-50 shadow-[0_1px_2px_rgba(0,0,0,0.02)] grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="space-y-1">
          <span className="text-[11px] text-gray-500 flex items-center gap-1">
            <Eye className="w-3.5 h-3.5 text-blue-500" />
            曝光印象数
          </span>
          <p className="text-[15px] font-semibold text-gray-900">{(totals.impressions || 0).toLocaleString()}</p>
        </div>
        <div className="space-y-1">
          <span className="text-[11px] text-gray-500 flex items-center gap-1">
            <MousePointer className="w-3.5 h-3.5 text-indigo-500" />
            网站点击量
          </span>
          <p className="text-[15px] font-semibold text-gray-900">{(totals.clicks || 0).toLocaleString()}</p>
        </div>
        <div className="space-y-1">
          <span className="text-[11px] text-gray-500 flex items-center gap-1 text-nowrap">
            <Percent className="w-3.5 h-3.5 text-violet-500" />
            点击率 (CTR)
          </span>
          <p className="text-[15px] font-semibold text-gray-900">{totals.ctr.toFixed(2)}%</p>
        </div>
        <div className="space-y-1">
          <span className="text-[11px] text-gray-500 flex items-center gap-1 text-nowrap">
            <Coins className="w-3.5 h-3.5 text-emerald-500" />
            单次点击费用 (CPC)
          </span>
          <p className="text-[15px] font-semibold text-gray-900">${totals.cpc.toFixed(2)}</p>
        </div>
      </div>

      {/* Bento Layout Grid for Store & Category Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-[20px]">
        {/* Daily Trend Spark chart */}
        <Card className="border-none shadow-[0_1px_3px_rgba(0,0,0,0.06)] bg-white rounded-[12px] lg:col-span-1">
          <CardHeader className="pb-2 border-b border-gray-100 flex flex-row items-center justify-between">
            <div className="space-y-0.5">
              <CardTitle className="text-[14px] font-bold text-meta-dark">消耗与营收趋势</CardTitle>
              <p className="text-[10px] text-meta-text-muted">自然日累计趋势表现</p>
            </div>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="flex items-center gap-1 font-semibold text-[#076eff]">
                <span className="w-2 h-2 rounded-full bg-[#076eff] inline-block" /> 消耗
              </span>
              <span className="flex items-center gap-1 font-semibold text-[#10b981]">
                <span className="w-2 h-2 rounded-full bg-[#10b981] inline-block" /> 展现价值
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-4 flex flex-col items-center justify-center">
            {dailyTrends.length >= 2 ? (
              <div className="w-full">
                <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="w-full overflow-visible">
                  {/* Grid Lines */}
                  <line x1="15" y1="15" x2={chartWidth - 15} y2="15" stroke="#f3f4f6" strokeWidth="1" />
                  <line x1="15" y1={chartHeight / 2} x2={chartWidth - 15} y2={chartHeight / 2} stroke="#f3f4f6" strokeWidth="1" />
                  <line x1="15" y1={chartHeight - 15} x2={chartWidth - 15} y2={chartHeight - 15} stroke="#e5e7eb" strokeWidth="1" />

                  {/* Spend Area and Line */}
                  <polyline
                    fill="none"
                    stroke="#076eff"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={spendPoints}
                  />

                  {/* Purchase Value Area and Line */}
                  <polyline
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={valuePoints}
                  />
                </svg>
                <div className="flex justify-between items-center text-[10px] text-gray-400 mt-2 px-1">
                  <span>{dailyTrends[0]?.date}</span>
                  <span>{dailyTrends[Math.floor(dailyTrends.length / 2)]?.date}</span>
                  <span>{dailyTrends[dailyTrends.length - 1]?.date}</span>
                </div>
              </div>
            ) : (
              <div className="h-[120px] w-full flex items-center justify-center text-gray-400 text-[12px]">
                暂无足够的天数折线数据
              </div>
            )}
          </CardContent>
        </Card>

        {/* Brand category share */}
        <Card className="border-none shadow-[0_1px_3px_rgba(0,0,0,0.06)] bg-white rounded-[12px] lg:col-span-2">
          <CardHeader className="pb-2 border-b border-gray-100">
            <CardTitle className="text-[14px] font-bold text-meta-dark flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#076eff]" />
              项目类别 (Category) 消耗表现
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {categoryStats.length === 0 ? (
              <div className="text-center py-6 text-gray-400 text-[12px]">暂无类别映射数据</div>
            ) : (
              categoryStats.map((cat) => {
                const totalSpendMax = Math.max(...categoryStats.map((c) => c.spend), 1);
                const percent = (cat.spend / totalSpendMax) * 100;
                return (
                  <div key={cat.project} className="space-y-1">
                    <div className="flex justify-between items-center text-[12px]">
                      <span className="font-semibold text-gray-800">{cat.project}</span>
                      <div className="flex items-center gap-4 text-[11px] text-gray-500">
                        <span>消耗: <strong className="text-gray-900">${(cat.spend || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
                        <span>成效: <strong className="text-gray-900">{cat.purchases}</strong></span>
                        <span>ROI: <strong className={cat.avgRoi >= 1 ? "text-emerald-600 bg-emerald-50 px-1 rounded font-bold" : "text-gray-500 font-bold"}>{cat.avgRoi.toFixed(2)}x</strong></span>
                        <span className="text-[10px] text-gray-400">({cat.accountsCount}个账户)</span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                      <div 
                        className="bg-logo-blue bg-gradient-to-r from-blue-500 to-indigo-600 h-full rounded-full transition-all duration-500" 
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modular Layout for Data Tables and Feature Panel */}
      <div className="flex flex-col xl:flex-row gap-[20px]">
        {/* Left Data Section: Grid layout for modular tables */}
        <div className="flex-1 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-[20px]">
            {/* Stores Performance Summary Table */}
            <Card className="border-none shadow-[0_1px_3px_rgba(0,0,0,0.06)] bg-white rounded-[12px] flex flex-col overflow-hidden max-h-[400px]">
              <div className="px-[16px] py-[12px] border-b border-gray-100 bg-gradient-to-r from-gray-50/50 to-white flex items-center gap-2">
                <StoreIcon className="w-4 h-4 text-indigo-500" />
                <span className="font-bold text-[14px] text-meta-dark">店铺消耗</span>
              </div>
              <div className="overflow-y-auto flex-1 custom-scrollbar">
                <Table className="text-[12px] whitespace-nowrap">
                  <TableHeader className="bg-gray-50/70 sticky top-0 z-10 shadow-sm shadow-gray-100/50">
                    <TableRow>
                      <TableHead className="font-semibold py-2 h-8">店铺</TableHead>
                      <TableHead className="font-semibold text-center py-2 h-8">账户</TableHead>
                      <TableHead className="font-semibold text-right py-2 h-8">消耗</TableHead>
                      <TableHead className="font-semibold text-right py-2 h-8">订单</TableHead>
                      <TableHead className="font-semibold text-right py-2 h-8">销售额</TableHead>
                      <TableHead className="font-semibold text-right py-2 h-8">ROI</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {storeStats.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-6 text-gray-400">
                          暂无店铺数据
                        </TableCell>
                      </TableRow>
                    ) : (
                      storeStats.map((item) => (
                        <TableRow key={item.store} className="hover:bg-gray-50/50">
                          <TableCell className="font-medium text-gray-900 py-2">{item.store}</TableCell>
                          <TableCell className="text-center py-2">
                            <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-medium">
                              {item.accountsCount}个
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-semibold text-gray-950 py-2">
                            ${(item.spend || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </TableCell>
                          <TableCell className="text-right text-gray-700 py-2">
                            {(item.purchases || 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-emerald-600 font-medium py-2">
                            ${(item.purchaseValue || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </TableCell>
                          <TableCell className="text-right py-2">
                            <span className={`inline-block px-1.5 py-0.5 rounded-[4px] font-bold ${item.avgRoi >= 1.0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
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

            {/* Account Owner Allocation list */}
            <Card className="border-none shadow-[0_1px_3px_rgba(0,0,0,0.06)] bg-white rounded-[12px] flex flex-col overflow-hidden max-h-[400px]">
              <div className="px-[16px] py-[12px] border-b border-gray-100 bg-gradient-to-r from-gray-50/50 to-white flex items-center gap-2">
                <User className="w-4 h-4 text-violet-500" />
                <span className="font-bold text-[14px] text-meta-dark">负责人概览</span>
              </div>
              <div className="overflow-y-auto flex-1 custom-scrollbar">
                <Table className="text-[12px] whitespace-nowrap">
                  <TableHeader className="bg-gray-50/70 sticky top-0 z-10 shadow-sm shadow-gray-100/50">
                    <TableRow>
                      <TableHead className="font-semibold py-2 h-8">负责人</TableHead>
                      <TableHead className="font-semibold text-center py-2 h-8">账户</TableHead>
                      <TableHead className="font-semibold text-right py-2 h-8">消耗</TableHead>
                      <TableHead className="font-semibold text-right py-2 h-8">单量</TableHead>
                      <TableHead className="font-semibold text-right py-2 h-8">营收</TableHead>
                      <TableHead className="font-semibold text-right py-2 h-8">ROAS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ownerStats.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-6 text-gray-400">
                          暂无分配数据
                        </TableCell>
                      </TableRow>
                    ) : (
                      ownerStats.map((item) => (
                        <TableRow key={item.owner} className="hover:bg-gray-50/50">
                          <TableCell className="font-medium text-gray-900 py-2">{item.owner}</TableCell>
                          <TableCell className="text-center py-2">
                            <span className="px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-700 text-[10px] font-medium">
                              {item.accountsCount}个
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-semibold py-2">
                            ${(item.spend || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </TableCell>
                          <TableCell className="text-right text-gray-600 py-2">
                            {(item.purchases || 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-medium text-gray-900 py-2">
                            ${(item.purchaseValue || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </TableCell>
                          <TableCell className="text-right py-2">
                            <span className={`font-bold ${item.avgRoi >= 1.0 ? 'text-emerald-600' : 'text-gray-500'}`}>
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
        </div>

        {/* Right Feature Modules Panel */}
        <div className="w-full xl:w-[260px] shrink-0">
          <Card className="border-none shadow-[0_1px_3px_rgba(0,0,0,0.06)] bg-white rounded-[12px] overflow-hidden sticky top-[20px]">
            <div className="px-[16px] py-[12px] border-b border-gray-100 bg-gray-50/30 flex items-center gap-2">
              <Layers className="w-4 h-4 text-meta-blue" />
              <span className="font-bold text-[13px] text-gray-800">视图模块配置</span>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-[11px] text-gray-500 text-left">自定义选择需要在总览中显示的模块</p>
              
              <div className="space-y-3">
                <label className="flex items-center justify-between group cursor-pointer">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded border border-blue-500 bg-blue-500 flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <span className="text-[12px] font-medium text-gray-700 group-hover:text-gray-900 transition-colors">店铺消耗概览</span>
                  </div>
                </label>

                <label className="flex items-center justify-between group cursor-pointer">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded border border-blue-500 bg-blue-500 flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <span className="text-[12px] font-medium text-gray-700 group-hover:text-gray-900 transition-colors">负责人业绩</span>
                  </div>
                </label>

                <label className="flex items-center justify-between group cursor-pointer">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded border border-gray-300 bg-white flex items-center justify-center group-hover:border-blue-400">
                    </div>
                    <span className="text-[12px] font-medium text-gray-500 group-hover:text-gray-900 transition-colors">时段消耗图</span>
                  </div>
                  <span className="text-[9px] text-meta-blue font-semibold px-1.5 py-0.5 bg-blue-50 rounded">PRO</span>
                </label>
                
                <label className="flex items-center justify-between group cursor-pointer">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded border border-gray-300 bg-white flex items-center justify-center group-hover:border-blue-400">
                    </div>
                    <span className="text-[12px] font-medium text-gray-500 group-hover:text-gray-900 transition-colors">商品成效分析</span>
                  </div>
                  <span className="text-[9px] text-gray-400 font-semibold px-1.5 py-0.5 bg-gray-100 rounded">待发布</span>
                </label>
              </div>

              <div className="pt-3 border-t border-gray-100">
                <button className="w-full py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 text-[12px] font-medium rounded-md transition-colors flex items-center justify-center gap-1.5">
                  应用视图布局
                </button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
