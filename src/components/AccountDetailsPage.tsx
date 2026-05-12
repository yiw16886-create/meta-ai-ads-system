import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { format, subDays } from "date-fns";
import axios from "axios";
import { ArrowLeft, RefreshCcw, Calendar as CalendarIcon, ArrowUpDown, Search, Check, ChevronsUpDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { HierarchyFilter } from "@/components/HierarchyFilter";

interface AccountDetailsPageProps {
  onLogout: () => void;
}

export function AccountDetailsPage({ onLogout }: AccountDetailsPageProps) {
  const { accountId } = useParams<{ accountId: string }>();
  const navigate = useNavigate();

  const [startDate, setStartDate] = useState<Date>(subDays(new Date(), 7));
  const [endDate, setEndDate] = useState<Date>(new Date());
  const [tempDateRange, setTempDateRange] = useState<{from: Date, to: Date}>({ from: subDays(new Date(), 7), to: new Date() });
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  
  const [level, setLevel] = useState<"campaigns" | "adsets" | "ads">("campaigns");
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountSearch, setAccountSearch] = useState("");
  const [tableSearch, setTableSearch] = useState("");
  const [accountSelectorOpen, setAccountSelectorOpen] = useState(false);
  const dataCache = useRef<Record<string, { data: any[], timestamp: number }>>({});

  // Hierarchy Filters State
  const [hierarchy, setHierarchy] = useState<{ campaigns: any[], adSets: any[], ads: any[] }>({ campaigns: [], adSets: [], ads: [] });
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  const [selectedAdSetIds, setSelectedAdSetIds] = useState<string[]>([]);
  const [selectedAdIds, setSelectedAdIds] = useState<string[]>([]);

  // Cleanup sub-selections when parent selection changes
  useEffect(() => {
    if (selectedCampaignIds.length > 0) {
      const validAdSetIds = new Set(hierarchy.adSets
        .filter(as => selectedCampaignIds.includes(as.campaign_id))
        .map(as => as.id));
      setSelectedAdSetIds(prev => prev.filter(id => validAdSetIds.has(id)));
    }
  }, [selectedCampaignIds, hierarchy.adSets]);

  useEffect(() => {
    if (selectedAdSetIds.length > 0) {
      const validAdIds = new Set(hierarchy.ads
        .filter(ad => selectedAdSetIds.includes(ad.adset_id))
        .map(ad => ad.id));
      setSelectedAdIds(prev => prev.filter(id => validAdIds.has(id)));
    }
  }, [selectedAdSetIds, hierarchy.ads]);

  // Sorting
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: "asc" | "desc" } | null>(null);

  const toggleSelection = (id: string) => {
    if (level === "campaigns") {
      setSelectedCampaignIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    } else if (level === "adsets") {
      setSelectedAdSetIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    } else if (level === "ads") {
      setSelectedAdIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    }
  };

  const isSelected = (id: string) => {
    if (level === "campaigns") return selectedCampaignIds.includes(id);
    if (level === "adsets") return selectedAdSetIds.includes(id);
    if (level === "ads") return selectedAdIds.includes(id);
    return false;
  };

  const toggleAll = () => {
    const allIds = sortedData.map(i => i.id);
    const currentSelectedOfVisible = sortedData.filter(i => isSelected(i.id)).map(i => i.id);
    
    let setter: (ids: string[] | ((prev: string[]) => string[])) => void;
    let selectedSet: string[];

    if (level === "campaigns") { setter = setSelectedCampaignIds; selectedSet = selectedCampaignIds; }
    else if (level === "adsets") { setter = setSelectedAdSetIds; selectedSet = selectedAdSetIds; }
    else { setter = setSelectedAdIds; selectedSet = selectedAdIds; }

    if (currentSelectedOfVisible.length === allIds.length && allIds.length > 0) {
      // Unselect all visible
      setter(prev => prev.filter(id => !allIds.includes(id)));
    } else {
      // Select all visible
      setter(prev => [...new Set([...prev, ...allIds])]);
    }
  };

  const fetchData = async () => {
    if (!accountId) return;

    const startStr = format(startDate, "yyyy-MM-dd");
    const endStr = format(endDate, "yyyy-MM-dd");
    const cacheKey = `${level}_${startStr}_${endStr}`;
    const now = Date.now();
    const CACHE_TTL = 3 * 60 * 1000; // 3 minutes frontend cache

    if (dataCache.current[cacheKey] && (now - dataCache.current[cacheKey].timestamp < CACHE_TTL)) {
      setData(dataCache.current[cacheKey].data);
      return;
    }

    setLoading(true);
    try {
      const response = await axios.get(`/api/accounts/${accountId}/details`, {
        params: {
          startDate: startStr,
          endDate: endStr,
          level,
        },
      });
      const newData = response.data.data || [];
      setData(newData);
      dataCache.current[cacheKey] = { data: newData, timestamp: now };
    } catch (error: any) {
      console.error("fetchData error:", error.response?.data || error);
      toast.error(typeof error.response?.data?.error === "string" ? error.response.data.error : "数据加载失败");
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Fetch account list for the switcher once on mount
    axios.get("/api/accounts/list").then(res => {
      if (Array.isArray(res.data)) {
        setAccounts(res.data);
      }
    });
  }, []);

  useEffect(() => {
    fetchData();
  }, [accountId, startDate, endDate, level]);

  useEffect(() => {
    if (!accountId) return;
    axios.get(`/api/accounts/${accountId}/hierarchy`).then(res => {
       if (res.data.success) {
          setHierarchy({ campaigns: res.data.campaigns || [], adSets: res.data.adSets || [], ads: res.data.ads || [] });
       }
    }).catch(err => console.error("hierarchy fetch error", err));
  }, [accountId]);

  const requestSort = (key: string) => {
    let direction: "asc" | "desc" = "desc";
    if (sortConfig && sortConfig.key === key && sortConfig.direction === "desc") {
      direction = "asc";
    }
    setSortConfig({ key, direction });
  };

  // Helper to extract nested metrics
  const getInsightValue = (item: any, key: string) => {
    if (!item.insights?.data?.[0]) return 0;
    const insight = item.insights.data[0];
    
    if (key === 'spend') return parseFloat(insight.spend || 0);
    if (key === 'impressions') return parseInt(insight.impressions || 0, 10);
    if (key === 'reach') return parseInt(insight.reach || 0, 10);
    if (key === 'frequency') return parseFloat(insight.frequency || 0);
    
    if (key === 'results') {
       // Look for purchase action
       const purchase = insight.actions?.find((a: any) => a.action_type === 'purchase');
       if (purchase) return parseInt(purchase.value, 10);
       return 0; // Fallback
    }
    
    if (key === 'cpr') { // Cost Per Result
       const cpa = insight.cost_per_action_type?.find((a: any) => a.action_type === 'purchase');
       if (cpa) return parseFloat(cpa.value);
       return 0;
    }

    if (key === 'cpc') {
       // cpc fallback
       const cpc = insight.cost_per_action_type?.find((a: any) => a.action_type === 'link_click');
       if (cpc) return parseFloat(cpc.value);
       return 0;
    }

    if (key === 'ctr') {
       const clicks = parseInt(insight.actions?.find((a: any) => a.action_type === 'link_click')?.value || 0, 10);
       const impressions = parseInt(insight.impressions || 0, 10);
       return impressions > 0 ? (clicks / impressions) * 100 : 0;
    }

    return 0;
  };

  const getBudgetValue = (item: any) => {
    if (item.daily_budget) return parseFloat(item.daily_budget) / 100;
    if (item.lifetime_budget) return parseFloat(item.lifetime_budget) / 100;
    return 0;
  };

  const filteredData = React.useMemo(() => {
    return data.filter(item => {
      // Search filter
      if (tableSearch && !item.name.toLowerCase().includes(tableSearch.toLowerCase())) {
        return false;
      }

      // Coupling: Only filter by PARENT selections, not CURRENT level selection.
      // This allows the user to see all items at the current level and pick multiple ones.
      
      const matchCamp = selectedCampaignIds.length === 0 || selectedCampaignIds.includes(item.campaign_id);
      const matchAdSet = selectedAdSetIds.length === 0 || selectedAdSetIds.includes(item.adset_id);

      if (level === "campaigns") {
         return true; // Show all campaigns for this account
      }
      if (level === "adsets") {
         return matchCamp; // Filter adsets by selected campaigns
      }
      if (level === "ads") {
         return matchCamp && matchAdSet; // Filter ads by parents
      }
      return true;
    });
  }, [data, level, selectedCampaignIds, selectedAdSetIds]);

  const sortedData = [...filteredData].sort((a, b) => {
    if (!sortConfig) return 0;

    const { key, direction } = sortConfig;
    let aVal: any = a[key];
    let bVal: any = b[key];

    // Handle derived fields
    const insightKeys = ['spend', 'impressions', 'reach', 'frequency', 'results', 'cpr'];
    if (insightKeys.includes(key)) {
      aVal = getInsightValue(a, key);
      bVal = getInsightValue(b, key);
    }
    
    if (key === 'budget') {
      aVal = getBudgetValue(a);
      bVal = getBudgetValue(b);
    }

    if (aVal < bVal) return direction === "asc" ? -1 : 1;
    if (aVal > bVal) return direction === "asc" ? 1 : -1;
    return 0;
  });

  // Calculate totals - prioritize selected items if any exist at current level
  const displayedItems = sortedData.filter(i => isSelected(i.id));
  const itemsToSum = displayedItems.length > 0 ? displayedItems : sortedData;

  const totalSpend = itemsToSum.reduce((sum, item) => sum + getInsightValue(item, 'spend'), 0);
  const totalImpressions = itemsToSum.reduce((sum, item) => sum + getInsightValue(item, 'impressions'), 0);
  const topLevelClicks = itemsToSum.reduce((sum, item) => {
      const clickAction = item.insights?.data?.[0]?.actions?.find((a:any) => a.action_type === 'link_click');
      return sum + (clickAction ? parseInt(clickAction.value, 10) : 0);
  }, 0);
  const totalPurchases = itemsToSum.reduce((sum, item) => sum + getInsightValue(item, 'results'), 0);
  const totalPurchaseValue = itemsToSum.reduce((sum, item) => {
     const valAction = item.insights?.data?.[0]?.action_values?.find((a:any) => a.action_type === 'purchase');
     return sum + (valAction ? parseFloat(valAction.value) : 0);
  }, 0);
  
  const avgCpc = topLevelClicks > 0 ? totalSpend / topLevelClicks : 0;
  const avgCtr = totalImpressions > 0 ? (topLevelClicks / totalImpressions) * 100 : 0;
  const roi = totalSpend > 0 ? (totalPurchaseValue / totalSpend) : 0;

  // Derived Options for Filters
  const campaignOptions = hierarchy.campaigns;
  const adSetOptions = selectedCampaignIds.length > 0
      ? hierarchy.adSets.filter(a => selectedCampaignIds.includes(a.campaign_id))
      : hierarchy.adSets;
  const adOptions = selectedAdSetIds.length > 0
      ? hierarchy.ads.filter(a => selectedAdSetIds.includes(a.adset_id))
      : (selectedCampaignIds.length > 0
         ? hierarchy.ads.filter(a => selectedCampaignIds.includes(a.campaign_id))
         : hierarchy.ads);

  const currentAccountName = accounts.find(a => a.accountId === accountId)?.accountName || accountId;

  return (
    <div className="min-h-screen bg-[#f3f4f6]">
      {/* Top Navbar */}
      <nav className="bg-white border-b border-[#e5e7eb] px-6 h-16 flex items-center sticky top-0 z-50">
        <div className="flex-1">
          <Button variant="ghost" onClick={() => navigate("/")} className="gap-2 px-0 hover:bg-transparent text-gray-700 font-normal">
            <ArrowLeft className="w-4 h-4" /> 返回工作台
          </Button>
        </div>
        
        {/* Date Picker - Centered (Dashboard Style Two-Box) */}
        <div className="flex-1 flex justify-center">
          <Popover open={datePickerOpen} onOpenChange={(open) => {
            setDatePickerOpen(open);
            if (open) {
               setTempDateRange({ from: startDate, to: endDate });
            }
          }}>
            <PopoverTrigger>
              <div className="flex items-center gap-2 cursor-pointer group">
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 group-hover:text-meta-blue transition-colors z-10" />
                  <div className="pl-9 pr-3 py-2 border border-[#e5e7eb] rounded-[6px] text-[13px] w-[130px] text-left bg-white flex items-center font-medium text-gray-700 hover:border-meta-blue/50 transition-colors">
                    {format(startDate, "yyyy-MM-dd")}
                  </div>
                </div>
                <span className="text-gray-400 text-[13px] font-medium">至</span>
                <div className="relative">
                  <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 group-hover:text-meta-blue transition-colors z-10" />
                  <div className="pl-9 pr-3 py-2 border border-[#e5e7eb] rounded-[6px] text-[13px] w-[130px] text-left bg-white flex items-center font-medium text-gray-700 hover:border-meta-blue/50 transition-colors">
                    {format(endDate, "yyyy-MM-dd")}
                  </div>
                </div>
              </div>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center" sideOffset={12}>
              <div className="flex flex-col">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={tempDateRange.from}
                  selected={{
                    from: tempDateRange.from,
                    to: tempDateRange.to,
                  }}
                  onSelect={(range) => {
                    if (range?.from) setTempDateRange(prev => ({ ...prev, from: range.from! }));
                    if (range?.to) setTempDateRange(prev => ({ ...prev, to: range.to! }));
                  }}
                  numberOfMonths={2}
                  className="rounded-t-md"
                />
                <div className="p-3 border-t bg-gray-50 flex justify-between items-center rounded-b-md">
                   <div className="text-[12px] text-gray-500">
                      已选: <span className="font-bold text-gray-700">{format(tempDateRange.from, "yyyy-MM-dd")}</span>
                      {tempDateRange.to && <> 至 <span className="font-bold text-gray-700">{format(tempDateRange.to, "yyyy-MM-dd")}</span></>}
                   </div>
                   <div className="flex gap-2">
                     <Button 
                       variant="ghost" 
                       size="sm" 
                       className="h-8 text-[12px]" 
                       onClick={() => setDatePickerOpen(false)}
                     >
                       取消
                     </Button>
                     <Button 
                       size="sm" 
                       className="h-8 text-[12px] bg-meta-blue hover:bg-blue-600"
                       onClick={() => {
                         setStartDate(tempDateRange.from);
                         setEndDate(tempDateRange.to || tempDateRange.from);
                         setDatePickerOpen(false);
                       }}
                     >
                       确定
                     </Button>
                   </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex-1 flex justify-end">
           {/* Placeholder */}
        </div>
      </nav>

      <main className="p-6 max-w-[1500px] mx-auto space-y-6">
        {/* Level Switcher, Filters & Action row */}
        <Card className="shadow-sm border border-gray-200 bg-white overflow-visible">
          <CardHeader className="py-0 px-6 border-b bg-white flex flex-row items-center justify-between space-y-0 relative z-20 min-h-[56px]">
             <div className="flex items-center space-x-8 self-end">
                <button
                  className={cn("pb-3 text-[14px] font-bold transition-all border-b-2 relative", level === "campaigns" ? "border-meta-blue text-meta-blue" : "border-transparent text-gray-500 hover:text-gray-700")}
                  onClick={() => setLevel("campaigns")}
                >
                  广告系列 (Campaigns)
                </button>
                <button
                  className={cn("pb-3 text-[14px] font-bold transition-all border-b-2 relative", level === "adsets" ? "border-meta-blue text-meta-blue" : "border-transparent text-gray-500 hover:text-gray-700")}
                  onClick={() => setLevel("adsets")}
                >
                  广告组 (Ad Sets)
                </button>
                <button
                  className={cn("pb-3 text-[14px] font-bold transition-all border-b-2 relative", level === "ads" ? "border-meta-blue text-meta-blue" : "border-transparent text-gray-500 hover:text-gray-700")}
                  onClick={() => setLevel("ads")}
                >
                  广告 (Ads)
                </button>
             </div>

             <div className="flex items-center gap-3 py-2">
                {/* Account Selector - Name box as trigger (Moved to Search position) */}
                <Popover open={accountSelectorOpen} onOpenChange={setAccountSelectorOpen}>
                   <PopoverTrigger className="px-3 py-1.5 bg-gray-50 border border-dashed border-gray-300 rounded-md text-[13px] font-bold text-[#1c2b33] hover:bg-gray-100 hover:border-meta-blue/50 transition-all cursor-pointer flex items-center gap-1 min-w-[150px] max-w-[240px]">
                      <span className="truncate">{currentAccountName}</span>
                      <ChevronsUpDown className="w-3 h-3 text-gray-400 shrink-0" />
                   </PopoverTrigger>
                   <PopoverContent className="w-[300px] p-0" align="start">
                     <div className="flex flex-col">
                       <div className="p-2 border-b">
                         <div className="relative">
                           <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                           <Input 
                              placeholder="搜索账户..." 
                              value={accountSearch}
                              onChange={(e) => setAccountSearch(e.target.value)}
                              className="pl-8 h-8 text-[13px]"
                           />
                         </div>
                       </div>
                       <ScrollArea className="h-[300px]">
                         <div className="p-1">
                           {accounts
                             .filter(a => a.accountName?.toLowerCase().includes(accountSearch.toLowerCase()) || a.accountId.includes(accountSearch))
                             .map(acc => (
                               <button
                                 key={acc.accountId}
                                 onClick={() => {
                                   navigate(`/account/${acc.accountId}`);
                                   setAccountSelectorOpen(false);
                                   setAccountSearch("");
                                 }}
                                 className={cn(
                                   "w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between hover:bg-blue-50 transition-colors",
                                   acc.accountId === accountId ? "bg-blue-50 text-meta-blue font-semibold" : "text-gray-700"
                                 )}
                               >
                                 <span className="truncate flex-1 pr-2">{acc.accountName || acc.accountId}</span>
                                 {acc.accountId === accountId && <Check className="w-4 h-4" />}
                               </button>
                             ))
                           }
                         </div>
                       </ScrollArea>
                     </div>
                   </PopoverContent>
                </Popover>

                {/* Hierarchy Filters inline */}
                <div className="flex items-center gap-2">
                   <HierarchyFilter 
                     label="广告系列" 
                     items={campaignOptions} 
                     selectedIds={selectedCampaignIds} 
                     onChange={setSelectedCampaignIds} 
                   />
                   <HierarchyFilter 
                     label="广告组" 
                     items={adSetOptions} 
                     selectedIds={selectedAdSetIds} 
                     onChange={setSelectedAdSetIds} 
                   />
                   <HierarchyFilter 
                     label="广告" 
                     items={adOptions} 
                     selectedIds={selectedAdIds} 
                     onChange={setSelectedAdIds} 
                   />
                </div>

                <Button onClick={fetchData} disabled={loading} size="sm" className="bg-meta-blue hover:bg-blue-700 h-9 px-4 font-bold flex items-center gap-2">
                  {loading ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                  刷新数据
                </Button>
             </div>
          </CardHeader>

          {/* Compact KPI Stats - Refined Labels and Styling */}
          <div className="bg-[#f9fafb]/50 border-b py-4 px-6">
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-6">
              <div className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm flex flex-col justify-between h-20">
                <div className="text-[11px] text-gray-500 font-bold uppercase tracking-tight">总花费 (SPEND)</div>
                <div className="text-lg font-bold text-[#1c2b33]">${totalSpend.toFixed(2)}</div>
              </div>
              <div className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm flex flex-col justify-between h-20">
                <div className="text-[11px] text-gray-500 font-bold uppercase tracking-tight">展示次数</div>
                <div className="text-lg font-bold text-[#1c2b33]">{totalImpressions.toLocaleString()}</div>
              </div>
              <div className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm flex flex-col justify-between h-20">
                <div className="text-[11px] text-gray-500 font-bold uppercase tracking-tight">点击次数</div>
                <div className="text-lg font-bold text-[#1c2b33]">{topLevelClicks.toLocaleString()}</div>
              </div>
              <div className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm flex flex-col justify-between h-20">
                <div className="text-[11px] text-gray-500 font-bold uppercase tracking-tight">成效 (PURCHASES)</div>
                <div className="text-lg font-bold text-[#1c2b33]">{totalPurchases.toLocaleString()}</div>
              </div>
              <div className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm flex flex-col justify-between h-20">
                <div className="text-[11px] text-gray-500 font-bold uppercase tracking-tight">平均 CPC</div>
                <div className="text-lg font-bold text-[#1c2b33]">${avgCpc.toFixed(2)}</div>
              </div>
              <div className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm flex flex-col justify-between h-20">
                <div className="text-[11px] text-gray-500 font-bold uppercase tracking-tight">平均 CTR</div>
                <div className="text-lg font-bold text-[#1c2b33]">{avgCtr.toFixed(2)}%</div>
              </div>
              <div className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm flex flex-col justify-between h-20">
                <div className="text-[11px] text-gray-500 font-bold uppercase tracking-tight">ROI (ROAS)</div>
                <div className="text-lg font-bold text-[#1c2b33]">{roi.toFixed(2)}</div>
              </div>
            </div>
          </div>

          <CardContent className="p-0 bg-white">
            <div className="overflow-x-auto max-h-[800px] relative">
              <Table>
                <TableHeader className="bg-[#fbfcff] sticky top-0 z-20 border-b">
                  <TableRow className="hover:bg-transparent">
                     <TableHead className="w-[50px] text-center border-r border-[#e5e7eb] px-0 h-12">
                        <div className="flex items-center justify-center h-full">
                          <Checkbox 
                            checked={sortedData.length > 0 && sortedData.every(i => isSelected(i.id))}
                            onCheckedChange={toggleAll}
                          />
                        </div>
                     </TableHead>
                     <TableHead className="w-[280px] border-r border-[#e5e7eb] cursor-pointer hover:bg-gray-100 h-12 text-[#374151] font-bold" onClick={() => requestSort("name")}>
                       名称 <ArrowUpDown className={`w-3 h-3 inline-block ml-1 ${sortConfig?.key === 'name' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                     </TableHead>
                     <TableHead className="cursor-pointer hover:bg-gray-100 border-r border-[#e5e7eb] h-12 text-[#374151] font-bold" onClick={() => requestSort("effective_status")}>
                       投放状态 <ArrowUpDown className={`w-3 h-3 inline-block ml-1 ${sortConfig?.key === 'effective_status' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                     </TableHead>
                     <TableHead className="cursor-pointer hover:bg-gray-100 border-r border-[#e5e7eb] h-12 text-[#374151] font-bold" onClick={() => requestSort("results")}>
                       成效 (Purchases) <ArrowUpDown className={`w-3 h-3 inline-block ml-1 ${sortConfig?.key === 'results' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                     </TableHead>
                     <TableHead className="cursor-pointer hover:bg-gray-100 border-r border-[#e5e7eb] h-12 text-[#374151] font-bold" onClick={() => requestSort("cpr")}>
                       单次成效费用 <ArrowUpDown className={`w-3 h-3 inline-block ml-1 ${sortConfig?.key === 'cpr' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                     </TableHead>
                     <TableHead className="cursor-pointer hover:bg-gray-100 border-r border-[#e5e7eb] h-12 text-[#374151] font-bold" onClick={() => requestSort("budget")}>
                       预算 <ArrowUpDown className={`w-3 h-3 inline-block ml-1 ${sortConfig?.key === 'budget' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                     </TableHead>
                     <TableHead className="cursor-pointer hover:bg-gray-100 border-r border-[#e5e7eb] h-12 text-[#374151] font-bold" onClick={() => requestSort("spend")}>
                       已花费金额 <ArrowUpDown className={`w-3 h-3 inline-block ml-1 ${sortConfig?.key === 'spend' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                     </TableHead>
                     <TableHead className="cursor-pointer hover:bg-gray-100 border-r border-[#e5e7eb] h-12 text-[#374151] font-bold" onClick={() => requestSort("impressions")}>
                       展示次数 <ArrowUpDown className={`w-3 h-3 inline-block ml-1 ${sortConfig?.key === 'impressions' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                     </TableHead>
                     <TableHead className="cursor-pointer hover:bg-gray-100 border-r border-[#e5e7eb] h-12 text-[#374151] font-bold" onClick={() => requestSort("reach")}>
                       覆盖人数 <ArrowUpDown className={`w-3 h-3 inline-block ml-1 ${sortConfig?.key === 'reach' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                     </TableHead>
                     <TableHead className="cursor-pointer hover:bg-gray-100 h-12 text-[#374151] font-bold" onClick={() => requestSort("frequency")}>
                       频次 <ArrowUpDown className={`w-3 h-3 inline-block ml-1 ${sortConfig?.key === 'frequency' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                     </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={10} className="h-32 text-center text-gray-500">
                        <RefreshCcw className="w-6 h-6 animate-spin mx-auto text-meta-blue mb-2" />
                        正在加载数据...
                      </TableCell>
                    </TableRow>
                  ) : sortedData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="h-32 text-center text-gray-500">
                        暂无数据
                      </TableCell>
                    </TableRow>
                  ) : (
                    sortedData.map((item) => (
                      <TableRow 
                        key={item.id} 
                        className={cn("hover:bg-gray-50 border-b border-[#f3f4f6] cursor-pointer transition-colors", isSelected(item.id) && "bg-blue-50/50 shadow-inner")}
                        onClick={() => toggleSelection(item.id)}
                      >
                        <TableCell className="text-center font-medium border-r border-[#e5e7eb] px-0" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-center h-full py-2">
                              <Checkbox 
                                checked={isSelected(item.id)} 
                                onCheckedChange={() => toggleSelection(item.id)}
                              />
                            </div>
                        </TableCell>
                        <TableCell className="font-medium text-meta-blue max-w-[200px] truncate border-r border-[#e5e7eb]" title={item.name}>
                          {item.name}
                        </TableCell>
                        <TableCell className="text-gray-600 border-r border-[#e5e7eb] max-w-[120px] truncate">
                          <span className={cn("px-2 py-1 rounded text-xs font-semibold uppercase", item.effective_status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700")}>
                             {item.effective_status}
                          </span>
                        </TableCell>
                        <TableCell className="font-bold border-r border-[#e5e7eb] text-gray-800">
                          {getInsightValue(item, 'results').toLocaleString()}
                        </TableCell>
                        <TableCell className="text-gray-600 border-r border-[#e5e7eb]">
                          ${getInsightValue(item, 'cpr').toFixed(2)}
                        </TableCell>
                        <TableCell className="text-gray-600 border-r border-[#e5e7eb]">
                          ${getBudgetValue(item).toFixed(2)}
                        </TableCell>
                        <TableCell className="font-medium border-r border-[#e5e7eb]">
                          ${getInsightValue(item, 'spend').toFixed(2)}
                        </TableCell>
                        <TableCell className="text-gray-600 border-r border-[#e5e7eb]">
                          {getInsightValue(item, 'impressions').toLocaleString()}
                        </TableCell>
                        <TableCell className="text-gray-600 border-r border-[#e5e7eb]">
                          {getInsightValue(item, 'reach').toLocaleString()}
                        </TableCell>
                        <TableCell className="text-gray-600">
                          {getInsightValue(item, 'frequency').toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
