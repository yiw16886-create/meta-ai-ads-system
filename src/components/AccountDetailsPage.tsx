import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { format, subDays } from "date-fns";
import axios from "axios";
import {
  ArrowLeft,
  RefreshCcw,
  Calendar as CalendarIcon,
  ArrowUpDown,
  Search,
  Check,
  ChevronsUpDown,
  Info,
  Settings2,
  AlertTriangle,
  Lightbulb,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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

  const [startDate, setStartDate] = useState<Date>(() => {
    try {
      const saved = localStorage.getItem("META_DASHBOARD_START_DATE");
      if (saved) {
        const parsed = new Date(saved);
        if (!isNaN(parsed.getTime())) return parsed;
      }
    } catch (e) {}
    return subDays(new Date(), 1);
  });
  const [endDate, setEndDate] = useState<Date>(() => {
    try {
      const saved = localStorage.getItem("META_DASHBOARD_END_DATE");
      if (saved) {
        const parsed = new Date(saved);
        if (!isNaN(parsed.getTime())) return parsed;
      }
    } catch (e) {}
    return subDays(new Date(), 1);
  });
  const [tempDateRange, setTempDateRange] = useState<{ from: Date; to?: Date }>(() => {
    try {
      const savedStart = localStorage.getItem("META_DASHBOARD_START_DATE");
      const savedEnd = localStorage.getItem("META_DASHBOARD_END_DATE");
      const from = savedStart ? new Date(savedStart) : subDays(new Date(), 1);
      const to = savedEnd ? new Date(savedEnd) : subDays(new Date(), 1);
      return {
        from: !isNaN(from.getTime()) ? from : subDays(new Date(), 1),
        to: !isNaN(to.getTime()) ? to : subDays(new Date(), 1)
      };
    } catch (e) {}
    return {
      from: subDays(new Date(), 1),
      to: subDays(new Date(), 1),
    };
  });

  useEffect(() => {
    if (startDate) {
      localStorage.setItem("META_DASHBOARD_START_DATE", startDate.toISOString());
    }
  }, [startDate]);

  useEffect(() => {
    if (endDate) {
      localStorage.setItem("META_DASHBOARD_END_DATE", endDate.toISOString());
    }
  }, [endDate]);
  const [datePickerOpen, setDatePickerOpen] = useState(false);


  const [level, setLevel] = useState<"campaigns" | "adsets" | "ads">(
    "campaigns",
  );
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [accountSearch, setAccountSearch] = useState("");
  const [tableSearch, setTableSearch] = useState("");
  const [accountSelectorOpen, setAccountSelectorOpen] = useState(false);
  const dataCache = useRef<Record<string, { data: any[]; timestamp: number }>>(
    {},
  );

  // Hierarchy Filters State
  const [hierarchy, setHierarchy] = useState<{
    campaigns: any[];
    adSets: any[];
    ads: any[];
  }>({ campaigns: [], adSets: [], ads: [] });
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([]);
  const [selectedAdSetIds, setSelectedAdSetIds] = useState<string[]>([]);
  const [selectedAdIds, setSelectedAdIds] = useState<string[]>([]);

  // Cleanup sub-selections when parent selection changes
  useEffect(() => {
    if (selectedCampaignIds.length > 0) {
      const validAdSetIds = new Set(
        hierarchy.adSets
          .filter((as) => selectedCampaignIds.includes(as.campaign_id))
          .map((as) => as.id),
      );
      setSelectedAdSetIds((prev) => prev.filter((id) => validAdSetIds.has(id)));
    }
  }, [selectedCampaignIds, hierarchy.adSets]);

  useEffect(() => {
    if (selectedAdSetIds.length > 0) {
      const validAdIds = new Set(
        hierarchy.ads
          .filter((ad) => selectedAdSetIds.includes(ad.adset_id))
          .map((ad) => ad.id),
      );
      setSelectedAdIds((prev) => prev.filter((id) => validAdIds.has(id)));
    }
  }, [selectedAdSetIds, hierarchy.ads]);

  // Sorting
  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: "asc" | "desc";
  } | null>({ key: "effective_status", direction: "desc" });

  const tableContainerRef = useRef<HTMLDivElement>(null);

  const toggleSelection = (id: string) => {
    if (level === "campaigns") {
      setSelectedCampaignIds((prev) =>
        prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
      );
    } else if (level === "adsets") {
      setSelectedAdSetIds((prev) =>
        prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
      );
    } else if (level === "ads") {
      setSelectedAdIds((prev) =>
        prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
      );
    }
  };

  const isSelected = (id: string) => {
    if (level === "campaigns") return selectedCampaignIds.includes(id);
    if (level === "adsets") return selectedAdSetIds.includes(id);
    if (level === "ads") return selectedAdIds.includes(id);
    return false;
  };

  const toggleAll = () => {
    const allIds = sortedData.map((i) => i.id);
    const currentSelectedOfVisible = sortedData
      .filter((i) => isSelected(i.id))
      .map((i) => i.id);

    let setter: (ids: string[] | ((prev: string[]) => string[])) => void;
    let selectedSet: string[];

    if (level === "campaigns") {
      setter = setSelectedCampaignIds;
      selectedSet = selectedCampaignIds;
    } else if (level === "adsets") {
      setter = setSelectedAdSetIds;
      selectedSet = selectedAdSetIds;
    } else {
      setter = setSelectedAdIds;
      selectedSet = selectedAdIds;
    }

    if (
      currentSelectedOfVisible.length === allIds.length &&
      allIds.length > 0
    ) {
      // Unselect all visible
      setter((prev) => prev.filter((id) => !allIds.includes(id)));
    } else {
      // Select all visible
      setter((prev) => [...new Set([...prev, ...allIds])]);
    }
  };

  const fetchData = async () => {
    if (!accountId) return;

    const startStr = format(startDate, "yyyy-MM-dd");
    const endStr = format(endDate, "yyyy-MM-dd");
    const cacheKey = `${level}_${startStr}_${endStr}`;
    const now = Date.now();
    const CACHE_TTL = 3 * 60 * 1000; // 3 minutes frontend cache

    if (
      dataCache.current[cacheKey] &&
      now - dataCache.current[cacheKey].timestamp < CACHE_TTL
    ) {
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
      toast.error(
        typeof error.response?.data?.error === "string"
          ? error.response.data.error
          : "数据加载失败",
      );
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Fetch account list for the switcher once on mount
    axios.get("/api/accounts/list").then((res) => {
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
    axios
      .get(`/api/accounts/${accountId}/hierarchy`)
      .then((res) => {
        if (res.data.success) {
          setHierarchy({
            campaigns: res.data.campaigns || [],
            adSets: res.data.adSets || [],
            ads: res.data.ads || [],
          });
        }
      })
      .catch((err) => console.error("hierarchy fetch error", err));
  }, [accountId]);

  const requestSort = (key: string) => {
    let direction: "asc" | "desc" = "desc";
    if (
      sortConfig &&
      sortConfig.key === key &&
      sortConfig.direction === "desc"
    ) {
      direction = "asc";
    }
    setSortConfig({ key, direction });
  };

  // Helper to extract nested metrics
  const getInsightValue = (item: any, key: string) => {
    if (!item.insights?.data?.[0]) return 0;
    const insight = item.insights.data[0];

    if (key === "spend") return parseFloat(insight.spend || 0);
    if (key === "impressions") return parseInt(insight.impressions || 0, 10);
    if (key === "reach") return parseInt(insight.reach || 0, 10);
    if (key === "frequency") return parseFloat(insight.frequency || 0);

    if (key === "cpm") return parseFloat(insight.cpm || 0);
    if (key === "clicks") return parseInt(insight.clicks || 0, 10);
    if (key === "ctr") return parseFloat(insight.ctr || 0);
    if (key === "cpc") return parseFloat(insight.cpc || 0);

    if (key === "link_clicks")
      return parseInt(insight.inline_link_clicks || 0, 10);
    if (key === "link_ctr")
      return parseFloat(insight.inline_link_click_ctr || 0);
    if (key === "link_cpc")
      return parseFloat(insight.cost_per_inline_link_click || 0);

    if (key === "add_to_cart") {
      const atc = insight.actions?.find(
        (a: any) =>
          a.action_type === "add_to_cart" ||
          a.action_type === "offsite_conversion.fb_pixel_add_to_cart",
      );
      return atc ? parseInt(atc.value, 10) : 0;
    }

    if (key === "results") {
      // Look for purchase action
      const purchase = insight.actions?.find(
        (a: any) => a.action_type === "purchase",
      );
      if (purchase) return parseInt(purchase.value, 10);
      return 0; // Fallback
    }

    if (key === "cpr") {
      // Cost Per Result
      const cpa = insight.cost_per_action_type?.find(
        (a: any) => a.action_type === "purchase",
      );
      if (cpa) return parseFloat(cpa.value);
      return 0;
    }

    if (key === "cpc") {
      // cpc fallback
      const cpc = insight.cost_per_action_type?.find(
        (a: any) => a.action_type === "link_click",
      );
      if (cpc) return parseFloat(cpc.value);
      return 0;
    }

    if (key === "ctr") {
      const clicks = parseInt(
        insight.actions?.find((a: any) => a.action_type === "link_click")
          ?.value || 0,
        10,
      );
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
    return data.filter((item) => {
      // Search filter
      if (
        tableSearch &&
        !(item.name || "").toLowerCase().includes((tableSearch || "").toLowerCase())
      ) {
        return false;
      }

      // Coupling: Only filter by PARENT selections, not CURRENT level selection.
      // This allows the user to see all items at the current level and pick multiple ones.

      const matchCamp =
        selectedCampaignIds.length === 0 ||
        selectedCampaignIds.includes(item.campaign_id);
      const matchAdSet =
        selectedAdSetIds.length === 0 ||
        selectedAdSetIds.includes(item.adset_id);

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
    const insightKeys = [
      "spend",
      "impressions",
      "reach",
      "frequency",
      "results",
      "cpr",
      "cpm",
      "link_clicks",
      "link_ctr",
      "link_cpc",
      "clicks",
      "ctr",
      "cpc",
      "add_to_cart",
    ];
    if (insightKeys.includes(key)) {
      aVal = getInsightValue(a, key);
      bVal = getInsightValue(b, key);
    }

    if (key === "budget") {
      aVal = getBudgetValue(a);
      bVal = getBudgetValue(b);
    }

    if (key === "effective_status") {
      const getStatusWeight = (status: string) => {
        const s = (status || "").toUpperCase();
        if (s === "ACTIVE") return 2;
        if (s.includes("PAUSED")) return 1;
        return 0; // deleted, archived, etc.
      };
      aVal = getStatusWeight(a[key]);
      bVal = getStatusWeight(b[key]);
    }

    if (aVal < bVal) return direction === "asc" ? -1 : 1;
    if (aVal > bVal) return direction === "asc" ? 1 : -1;
    return 0;
  });

  // Calculate totals - prioritize selected items if any exist at current level
  const displayedItems = sortedData.filter((i) => isSelected(i.id));
  const itemsToSum = displayedItems.length > 0 ? displayedItems : sortedData;

  const totalSpend = itemsToSum.reduce(
    (sum, item) => sum + getInsightValue(item, "spend"),
    0,
  );
  const totalImpressions = itemsToSum.reduce(
    (sum, item) => sum + getInsightValue(item, "impressions"),
    0,
  );
  const totalReach = itemsToSum.reduce(
    (sum, item) => sum + getInsightValue(item, "reach"),
    0,
  );

  const linkClicks = itemsToSum.reduce(
    (sum, item) => sum + getInsightValue(item, "link_clicks"),
    0,
  );
  const allClicks = itemsToSum.reduce(
    (sum, item) => sum + getInsightValue(item, "clicks"),
    0,
  );
  const totalPurchases = itemsToSum.reduce(
    (sum, item) => sum + getInsightValue(item, "results"),
    0,
  );
  const totalAddToCart = itemsToSum.reduce(
    (sum, item) => sum + getInsightValue(item, "add_to_cart"),
    0,
  );

  const totalPurchaseValue = itemsToSum.reduce((sum, item) => {
    const valAction = item.insights?.data?.[0]?.action_values?.find(
      (a: any) => a.action_type === "purchase",
    );
    return sum + (valAction ? parseFloat(valAction.value) : 0);
  }, 0);

  // Weighted averages
  const avgCpm =
    totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0;
  const avgLinkCtr =
    totalImpressions > 0 ? (linkClicks / totalImpressions) * 100 : 0;
  const avgLinkCpc = linkClicks > 0 ? totalSpend / linkClicks : 0;
  const avgAllCtr =
    totalImpressions > 0 ? (allClicks / totalImpressions) * 100 : 0;
  const avgAllCpc = allClicks > 0 ? totalSpend / allClicks : 0;
  const avgCpr = totalPurchases > 0 ? totalSpend / totalPurchases : 0;
  const avgFrequency = totalReach > 0 ? totalImpressions / totalReach : 0;
  const roi = totalSpend > 0 ? totalPurchaseValue / totalSpend : 0;

  // Derived Options for Filters
  const campaignOptions = hierarchy.campaigns;
  const adSetOptions =
    selectedCampaignIds.length > 0
      ? hierarchy.adSets.filter((a) =>
          selectedCampaignIds.includes(a.campaign_id),
        )
      : hierarchy.adSets;
  const adOptions =
    selectedAdSetIds.length > 0
      ? hierarchy.ads.filter((a) => selectedAdSetIds.includes(a.adset_id))
      : selectedCampaignIds.length > 0
        ? hierarchy.ads.filter((a) =>
            selectedCampaignIds.includes(a.campaign_id),
          )
        : hierarchy.ads;

  const currentAccountName =
    accounts.find((a) => a.accountId === accountId)?.accountName || accountId;

  return (
    <div className="min-h-screen bg-[#f3f4f6]">
      {/* Top Navbar */}
      <nav className="bg-white border-b border-[#e5e7eb] px-6 h-16 flex items-center sticky top-0 z-50">
        <div className="flex-1">
          <Button
            variant="ghost"
            onClick={() => {
              if (window.history.length > 1) {
                navigate(-1);
              } else {
                navigate("/");
              }
            }}
            className="gap-2 px-0 hover:bg-transparent text-gray-700 font-normal"
          >
            <ArrowLeft className="w-4 h-4" /> 返回工作台
          </Button>
        </div>

        {/* Date Picker - Centered (Dashboard Style Two-Box) */}
        <div className="flex-1 flex justify-center">
          {/* Moved date picker to filter row below */}
        </div>

        <div className="flex-1 flex justify-end">{/* Placeholder */}</div>
      </nav>

      <main className="p-6 max-w-[1700px] mx-auto space-y-6 flex flex-col h-[calc(100vh-64px)] overflow-hidden">
        {/* Level Switcher, Filters & Action row */}
        <Card className="shadow-sm border border-gray-200 bg-white overflow-hidden flex flex-col flex-1">
          {/* Level Tabs Bar - FIXED */}
          <div className="flex-shrink-0 px-6 border-b bg-white flex items-center h-[52px] z-50">
            <div className="flex items-center space-x-6 h-full">
              <button
                className={cn(
                  "h-full px-2 text-[14px] font-bold transition-all border-b-[3px] relative flex items-center",
                  level === "campaigns"
                    ? "border-meta-blue text-meta-blue"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200",
                )}
                onClick={() => setLevel("campaigns")}
              >
                广告系列 (Campaigns)
              </button>
              <button
                className={cn(
                  "h-full px-2 text-[14px] font-bold transition-all border-b-[3px] relative flex items-center",
                  level === "adsets"
                    ? "border-meta-blue text-meta-blue"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200",
                )}
                onClick={() => setLevel("adsets")}
              >
                广告组 (Ad Sets)
              </button>
              <button
                className={cn(
                  "h-full px-2 text-[14px] font-bold transition-all border-b-[3px] relative flex items-center",
                  level === "ads"
                    ? "border-meta-blue text-meta-blue"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200",
                )}
                onClick={() => setLevel("ads")}
              >
                广告 (Ads)
              </button>
            </div>
          </div>

          <div className="flex-shrink-0 px-6 py-2 border-b bg-[#f6f7f9] flex items-center justify-between z-40 min-h-[52px]">
            <div className="flex items-center gap-3">
              {/* Account Selector - Name box as trigger */}
              <Popover
                open={accountSelectorOpen}
                onOpenChange={setAccountSelectorOpen}
              >
                <PopoverTrigger className="px-3 py-1.5 bg-white border border-gray-300 rounded-md text-[13px] font-medium text-[#1c2b33] hover:bg-gray-50 hover:border-meta-blue/50 transition-all cursor-pointer flex items-center gap-1 min-w-[150px] max-w-[240px] shadow-sm">
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
                          .filter(
                            (a) =>
                              (a.accountName || "")
                                .toLowerCase()
                                .includes((accountSearch || "").toLowerCase()) ||
                              (a.accountId || "").includes(accountSearch || ""),
                          )
                          .map((acc) => (
                            <button
                              key={acc.accountId}
                              onClick={() => {
                                navigate(`/account/${acc.accountId}`);
                                setAccountSelectorOpen(false);
                                setAccountSearch("");
                              }}
                              className={cn(
                                "w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between hover:bg-blue-50 transition-colors",
                                acc.accountId === accountId
                                  ? "bg-blue-50 text-meta-blue font-semibold"
                                  : "text-gray-700",
                              )}
                            >
                              <span className="truncate flex-1 pr-2">
                                {acc.accountName || acc.accountId}
                              </span>
                              {acc.accountId === accountId && (
                                <Check className="w-4 h-4" />
                              )}
                            </button>
                          ))}
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
            </div>

            <div className="flex items-center gap-3">
              <Popover
                open={datePickerOpen}
                onOpenChange={(open) => {
                  setDatePickerOpen(open);
                  if (open) {
                    setTempDateRange({ from: startDate, to: endDate });
                  }
                }}
              >
                <PopoverTrigger>
                  <div className="flex items-center gap-2 cursor-pointer group">
                    <div className="relative">
                      <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 group-hover:text-meta-blue transition-colors z-10" />
                      <div className="pl-9 pr-3 py-2 border border-gray-300 rounded-md text-[13px] w-[130px] text-left bg-white flex items-center font-medium text-gray-700 hover:border-meta-blue/50 transition-colors shadow-sm">
                        {format(startDate, "yyyy-MM-dd")}
                      </div>
                    </div>
                    <span className="text-gray-400 text-[13px] font-medium">
                      至
                    </span>
                    <div className="relative">
                      <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 group-hover:text-meta-blue transition-colors z-10" />
                      <div className="pl-9 pr-3 py-2 border border-gray-300 rounded-md text-[13px] w-[130px] text-left bg-white flex items-center font-medium text-gray-700 hover:border-meta-blue/50 transition-colors shadow-sm">
                        {format(endDate, "yyyy-MM-dd")}
                      </div>
                    </div>
                  </div>
                </PopoverTrigger>
                <PopoverContent
                  className="w-auto p-0"
                  align="end"
                  sideOffset={8}
                >
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
                        if (range) {
                          setTempDateRange(range);
                        }
                      }}
                      numberOfMonths={2}
                      className="rounded-t-md"
                    />
                    <div className="p-3 border-t bg-gray-50 flex justify-between items-center rounded-b-md">
                      <div className="text-[12px] text-gray-500">
                        已选:{" "}
                        <span className="font-bold text-gray-700">
                          {tempDateRange.from ? format(tempDateRange.from, "yyyy-MM-dd") : "-"}
                        </span>
                        {tempDateRange.to && (
                          <>
                            {" "}
                            至{" "}
                            <span className="font-bold text-gray-700">
                              {format(tempDateRange.to, "yyyy-MM-dd")}
                            </span>
                          </>
                        )}
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
                            if (tempDateRange.from) {
                              setStartDate(tempDateRange.from);
                              setEndDate(tempDateRange.to || tempDateRange.from);
                              setDatePickerOpen(false);
                            }
                          }}
                        >
                          确定
                        </Button>
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              <Button
                onClick={fetchData}
                disabled={loading}
                size="sm"
                className="bg-meta-blue hover:bg-blue-700 h-9 px-4 font-bold flex items-center gap-2"
              >
                {loading ? (
                  <RefreshCcw className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCcw className="w-4 h-4" />
                )}
                刷新数据
              </Button>
            </div>
          </div>

          <CardContent className="p-0 bg-white relative flex-1 flex flex-col overflow-hidden rounded-b-md">
            <div
              ref={tableContainerRef}
              className="flex-1 overflow-auto relative border-x border-t border-b max-h-[600px]"
            >
              <table className="w-full caption-bottom text-sm min-w-max border-separate border-spacing-0">
                <thead className="[&_tr]:border-b bg-[#fbfcff] sticky top-0 z-40 shadow-sm">
                  <tr className="border-b transition-colors hover:bg-transparent">
                    <th className="p-0 align-middle whitespace-nowrap w-[50px] min-w-[50px] max-w-[50px] text-center border-r border-b border-[#e5e7eb] h-10 sticky left-0 z-[60] bg-[#fbfcff]">
                      <div className="flex items-center justify-center h-full w-full">
                        <Checkbox
                          checked={
                            sortedData.length > 0 &&
                            sortedData.every((i) => isSelected(i.id))
                          }
                          onCheckedChange={toggleAll}
                        />
                      </div>
                    </th>
                    <th
                      className="p-0 align-middle whitespace-nowrap w-[250px] min-w-[250px] max-w-[250px] border-r border-b border-[#e5e7eb] cursor-pointer hover:bg-gray-100 text-[#4b5563] font-bold text-[12px] sticky left-[50px] z-[60] bg-[#fbfcff]"
                      onClick={() => requestSort("name")}
                    >
                      <div className="w-full flex items-center px-4">
                        名称{" "}
                        <ArrowUpDown
                          className={`w-3 h-3 inline-block ml-1 ${sortConfig?.key === "name" ? "text-meta-blue" : "text-gray-300"}`}
                        />
                      </div>
                    </th>
                    {level === "ads" && (
                      <th
                        className="h-10 px-2 align-middle whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 border-r border-b border-[#e5e7eb] text-[#4b5563] font-bold px-4 text-[12px] text-left"
                      >
                        广告创意 ID
                      </th>
                    )}
                    <th
                      className="h-10 px-2 align-middle whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-gray-100 border-r border-b border-[#e5e7eb] text-[#4b5563] font-bold px-4 text-[12px]"
                      onClick={() => requestSort("effective_status")}
                    >
                      投放状态{" "}
                      <ArrowUpDown
                        className={`w-3 h-3 inline-block ml-1 ${sortConfig?.key === "effective_status" ? "text-meta-blue" : "text-gray-300"}`}
                      />
                    </th>

                    <th
                      className="h-10 px-2 align-middle whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-gray-100 border-r border-b border-[#e5e7eb] text-[#4b5563] font-bold px-4 text-[12px] md:min-w-[120px]"
                      onClick={() => requestSort("results")}
                    >
                      购物次数{" "}
                      <ArrowUpDown
                        className={`w-3 h-3 inline-block ml-1 ${sortConfig?.key === "results" ? "text-meta-blue" : "text-gray-300"}`}
                      />
                    </th>
                    <th
                      className="h-10 px-2 align-middle whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-gray-100 border-r border-b border-[#e5e7eb] text-[#4b5563] font-bold px-4 text-[12px]"
                      onClick={() => requestSort("cpr")}
                    >
                      单次购物费用{" "}
                      <ArrowUpDown
                        className={`w-3 h-3 inline-block ml-1 ${sortConfig?.key === "cpr" ? "text-meta-blue" : "text-gray-300"}`}
                      />
                    </th>

                    <th
                      className="h-10 px-2 align-middle whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-gray-100 border-r border-b border-[#e5e7eb] text-[#4b5563] font-bold px-4 text-[12px]"
                      onClick={() => requestSort("budget")}
                    >
                      预算{" "}
                      <ArrowUpDown
                        className={`w-3 h-3 inline-block ml-1 ${sortConfig?.key === "budget" ? "text-meta-blue" : "text-gray-300"}`}
                      />
                    </th>
                    <th
                      className="h-10 px-2 align-middle whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-gray-100 border-r border-b border-[#e5e7eb] text-[#4b5563] font-bold px-4 text-[12px]"
                      onClick={() => requestSort("spend")}
                    >
                      已花费金额{" "}
                      <ArrowUpDown
                        className={`w-3 h-3 inline-block ml-1 ${sortConfig?.key === "spend" ? "text-meta-blue" : "text-gray-300"}`}
                      />
                    </th>
                    <th
                      className="h-10 px-2 align-middle whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-gray-100 border-r border-b border-[#e5e7eb] text-[#4b5563] font-bold px-4 text-[12px]"
                      onClick={() => requestSort("impressions")}
                    >
                      展示次数{" "}
                      <ArrowUpDown
                        className={`w-3 h-3 inline-block ml-1 ${sortConfig?.key === "impressions" ? "text-meta-blue" : "text-gray-300"}`}
                      />
                    </th>
                    <th
                      className="h-10 px-2 align-middle whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-gray-100 border-r border-b border-[#e5e7eb] text-[#4b5563] font-bold px-4 text-[12px]"
                      onClick={() => requestSort("reach")}
                    >
                      覆盖人数{" "}
                      <ArrowUpDown
                        className={`w-3 h-3 inline-block ml-1 ${sortConfig?.key === "reach" ? "text-meta-blue" : "text-gray-300"}`}
                      />
                    </th>
                    <th
                      className="h-10 px-2 align-middle whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-gray-100 border-r border-b border-[#e5e7eb] text-[#4b5563] font-bold px-4 text-[12px]"
                      onClick={() => requestSort("frequency")}
                    >
                      频次{" "}
                      <ArrowUpDown
                        className={`w-3 h-3 inline-block ml-1 ${sortConfig?.key === "frequency" ? "text-meta-blue" : "text-gray-300"}`}
                      />
                    </th>

                    <th
                      className="h-10 px-2 align-middle whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-gray-100 border-r border-b border-[#e5e7eb] text-[#4b5563] font-bold px-4 text-[12px]"
                      onClick={() => requestSort("cpm")}
                    >
                      CPM{" "}
                      <ArrowUpDown
                        className={`w-3 h-3 inline-block ml-1 ${sortConfig?.key === "cpm" ? "text-meta-blue" : "text-gray-300"}`}
                      />
                    </th>
                    <th
                      className="h-10 px-2 align-middle whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-gray-100 border-r border-b border-[#e5e7eb] text-[#4b5563] font-bold px-4 text-[12px]"
                      onClick={() => requestSort("link_clicks")}
                    >
                      链接点击量{" "}
                      <ArrowUpDown
                        className={`w-3 h-3 inline-block ml-1 ${sortConfig?.key === "link_clicks" ? "text-meta-blue" : "text-gray-300"}`}
                      />
                    </th>
                    <th
                      className="h-10 px-2 align-middle whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-gray-100 border-r border-b border-[#e5e7eb] text-[#4b5563] font-bold px-4 text-[12px]"
                      onClick={() => requestSort("link_ctr")}
                    >
                      链接点击率{" "}
                      <ArrowUpDown
                        className={`w-3 h-3 inline-block ml-1 ${sortConfig?.key === "link_ctr" ? "text-meta-blue" : "text-gray-300"}`}
                      />
                    </th>
                    <th
                      className="h-10 px-2 align-middle whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-gray-100 border-r border-b border-[#e5e7eb] text-[#4b5563] font-bold px-4 text-[12px]"
                      onClick={() => requestSort("link_cpc")}
                    >
                      单次链接点击费用{" "}
                      <ArrowUpDown
                        className={`w-3 h-3 inline-block ml-1 ${sortConfig?.key === "link_cpc" ? "text-meta-blue" : "text-gray-300"}`}
                      />
                    </th>
                    <th
                      className="h-10 px-2 align-middle whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-gray-100 border-r border-b border-[#e5e7eb] text-[#4b5563] font-bold px-4 text-[12px]"
                      onClick={() => requestSort("clicks")}
                    >
                      点击量{" "}
                      <ArrowUpDown
                        className={`w-3 h-3 inline-block ml-1 ${sortConfig?.key === "clicks" ? "text-meta-blue" : "text-gray-300"}`}
                      />
                    </th>
                    <th
                      className="h-10 px-2 align-middle whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-gray-100 border-r border-b border-[#e5e7eb] text-[#4b5563] font-bold px-4 text-[12px]"
                      onClick={() => requestSort("ctr")}
                    >
                      点击率{" "}
                      <ArrowUpDown
                        className={`w-3 h-3 inline-block ml-1 ${sortConfig?.key === "ctr" ? "text-meta-blue" : "text-gray-300"}`}
                      />
                    </th>
                    <th
                      className="h-10 px-2 align-middle whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-gray-100 border-r border-b border-[#e5e7eb] text-[#4b5563] font-bold px-4 text-[12px]"
                      onClick={() => requestSort("cpc")}
                    >
                      单次点击费用{" "}
                      <ArrowUpDown
                        className={`w-3 h-3 inline-block ml-1 ${sortConfig?.key === "cpc" ? "text-meta-blue" : "text-gray-300"}`}
                      />
                    </th>
                    <th
                      className="h-10 px-2 align-middle whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 cursor-pointer hover:bg-gray-100 border-b border-[#e5e7eb] text-[#4b5563] font-bold px-4 text-[12px]"
                      onClick={() => requestSort("add_to_cart")}
                    >
                      加入购物车{" "}
                      <ArrowUpDown
                        className={`w-3 h-3 inline-block ml-1 ${sortConfig?.key === "add_to_cart" ? "text-meta-blue" : "text-gray-300"}`}
                      />
                    </th>
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  {loading ? (
                    <tr className="border-b transition-colors">
                      <td
                        colSpan={level === "ads" ? 21 : 20}
                        className="p-2 align-middle h-32 text-center text-gray-500"
                      >
                        <RefreshCcw className="w-6 h-6 animate-spin mx-auto text-meta-blue mb-2" />
                        正在加载数据...
                      </td>
                    </tr>
                  ) : sortedData.length === 0 ? (
                    <tr className="border-b transition-colors">
                      <td
                        colSpan={level === "ads" ? 21 : 20}
                        className="p-2 align-middle h-32 text-center text-gray-500"
                      >
                        暂无数据
                      </td>
                    </tr>
                  ) : (
                    sortedData.map((item) => (
                      <tr
                        key={item.id}
                        className={cn(
                          "border-b transition-colors hover:bg-gray-50 border-[#f3f4f6] cursor-pointer group",
                          isSelected(item.id) && "bg-blue-50/50",
                        )}
                        onClick={() => toggleSelection(item.id)}
                      >
                        <td
                          className="p-0 align-middle whitespace-nowrap w-[50px] min-w-[50px] max-w-[50px] text-center font-medium border-r border-[#e5e7eb] sticky left-0 z-20 bg-white group-hover:bg-gray-50 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-center h-full py-2 w-full">
                            <Checkbox
                              checked={isSelected(item.id)}
                              onCheckedChange={() => toggleSelection(item.id)}
                            />
                          </div>
                        </td>
                        <td
                          className="p-0 align-middle whitespace-nowrap font-medium text-meta-blue border-r border-[#e5e7eb] sticky left-[50px] w-[250px] min-w-[250px] max-w-[250px] z-20 bg-white group-hover:bg-gray-50 transition-colors"
                          title={item.name}
                        >
                          <div 
                            className={`w-full truncate px-4 py-2 ${level !== "ads" ? "hover:underline cursor-pointer" : ""}`}
                            onClick={(e) => {
                              if (level === "campaigns" || level === "adsets") {
                                e.stopPropagation();
                                if (level === "campaigns") {
                                  setLevel("adsets");
                                  setSelectedCampaignIds([item.id]);
                                  setSelectedAdSetIds([]);
                                  setSelectedAdIds([]);
                                } else if (level === "adsets") {
                                  setLevel("ads");
                                  setSelectedAdSetIds([item.id]);
                                  setSelectedAdIds([]);
                                }
                              }
                            }}
                          >
                            {item.name}
                          </div>
                        </td>
                        {level === "ads" && (
                          <td className="p-2 align-middle whitespace-nowrap text-left font-mono text-xs border-r border-[#e5e7eb] px-4 text-gray-500">
                            {item.creative?.id || item.creative_id || (item.creative ? item.creative.id : null) ? (
                              <span className="bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-md font-semibold text-slate-700 select-all" title="双击全选复制">
                                {item.creative?.id || item.creative_id || item.creative?.id}
                              </span>
                            ) : (
                              <span className="text-gray-300 italic">未绑定创意</span>
                            )}
                          </td>
                        )}
                        <td className="p-2 align-middle whitespace-nowrap text-gray-600 border-r border-[#e5e7eb] px-4">
                          <span
                            className={cn(
                              "px-2 py-1 rounded text-[10px] font-bold uppercase",
                              item.effective_status === "ACTIVE"
                                ? "bg-green-100 text-green-700"
                                : "bg-gray-100 text-gray-700",
                            )}
                          >
                            {item.effective_status}
                          </span>
                        </td>
                        <td className="p-2 align-middle whitespace-nowrap font-bold border-r border-[#e5e7eb] text-gray-800 px-4">
                          {(getInsightValue(item, "results") || 0).toLocaleString()}
                        </td>
                        <td className="p-2 align-middle whitespace-nowrap text-gray-600 border-r border-[#e5e7eb] px-4">
                          ${getInsightValue(item, "cpr").toFixed(2)}
                        </td>

                        <td className="p-2 align-middle whitespace-nowrap font-medium border-r border-[#e5e7eb] px-4 text-gray-700">
                          ${getBudgetValue(item).toFixed(2)}
                        </td>
                        <td className="p-2 align-middle whitespace-nowrap font-medium border-r border-[#e5e7eb] px-4 text-gray-900 text-right">
                          ${getInsightValue(item, "spend").toFixed(2)}
                        </td>
                        <td className="p-2 align-middle whitespace-nowrap text-gray-600 border-r border-[#e5e7eb] px-4">
                          {(getInsightValue(
                            item,
                            "impressions",
                          ) || 0).toLocaleString()}
                        </td>
                        <td className="p-2 align-middle whitespace-nowrap text-gray-600 border-r border-[#e5e7eb] px-4">
                          {(getInsightValue(item, "reach") || 0).toLocaleString()}
                        </td>
                        <td className="p-2 align-middle whitespace-nowrap text-gray-600 border-r border-[#e5e7eb] px-4">
                          {getInsightValue(item, "frequency").toFixed(2)}
                        </td>

                        <td className="p-2 align-middle whitespace-nowrap text-gray-600 border-r border-[#e5e7eb] px-4">
                          ${getInsightValue(item, "cpm").toFixed(2)}
                        </td>
                        <td className="p-2 align-middle whitespace-nowrap text-gray-600 border-r border-[#e5e7eb] px-4">
                          {(getInsightValue(
                            item,
                            "link_clicks",
                          ) || 0).toLocaleString()}
                        </td>
                        <td className="p-2 align-middle whitespace-nowrap text-gray-600 border-r border-[#e5e7eb] px-4">
                          {getInsightValue(item, "link_ctr").toFixed(2)}%
                        </td>
                        <td className="p-2 align-middle whitespace-nowrap text-gray-600 border-r border-[#e5e7eb] px-4">
                          ${getInsightValue(item, "link_cpc").toFixed(2)}
                        </td>
                        <td className="p-2 align-middle whitespace-nowrap text-gray-600 border-r border-[#e5e7eb] px-4">
                          {(getInsightValue(item, "clicks") || 0).toLocaleString()}
                        </td>
                        <td className="p-2 align-middle whitespace-nowrap text-gray-600 border-r border-[#e5e7eb] px-4">
                          {getInsightValue(item, "ctr").toFixed(2)}%
                        </td>
                        <td className="p-2 align-middle whitespace-nowrap text-gray-600 border-r border-[#e5e7eb] px-4">
                          ${getInsightValue(item, "cpc").toFixed(2)}
                        </td>
                        <td className="p-2 align-middle whitespace-nowrap text-gray-600 px-4">
                          {(getInsightValue(
                            item,
                            "add_to_cart",
                          ) || 0).toLocaleString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>

                {/* Summary Footer Row */}
                {!loading && sortedData.length > 0 && (
                  <tfoot className="border-t bg-muted/50 font-medium [&>tr]:last:border-b-0">
                    <tr className="border-b transition-colors bg-[#f0f2f5] sticky bottom-0 z-40 shadow-[0_-2px_10px_rgba(0,0,0,0.1)] border-t-[3px] border-[#ced0d4] h-[64px] hover:bg-[#f0f2f5]">
                      <td className="p-0 align-middle whitespace-nowrap text-center font-medium border-r border-[#ced0d4] w-[50px] min-w-[50px] max-w-[50px] sticky left-0 z-[60] bg-[#f0f2f5]">
                        <div className="flex items-center justify-center h-full w-full"></div>
                      </td>
                      <td className="p-0 align-middle whitespace-nowrap font-bold text-[#1c2b33] border-r border-[#ced0d4] sticky left-[50px] w-[250px] min-w-[250px] max-w-[250px] z-[60] bg-[#f0f2f5]">
                        <div className="w-full text-[13px] leading-tight px-4 py-2">
                          <div className="font-bold truncate flex items-center gap-1">
                            {itemsToSum.length}个
                            {level === "campaigns"
                              ? "广告系列"
                              : level === "adsets"
                                ? "广告组"
                                : "广告"}
                            的汇总
                            <Info className="w-3.5 h-3.5 text-gray-500 font-normal" />
                          </div>
                          <div className="text-[11px] text-gray-500 font-normal mt-0.5">
                            成效汇总
                          </div>
                        </div>
                      </td>
                      <td className="p-2 align-middle whitespace-nowrap text-center text-gray-400 border-r border-[#ced0d4] px-4">
                        —
                      </td>
                      <td className="p-2 align-middle whitespace-nowrap border-r border-[#ced0d4] text-[#1c2b33] px-4 leading-tight">
                        <div className="font-bold text-[13px]">
                          {(totalPurchases || 0).toLocaleString()}
                        </div>
                        <div className="text-[11px] text-gray-500">
                          Meta 账户
                        </div>
                      </td>
                      <td className="p-2 align-middle whitespace-nowrap text-[#1c2b33] border-r border-[#ced0d4] px-4 leading-tight">
                        <div className="font-bold text-[13px]">
                          ${avgCpr.toFixed(2)}
                        </div>
                        <div className="text-[11px] text-gray-500">
                          每个 Meta 账户
                        </div>
                      </td>
                      <td className="p-2 align-middle whitespace-nowrap text-center text-gray-400 border-r border-[#ced0d4] px-4">
                        —
                      </td>
                      <td className="p-2 align-middle whitespace-nowrap text-[#1c2b33] border-r border-[#ced0d4] px-4 text-right leading-tight">
                        <div className="font-bold text-[13px]">
                          ${totalSpend.toFixed(2)}
                        </div>
                        <div className="text-[11px] text-gray-500">总花费</div>
                      </td>
                      <td className="p-2 align-middle whitespace-nowrap text-[#1c2b33] border-r border-[#ced0d4] px-4 leading-tight">
                        <div className="font-bold text-[13px]">
                          {(totalImpressions || 0).toLocaleString()}
                        </div>
                        <div className="text-[11px] text-gray-500">共计</div>
                      </td>
                      <td className="p-2 align-middle whitespace-nowrap text-[#1c2b33] border-r border-[#ced0d4] px-4 leading-tight">
                        <div className="font-bold text-[13px]">
                          {(totalReach || 0).toLocaleString()}
                        </div>
                        <div className="text-[11px] text-gray-500">共计</div>
                      </td>
                      <td className="p-2 align-middle whitespace-nowrap text-[#1c2b33] border-r border-[#ced0d4] px-4 leading-tight">
                        <div className="font-bold text-[13px]">
                          {avgFrequency.toFixed(2)}
                        </div>
                        <div className="text-[11px] text-gray-500">
                          每个用户的平均频率
                        </div>
                      </td>
                      <td className="p-2 align-middle whitespace-nowrap text-[#1c2b33] border-r border-[#ced0d4] px-4 leading-tight">
                        <div className="font-bold text-[13px]">
                          ${avgCpm.toFixed(2)}
                        </div>
                        <div className="text-[11px] text-gray-500">
                          每 1000 次展示
                        </div>
                      </td>
                      <td className="p-2 align-middle whitespace-nowrap text-[#1c2b33] border-r border-[#ced0d4] px-4 leading-tight">
                        <div className="font-bold text-[13px]">
                          {(linkClicks || 0).toLocaleString()}
                        </div>
                        <div className="text-[11px] text-gray-500">共计</div>
                      </td>
                      <td className="p-2 align-middle whitespace-nowrap text-[#1c2b33] border-r border-[#ced0d4] px-4 leading-tight">
                        <div className="font-bold text-[13px]">
                          {avgLinkCtr.toFixed(2)}%
                        </div>
                        <div className="text-[11px] text-gray-500">平均</div>
                      </td>
                      <td className="p-2 align-middle whitespace-nowrap text-[#1c2b33] border-r border-[#ced0d4] px-4 leading-tight">
                        <div className="font-bold text-[13px]">
                          ${avgLinkCpc.toFixed(2)}
                        </div>
                        <div className="text-[11px] text-gray-500">平均</div>
                      </td>
                      <td className="p-2 align-middle whitespace-nowrap text-[#1c2b33] border-r border-[#ced0d4] px-4 leading-tight">
                        <div className="font-bold text-[13px]">
                          {(allClicks || 0).toLocaleString()}
                        </div>
                        <div className="text-[11px] text-gray-500">共计</div>
                      </td>
                      <td className="p-2 align-middle whitespace-nowrap text-[#1c2b33] border-r border-[#ced0d4] px-4 leading-tight">
                        <div className="font-bold text-[13px]">
                          {avgAllCtr.toFixed(2)}%
                        </div>
                        <div className="text-[11px] text-gray-500">平均</div>
                      </td>
                      <td className="p-2 align-middle whitespace-nowrap text-[#1c2b33] border-r border-[#ced0d4] px-4 leading-tight">
                        <div className="font-bold text-[13px]">
                          ${avgAllCpc.toFixed(2)}
                        </div>
                        <div className="text-[11px] text-gray-500">平均</div>
                      </td>
                      <td className="p-2 align-middle whitespace-nowrap text-[#1c2b33] px-4 leading-tight">
                        <div className="font-bold text-[13px]">
                          {(totalAddToCart || 0).toLocaleString()}
                        </div>
                        <div className="text-[11px] text-gray-500">共计</div>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
