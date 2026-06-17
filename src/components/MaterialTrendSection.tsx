import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend as RechartsLegend,
} from 'recharts';
import ReactECharts from 'echarts-for-react';
import { Target, MousePointerClick, ShoppingCart, CreditCard, TrendingUp, Sparkles, Activity } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface MaterialTrendSectionProps {
  startDate: string;        // 格式如 "2026-06-08"
  endDate: string;          // 格式如 "2026-06-15"
  selectedShopId: string;    // 店铺ID，如 "unitedloot"、"baslayer" 或 "all"
  selectedAccountId: string; // 账户ID 或 "all"
  materialType: string;      // "IMAGE"、"VIDEO" 或 "all"
}

interface TrendData {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  link_clicks: number;
  add_to_cart: number;
  initiated_checkouts: number;
  purchases: number;
  purchaseValue: number;
  roas?: number;
  atcRate?: number;
}

export function MaterialTrendSection({
  startDate,
  endDate,
  selectedShopId,
  selectedAccountId,
  materialType,
}: MaterialTrendSectionProps) {
  const [data, setData] = useState<TrendData[]>([]);
  const [creativeData, setCreativeData] = useState<any[]>([]);
  const [backendHeatmap, setBackendHeatmap] = useState<number[][]>([]);
  const [loading, setLoading] = useState(false);
  const [hoveredData, setHoveredData] = useState<TrendData | null>(null);

  // Fetch data
  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      setLoading(true);
      try {
        const [trendRes, leaderRes] = await Promise.all([
          axios.get('/api/materials/trend', {
            params: { storeId: selectedShopId, accountId: selectedAccountId, startDate, endDate, materialType },
          }),
          axios.get('/api/materials/leaderboard', {
            params: { storeId: selectedShopId, accountId: selectedAccountId, startDate, endDate, materialType, sortBy: 'spend', sortOrder: 'desc', page: 1, limit: 100 },
          }).catch(() => ({ data: { success: false, data: [] } }))
        ]);
        
        if (isMounted && trendRes.data.success) {
          const rawData: TrendData[] = trendRes.data.data;
          const processed = rawData.map((d) => ({
            ...d,
            roas: d.spend > 0 ? Number((d.purchaseValue / d.spend).toFixed(2)) : 0,
            atcRate: d.link_clicks > 0 ? Number(((d.add_to_cart / d.link_clicks) * 100).toFixed(2)) : 0,
          }));
          setData(processed);
          if (trendRes.data.heatmapData) {
            setBackendHeatmap(trendRes.data.heatmapData);
          }
        }
        
        if (isMounted && leaderRes.data.success) {
          setCreativeData(leaderRes.data.data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();
    return () => { isMounted = false; };
  }, [startDate, endDate, selectedShopId, selectedAccountId, materialType]);

  // Aggregate total
  const totalData = useMemo(() => {
    if (data.length === 0) return null;
    return data.reduce(
      (acc, curr) => {
        acc.spend += curr.spend;
        acc.impressions += curr.impressions;
        acc.clicks += curr.clicks;
        acc.link_clicks += curr.link_clicks;
        acc.add_to_cart += curr.add_to_cart;
        acc.initiated_checkouts += curr.initiated_checkouts;
        acc.purchases += curr.purchases;
        acc.purchaseValue += curr.purchaseValue;
        return acc;
      },
      {
        spend: 0, impressions: 0, clicks: 0, link_clicks: 0,
        add_to_cart: 0, initiated_checkouts: 0, purchases: 0, purchaseValue: 0, date: '全量'
      } as any
    );
  }, [data]);

  const displayData = hoveredData || totalData;

  // Real creative data mapped to Scatter Plot
  const scatterData = useMemo(() => {
    const points: any[] = [];
    let avgSpend = 0;
    
    if (creativeData && creativeData.length > 0) {
      creativeData.forEach(item => {
        const spend = Number(item.spend) || 0;
        const roas = Number(item.roas) || 0;
        const impressions = Number(item.impressions) || 0;
        const name = item.material_name || item.name || item.effectivePostId || item.creative_id || '未命名素材';
        const previewUrl = item.preview_url || item.previewUrl || '';
        avgSpend += spend;
        points.push([spend, roas, impressions, name, previewUrl]);
      });
      avgSpend = creativeData.length > 0 ? avgSpend / creativeData.length : 0;
      return { points, avgSpend };
    }

    return { points: [], avgSpend: 0 };
  }, [creativeData]);

  const top10Materials = useMemo(() => {
    if (!creativeData || creativeData.length === 0) return [];
    
    // Filter out invalid items, sort by ROAS desc, take top 10
    const sorted = [...creativeData]
      .filter(item => Number(item.roas) > 0)
      .sort((a, b) => Number(b.roas) - Number(a.roas))
      .slice(0, 10);
      
    return sorted.map(item => ({
      name: item.material_name || item.name || item.effectivePostId || item.creative_id || '未命名素材',
      roas: Number(item.roas).toFixed(2),
      spend: Number(item.spend),
      previewUrl: item.preview_url || item.previewUrl || '',
      landingUrl: item.landing_url || item.landingUrl || ''
    }));
  }, [creativeData]);

  // Custom tooltips & events
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900 border border-slate-700/50 p-4 rounded-xl shadow-xl text-slate-100 z-50 relative">
          <p className="font-medium text-[13px] mb-2 text-slate-300">{label}</p>
          {payload.map((p: any, idx: number) => (
            <div key={idx} className="flex justify-between items-center gap-4 text-xs py-0.5">
              <span style={{ color: p.color }} className="font-medium">{p.name}:</span>
              <span className="font-mono">
                {p.name === '费用 ($)' || p.name === '购物金额 ($)' ? '$' : ''}
                {p.value?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                {p.name === 'ROAS' ? 'x' : ''}
                {p.name === '加购率 (%)' ? '%' : ''}
              </span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  const handleMouseMove = (state: any) => {
    if (state.isTooltipActive && state.activePayload && state.activePayload.length) {
      const activeItem = state.activePayload[0].payload as TrendData;
      setHoveredData(activeItem);
    } else {
      setHoveredData(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl w-full animate-pulse flex flex-col gap-6">
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-800" />
            <div className="flex flex-col gap-2">
              <div className="h-5 w-48 bg-slate-800 rounded" />
              <div className="h-3 w-32 bg-slate-800/80 rounded" />
            </div>
          </div>
          <div className="w-32 h-8 rounded-full bg-slate-800" />
        </div>
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-7 h-[340px] bg-slate-800/50 rounded-xl" />
          <div className="col-span-12 lg:col-span-5 h-[340px] bg-slate-800/50 rounded-xl" />
          <div className="col-span-12 lg:col-span-6 h-[320px] bg-slate-800/50 rounded-xl" />
          <div className="col-span-12 lg:col-span-6 h-[320px] bg-slate-800/50 rounded-xl" />
        </div>
      </div>
    );
  }

  // 计算漏斗卡片的转换率防除零
  const calcRate = (numerator: number, denominator: number) => {
    if (!denominator || denominator === 0) return 0;
    return ((numerator / denominator) * 100).toFixed(2);
  };

  const funnelImpressions = displayData?.impressions || 0;
  const funnelClicks = displayData?.clicks || 0;
  const funnelLinkClicks = displayData?.link_clicks || 0;
  const funnelATC = displayData?.add_to_cart || 0;
  const funnelCheckouts = displayData?.initiated_checkouts || 0;
  const funnelPurchases = displayData?.purchases || 0;

  const ctr = calcRate(funnelClicks, funnelImpressions);
  const atcRate = calcRate(funnelATC, funnelLinkClicks);
  const checkoutRate = calcRate(funnelCheckouts, funnelATC);
  const cvr = calcRate(funnelPurchases, funnelCheckouts);

  // ECharts Options
  const scatterOption = {
    backgroundColor: 'transparent',
    grid: { top: 40, right: 30, bottom: 30, left: 40 },
    tooltip: {
      trigger: 'item',
      backgroundColor: 'transparent',
      borderColor: 'transparent',
      padding: 0,
      formatter: function (params: any) {
        const rawData = params.value;
        const previewUrl = rawData[4];
        const imageHtml = previewUrl ? `<div style="margin-bottom: 8px; text-align: center;"><img src="${previewUrl}" style="max-width: 180px; max-height: 120px; border-radius: 4px; object-fit: cover;" /></div>` : '';
        return `
          <div style="padding: 8px; font-family: sans-serif; background: #0f172a; border: 1px solid #334155; color: #fff; border-radius: 6px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.5);">
            ${imageHtml}
            <div style="font-weight: bold; margin-bottom: 6px; color: #2dd4bf; max-width: 200px; word-break: break-all;">
              📦 素材名称: ${rawData[3] || '未命名素材'}
            </div>
            <div style="border-top: 1px solid #334155; padding-top: 6px; font-size: 12px; line-height: 1.8;">
              💵 <span style="color: #94a3b8;">累计花费:</span> <span style="font-weight: bold;">$${rawData[0].toLocaleString(undefined, { maximumFractionDigits: 2 })}</span><br/>
              🚀 <span style="color: #94a3b8;">实时 ROAS:</span> <span style="font-weight: bold; color: #4ade80;">${rawData[1].toFixed(2)}x</span><br/>
              👁️ <span style="color: #94a3b8;">展示数量:</span> <span>${rawData[2].toLocaleString()}</span>
            </div>
          </div>
        `;
      }
    },
    xAxis: {
      type: 'value',
      name: '花费 ($)',
      nameLocation: 'middle',
      nameGap: 25,
      nameTextStyle: { color: '#94a3b8', fontSize: 11 },
      splitLine: { show: true, lineStyle: { type: 'dashed', color: '#1e293b' } },
      axisLabel: { color: '#94a3b8', fontSize: 10 }
    },
    yAxis: {
      type: 'value',
      name: 'ROAS',
      splitLine: { show: true, lineStyle: { type: 'dashed', color: '#1e293b' } },
      axisLabel: { color: '#94a3b8', fontSize: 10 }
    },
    series: [{
      type: 'scatter',
      data: scatterData.points,
      symbolSize: function (d: any) { return Math.min(Math.max(d[2] / 500, 8), 35); },
      itemStyle: { color: '#3b82f6', shadowBlur: 10, shadowColor: 'rgba(59, 130, 246, 0.6)', opacity: 0.8 },
      markLine: {
        silent: true,
        symbol: ['none', 'none'],
        label: { formatter: '{b}', position: 'end', color: '#94a3b8', fontSize: 10 },
        lineStyle: { type: 'solid', color: '#f43f5e', width: 1, opacity: 0.5 },
        data: [
          { yAxis: 2.0, name: '保本 2.0' },
          { xAxis: scatterData.avgSpend, name: '均值' }
        ]
      }
    }]
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col gap-6 w-full font-sans max-w-full overflow-hidden animate-in fade-in duration-500">
      
      {/* 行 0: 头部标题 */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-teal-500/10 flex items-center justify-center border border-teal-500/20">
            <Activity className="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">素材表现走势与联动漏斗</h3>
            <p className="text-xs text-slate-400 font-medium">基准：100% 真实 Neon PostgreSQL 流重构数据集合</p>
          </div>
        </div>
        
        {hoveredData ? (
          <div className="px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm font-mono font-bold flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            游标: {hoveredData.date}
          </div>
        ) : (
          <div className="px-4 py-1.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-sm font-medium">
            全量周期聚合
          </div>
        )}
      </div>

      <div className="grid grid-cols-12 gap-5">
        
        {/* Row 1, Col 1: 走势线图 (60%) */}
        <div className="col-span-12 lg:col-span-7 bg-slate-800/30 border border-slate-700/50 rounded-xl p-4 flex flex-col" onMouseLeave={() => setHoveredData(null)}>
          <h4 className="text-slate-300 text-[13px] font-bold uppercase tracking-wider mb-4 border-l-2 border-slate-500 pl-2">
            主轴：多指标双轴趋势
          </h4>
          <div className="w-full h-[300px] relative">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={data}
                margin={{ top: 5, right: 0, left: -20, bottom: 0 }}
                onMouseMove={handleMouseMove}
                onMouseLeave={() => setHoveredData(null)}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.5} />
                <XAxis 
                  dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} 
                  tickFormatter={(val) => { try { return format(parseISO(val), 'MM-dd'); } catch(e) { return val; } }}
                  dy={10}
                />
                <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(v) => `$${v}`} />
                <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <RechartsTooltip content={<CustomTooltip />} />
                <RechartsLegend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} iconType="circle" />
                <Bar yAxisId="left" dataKey="spend" name="费用 ($)" fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={30} />
                <Line yAxisId="left" type="monotone" dataKey="purchaseValue" name="购物金额 ($)" stroke="#a855f7" strokeWidth={2} dot={false} activeDot={{ r: 5, fill: '#a855f7', strokeWidth: 0 }} />
                <Line yAxisId="right" type="stepAfter" dataKey="roas" name="ROAS" stroke="#2dd4bf" strokeWidth={2} dot={{ r: 2, fill: '#2dd4bf' }} activeDot={{ r: 5 }} />
                <Line yAxisId="right" type="monotone" dataKey="atcRate" name="加购率 (%)" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 4" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Row 1, Col 2: 紧凑漏斗框 (40%) */}
        <div className="col-span-12 lg:col-span-5 flex flex-col gap-3">
          <h4 className="text-slate-300 text-[13px] font-bold uppercase tracking-wider mb-1 border-l-2 border-slate-500 pl-2">
            模型：倒金字塔剔除
          </h4>
          
          {/* Layer 1: 曝光层 (最宽) */}
          <div className="relative w-full overflow-hidden rounded-xl bg-slate-800/60 border border-slate-700/80 p-3 hover:bg-slate-800 transition-colors">
            <div className="flex justify-between items-center mb-1.5">
              <div className="flex items-center gap-2">
                <Target className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-[11px] text-slate-400 font-medium">L1: 曝光转化</span>
              </div>
              <span className="px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-[11px] font-bold font-mono text-white">
                CTR {ctr}%
              </span>
            </div>
            <div className="flex items-center gap-2 px-1">
              <span className="text-sm font-bold font-mono text-slate-200">{funnelImpressions.toLocaleString()}</span>
              <ArrowRight className="w-3 h-3 text-slate-600" />
              <span className="text-sm font-bold font-mono text-indigo-400">{funnelClicks.toLocaleString()}</span>
            </div>
            <div className="w-full bg-slate-900/80 h-1.5 mt-2 rounded-full overflow-hidden"><div className="bg-indigo-500 h-full rounded-full w-full"></div></div>
          </div>

          {/* Layer 2: 进站层 */}
          <div className="relative w-[92%] mx-auto overflow-hidden rounded-xl bg-slate-800/60 border border-slate-700/80 p-3 hover:bg-slate-800 transition-colors">
            <div className="flex justify-between items-center mb-1.5">
              <div className="flex items-center gap-2">
                <MousePointerClick className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-[11px] text-slate-400 font-medium">L2: 进站加购</span>
              </div>
              <span className="px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-[11px] font-bold font-mono text-white">
                ATC {atcRate}%
              </span>
            </div>
            <div className="flex items-center gap-2 px-1">
              <span className="text-sm font-bold font-mono text-slate-200">{funnelLinkClicks.toLocaleString()}</span>
              <ArrowRight className="w-3 h-3 text-slate-600" />
              <span className="text-sm font-bold font-mono text-blue-400">{funnelATC.toLocaleString()}</span>
            </div>
            <div className="w-full bg-slate-900/80 h-1.5 mt-2 rounded-full overflow-hidden"><div className="bg-blue-500 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, Number(atcRate))}%` }}></div></div>
          </div>

          {/* Layer 3: 结账层 */}
          <div className="relative w-[84%] mx-auto overflow-hidden rounded-xl bg-slate-800/60 border border-slate-700/80 p-3 hover:bg-slate-800 transition-colors">
            <div className="flex justify-between items-center mb-1.5">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-[11px] text-slate-400 font-medium">L3: 结账发起</span>
              </div>
              <span className="px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-[11px] font-bold font-mono text-white">
                CHK {checkoutRate}%
              </span>
            </div>
            <div className="flex items-center gap-2 px-1">
              <span className="text-sm font-bold font-mono text-slate-200">{funnelATC.toLocaleString()}</span>
              <ArrowRight className="w-3 h-3 text-slate-600" />
              <span className="text-sm font-bold font-mono text-amber-500">{funnelCheckouts.toLocaleString()}</span>
            </div>
            <div className="w-full bg-slate-900/80 h-1.5 mt-2 rounded-full overflow-hidden"><div className="bg-amber-500 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, Number(checkoutRate))}%` }}></div></div>
          </div>

          {/* Layer 4: 变现层 (最窄) */}
          <div className="relative w-[76%] mx-auto overflow-hidden rounded-xl bg-slate-800/60 border border-teal-500/30 p-3 hover:border-teal-500/60 transition-colors">
            <div className="flex justify-between items-center mb-1.5">
              <div className="flex items-center gap-2">
                <CreditCard className="w-3.5 h-3.5 text-teal-400" />
                <span className="text-[11px] text-slate-400 font-medium">L4: 终极变现</span>
              </div>
              <span className="px-1.5 py-0.5 bg-teal-950/50 border border-teal-500/50 rounded text-[11px] font-bold font-mono text-teal-300">
                CVR {cvr}%
              </span>
            </div>
            <div className="flex items-center gap-2 px-1">
              <span className="text-sm font-bold font-mono text-slate-200">{funnelCheckouts.toLocaleString()}</span>
              <ArrowRight className="w-3 h-3 text-slate-600" />
              <span className="text-sm font-bold font-mono text-teal-400">{funnelPurchases.toLocaleString()}</span>
            </div>
            <div className="w-full bg-slate-900/80 h-1.5 mt-2 rounded-full overflow-hidden"><div className="bg-teal-400 h-full rounded-full transition-all duration-500 shadow-[0_0_8px_rgba(45,212,191,0.8)]" style={{ width: `${Math.min(100, Number(cvr))}%` }}></div></div>
          </div>
        </div>

        {/* Row 2, Col 1: 散点象限 (50%) */}
        <div className="col-span-12 lg:col-span-6 bg-slate-800/30 border border-slate-700/50 rounded-xl p-4 flex flex-col">
          <h4 className="text-slate-300 text-[13px] font-bold uppercase tracking-wider mb-2 border-l-2 border-slate-500 pl-2">
            洞察：素材边际效应四象限
          </h4>
          <ReactECharts option={scatterOption} style={{ height: 320, width: '100%' }} />
        </div>

        {/* Row 2, Col 2: Top 10 Materials List */}
        <div className="col-span-12 lg:col-span-6 bg-slate-800/30 border border-slate-700/50 rounded-xl p-4 flex flex-col relative overflow-hidden">
          <div className="flex items-center justify-between mb-4 border-l-2 border-teal-500 pl-2">
            <h4 className="text-slate-200 text-[13px] font-bold uppercase tracking-wider">
              🔥 转化榜眼: TOP 10 高 ROAS 素材
            </h4>
          </div>
          
          <div className="flex-1 overflow-auto pr-2 space-y-2 snap-y" style={{ maxHeight: '310px' }}>
            {top10Materials.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                暂无带有真实 ROAS 转化数据的素材可以上榜。
              </div>
            ) : (
              top10Materials.map((item, idx) => (
                <div key={idx} className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 flex gap-4 items-center group hover:bg-slate-800 transition-colors snap-start">
                  <div className="flex-shrink-0 w-8 text-center text-slate-400 font-bold text-lg italic">
                    #{idx + 1}
                  </div>
                  
                  {item.previewUrl && (
                    <div className="w-12 h-12 rounded bg-slate-900 overflow-hidden flex-shrink-0 border border-slate-600/50">
                       <img src={item.previewUrl} alt={item.name} className="w-full h-full object-cover" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-slate-200 truncate">
                      {item.name}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs">
                      <span className="text-emerald-400 font-mono font-bold bg-emerald-400/10 px-1.5 py-0.5 rounded">
                        ROAS {item.roas}
                      </span>
                      <span className="text-slate-400 font-mono">
                        花费 ${item.spend}
                      </span>
                    </div>
                  </div>
                  
                  {item.landingUrl && (
                    <a
                      href={item.landingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="opacity-0 group-hover:opacity-100 p-2 bg-slate-700/50 hover:bg-teal-500 hover:text-white text-teal-400 rounded transition-all flex-shrink-0"
                      title="打开落地页"
                    >
                      <svg fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" className="w-4 h-4">
                         <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/>
                      </svg>
                    </a>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

function ArrowRight(props: any) {
  return (
    <svg fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" {...props}>
      <path d="M5 12h14m-7-7 7 7-7 7" />
    </svg>
  );
}