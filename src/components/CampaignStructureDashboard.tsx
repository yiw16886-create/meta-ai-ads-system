import React, { useState, useEffect } from "react";
import axios from "axios";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Loader2, RefreshCcw, AlertTriangle, Search, ChevronsUpDown, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function CampaignStructureDashboard({ startDate, endDate }: { startDate: Date; endDate: Date }) {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"campaigns" | "adsets" | "ads">("campaigns");
  
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

  // Selection States
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  const [selectedAdSetIds, setSelectedAdSetIds] = useState<string[]>([]);
  const [selectedAdIds, setSelectedAdIds] = useState<string[]>([]);

  // Reset selected items when the account changes
  useEffect(() => {
    setSelectedCampaignIds([]);
    setSelectedAdSetIds([]);
    setSelectedAdIds([]);
  }, [selectedAccount]);

  // For cascade filters (Optional enhancement to filter the view below)
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [adsetFilter, setAdsetFilter] = useState("all");

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

  const fetchDataForTab = async () => {
    if (!selectedAccount || !startDate || !endDate) return;
    setLoading(true);
    try {
      const res = await axios.get(`/api/accounts/${selectedAccount}/details`, {
        params: {
          level: activeTab,
          startDate: format(startDate, "yyyy-MM-dd"),
          endDate: format(endDate, "yyyy-MM-dd"),
        }
      });
      // Flatten the insights out
      const processed = (res.data.data || []).map((item: any) => {
        const insights = item.insights?.data?.[0] || {};
        
        const actions = insights.actions || [];
        const actionValues = insights.action_values || [];
        
        const getActionVal = (type: string) => {
           const found = actions.find((a: any) => a.action_type === type);
           return found ? parseFloat(found.value) : 0;
        }

        const getValueVal = (type: string) => {
           const found = actionValues.find((a: any) => a.action_type === type);
           return found ? parseFloat(found.value) : 0;
        }
        
        const purchases = getActionVal("purchase") || getActionVal("omni_purchase");
        const addsToCart = getActionVal("add_to_cart") || getActionVal("omni_add_to_cart");
        const initiateCheckouts = getActionVal("initiate_checkout") || getActionVal("omni_initiate_checkout");
        const purchaseValue = getValueVal("purchase") || getValueVal("omni_purchase");
        
        const spend = parseFloat(insights.spend || "0");
        const roas = spend > 0 ? purchaseValue / spend : 0;
        const cpp = purchases > 0 ? spend / purchases : 0;
        const cpa = addsToCart > 0 ? spend / addsToCart : 0;
        
        const inline_link_clicks = parseFloat(insights.inline_link_clicks || "0");
        const inline_link_click_ctr = parseFloat(insights.inline_link_click_ctr || "0");
        const cost_per_inline_link_click = parseFloat(insights.cost_per_inline_link_click || "0");
        const clicks = parseFloat(insights.clicks || "0");
        const ctr = parseFloat(insights.ctr || "0");
        const cpc = parseFloat(insights.cpc || "0");

        return {
          id: item.id,
          name: item.name,
          status: item.status || item.effective_status,
          budget: parseFloat(item.daily_budget || "0") / 100 || parseFloat(item.lifetime_budget || "0") / 100, // Meta format
          spend,
          purchases,
          purchaseValue,
          roas,
          initiateCheckouts,
          cpp,
          cpa,
          addsToCart,
          atcRate: clicks > 0 ? (addsToCart / clicks) * 100 : 0,
          linkClicks: inline_link_clicks,
          linkCTR: inline_link_click_ctr,
          cpcLink: cost_per_inline_link_click,
          clicks,
          ctr,
          cpc,
          impressions: parseInt(insights.impressions || "0"),
          reach: parseInt(insights.reach || "0"),
          frequency: parseFloat(insights.frequency || "0"),
          checkoutRate: clicks > 0 ? (initiateCheckouts / clicks) * 100 : 0,
          campaign_id: item.campaign_id,
          adset_id: item.adset_id,
          creative_id: item.creative_id || item.creative?.id || null
        }
      });

      setData(processed);
    } catch (err) {
      console.error(err);
      toast.error("获取数据失败");
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDataForTab();
  }, [selectedAccount, startDate, endDate, activeTab]);

  // Helper to get active selected ID list for current activeTab
  const getActiveSelectedList = () => {
    if (activeTab === "campaigns") return selectedCampaignIds;
    if (activeTab === "adsets") return selectedAdSetIds;
    return selectedAdIds;
  };

  // Helper to update active selected list for current activeTab
  const setActiveSelectedList = (newIds: string[]) => {
    if (activeTab === "campaigns") {
      setSelectedCampaignIds(newIds);
    } else if (activeTab === "adsets") {
      setSelectedAdSetIds(newIds);
    } else {
      setSelectedAdIds(newIds);
    }
  };

  // Click on campaign or adset name to jump
  const handleNameClick = (row: any) => {
    if (activeTab === "campaigns") {
      setSelectedCampaignIds([row.id]);
      setSelectedAdSetIds([]);
      setSelectedAdIds([]);
      setActiveTab("adsets");
    } else if (activeTab === "adsets") {
      setSelectedAdSetIds([row.id]);
      setSelectedAdIds([]);
      setActiveTab("ads");
    }
  };

  // Handle cascading filters client side
  const filteredData = data.filter(item => {
    if (activeTab === "adsets" || activeTab === "ads") {
      if (selectedCampaignIds.length > 0) {
        if (!selectedCampaignIds.includes(item.campaign_id)) return false;
      } else if (campaignFilter !== "all" && item.campaign_id !== campaignFilter) {
        return false;
      }
    }
    if (activeTab === "ads") {
      if (selectedAdSetIds.length > 0) {
        if (!selectedAdSetIds.includes(item.adset_id)) return false;
      } else if (adsetFilter !== "all" && item.adset_id !== adsetFilter) {
        return false;
      }
    }
    return true;
  });

  const sortedData = [...filteredData].sort((a, b) => {
    if (!sortConfig) return 0;
    const aVal = a[sortConfig.key];
    const bVal = b[sortConfig.key];
    if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const filteredAccounts = accounts.filter(acc => 
    (acc.accountName || acc.accountId).toLowerCase().includes(searchQuery.toLowerCase()) ||
    acc.accountId.includes(searchQuery)
  );

  const totalPurchases = filteredData.reduce((sum, item) => sum + (item.purchases || 0), 0);
  const totalPurchaseValue = filteredData.reduce((sum, item) => sum + (item.purchaseValue || 0), 0);
  const totalInitiateCheckouts = filteredData.reduce((sum, item) => sum + (item.initiateCheckouts || 0), 0);
  const totalSpend = filteredData.reduce((sum, item) => sum + (item.spend || 0), 0);
  const totalImpressions = filteredData.reduce((sum, item) => sum + (item.impressions || 0), 0);
  const totalReach = filteredData.reduce((sum, item) => sum + (item.reach || 0), 0);
  const totalClicks = filteredData.reduce((sum, item) => sum + (item.clicks || 0), 0);
  const totalLinkClicks = filteredData.reduce((sum, item) => sum + (item.linkClicks || 0), 0);
  const totalAddsToCart = filteredData.reduce((sum, item) => sum + (item.addsToCart || 0), 0);

  const totalCPP = totalPurchases > 0 ? totalSpend / totalPurchases : 0;
  const totalROAS = totalSpend > 0 ? totalPurchaseValue / totalSpend : 0;
  const totalCPA = totalAddsToCart > 0 ? totalSpend / totalAddsToCart : 0;
  const totalCheckoutRate = totalClicks > 0 ? (totalInitiateCheckouts / totalClicks) * 100 : 0;
  const totalATCRate = totalClicks > 0 ? (totalAddsToCart / totalClicks) * 100 : 0;
  const totalFrequency = totalReach > 0 ? totalImpressions / totalReach : 0;
  const totalCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const totalLinkCTR = totalImpressions > 0 ? (totalLinkClicks / totalImpressions) * 100 : 0;
  const totalCPC = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const totalCPCLink = totalLinkClicks > 0 ? totalSpend / totalLinkClicks : 0;

  return (
    <div className="flex flex-col h-full bg-[#f9fafb]">
       {/* Tab Navigation */}
      <div className="bg-white border-b px-6 flex items-center gap-10 shadow-sm pt-4">
        {[
          { id: "campaigns", label: "广告系列 (Campaigns)" },
          { id: "adsets", label: "广告组 (Ad Sets)" },
          { id: "ads", label: "广告 (Ads)" }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "pb-3 text-[14px] font-semibold border-b-2 transition-colors",
              activeTab === tab.id 
                ? "border-meta-blue text-meta-blue" 
                : "border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-300"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filters Area */}
      <div className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          
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
          
          <Button variant="outline" className="h-9 px-3" onClick={fetchDataForTab}>
            <RefreshCcw className="w-4 h-4 mr-2" />
            刷新数据
          </Button>
        </div>

        {/* Selected Filter Badges */}
        <div className="flex items-center gap-2 flex-wrap">
          {selectedCampaignIds.length > 0 && (
            <div className="flex items-center h-9 bg-[#eff6ff] border border-blue-200 text-blue-700 px-3 py-1 rounded-md text-sm gap-2">
              <span className="font-medium">已过滤: {selectedCampaignIds.length}个广告系列</span>
              <button
                onClick={() => setSelectedCampaignIds([])}
                className="text-blue-500 hover:text-blue-800 font-bold hover:bg-blue-100 rounded-full w-4 h-4 flex items-center justify-center transition-colors text-[10px]"
                title="清除广告系列过滤"
              >
                ✕
              </button>
            </div>
          )}

          {selectedAdSetIds.length > 0 && (
            <div className="flex items-center h-9 bg-[#faf5ff] border border-purple-200 text-purple-700 px-3 py-1 rounded-md text-sm gap-2">
              <span className="font-medium">已过滤: {selectedAdSetIds.length}个广告组</span>
              <button
                onClick={() => setSelectedAdSetIds([])}
                className="text-purple-500 hover:text-purple-800 font-bold hover:bg-purple-100 rounded-full w-4 h-4 flex items-center justify-center transition-colors text-[10px]"
                title="清除广告组过滤"
              >
                ✕
              </button>
            </div>
          )}

          {selectedAdIds.length > 0 && (
            <div className="flex items-center h-9 bg-[#fffbeb] border border-amber-200 text-amber-700 px-3 py-1 rounded-md text-sm gap-2">
              <span className="font-medium">已过滤: {selectedAdIds.length}个广告</span>
              <button
                onClick={() => setSelectedAdIds([])}
                className="text-amber-500 hover:text-amber-800 font-bold hover:bg-amber-100 rounded-full w-4 h-4 flex items-center justify-center transition-colors text-[10px]"
                title="清除广告过滤"
              >
                ✕
              </button>
            </div>
          )}

          {(selectedCampaignIds.length > 0 || selectedAdSetIds.length > 0 || selectedAdIds.length > 0) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-gray-500 hover:text-gray-900 text-xs px-2"
              onClick={() => {
                setSelectedCampaignIds([]);
                setSelectedAdSetIds([]);
                setSelectedAdIds([]);
              }}
            >
              重置全部过滤
            </Button>
          )}
        </div>
      </div>

      {/* Data Table */}
      <div className="flex-1 p-4 pt-0 overflow-hidden flex flex-col">
        <Card className="border-none shadow-sm h-full flex flex-col bg-white overflow-hidden text-[13px]">
           <div className="flex-grow overflow-auto custom-scrollbar mb-2 border-b">
             {loading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-8 h-8 animate-spin text-meta-blue" />
                </div>
             ) : (
                <Table className="border-collapse w-max min-w-full">
                  <TableHeader className="sticky top-0 z-20 bg-[#f9fafb] shadow-sm">
                    <TableRow>
                      <TableHead className="w-[50px] min-w-[50px] text-center h-11 sticky left-0 z-30 bg-[#f9fafb] shadow-[1px_0_0_#e5e7eb] px-3">
                        <Checkbox
                          checked={sortedData.length > 0 && sortedData.every(item => getActiveSelectedList().includes(item.id))}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              const activeIds = sortedData.map(item => item.id);
                              setActiveSelectedList(Array.from(new Set([...getActiveSelectedList(), ...activeIds])));
                            } else {
                              const activeIds = sortedData.map(item => item.id);
                              setActiveSelectedList(getActiveSelectedList().filter(id => !activeIds.includes(id)));
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead className="font-semibold h-11 sticky left-[50px] z-30 bg-[#f9fafb] shadow-[1px_0_0_#e5e7eb] whitespace-nowrap cursor-pointer hover:bg-gray-100 text-[#374151]" onClick={() => requestSort('name')}>名称</TableHead>
                      {activeTab === "ads" && (
                        <TableHead className="font-semibold whitespace-nowrap text-[#374151] hover:bg-gray-100 cursor-pointer" onClick={() => requestSort('creative_id')}>广告创意 ID</TableHead>
                      )}
                      <TableHead className="font-semibold whitespace-nowrap cursor-pointer hover:bg-gray-100 text-[#374151]" onClick={() => requestSort('status')}>投放状态</TableHead>
                      <TableHead className="font-semibold text-right whitespace-nowrap cursor-pointer hover:bg-gray-100 text-[#374151]" onClick={() => requestSort('spend')}>花费金额</TableHead>
                      <TableHead className="font-semibold text-right whitespace-nowrap cursor-pointer hover:bg-gray-100 text-[#374151]" onClick={() => requestSort('purchaseValue')}>转化价值</TableHead>
                      <TableHead className="font-semibold text-right whitespace-nowrap cursor-pointer hover:bg-gray-100 text-[#374151]" onClick={() => requestSort('roas')}>ROAS</TableHead>
                      <TableHead className="font-semibold text-right whitespace-nowrap cursor-pointer hover:bg-gray-100 text-[#374151]" onClick={() => requestSort('purchases')}>购物量</TableHead>
                      <TableHead className="font-semibold text-right whitespace-nowrap cursor-pointer hover:bg-gray-100 text-[#374151]" onClick={() => requestSort('cpp')}>单次购物费用</TableHead>
                      <TableHead className="font-semibold text-right whitespace-nowrap cursor-pointer hover:bg-gray-100 text-[#374151]" onClick={() => requestSort('budget')}>预算</TableHead>
                      <TableHead className="font-semibold text-right whitespace-nowrap cursor-pointer hover:bg-gray-100 text-[#374151]" onClick={() => requestSort('impressions')}>展示次数</TableHead>
                      <TableHead className="font-semibold text-right whitespace-nowrap cursor-pointer hover:bg-gray-100 text-[#374151]" onClick={() => requestSort('reach')}>覆盖人数</TableHead>
                      <TableHead className="font-semibold text-right whitespace-nowrap cursor-pointer hover:bg-gray-100 text-[#374151]" onClick={() => requestSort('frequency')}>频次</TableHead>
                      <TableHead className="font-semibold text-right whitespace-nowrap cursor-pointer hover:bg-gray-100 text-[#374151]" onClick={() => requestSort('linkClicks')}>链接点击量</TableHead>
                      <TableHead className="font-semibold text-right whitespace-nowrap cursor-pointer hover:bg-gray-100 text-[#374151]" onClick={() => requestSort('linkCTR')}>链接点击率</TableHead>
                      <TableHead className="font-semibold text-right whitespace-nowrap cursor-pointer hover:bg-gray-100 text-[#374151]" onClick={() => requestSort('cpcLink')}>单次链接点击</TableHead>
                      <TableHead className="font-semibold text-right whitespace-nowrap cursor-pointer hover:bg-gray-100 text-[#374151]" onClick={() => requestSort('clicks')}>点击量</TableHead>
                      <TableHead className="font-semibold text-right whitespace-nowrap cursor-pointer hover:bg-gray-100 text-[#374151]" onClick={() => requestSort('ctr')}>点击率</TableHead>
                      <TableHead className="font-semibold text-right whitespace-nowrap cursor-pointer hover:bg-gray-100 text-[#374151]" onClick={() => requestSort('cpc')}>单次点击</TableHead>
                      <TableHead className="font-semibold text-right whitespace-nowrap cursor-pointer hover:bg-gray-100 text-[#374151]" onClick={() => requestSort('addsToCart')}>加入购物车</TableHead>
                      <TableHead className="font-semibold text-right whitespace-nowrap cursor-pointer hover:bg-gray-100 text-[#374151]" onClick={() => requestSort('atcRate')}>加购率</TableHead>
                      <TableHead className="font-semibold text-right whitespace-nowrap cursor-pointer hover:bg-gray-100 text-[#374151]" onClick={() => requestSort('cpa')}>单次加购费用</TableHead>
                      <TableHead className="font-semibold text-right whitespace-nowrap cursor-pointer hover:bg-gray-100 text-[#374151]" onClick={() => requestSort('initiateCheckouts')}>发起结账量</TableHead>
                      <TableHead className="font-semibold text-right whitespace-nowrap cursor-pointer hover:bg-gray-100 text-[#374151]" onClick={() => requestSort('checkoutRate')}>结账率</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedData.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={activeTab === "ads" ? 24 : 23} className="text-center py-10 text-gray-400">
                          暂无数据或无花费记录
                        </TableCell>
                      </TableRow>
                    ) : sortedData.map((row) => {
                       return (
                        <TableRow key={row.id} className="hover:bg-gray-50 border-b group">
                          <TableCell className="w-[50px] min-w-[50px] text-center sticky left-0 z-10 bg-white group-hover:bg-gray-50 shadow-[1px_0_0_#e5e7eb] px-3">
                            <Checkbox
                              checked={getActiveSelectedList().includes(row.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setActiveSelectedList([...getActiveSelectedList(), row.id]);
                                } else {
                                  setActiveSelectedList(getActiveSelectedList().filter(id => id !== row.id));
                                }
                              }}
                            />
                          </TableCell>
                          <TableCell className="font-medium sticky left-[50px] z-10 bg-white group-hover:bg-gray-50 shadow-[1px_0_0_#e5e7eb] text-meta-blue max-w-[200px] truncate" title={row.name}>
                            <span
                              className="cursor-pointer text-meta-blue hover:underline whitespace-nowrap text-ellipsis overflow-hidden"
                              onClick={() => handleNameClick(row)}
                            >
                              {row.name}
                            </span>
                          </TableCell>
                          {activeTab === "ads" && (
                            <TableCell className="text-left font-mono text-xs whitespace-nowrap text-gray-500">
                              {row.creative_id ? (
                                <span className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-md font-semibold select-all text-slate-700" title="鼠标双击复制">
                                  {row.creative_id}
                                </span>
                              ) : (
                                <span className="text-gray-300 italic">未绑定创意</span>
                              )}
                            </TableCell>
                          )}
                          <TableCell>
                            {row.status === "ACTIVE" ? (
                              <span className="px-2 py-0.5 rounded-sm bg-green-100 text-green-700 text-[11px] font-bold">
                                ACTIVE
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-sm bg-gray-100 text-gray-600 text-[11px] font-bold uppercase">
                                {row.status}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-medium">${row.spend.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-medium text-meta-blue">${row.purchaseValue.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-semibold">{row.roas.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{row.purchases}</TableCell>
                          <TableCell className="text-right">${row.cpp.toFixed(2)}</TableCell>
                          <TableCell className="text-right text-gray-500">
                            {row.budget > 0 ? `$${row.budget.toFixed(2)}` : '最高层级或无'}
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
                          <TableCell className="text-right">{row.atcRate.toFixed(2)}%</TableCell>
                          <TableCell className="text-right">${row.cpa.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{row.initiateCheckouts}</TableCell>
                          <TableCell className="text-right">{row.checkoutRate.toFixed(2)}%</TableCell>
                        </TableRow>
                      )})}
                  </TableBody>
                  {filteredData.length > 0 && (
                    <TableFooter className="sticky bottom-0 z-20 bg-gray-50 shadow-[0_-1px_0_#e5e7eb] font-semibold border-t">
                      <TableRow className="hover:bg-gray-50">
                        <TableCell className="w-[50px] min-w-[50px] px-3 sticky left-0 z-30 bg-gray-50 shadow-[1px_0_0_#e5e7eb]"></TableCell>
                        <TableCell className="px-4 sticky left-[50px] z-30 bg-gray-50 shadow-[1px_0_0_#e5e7eb]">
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold">{filteredData.length} 个数据的汇总</span>
                            <span className="text-xs font-normal text-muted-foreground mt-0.5">成效汇总</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center align-top pt-4 text-muted-foreground">—</TableCell>
                        <TableCell className="text-right align-top pt-4 font-medium">${totalSpend.toFixed(2)}</TableCell>
                        <TableCell className="text-right align-top pt-4 text-meta-blue font-medium">${totalPurchaseValue.toFixed(2)}</TableCell>
                        <TableCell className="text-right align-top pt-4 font-semibold">{totalROAS.toFixed(2)}</TableCell>
                        <TableCell className="text-right align-top pt-4">{totalPurchases.toLocaleString()}</TableCell>
                        <TableCell className="text-right align-top pt-4">${totalCPP.toFixed(2)}</TableCell>
                        <TableCell className="text-right align-top pt-4 text-muted-foreground">—</TableCell>
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
                        <TableCell className="text-right align-top pt-4">{totalATCRate.toFixed(2)}%</TableCell>
                        <TableCell className="text-right align-top pt-4">${totalCPA.toFixed(2)}</TableCell>
                        <TableCell className="text-right align-top pt-4">{totalInitiateCheckouts.toLocaleString()}</TableCell>
                        <TableCell className="text-right align-top pt-4">{totalCheckoutRate.toFixed(2)}%</TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
             )}
           </div>
        </Card>
      </div>

      {/* Floating Actions Bar */}
      {getActiveSelectedList().length > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#1e293b] text-white px-6 py-3.5 rounded-xl shadow-2xl flex items-center gap-6 border border-slate-700 animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-meta-blue animate-pulse"></span>
            <span className="text-sm font-medium">
              已选择 {getActiveSelectedList().length} 个{activeTab === "campaigns" ? "广告系列" : activeTab === "adsets" ? "广告组" : "广告"}
            </span>
          </div>
          
          <div className="h-4 w-[1px] bg-slate-700"></div>
          
          <div className="flex items-center gap-3">
            {activeTab === "campaigns" && (
              <>
                <Button
                  size="sm"
                  className="bg-meta-blue hover:bg-blue-600 text-white font-medium h-8"
                  onClick={() => {
                    setActiveTab("adsets");
                  }}
                >
                  查看对应广告组
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-slate-700 hover:bg-slate-800 text-slate-200 hover:text-white font-medium h-8"
                  onClick={() => {
                    setActiveTab("ads");
                  }}
                >
                  查看对应广告
                </Button>
              </>
            )}
            {activeTab === "adsets" && (
              <Button
                size="sm"
                className="bg-meta-blue hover:bg-blue-600 text-white font-medium h-8"
                onClick={() => {
                  setActiveTab("ads");
                }}
              >
                查看对应广告
              </Button>
            )}
            
            <Button
              size="sm"
              variant="ghost"
              className="text-slate-400 hover:text-white hover:bg-slate-800 h-8 font-normal"
              onClick={() => {
                setActiveSelectedList([]);
              }}
            >
              取消选择
            </Button>
          </div>
        </div>
      )}
     </div>
   );
}
