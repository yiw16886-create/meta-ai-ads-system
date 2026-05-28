import React, { useState, useEffect } from "react";
import axios from "axios";
import { format } from "date-fns";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Users, MapPin, MonitorPlay, CalendarDays, AlertTriangle, Search, ChevronsUpDown, Check } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export function AudienceAnalysisDashboard({ startDate, endDate }: { startDate: Date; endDate: Date }) {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"gender_age" | "country" | "placement">("gender_age");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);
  
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const res = await axios.get("/api/accounts/list");
        if (Array.isArray(res.data) && res.data.length > 0) {
          setAccounts(res.data);
          setSelectedAccount(res.data[0].accountId); // Default to first account
        }
      } catch (e) {
        console.error("Failed to fetch accounts", e);
      }
    };
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (!selectedAccount || !startDate || !endDate) return;

    const fetchInsights = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`/api/accounts/${selectedAccount}/audience-insights`, {
          params: {
            startDate: format(startDate, "yyyy-MM-dd"),
            endDate: format(endDate, "yyyy-MM-dd"),
            breakdown: activeTab,
          }
        });
        
        let processedData = res.data.map((item: any) => {
          let name = '未知';
          if (activeTab === "placement") {
            const platformMap: Record<string, string> = {
                'facebook': 'Facebook',
                'instagram': 'Instagram',
                'audience_network': 'Audience Network',
                'messenger': 'Messenger'
            };
            const posMap: Record<string, string> = {
                'feed': '信息流',
                'story': '快拍',
                'reels': 'Reels',
                'instream_video': '插播视频',
                'search': '搜索结果',
                'messages': '消息',
                'marketplace': 'Marketplace',
                'right_hand_column': '右侧边栏',
                'explore': '发现',
                'unknown': '未知'
            };
            const plt = platformMap[item.publisher_platform] || item.publisher_platform || '未知';
            const pos = posMap[item.platform_position] || item.platform_position || '未知';
            
            // For placements, omit platform if not meaningful, but usually both are passed.
            if (item.publisher_platform) {
                name = `${plt} - ${pos}`;
            }
          } else if (activeTab === "country") {
            const countryMap: Record<string, string> = {
                'US': '美国',
                'GB': '英国',
                'UK': '英国',
                'AU': '澳大利亚',
                'DE': '德国',
                'CA': '加拿大',
                'FR': '法国',
                'IT': '意大利',
                'ES': '西班牙',
                'NL': '荷兰',
                'BE': '比利时',
                'SE': '瑞典',
                'IE': '爱尔兰',
                'AT': '奥地利',
                'CH': '瑞士',
                'NO': '挪威',
                'DK': '丹麦',
                'FI': '芬兰',
                'PT': '葡萄牙',
                'GR': '希腊',
                'PL': '波兰',
                'CZ': '捷克',
                'HU': '匈牙利',
                'RO': '罗马尼亚',
                'RU': '俄罗斯',
                'BR': '巴西',
                'MX': '墨西哥',
                'AR': '阿根廷',
                'CO': '哥伦比亚',
                'CL': '智利',
                'PE': '秘鲁',
                'JP': '日本',
                'KR': '韩国',
                'IN': '印度',
                'ID': '印尼',
                'MY': '马来西亚',
                'SG': '新加坡',
                'TH': '泰国',
                'VN': '越南',
                'PH': '菲律宾',
                'NZ': '新西兰',
                'ZA': '南非',
                'AE': '阿联酋',
                'SA': '沙特阿拉伯',
                'IL': '以色列',
                'TR': '土耳其',
                'TW': '台湾',
                'HK': '香港'
            };
            name = item.country ? (countryMap[item.country.toUpperCase()] || item.country) : '未知';
          } else if (activeTab === "gender_age") {
            const genderMap: Record<string, string> = {
                'male': '男性',
                'female': '女性',
                'unknown': '未知'
            };
            const gender = genderMap[item.gender] || item.gender || '未知';
            name = `${gender} ${item.age || '未知'}`;
          }

          const actions = item.actions || [];
          const getActionVal = (type: string) => {
             const found = actions.find((a: any) => a.action_type === type);
             return found ? parseFloat(found.value) : 0;
          };
          
          const purchases = getActionVal("purchase") || getActionVal("omni_purchase");
          const addsToCart = getActionVal("add_to_cart") || getActionVal("omni_add_to_cart");
          const spend = parseFloat(item.spend || "0");
          const cpp = purchases > 0 ? spend / purchases : 0;
          const reach = parseInt(item.reach || "0");
          const impressions = parseInt(item.impressions || "0");
          const frequency = reach > 0 ? impressions / reach : 0;
          const inline_link_clicks = parseFloat(item.inline_link_clicks || "0");
          const inline_link_click_ctr = parseFloat(item.inline_link_click_ctr || "0");
          const cost_per_inline_link_click = parseFloat(item.cost_per_inline_link_click || "0");
          const clicks = parseFloat(item.clicks || "0");
          const ctr = parseFloat(item.ctr || "0");
          const cpc = parseFloat(item.cpc || "0");

          return {
            ...item,
            name,
            spend,
            purchases,
            cpp,
            addsToCart,
            linkClicks: inline_link_clicks,
            linkCTR: inline_link_click_ctr,
            cpcLink: cost_per_inline_link_click,
            clicks,
            ctr,
            cpc,
            reach,
            impressions,
            frequency
          };
        });
        
        // Sort by spend descending
        processedData.sort((a: any, b: any) => b.spend - a.spend);

        setData(processedData);
      } catch (err) {
        console.error(err);
        toast.error("获取受众数据失败");
      } finally {
        setLoading(false);
      }
    };

    fetchInsights();
  }, [selectedAccount, startDate, endDate, activeTab]);

  const filteredAccounts = accounts.filter(acc => 
    (acc.accountName || acc.accountId).toLowerCase().includes(searchQuery.toLowerCase()) ||
    acc.accountId.includes(searchQuery)
  );

  const totalPurchases = data.reduce((sum, item) => sum + (item.purchases || 0), 0);
  const totalSpend = data.reduce((sum, item) => sum + (item.spend || 0), 0);
  const totalImpressions = data.reduce((sum, item) => sum + (item.impressions || 0), 0);
  const totalReach = data.reduce((sum, item) => sum + (item.reach || 0), 0);
  const totalClicks = data.reduce((sum, item) => sum + (item.clicks || 0), 0);
  const totalLinkClicks = data.reduce((sum, item) => sum + (item.linkClicks || 0), 0);
  const totalAddsToCart = data.reduce((sum, item) => sum + (item.addsToCart || 0), 0);

  const totalCPP = totalPurchases > 0 ? totalSpend / totalPurchases : 0;
  const totalFrequency = totalReach > 0 ? totalImpressions / totalReach : 0;
  const totalCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const totalLinkCTR = totalImpressions > 0 ? (totalLinkClicks / totalImpressions) * 100 : 0;
  const totalCPC = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const totalCPCLink = totalLinkClicks > 0 ? totalSpend / totalLinkClicks : 0;

  return (
    <div className="flex flex-col h-full bg-[#f9fafb]">
      <div className="p-4 bg-white border-b flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <span className="text-[14px] font-semibold text-meta-dark">选择分析账户：</span>
          
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger render={
              <Button
                variant="outline"
                role="combobox"
                className="w-[300px] h-9 justify-between font-normal bg-white"
              />
            }>
              {selectedAccount 
                ? (accounts.find(acc => acc.accountId === selectedAccount)?.accountName || selectedAccount)
                : "选择广告账户..."}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="start">
              <div className="flex items-center border-b px-3">
                <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                <input
                  className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="搜索账户..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="max-h-[300px] overflow-y-auto p-1">
                {filteredAccounts.length === 0 ? (
                  <p className="p-4 text-center text-sm text-gray-500">未找到匹配的账户</p>
                ) : (
                  filteredAccounts.map((acc) => (
                    <div
                      key={acc.accountId}
                      className={cn(
                        "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-slate-100 hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 break-all",
                        selectedAccount === acc.accountId ? "bg-blue-50 text-blue-600 font-medium" : ""
                      )}
                      onClick={() => {
                        setSelectedAccount(acc.accountId);
                        setOpen(false);
                      }}
                    >
                      <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{acc.accountName || acc.accountId}</span>
                      {selectedAccount === acc.accountId && (
                        <Check className="ml-auto h-4 w-4 text-blue-600" />
                      )}
                    </div>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>

        </div>
        
        <div className="flex bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab("gender_age")}
            className={cn("px-4 py-1.5 text-[13px] font-medium rounded-md transition-colors", activeTab === "gender_age" ? "bg-white text-meta-blue shadow-sm" : "text-gray-600 hover:text-gray-900")}
          >
            <Users className="w-4 h-4 inline-block mr-1.5 align-text-bottom" />
            性别与年龄
          </button>
          <button
            onClick={() => setActiveTab("country")}
            className={cn("px-4 py-1.5 text-[13px] font-medium rounded-md transition-colors", activeTab === "country" ? "bg-white text-meta-blue shadow-sm" : "text-gray-600 hover:text-gray-900")}
          >
            <MapPin className="w-4 h-4 inline-block mr-1.5 align-text-bottom" />
            国家/地区
          </button>
          <button
            onClick={() => setActiveTab("placement")}
            className={cn("px-4 py-1.5 text-[13px] font-medium rounded-md transition-colors", activeTab === "placement" ? "bg-white text-meta-blue shadow-sm" : "text-gray-600 hover:text-gray-900")}
          >
            <MonitorPlay className="w-4 h-4 inline-block mr-1.5 align-text-bottom" />
            广告版位
          </button>
        </div>
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        {!selectedAccount ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Users className="w-12 h-12 mb-2 opacity-50" />
            <p>请先选择一个广告账户以查看受众分析</p>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center h-[400px]">
            <Loader2 className="w-8 h-8 animate-spin text-meta-blue" />
            <p className="mt-4 text-sm text-gray-500">正在分析受众数据...</p>
          </div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[400px] text-gray-400">
            <p>未找到该维度的受众数据 (请检查所选日期范围)</p>
          </div>
        ) : (
          <div className="space-y-6">
            <Card className="shadow-sm border-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-[15px]">核心受众消耗占比 (Top 10)</CardTitle>
              </CardHeader>
              <CardContent className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.slice(0, 10)} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 12, fill: '#6B7280' }} 
                      angle={-45}
                      textAnchor="end"
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 12, fill: '#6B7280' }} 
                      tickFormatter={(val) => `$${val}`}
                    />
                    <RechartsTooltip 
                      cursor={{ fill: '#F3F4F6' }}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: any) => [`$${parseFloat(value).toFixed(2)}`, '花费金额']}
                    />
                    <Bar dataKey="spend" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={60} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-none overflow-hidden">
              <CardHeader className="bg-[#f9fafb] border-b pb-3">
                <CardTitle className="text-[15px]">受众成效明细报表</CardTitle>
              </CardHeader>
              <div className="overflow-auto custom-scrollbar max-h-[500px] mb-2 border-b">
                <Table className="text-[13px] border-collapse relative w-max min-w-full">
                  <TableHeader className="sticky top-0 z-20 bg-[#f9fafb] shadow-sm">
                    <TableRow>
                      <TableHead className="font-semibold px-4 h-11 sticky left-0 z-30 bg-[#f9fafb] shadow-[1px_0_0_#e5e7eb]">受众维度</TableHead>
                      <TableHead className="font-semibold text-right">购物次数</TableHead>
                      <TableHead className="font-semibold text-right">单次购物费用</TableHead>
                      <TableHead className="font-semibold text-right whitespace-nowrap">花费金额</TableHead>
                      <TableHead className="font-semibold text-right whitespace-nowrap">展示次数</TableHead>
                      <TableHead className="font-semibold text-right whitespace-nowrap">覆盖人数</TableHead>
                      <TableHead className="font-semibold text-right whitespace-nowrap">频次</TableHead>
                      <TableHead className="font-semibold text-right whitespace-nowrap">链接点击量</TableHead>
                      <TableHead className="font-semibold text-right whitespace-nowrap">链接点击率</TableHead>
                      <TableHead className="font-semibold text-right whitespace-nowrap">单次链接点击</TableHead>
                      <TableHead className="font-semibold text-right whitespace-nowrap">点击量</TableHead>
                      <TableHead className="font-semibold text-right whitespace-nowrap">点击率</TableHead>
                      <TableHead className="font-semibold text-right whitespace-nowrap">单次点击</TableHead>
                      <TableHead className="font-semibold text-right whitespace-nowrap">加入购物车</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.map((row, idx) => {
                      return (
                        <TableRow key={idx} className="hover:bg-gray-50 border-b group">
                          <TableCell className="font-medium px-4 sticky left-0 z-10 bg-white group-hover:bg-gray-50 shadow-[1px_0_0_#e5e7eb] text-meta-blue max-w-[200px] truncate" title={row.name}>{row.name}</TableCell>
                          <TableCell className="text-right font-semibold">{row.purchases}</TableCell>
                          <TableCell className="text-right">${row.cpp.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-medium text-meta-dark">
                            ${row.spend.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">{row.impressions.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{row.reach.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{row.frequency.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{row.linkClicks}</TableCell>
                          <TableCell className="text-right">{row.linkCTR.toFixed(2)}%</TableCell>
                          <TableCell className="text-right">${row.cpcLink.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{row.clicks}</TableCell>
                          <TableCell className="text-right">{row.ctr.toFixed(2)}%</TableCell>
                          <TableCell className="text-right">${row.cpc.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{row.addsToCart}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  {data.length > 0 && (
                    <TableFooter className="sticky bottom-0 z-20 bg-gray-50 shadow-[0_-1px_0_#e5e7eb] font-semibold border-t">
                      <TableRow className="hover:bg-gray-50">
                        <TableCell className="px-4 sticky left-0 z-30 bg-gray-50 shadow-[1px_0_0_#e5e7eb]">
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold">{data.length} 个受众维度的汇总</span>
                            <span className="text-xs font-normal text-muted-foreground mt-0.5">成效汇总</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right align-top pt-4 text-sm">{totalPurchases}</TableCell>
                        <TableCell className="text-right align-top pt-4">${totalCPP.toFixed(2)}</TableCell>
                        <TableCell className="text-right align-top pt-4 text-meta-dark">${totalSpend.toFixed(2)}</TableCell>
                        <TableCell className="text-right align-top pt-4">{totalImpressions.toLocaleString()}</TableCell>
                        <TableCell className="text-right align-top pt-4">{totalReach.toLocaleString()}</TableCell>
                        <TableCell className="text-right align-top pt-4">{totalFrequency.toFixed(2)}</TableCell>
                        <TableCell className="text-right align-top pt-4">{totalLinkClicks.toLocaleString()}</TableCell>
                        <TableCell className="text-right align-top pt-4">{totalLinkCTR.toFixed(2)}%</TableCell>
                        <TableCell className="text-right align-top pt-4">${totalCPCLink.toFixed(2)}</TableCell>
                        <TableCell className="text-right align-top pt-4">{totalClicks.toLocaleString()}</TableCell>
                        <TableCell className="text-right align-top pt-4">{totalCTR.toFixed(2)}%</TableCell>
                        <TableCell className="text-right align-top pt-4">${totalCPC.toFixed(2)}</TableCell>
                        <TableCell className="text-right align-top pt-4">{totalAddsToCart.toLocaleString()}</TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

