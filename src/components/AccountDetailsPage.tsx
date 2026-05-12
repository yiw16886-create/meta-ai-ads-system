import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { format, subDays } from "date-fns";
import axios from "axios";
import { ArrowLeft, RefreshCcw, Calendar as CalendarIcon, ArrowUpDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  
  const [level, setLevel] = useState<"campaigns" | "adsets" | "ads">("campaigns");
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
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

  return (
    <div className="min-h-screen bg-[#f3f4f6]">
      {/* Top Navbar */}
      <nav className="bg-white border-b border-[#e5e7eb] px-6 py-4 flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate("/")} className="gap-2">
            <ArrowLeft className="w-4 h-4" /> 返回工作台
          </Button>
          <div className="w-px h-6 bg-gray-200"></div>
          <h1 className="text-xl font-bold text-[#1c2b33]">账户详情: <span className="text-meta-blue font-mono">{accountId}</span></h1>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Date Picker */}
          <Popover>
            <PopoverTrigger className={cn("pl-8 pr-3 py-2 border border-[#e5e7eb] rounded-[6px] text-[13px] bg-white flex items-center font-normal", !startDate && "text-muted-foreground")}>
                <CalendarIcon className="mr-2 h-4 w-4 text-[#6b7280]" />
                {startDate ? (
                  endDate ? (
                    <>
                      {format(startDate, "LLL dd, y")} -{" "}
                      {format(endDate, "LLL dd, y")}
                    </>
                  ) : (
                    format(startDate, "LLL dd, y")
                  )
                ) : (
                  <span>Pick a date</span>
                )}
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                initialFocus
                mode="range"
                defaultMonth={startDate}
                selected={{
                  from: startDate,
                  to: endDate,
                }}
                onSelect={(range) => {
                  if (range?.from) setStartDate(range.from);
                  if (range?.to) setEndDate(range.to);
                }}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>

          <Button onClick={fetchData} disabled={loading} className="bg-meta-blue hover:bg-blue-700">
            {loading ? <RefreshCcw className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
            刷新数据
          </Button>
        </div>
      </nav>

      <main className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Filters */}
        <Card className="rounded-xl shadow-sm border border-gray-100 bg-white overflow-hidden">
          <CardContent className="p-4 flex flex-wrap items-center gap-4">
             <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">广告系列 (Campaign)</span>
                <HierarchyFilter 
                  label="所有系列" 
                  items={campaignOptions} 
                  selectedIds={selectedCampaignIds} 
                  onChange={setSelectedCampaignIds} 
                />
             </div>
             <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">广告组 (Ad Set)</span>
                <HierarchyFilter 
                  label="所有广告组" 
                  items={adSetOptions} 
                  selectedIds={selectedAdSetIds} 
                  onChange={setSelectedAdSetIds} 
                />
             </div>
             <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">广告 (Ad)</span>
                <HierarchyFilter 
                  label="所有广告" 
                  items={adOptions} 
                  selectedIds={selectedAdIds} 
                  onChange={setSelectedAdIds} 
                />
             </div>
             
             {(selectedCampaignIds.length > 0 || selectedAdSetIds.length > 0 || selectedAdIds.length > 0) && (
               <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => {
                  setSelectedCampaignIds([]);
                  setSelectedAdSetIds([]);
                  setSelectedAdIds([]);
                }}
                className="mt-5 text-gray-400 hover:text-meta-blue"
               >
                 清除筛选
               </Button>
             )}
          </CardContent>
        </Card>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
           {/* Spend */}
           <Card className="rounded-xl shadow-sm border border-gray-100 bg-white">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="font-semibold text-gray-500">总花费 (Spend)</CardDescription>
              <CardTitle className="text-2xl font-bold text-[#1c2b33]">${totalSpend.toFixed(2)}</CardTitle>
            </CardHeader>
           </Card>
           
           <Card className="rounded-xl shadow-sm border border-gray-100 bg-white">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="font-semibold text-gray-500">展示次数</CardDescription>
              <CardTitle className="text-2xl font-bold text-[#1c2b33]">{totalImpressions.toLocaleString()}</CardTitle>
            </CardHeader>
           </Card>

           <Card className="rounded-xl shadow-sm border border-gray-100 bg-white">
            <CardHeader className="p-4 pb-2">
              <CardDescription className="font-semibold text-gray-500">点击次数</CardDescription>
              <CardTitle className="text-2xl font-bold text-[#1c2b33]">{topLevelClicks.toLocaleString()}</CardTitle>
            </CardHeader>
           </Card>

           <Card className="rounded-xl shadow-sm border border-gray-100 bg-white">
             <CardHeader className="p-4 pb-2">
              <CardDescription className="font-semibold text-gray-500">成效 (Purchases)</CardDescription>
              <CardTitle className="text-2xl font-bold text-[#1c2b33]">{totalPurchases.toLocaleString()}</CardTitle>
             </CardHeader>
           </Card>

           <Card className="rounded-xl shadow-sm border border-gray-100 bg-white">
             <CardHeader className="p-4 pb-2">
              <CardDescription className="font-semibold text-gray-500">平均 CPC</CardDescription>
              <CardTitle className="text-2xl font-bold text-[#1c2b33]">${avgCpc.toFixed(2)}</CardTitle>
             </CardHeader>
           </Card>

           <Card className="rounded-xl shadow-sm border border-gray-100 bg-white">
             <CardHeader className="p-4 pb-2">
              <CardDescription className="font-semibold text-gray-500">平均 CTR</CardDescription>
              <CardTitle className="text-2xl font-bold text-[#1c2b33]">{avgCtr.toFixed(2)}%</CardTitle>
             </CardHeader>
           </Card>

           <Card className="rounded-xl shadow-sm border border-gray-100 bg-white">
             <CardHeader className="p-4 pb-2">
              <CardDescription className="font-semibold text-gray-500">ROI (ROAS)</CardDescription>
              <CardTitle className="text-2xl font-bold text-[#1c2b33]">{roi.toFixed(2)}</CardTitle>
             </CardHeader>
           </Card>
        </div>

        {/* Level Switcher & Table */}
        <Card className="shadow-sm border-0 border-t-4 border-t-meta-blue">
          <CardHeader className="bg-white pb-0 border-b relative">
             <div className="flex space-x-8 -mb-px">
                <button
                  className={cn("pb-4 text-sm font-semibold transition-colors border-b-2", level === "campaigns" ? "border-meta-blue text-meta-blue" : "border-transparent text-gray-500 hover:text-gray-700")}
                  onClick={() => setLevel("campaigns")}
                >
                  广告系列 (Campaigns)
                </button>
                <button
                  className={cn("pb-4 text-sm font-semibold transition-colors border-b-2", level === "adsets" ? "border-meta-blue text-meta-blue" : "border-transparent text-gray-500 hover:text-gray-700")}
                  onClick={() => setLevel("adsets")}
                >
                  广告组 (Ad Sets)
                </button>
                <button
                  className={cn("pb-4 text-sm font-semibold transition-colors border-b-2", level === "ads" ? "border-meta-blue text-meta-blue" : "border-transparent text-gray-500 hover:text-gray-700")}
                  onClick={() => setLevel("ads")}
                >
                  广告 (Ads)
                </button>
             </div>
          </CardHeader>
          <CardContent className="p-0 bg-white">
            <div className="overflow-x-auto max-h-[600px] relative">
              <Table>
                <TableHeader className="bg-[#f9fafb] sticky top-0 z-20">
                  <TableRow>
                     <TableHead className="w-[50px] text-center border-r border-[#e5e7eb] px-0">
                        <div className="flex items-center justify-center h-full">
                          <Checkbox 
                            checked={sortedData.length > 0 && sortedData.every(i => isSelected(i.id))}
                            onCheckedChange={toggleAll}
                          />
                        </div>
                     </TableHead>
                     <TableHead className="w-[200px] border-r border-[#e5e7eb] cursor-pointer hover:bg-gray-100" onClick={() => requestSort("name")}>
                       名称 <ArrowUpDown className={`w-3 h-3 inline-block ml-1 ${sortConfig?.key === 'name' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                     </TableHead>
                     <TableHead className="cursor-pointer hover:bg-gray-100 border-r border-[#e5e7eb]" onClick={() => requestSort("effective_status")}>
                       投放状态 <ArrowUpDown className={`w-3 h-3 inline-block ml-1 ${sortConfig?.key === 'effective_status' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                     </TableHead>
                     <TableHead className="cursor-pointer hover:bg-gray-100 border-r border-[#e5e7eb]" onClick={() => requestSort("results")}>
                       成效 (Purchases) <ArrowUpDown className={`w-3 h-3 inline-block ml-1 ${sortConfig?.key === 'results' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                     </TableHead>
                     <TableHead className="cursor-pointer hover:bg-gray-100 border-r border-[#e5e7eb]" onClick={() => requestSort("cpr")}>
                       单次成效费用 <ArrowUpDown className={`w-3 h-3 inline-block ml-1 ${sortConfig?.key === 'cpr' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                     </TableHead>
                     <TableHead className="cursor-pointer hover:bg-gray-100 border-r border-[#e5e7eb]" onClick={() => requestSort("budget")}>
                       预算 <ArrowUpDown className={`w-3 h-3 inline-block ml-1 ${sortConfig?.key === 'budget' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                     </TableHead>
                     <TableHead className="cursor-pointer hover:bg-gray-100 border-r border-[#e5e7eb]" onClick={() => requestSort("spend")}>
                       已花费金额 <ArrowUpDown className={`w-3 h-3 inline-block ml-1 ${sortConfig?.key === 'spend' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                     </TableHead>
                     <TableHead className="cursor-pointer hover:bg-gray-100 border-r border-[#e5e7eb]" onClick={() => requestSort("impressions")}>
                       展示次数 <ArrowUpDown className={`w-3 h-3 inline-block ml-1 ${sortConfig?.key === 'impressions' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                     </TableHead>
                     <TableHead className="cursor-pointer hover:bg-gray-100 border-r border-[#e5e7eb]" onClick={() => requestSort("reach")}>
                       覆盖人数 <ArrowUpDown className={`w-3 h-3 inline-block ml-1 ${sortConfig?.key === 'reach' ? 'text-meta-blue' : 'text-gray-300'}`}/>
                     </TableHead>
                     <TableHead className="cursor-pointer hover:bg-gray-100" onClick={() => requestSort("frequency")}>
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
