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
        const summaryKey = Object.keys(storeSummaries).find(k => k.toLowerCase() === item.store.toLowerCase());
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
                ${totals.spend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                ${totals.purchaseValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                {totals.purchases.toLocaleString()} 次
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
          <p className="text-[15px] font-semibold text-gray-900">{totals.impressions.toLocaleString()}</p>
        </div>
        <div className="space-y-1">
          <span className="text-[11px] text-gray-500 flex items-center gap-1">
            <MousePointer className="w-3.5 h-3.5 text-indigo-500" />
            网站点击量
          </span>
          <p className="text-[15px] font-semibold text-gray-900">{totals.clicks.toLocaleString()}</p>
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
                        <span>消耗: <strong className="text-gray-900">${cat.spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong></span>
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

      {/* Stores Performance Summary Table */}
      <Card className="border-none shadow-[0_1px_3px_rgba(0,0,0,0.06)] bg-white rounded-[12px] overflow-hidden">
        <div className="px-[16px] py-[12px] border-b border-gray-100 bg-gradient-to-r from-gray-50/50 to-white flex items-center gap-2">
          <StoreIcon className="w-4 h-4 text-indigo-500" />
          <span className="font-bold text-[14px] text-meta-dark">店铺全维度消耗总览 (Store Performance)</span>
        </div>
        <div className="overflow-x-auto">
          <Table className="text-[12px]">
            <TableHeader className="bg-gray-50/70">
              <TableRow>
                <TableHead className="font-semibold">店铺名称</TableHead>
                <TableHead className="font-semibold text-center">绑定账户数</TableHead>
                <TableHead className="font-semibold text-right">广告消耗</TableHead>
                <TableHead className="font-semibold text-right">总订单数</TableHead>
                <TableHead className="font-semibold text-right">总销售额</TableHead>
                <TableHead className="font-semibold text-right">平均投资回报 (ROI)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {storeStats.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-gray-400">
                    目前没有发现绑定了店铺的Meta广告账户记录。
                  </TableCell>
                </TableRow>
              ) : (
                storeStats.map((item) => (
                  <TableRow key={item.store} className="hover:bg-gray-50/50">
                    <TableCell className="font-medium text-gray-900">{item.store}</TableCell>
                    <TableCell className="text-center">
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-medium">
                        {item.accountsCount}个
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-semibold text-gray-950">
                      ${item.spend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right text-gray-700">
                      {item.purchases.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-emerald-600 font-medium">
                      ${item.purchaseValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`inline-block px-2 py-0.5 rounded-[4px] font-bold ${item.avgRoi >= 1.0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
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
      <Card className="border-none shadow-[0_1px_3px_rgba(0,0,0,0.06)] bg-white rounded-[12px] overflow-hidden">
        <div className="px-[16px] py-[12px] border-b border-gray-100 bg-gradient-to-r from-gray-50/50 to-white flex items-center gap-2">
          <User className="w-4 h-4 text-violet-500" />
          <span className="font-bold text-[14px] text-meta-dark">负责人分配及投放消耗概览 (Mediabuyer Owner)</span>
        </div>
        <div className="overflow-x-auto">
          <Table className="text-[12px]">
            <TableHeader className="bg-gray-50/70">
              <TableRow>
                <TableHead className="font-semibold">负责人</TableHead>
                <TableHead className="font-semibold text-center">负责账户数量</TableHead>
                <TableHead className="font-semibold text-right">时间段总消耗</TableHead>
                <TableHead className="font-semibold text-right">时间段总成效 (单量)</TableHead>
                <TableHead className="font-semibold text-right">时间段总营收</TableHead>
                <TableHead className="font-semibold text-right">平均 ROAS</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ownerStats.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-gray-400">
                    未分配任何负责人
                  </TableCell>
                </TableRow>
              ) : (
                ownerStats.map((item) => (
                  <TableRow key={item.owner} className="hover:bg-gray-50/50">
                    <TableCell className="font-medium text-gray-900">{item.owner}</TableCell>
                    <TableCell className="text-center">
                      <span className="px-2.5 py-0.5 rounded-full bg-violet-50 text-violet-700 text-[11px] font-medium">
                        {item.accountsCount} 个账户
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-semibold">
                      ${item.spend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right text-gray-600">
                      {item.purchases.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right font-medium text-gray-900">
                      ${item.purchaseValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-right">
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
  );
}
