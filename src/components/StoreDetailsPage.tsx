import React, { useState, useEffect, useMemo } from "react";
import { format, subDays } from "date-fns";
import axios from "axios";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  ArrowUpDown,
  ChevronRight,
  Settings,
  Store,
  Key,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ShoppingBag,
  Search,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const getPlatformSuffix = (platform: string): string => {
  if (platform === "shopify") return ".myshopify.com";
  if (platform === "shoplazza") return ".myshoplaza.com";
  return ".myshopline.com"; // default is shopline
};

const getSubdomainOnly = (domain: string, platform: string): string => {
  if (!domain) return "";
  
  // Clean up https:// and trailing slashes first
  let clean = domain.replace(/^https?:\/\//i, "").replace(/\/$/, "").replace(/\/admin\/.*$/i, "");
  
  // Clean up any other known platform suffixes first to keep it pristine
  clean = clean.replace(/\.myshopline\.com$/i, "").replace(/\.myshopline$/i, "")
               .replace(/\.myshopify\.com$/i, "").replace(/\.myshopify$/i, "")
               .replace(/\.myshoplazz\.com$/i, "").replace(/\.myshoplazz$/i, "")
               .replace(/\.myshoplazza\.com$/i, "").replace(/\.myshoplazza$/i, "")
               .replace(/\.myshoplaza\.com$/i, "").replace(/\.myshoplaza$/i, "");
               
  return clean;
};

export function StoreDetailsPage({
  onLogout,
  isNew = false,
}: {
  onLogout: () => void;
  isNew?: boolean;
}) {
  const navigate = useNavigate();
  const { storeId } = useParams();
  const [storeData, setStoreData] = useState<any>({
    name: "",
    platform: "shopline",
    shopline_token: "",
    shopify_token: "",
    shoplazza_token: "",
    domain: "",
    timezone: "GMT+8",
    visitors: 0,
    accounts: [],
  });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [isSyncingData, setIsSyncingData] = useState(false);

  const [dashboardSummary, setDashboardSummary] = useState<any>({
    totalSpend: 0,
    totalROAS: 0,
    totalSales: 0,
    totalOrders: 0,
    totalVisitors: 0,
    avgConversionRate: 0,
    loading: false,
    isConfigured: false,
    error: false
  });

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

  // Ad Account Mappings States
  const [mappings, setMappings] = useState<any[]>([]);
  const [adInsights, setAdInsights] = useState<any[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [unmapConfirmOpen, setUnmapConfirmOpen] = useState(false);
  const [accountToUnmap, setAccountToUnmap] = useState<string | null>(null);
  const [newAccount, setNewAccount] = useState({
    accountId: "",
    accountName: "",
    owner: "",
    project: "",
  });

  // Multi-select Available Ad Accounts states
  const [availableAccounts, setAvailableAccounts] = useState<any[]>([]);
  const [accountsListLoading, setAccountsListLoading] = useState(false);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [accSearchQuery, setAccSearchQuery] = useState("");

  const fetchAvailableAccounts = async () => {
    setAccountsListLoading(true);
    try {
      const res = await axios.get("/api/accounts/list");
      if (Array.isArray(res.data)) {
        setAvailableAccounts(res.data);
      }
    } catch (err) {
      console.error("Failed to fetch available accounts:", err);
    } finally {
      setAccountsListLoading(false);
    }
  };

  useEffect(() => {
    if (addAccountOpen) {
      fetchAvailableAccounts();
      setSelectedAccountIds([]);
      setAccSearchQuery("");
    }
  }, [addAccountOpen]);

  const filteredAvailableAccounts = useMemo(() => {
    const query = accSearchQuery.toLowerCase().trim();
    return availableAccounts.filter(acc => {
      const name = (acc.accountName || "").toLowerCase();
      const id = (acc.accountId || "").toLowerCase();
      return name.includes(query) || id.includes(query);
    });
  }, [availableAccounts, accSearchQuery]);

  const isAllFilteredSelected = useMemo(() => {
    if (filteredAvailableAccounts.length === 0) return false;
    // Filter out accounts already associated with this store so we don't count them in toggle select-all logic
    const selectables = filteredAvailableAccounts.filter(acc => {
      return !mappings.some(
        (m: any) => {
          const mId = String(m.accountId || "").replace("act_", "").trim();
          const accId = String(acc.accountId || "").replace("act_", "").trim();
          return mId === accId && String(m.store).toLowerCase() === String(storeData.name).toLowerCase();
        }
      );
    });
    if (selectables.length === 0) return false;
    return selectables.every(acc => selectedAccountIds.includes(acc.accountId));
  }, [filteredAvailableAccounts, selectedAccountIds, mappings, storeData?.name]);

  const toggleSelectAllFiltered = () => {
    const selectables = filteredAvailableAccounts.filter(acc => {
      return !mappings.some(
        (m: any) => {
          const mId = String(m.accountId || "").replace("act_", "").trim();
          const accId = String(acc.accountId || "").replace("act_", "").trim();
          return mId === accId && String(m.store).toLowerCase() === String(storeData.name).toLowerCase();
        }
      );
    });
    
    if (isAllFilteredSelected) {
      // Remove all selectable filtered IDs from selection
      const idsToRemove = selectables.map(acc => acc.accountId);
      setSelectedAccountIds(prev => prev.filter(id => !idsToRemove.includes(id)));
    } else {
      // Add all selectable filtered IDs to selection
      const idsToAdd = selectables.map(acc => acc.accountId);
      setSelectedAccountIds(prev => Array.from(new Set([...prev, ...idsToAdd])));
    }
  };

  const fetchAssociatedAdAccounts = async () => {
    if (!storeData?.name) return;
    setAccountsLoading(true);
    try {
      const dateParams = {
        startDate: format(startDate, "yyyy-MM-dd"),
        endDate: format(endDate, "yyyy-MM-dd"),
      };

      const [mappingsRes, insightsRes] = await Promise.all([
        axios.get("/api/mappings"),
        axios.get("/api/insights", { params: dateParams }),
      ]);

      if (Array.isArray(mappingsRes.data)) {
        setMappings(mappingsRes.data);
      }
      if (Array.isArray(insightsRes.data)) {
        setAdInsights(insightsRes.data);
      }
    } catch (error) {
      console.error("Failed to fetch associated account data:", error);
    } finally {
      setAccountsLoading(false);
    }
  };

  useEffect(() => {
    if (!isNew && storeData?.name) {
      fetchAssociatedAdAccounts();
    }
  }, [isNew, storeData?.name, startDate, endDate]);

  const filteredAccountsData = useMemo(() => {
    if (!storeData?.name) return [];
    
    // Find all mappings belonging to the current store
    const storeMappings = mappings.filter(
      (m: any) => m.store && String(m.store).toLowerCase() === String(storeData.name).toLowerCase()
    );

    // Map each mapping to its aggregated metrics
    return storeMappings.map((m: any) => {
      const cleanMappedId = String(m.accountId).replace("act_", "").trim();
      
      // Filter ad insights that match this account ID
      const matchingInsights = adInsights.filter((insight: any) => {
        const cleanInsightId = String(insight.accountId).replace("act_", "").trim();
        return cleanInsightId === cleanMappedId;
      });

      // Sum metrics
      let reach = 0;
      let impressions = 0;
      let clicks = 0;
      let spend = 0;
      let addToCart = 0;
      let initiateCheckout = 0;
      let purchases = 0;
      let purchaseValue = 0;

      matchingInsights.forEach((item: any) => {
        reach += item.reach || 0;
        impressions += item.impressions || 0;
        clicks += item.clicks || 0;
        spend += item.spend || 0;
        addToCart += item.addToCart || 0;
        initiateCheckout += item.initiateCheckout || 0;
        purchases += item.purchases || 0;
        purchaseValue += item.purchaseValue || 0;
      });

      return {
        accountId: m.accountId,
        accountName: m.accountName || m.accountId,
        store: m.store,
        owner: m.owner || "未分配",
        project: m.project || "未分配",
        reach,
        impressions,
        clicks,
        spend,
        addToCart,
        initiateCheckout,
        purchases,
        purchaseValue,
        cpc: clicks > 0 ? spend / clicks : 0,
        ctr: impressions > 0 ? (clicks / impressions) * 105 : 0, // customized multiplier or % computation
        atcRate: clicks > 0 ? (addToCart / clicks) * 100 : 0,
        checkoutRate: clicks > 0 ? (initiateCheckout / clicks) * 100 : 0,
        cpp: purchases > 0 ? spend / purchases : 0,
        roas: spend > 0 ? purchaseValue / spend : 0,
      };
    });
  }, [mappings, adInsights, storeData?.name]);

  const [sortKey, setSortKey] = useState<string>("spend");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDirection(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  };

  const sortedAccountsData = useMemo(() => {
    return [...filteredAccountsData].sort((a: any, b: any) => {
      let valA = a[sortKey];
      let valB = b[sortKey];

      if (typeof valA === "string") valA = valA.toLowerCase();
      if (typeof valB === "string") valB = valB.toLowerCase();

      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [filteredAccountsData, sortKey, sortDirection]);

  const accountTotals = useMemo(() => {
    let spend = 0;
    let purchaseValue = 0;
    let addToCart = 0;
    let initiateCheckout = 0;
    let purchases = 0;
    let clicks = 0;
    let impressions = 0;

    filteredAccountsData.forEach((item: any) => {
      spend += item.spend || 0;
      purchaseValue += item.purchaseValue || 0;
      addToCart += item.addToCart || 0;
      initiateCheckout += item.initiateCheckout || 0;
      purchases += item.purchases || 0;
      clicks += item.clicks || 0;
      impressions += item.impressions || 0;
    });

    return {
      spend,
      purchaseValue,
      addToCart,
      initiateCheckout,
      purchases,
      clicks,
      impressions,
      atcRate: clicks > 0 ? (addToCart / clicks) * 100 : 0,
      checkoutRate: clicks > 0 ? (initiateCheckout / clicks) * 100 : 0,
      cpp: purchases > 0 ? spend / purchases : 0,
      roas: spend > 0 ? purchaseValue / spend : 0,
      count: filteredAccountsData.length,
    };
  }, [filteredAccountsData]);

  const handleAddAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedAccountIds.length === 0) {
      return toast.error("请选择至少一个广告账户");
    }
    
    try {
      const payload = {
        mappings: selectedAccountIds.map(id => {
          const acc = availableAccounts.find(a => a.accountId === id);
          return {
            accountId: id,
            accountName: acc?.accountName || id,
            store: storeData.name,
            owner: newAccount.owner || "未分配",
            project: newAccount.project || "未分配",
          };
        })
      };

      const res = await axios.post("/api/mappings/batch", payload);
      if (res.data.success) {
        toast.success(`成功关联 ${selectedAccountIds.length} 个广告账户`);
        setAddAccountOpen(false);
        setNewAccount({
          accountId: "",
          accountName: "",
          owner: "",
          project: "",
        });
        setSelectedAccountIds([]);
        fetchAssociatedAdAccounts();
      } else {
        toast.error("添加广告账户失败");
      }
    } catch (error: any) {
      console.error("Add account mappings error:", error);
      toast.error(error.response?.data?.error || "添加广告账户出错");
    }
  };

  const handleUnmapAccount = (accountId: string) => {
    setAccountToUnmap(accountId);
    setUnmapConfirmOpen(true);
  };

  const handleUnmapAccountConfirm = async () => {
    if (!accountToUnmap) return;
    setUnmapConfirmOpen(false);
    try {
      const payload = {
        mappings: [
          {
            accountId: accountToUnmap,
            store: "未分配"
          }
        ]
      };
      const res = await axios.post("/api/mappings/batch", payload);
      if (res.data.success) {
        toast.success("解除关联成功");
        fetchAssociatedAdAccounts();
      } else {
        toast.error("解除关联失败");
      }
    } catch (error) {
      console.error("Failed to unmap account:", error);
      toast.error("解除关联失败");
    } finally {
      setAccountToUnmap(null);
    }
  };

  useEffect(() => {
    if (!isNew && storeId) {
      fetchStore().then(storeName => {
        if (storeName) {
          fetchDashboardSummary(storeId);
        }
      });
    }
  }, [isNew, storeId, startDate, endDate]);

  const fetchStore = async () => {
    try {
      const res = await axios.get(`/api/stores/${storeId}`);
      setStoreData(res.data);
      return res.data?.name;
    } catch (err: any) {
      if (err.response?.status === 404 && storeId && isNaN(Number(storeId))) {
        // If not found in DB but it's a valid string name from the route
        setStoreData((prev: any) => ({ ...prev, name: storeId }));
        return storeId;
      }
      toast.error("加载店铺数据失败");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const fetchDashboardSummary = async (id: string) => {
    setDashboardSummary(prev => ({ ...prev, loading: true }));
    try {
      const res = await axios.get(`/api/stores/${id}/dashboard-summary`, {
        params: {
          startDate: format(startDate, "yyyy-MM-dd"),
          endDate: format(endDate, "yyyy-MM-dd"),
        }
      });
      const { summary, shopline } = res.data;
      setDashboardSummary({ 
        ...summary, 
        isConfigured: shopline.isConfigured,
        error: !!shopline.error,
        errorMessage: shopline.errorMessage,
        loading: false 
      });
    } catch (err) {
      console.error("Failed to fetch dashboard summary", err);
      setDashboardSummary(prev => ({ ...prev, loading: false }));
    }
  };

  const userRole = JSON.parse(localStorage.getItem("user") || "{}").role;
  const isAdmin = userRole === "admin" || userRole === "SUPER_ADMIN";

  const handleSaveStore = async () => {
    if (!isAdmin) return toast.error("仅管理员可修改店铺配置");
    if (!storeData.name) return toast.error("请输入店铺名称");
    setSaving(true);
    try {
      const payload = { ...storeData };
      const res = await axios.post("/api/stores", payload);
      toast.success("店铺保存成功");
      if (isNew) {
        navigate(`/store/${res.data.id}`);
      } else {
        await fetchStore();
        if (storeId) {
          fetchDashboardSummary(storeId);
        }
      }
    } catch (err) {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleSyncStoreData = async () => {
    if (!storeId) return;
    setIsSyncingData(true);
    try {
      const startStr = format(startDate, "yyyy-MM-dd");
      const endStr = format(endDate, "yyyy-MM-dd");
      toast.info(`正在同步店铺数据: ${startStr} 至 ${endStr}`);
      const res = await axios.post("/api/sync-store", {
        startDate: startStr,
        endDate: endStr,
        storeId: storeId
      });
      if (res.data.success) {
        toast.success("店铺及订单数据同步成功");
        fetchDashboardSummary(storeId);
      } else {
        toast.error("数据同步未能完全成功");
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || "店铺数据同步失败");
    } finally {
      setIsSyncingData(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white border-b px-6 py-4 flex items-center justify-between z-10 shrink-0">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                if (window.history.length > 1) {
                  navigate(-1);
                } else {
                  navigate("/?tab=stores");
                }
              }}
              className="text-gray-500 hover:text-gray-900 flex items-center gap-2"
            >
              <ArrowLeft className="h-5 w-5" />
              返回店铺
            </button>
            <div className="h-4 w-px bg-gray-300"></div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              {isNew ? "新建店铺" : storeData.name}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            {isAdmin && !isNew && (
              <Dialog>
                <DialogTrigger render={<Button variant="outline" className="text-blue-600 border-blue-600 hover:bg-blue-50" />}>
                  <Settings className="w-4 h-4 mr-2" /> 设置
                </DialogTrigger>
                <DialogContent className="max-w-2xl rounded-xl bg-white p-6 shadow-xl border border-slate-100">
                  <DialogHeader className="border-b pb-3 mb-4">
                    <DialogTitle className="flex items-center gap-2 text-slate-800 font-bold text-base">
                      <span className="p-1 rounded bg-blue-50 text-meta-blue">
                        <Settings className="w-4 h-4" />
                      </span>
                      店铺基础配置
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-6">
                    {/* Platform Selection */}
                    <div className="space-y-2 pb-4 border-b">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <span>店铺所属平台 (Store Platform)</span>
                        <span className="text-xs text-slate-400 font-normal">切换店铺所处的独立站平台</span>
                      </label>
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { id: "shopline", name: "SHOPLINE", color: "bg-[#0051ff]", desc: "应用 SHOPLINE 订单拉取", icon: "💎" },
                          { id: "shoplazza", name: "Shoplazza (店匠)", color: "bg-[#10b981]", desc: "应用 Shoplazza 订单拉取", icon: "🌐" },
                          { id: "shopify", name: "Shopify", color: "bg-[#95bf47]", desc: "应用 Shopify 订单拉取", icon: "🛍️" },
                        ].map((p) => {
                          const isSelected = (storeData.platform || "shopline") === p.id;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                const currentSub = getSubdomainOnly(storeData.domain || "", storeData.platform || "shopline");
                                const nextSuffix = getPlatformSuffix(p.id);
                                setStoreData({
                                  ...storeData,
                                  platform: p.id,
                                  domain: currentSub ? `${currentSub}${nextSuffix}` : ""
                                });
                              }}
                              className={cn(
                                "flex items-start gap-2.5 p-2.5 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden",
                                isSelected
                                  ? "border-meta-blue bg-blue-50/40 ring-2 ring-meta-blue/20"
                                  : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 bg-white"
                              )}
                            >
                              <span className="text-xl mt-0.5">{p.icon}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className={cn("w-1.5 h-1.5 rounded-full", p.color)} />
                                  <span className="text-xs font-bold text-slate-800">{p.name}</span>
                                </div>
                                <span className="text-[10px] text-slate-400 leading-tight block truncate">{p.desc}</span>
                              </div>
                              {isSelected && (
                                <div className="absolute top-1 right-1 w-2.5 h-2.5 bg-meta-blue rounded-full flex items-center justify-center">
                                  <span className="text-[7px] text-white">✓</span>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Left Column */}
                      <div className="space-y-4">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-1">基本属性</h4>
                        
                        <div className="space-y-1.5">
                           <label className="text-xs font-bold text-slate-700">店铺名称</label>
                          <Input
                            value={storeData.name || ""}
                            onChange={(e) => setStoreData({ ...storeData, name: e.target.value })}
                            placeholder="例如: Kolaich"
                            className="h-9 text-sm border-slate-200 focus:border-meta-blue focus:ring-meta-blue rounded-lg"
                          />
                        </div>
                        
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                            <span>域名</span>
                            <span className="text-[10px] text-slate-400 font-normal">
                              (请使用 {storeData.platform === "shoplazza" ? "Shoplazza" : storeData.platform === "shopify" ? "Shopify" : "SHOPLINE"} 内部域名)
                            </span>
                          </label>
                          <div className="flex items-center rounded-lg border border-slate-250 bg-white focus-within:border-meta-blue focus-within:ring-1 focus-within:ring-meta-blue h-9 overflow-hidden transition-colors">
                            <input
                              type="text"
                              value={getSubdomainOnly(storeData.domain || "", storeData.platform || "shopline")}
                              onChange={(e) => {
                                let sub = e.target.value.trim();
                                sub = sub.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
                                sub = sub.replace(/\.myshopline\.com$/i, "").replace(/\.myshopline$/i, "")
                                         .replace(/\.myshopify\.com$/i, "").replace(/\.myshopify$/i, "")
                                         .replace(/\.myshoplazz\.com$/i, "").replace(/\.myshoplazz$/i, "")
                                         .replace(/\.myshoplazza\.com$/i, "").replace(/\.myshoplazza$/i, "")
                                         .replace(/\.myshoplaza\.com$/i, "").replace(/\.myshoplaza$/i, "");
                                const suffix = getPlatformSuffix(storeData.platform || "shopline");
                                setStoreData({
                                  ...storeData,
                                  domain: sub ? `${sub}${suffix}` : ""
                                });
                              }}
                              placeholder="例如: xxxx"
                              className="flex-1 h-full px-3 text-sm border-0 bg-transparent focus:outline-none focus:ring-0 text-right font-medium text-slate-800 placeholder:text-slate-400 placeholder:font-normal"
                            />
                            <span className="h-full flex items-center bg-slate-50 px-3 border-l border-slate-200 text-slate-500 font-mono text-xs select-none shrink-0 font-medium">
                              {getPlatformSuffix(storeData.platform || "shopline")}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-700">店铺时区</label>
                          <div className="flex h-9 w-full items-center rounded-md border border-slate-100 bg-slate-50 px-3 py-1 text-xs text-slate-400 font-medium">
                            自动同步 (连接连接成功后自动获取)
                          </div>
                        </div>
                      </div>

                      {/* Right Column */}
                      <div className="space-y-4">
                        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b pb-1">API & 其它参数</h4>

                         {(!storeData.platform || storeData.platform === "shopline") && (
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700">SHOPLINE Access Token</label>
                            <Input
                              type="password"
                              value={storeData.shopline_token || ""}
                              onChange={(e) =>
                                setStoreData({
                                  ...storeData,
                                  shopline_token: e.target.value,
                                })
                              }
                              placeholder="填入 SHOPLINE Access Token"
                              className="h-9 text-sm border-slate-200 focus:border-meta-blue focus:ring-meta-blue rounded-lg"
                            />
                          </div>
                        )}

                        {storeData.platform === "shoplazza" && (
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700">Shoplazza Access Token</label>
                            <Input
                              type="password"
                              value={storeData.shoplazza_token || ""}
                              onChange={(e) =>
                                setStoreData({
                                  ...storeData,
                                  shoplazza_token: e.target.value,
                                })
                              }
                              placeholder="填入 Shoplazza Access Token"
                              className="h-9 text-sm border-slate-200 focus:border-meta-blue focus:ring-meta-blue rounded-lg"
                            />
                          </div>
                        )}

                        {storeData.platform === "shopify" && (
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-700">Shopify Access Token</label>
                            <Input
                              type="password"
                              value={storeData.shopify_token || ""}
                              onChange={(e) =>
                                setStoreData({
                                  ...storeData,
                                  shopify_token: e.target.value,
                                })
                              }
                              placeholder="填入 Shopify Access Token"
                              className="h-9 text-sm border-slate-200 focus:border-meta-blue focus:ring-meta-blue rounded-lg"
                            />
                          </div>
                        )}

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-700">预设访客数</label>
                          <Input
                            type="number"
                            value={storeData.visitors ?? ""}
                            onChange={(e) => setStoreData({ ...storeData, visitors: parseInt(e.target.value) || 0 })}
                            placeholder="0"
                            className="h-9 text-sm border-slate-200 focus:border-meta-blue focus:ring-meta-blue rounded-lg"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t flex justify-end gap-2">
                      <Button onClick={handleSaveStore} disabled={saving} className="w-full h-10 bg-meta-blue hover:bg-meta-blue/90 flex items-center justify-center gap-1.5 text-sm font-semibold text-white rounded-lg shadow-sm">
                        <Save className="w-4 h-4" /> 保存偏好配置
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}

            {!isNew && storeId && (
              <Button 
                variant="outline" 
                onClick={handleSyncStoreData} 
                disabled={isSyncingData}
                className="text-blue-600 border-blue-600 hover:bg-blue-50"
              >
                {isSyncingData ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ArrowUpDown className="w-4 h-4 mr-2" />}
                {isSyncingData ? "正在同步店铺数据..." : "同步数据"}
              </Button>
            )}

            <Popover>
              <PopoverTrigger
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "justify-start text-left font-normal w-[240px]",
                  !startDate && "text-muted-foreground",
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {startDate ? (
                  format(startDate, "yyyy-MM-dd")
                ) : (
                  <span>开始日期</span>
                )}
                {" - "}
                {endDate ? (
                  format(endDate, "yyyy-MM-dd")
                ) : (
                  <span>结束日期</span>
                )}
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <div className="flex">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={(date) => date && setStartDate(date)}
                    initialFocus
                  />
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={(date) => date && setEndDate(date)}
                  />
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {!isNew && (
            <div className="grid grid-cols-1 gap-4 mb-6">
              <Card className="bg-white border-[#e5e7eb] shadow-sm">
                <CardContent className="p-4 h-full flex flex-row items-center justify-around relative">
                  {dashboardSummary.loading && (
                    <div className="absolute inset-0 bg-white/50 flex items-center justify-center rounded-lg z-10">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    </div>
                  )}
                  {!dashboardSummary.isConfigured && !dashboardSummary.loading && (
                    <div className="absolute inset-0 bg-white/10 flex items-center justify-center rounded-lg z-10 pointer-events-none opacity-50">
                      <span className="text-[10px] text-gray-400">未配置 Token</span>
                    </div>
                  )}
                  {dashboardSummary.error && !dashboardSummary.loading && (
                    <div className="absolute inset-0 bg-white/10 flex items-center justify-center rounded-lg z-10 p-2">
                      <div className="flex flex-col items-center gap-1 bg-white/90 p-2 rounded shadow-sm">
                        <span className="text-[10px] text-red-500 font-bold">API 连接失败</span>
                        <span className="text-[9px] text-gray-500 text-center leading-tight">
                          {dashboardSummary.errorMessage || "请检查配置或域名"}
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="flex flex-col items-center justify-center">
                    <span className="text-gray-500 text-xs font-medium mb-1">总销售额</span>
                    <span className="text-xl font-bold text-gray-800">
                      ${(dashboardSummary.totalSales || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex flex-col items-center justify-center border-l border-[#e5e7eb] pl-6 ml-2">
                    <span className="text-gray-500 text-xs font-medium mb-1">总订单数</span>
                    <span className="text-xl font-bold text-gray-800">
                      {dashboardSummary.totalOrders || 0}
                    </span>
                  </div>
                  <div className="flex flex-col items-center justify-center border-l border-[#e5e7eb] pl-6 ml-2">
                    <span className="text-gray-500 text-xs font-medium mb-1">总访客数</span>
                    <span className="text-xl font-bold text-gray-800">
                      {dashboardSummary.totalVisitors || 0}
                    </span>
                  </div>
                  <div className="flex flex-col items-center justify-center border-l border-[#e5e7eb] pl-6 ml-2">
                    <span className="text-gray-500 text-xs font-medium mb-1">平均转化率</span>
                    <span className="text-xl font-bold text-gray-800">
                      {(dashboardSummary.avgConversionRate || 0).toFixed(2)}%
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {!isNew && (
            <Card className="bg-white border-[#e5e7eb] shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-[#f3f4f6] px-6">
                <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  <span className="w-1.5 h-3 bg-meta-blue rounded-full animate-pulse" />
                  已关联的广告账户级数据
                </CardTitle>
                <Dialog open={addAccountOpen} onOpenChange={setAddAccountOpen}>
                  <DialogTrigger render={
                    <Button className="h-[28px] px-2.5 rounded-[6px] bg-meta-blue hover:bg-meta-blue/90 text-[11px] text-white flex items-center gap-1 font-medium select-none shadow-sm cursor-pointer border-0">
                      <Plus className="w-3.5 h-3.5" />
                      添加账户
                    </Button>
                  } />
                  <DialogContent className="max-w-md rounded-xl bg-white p-5 shadow-xl border border-slate-100 z-50">
                    <DialogHeader className="border-b pb-2 mb-3">
                      <DialogTitle className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                        <Plus className="w-4 h-4 text-meta-blue" />
                        添加关联广告账户
                      </DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleAddAccountSubmit} className="space-y-4">
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-600 block">
                          选择要关联的广告账户 (可多选) <span className="text-red-500">*</span>
                        </label>
                        <div className="border border-slate-200 rounded-lg p-2.5 bg-slate-50/50 space-y-2">
                          {/* Search box with Search icon */}
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                            <Input
                              value={accSearchQuery}
                              onChange={(e) => setAccSearchQuery(e.target.value)}
                              placeholder="输入账户名称或 ID 搜索..."
                              className="pl-8 h-8 text-xs border-slate-200 rounded-md bg-white"
                            />
                          </div>

                          {/* Accounts list container */}
                          {accountsListLoading ? (
                            <div className="h-[180px] flex items-center justify-center gap-1.5 bg-white border border-slate-100 rounded-md">
                              <Loader2 className="w-4 h-4 text-meta-blue animate-spin" />
                              <span className="text-[11px] text-slate-400">正在加载广告账户...</span>
                            </div>
                          ) : availableAccounts.length === 0 ? (
                            <div className="h-[180px] flex items-center justify-center bg-white border border-slate-100 rounded-md text-[11px] text-slate-400">
                              暂无可用广告账户
                            </div>
                          ) : (
                            <div className="bg-white border border-slate-200 rounded-md overflow-hidden">
                              {/* Selection Toolbar / Select All */}
                              <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-slate-100 bg-slate-50/50 text-[10px] text-slate-500">
                                <div 
                                  className="flex items-center gap-1.5 cursor-pointer select-none" 
                                  onClick={toggleSelectAllFiltered}
                                >
                                  <Checkbox
                                    checked={isAllFilteredSelected}
                                    onCheckedChange={toggleSelectAllFiltered}
                                    className="w-3.5 h-3.5"
                                  />
                                  <span>全选当前筛选 ({filteredAvailableAccounts.length})</span>
                                </div>
                                <div className="font-medium">
                                  已选择: <span className="font-bold text-meta-blue">{selectedAccountIds.length}</span> 个
                                </div>
                              </div>

                              {/* Scrollable list of accounts */}
                              <div className="max-h-[150px] overflow-y-auto divide-y divide-slate-100">
                                {filteredAvailableAccounts.length === 0 ? (
                                  <div className="p-4 text-center text-[11px] text-slate-400">
                                    未找到匹配的的广告账户
                                  </div>
                                ) : (
                                  filteredAvailableAccounts.map((acc) => {
                                    const cleanAccId = String(acc.accountId || "").replace("act_", "").trim();
                                    const isCurrentStore = mappings.some(
                                      (m: any) => String(m.accountId || "").replace("act_", "").trim() === cleanAccId && String(m.store).toLowerCase() === String(storeData.name).toLowerCase()
                                    );
                                    const otherStore = mappings.find(
                                      (m: any) => String(m.accountId || "").replace("act_", "").trim() === cleanAccId && String(m.store).toLowerCase() !== String(storeData.name).toLowerCase()
                                    )?.store;

                                    const isSelected = selectedAccountIds.includes(acc.accountId);

                                    const handleItemClick = () => {
                                      if (isCurrentStore) return; // Already linked to this store
                                      setSelectedAccountIds(prev => 
                                        prev.includes(acc.accountId) 
                                          ? prev.filter(id => id !== acc.accountId)
                                          : [...prev, acc.accountId]
                                      );
                                    };

                                    return (
                                      <div
                                        key={acc.accountId}
                                        onClick={handleItemClick}
                                        className={cn(
                                          "flex items-center justify-between px-2.5 py-2 hover:bg-slate-50/80 transition-colors text-xs select-none",
                                          isCurrentStore ? "opacity-60 cursor-not-allowed bg-slate-50/40" : "cursor-pointer"
                                        )}
                                      >
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                          <Checkbox
                                            checked={isSelected || isCurrentStore}
                                            disabled={isCurrentStore}
                                            onCheckedChange={handleItemClick}
                                            className="w-3.5 h-3.5"
                                          />
                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                              <span className="font-medium text-slate-700 truncate block max-w-[150px]">
                                                {acc.accountName || acc.accountId}
                                              </span>
                                              {acc.status && (
                                                <span className={cn(
                                                  "text-[9px] px-1.5 py-0.2 rounded font-semibold scale-90",
                                                  acc.status === "ACTIVE" 
                                                    ? "text-green-600 bg-green-50 border border-green-100" 
                                                    : acc.status === "DISABLED" || acc.status === "3"
                                                    ? "text-red-600 bg-red-50 border border-red-100"
                                                    : "text-amber-600 bg-amber-50 border border-amber-100"
                                                )}>
                                                  {acc.status === "ACTIVE" ? "活跃" : acc.status === "DISABLED" || acc.status === "3" ? "停用" : acc.status}
                                                </span>
                                              )}
                                            </div>
                                            <span className="text-[10px] text-slate-400 font-mono block">
                                              {acc.accountId}
                                            </span>
                                          </div>
                                        </div>

                                        <div className="flex items-center gap-1.5 shrink-0 pl-1">
                                          {isCurrentStore ? (
                                            <span className="text-[9px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded border border-green-100 font-medium">
                                              已关联本店铺
                                            </span>
                                          ) : otherStore ? (
                                            <span className="text-[9px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-medium max-w-[90px] truncate block">
                                              已在: {otherStore}
                                            </span>
                                          ) : null}
                                        </div>
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-600 block">负责人 (Owner)</label>
                        <Input
                          value={newAccount.owner}
                          onChange={(e) => setNewAccount({ ...newAccount, owner: e.target.value })}
                          placeholder="例如: 黄淑怡"
                          className="h-8 text-xs border-slate-200 rounded-md"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-bold text-slate-600 block">所属项目 (Project)</label>
                        <Input
                          value={newAccount.project}
                          onChange={(e) => setNewAccount({ ...newAccount, project: e.target.value })}
                          placeholder="例如: Default"
                          className="h-8 text-xs border-slate-200 rounded-md"
                        />
                      </div>
                      <div className="pt-2 border-t flex items-center justify-end gap-2.5">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setAddAccountOpen(false)}
                          className="h-8 text-xs rounded-md"
                        >
                          取消
                        </Button>
                        <Button
                          type="submit"
                          className="h-8 text-xs bg-meta-blue hover:bg-meta-blue/90 text-white rounded-md px-4 font-semibold border-0"
                        >
                          确认添加
                        </Button>
                      </div>
                    </form>
                  </DialogContent>
                </Dialog>

                <Dialog open={unmapConfirmOpen} onOpenChange={setUnmapConfirmOpen}>
                  <DialogContent className="max-w-md rounded-xl bg-white p-5 shadow-xl border border-slate-100 z-50">
                    <DialogHeader className="border-b pb-2 mb-3">
                      <DialogTitle className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                        <AlertTriangle className="w-4 h-4 text-amber-500" />
                        解除广告账户关联
                      </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-1">
                      <p className="text-xs text-slate-600 leading-relaxed">
                        确定要解除广告账户 <strong className="text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded font-mono text-xs">{accountToUnmap}</strong> 与当前店铺的关联吗？
                      </p>
                      <div className="flex items-center justify-end gap-2.5 pt-2">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            setUnmapConfirmOpen(false);
                            setAccountToUnmap(null);
                          }}
                          className="h-8 text-xs rounded-md"
                        >
                          取消
                        </Button>
                        <Button
                          type="button"
                          onClick={handleUnmapAccountConfirm}
                          className="h-8 text-xs bg-red-600 hover:bg-red-700 text-white rounded-md px-4 font-semibold border-0"
                        >
                          确认解除
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-0 overflow-auto">
                {accountsLoading ? (
                  <div className="py-20 flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 text-meta-blue animate-spin" />
                    <span className="text-xs text-slate-400">正在拉取广告账户级数据...</span>
                  </div>
                ) : sortedAccountsData.length === 0 ? (
                  <div className="py-16 text-center">
                    <span className="text-xs text-slate-400 block">未关联广告账户级数据。</span>
                    <span className="text-[11px] text-slate-350 mt-1 block">请通过右上角「+ 添加账户」为本店铺绑定 Meta 广告账户。</span>
                  </div>
                ) : (
                  <div className="w-full overflow-x-auto">
                    <Table className="text-[11px] w-full border-collapse">
                      <TableHeader className="bg-[#f9fafb]">
                        <TableRow>
                          <TableHead className="font-semibold text-slate-700 h-9 px-4 cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort("store")}>
                            <div className="flex items-center gap-1">
                              店铺 <ArrowUpDown className="w-3 h-3 text-slate-400" />
                            </div>
                          </TableHead>
                          <TableHead className="font-semibold text-slate-700 h-9 px-4 cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort("owner")}>
                            <div className="flex items-center gap-1">
                              负责人 <ArrowUpDown className="w-3 h-3 text-slate-400" />
                            </div>
                          </TableHead>
                          <TableHead className="font-semibold text-slate-700 h-9 px-4 cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort("accountName")}>
                            <div className="flex items-center gap-1">
                              广告账户 <ArrowUpDown className="w-3 h-3 text-slate-400" />
                            </div>
                          </TableHead>
                          <TableHead className="font-semibold text-slate-700 h-9 px-4 text-right cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort("spend")}>
                            <div className="flex items-center justify-end gap-1">
                              已花费金额 <ArrowUpDown className="w-3 h-3 text-slate-400" />
                            </div>
                          </TableHead>
                          <TableHead className="font-semibold text-emerald-800 h-9 px-4 text-right cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort("purchaseValue")}>
                            <div className="flex items-center justify-end gap-1">
                              购物转化价值 <ArrowUpDown className="w-3 h-3 text-slate-400" />
                            </div>
                          </TableHead>
                          <TableHead className="font-semibold text-slate-700 h-9 px-4 text-right cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort("addToCart")}>
                            <div className="flex items-center justify-end gap-1">
                              加购 <ArrowUpDown className="w-3 h-3 text-slate-400" />
                            </div>
                          </TableHead>
                          <TableHead className="font-semibold text-slate-700 h-9 px-4 text-right cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort("atcRate")}>
                            <div className="flex items-center justify-end gap-1">
                              加购率 <ArrowUpDown className="w-3 h-3 text-slate-400" />
                            </div>
                          </TableHead>
                          <TableHead className="font-semibold text-slate-700 h-9 px-4 text-right cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort("initiateCheckout")}>
                            <div className="flex items-center justify-end gap-1">
                              结账发起 <ArrowUpDown className="w-3 h-3 text-slate-400" />
                            </div>
                          </TableHead>
                          <TableHead className="font-semibold text-slate-700 h-9 px-4 text-right cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort("checkoutRate")}>
                            <div className="flex items-center justify-end gap-1">
                              结账率 <ArrowUpDown className="w-3 h-3 text-slate-400" />
                            </div>
                          </TableHead>
                          <TableHead className="font-semibold text-slate-700 h-9 px-4 text-right cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort("purchases")}>
                            <div className="flex items-center justify-end gap-1">
                              成效 <ArrowUpDown className="w-3 h-3 text-slate-400" />
                            </div>
                          </TableHead>
                          <TableHead className="font-semibold text-slate-700 h-9 px-4 text-right cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort("cpp")}>
                            <div className="flex items-center justify-end gap-1">
                              单次费用 <ArrowUpDown className="w-3 h-3 text-slate-400" />
                            </div>
                          </TableHead>
                          <TableHead className="font-semibold text-slate-700 h-9 px-4 text-right cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort("roas")}>
                            <div className="flex items-center justify-end gap-1">
                              ROAS <ArrowUpDown className="w-3 h-3 text-slate-400" />
                            </div>
                          </TableHead>
                          <TableHead className="font-semibold text-slate-700 h-9 px-4 text-center">操作</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedAccountsData.map((item: any) => (
                          <TableRow key={item.accountId} className="hover:bg-slate-50 transition-colors border-b">
                            <TableCell className="px-4 py-3 whitespace-nowrap">
                              <span className="text-blue-605 font-semibold text-slate-800">{item.store}</span>
                            </TableCell>
                            <TableCell className="px-4 py-3 whitespace-nowrap text-slate-600">
                              {item.owner}
                            </TableCell>
                            <TableCell className="px-4 py-3 whitespace-nowrap">
                              <button
                                onClick={() => navigate(`/account/${item.accountId}`)}
                                className="hover:text-blue-800 hover:underline text-left outline-none font-medium text-blue-600"
                              >
                                {item.accountName}
                              </button>
                            </TableCell>
                            <TableCell className="px-4 py-3 whitespace-nowrap text-right font-medium text-slate-700">
                              ${item.spend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="px-4 py-3 whitespace-nowrap text-right font-semibold text-emerald-600">
                              ${item.purchaseValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="px-4 py-3 whitespace-nowrap text-right text-slate-600">
                              {item.addToCart.toLocaleString()}
                            </TableCell>
                            <TableCell className="px-4 py-3 whitespace-nowrap text-right text-slate-600 font-mono">
                              {item.atcRate.toFixed(2)}%
                            </TableCell>
                            <TableCell className="px-4 py-3 whitespace-nowrap text-right text-slate-600">
                              {item.initiateCheckout.toLocaleString()}
                            </TableCell>
                            <TableCell className="px-4 py-3 whitespace-nowrap text-right text-slate-600 font-mono">
                              {item.checkoutRate.toFixed(2)}%
                            </TableCell>
                            <TableCell className="px-4 py-3 whitespace-nowrap text-right text-slate-600">
                              {item.purchases.toLocaleString()}
                            </TableCell>
                            <TableCell className="px-4 py-3 whitespace-nowrap text-right text-slate-600 font-mono">
                              ${item.cpp.toFixed(2)}
                            </TableCell>
                            <TableCell className="px-4 py-3 whitespace-nowrap text-right">
                              <span className="text-blue-600 font-bold font-mono">
                                {item.roas.toFixed(2)}x
                              </span>
                            </TableCell>
                            <TableCell className="px-4 py-3 whitespace-nowrap text-center">
                              <button
                                onClick={() => handleUnmapAccount(item.accountId)}
                                className="text-slate-400 hover:text-red-500 p-1 rounded-md transition-colors"
                                title="解除关联"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </TableCell>
                          </TableRow>
                        ))}
                        {/* Summary / Totals Row */}
                        <TableRow className="bg-slate-50 font-semibold border-t-2 border-slate-200">
                          <TableCell className="px-4 py-3 whitespace-nowrap">
                            <div className="flex flex-col">
                              <span className="text-slate-800 text-xs font-bold leading-tight">{accountTotals.count}个广告账户的汇总</span>
                              <span className="text-[9px] text-slate-400 font-normal leading-tight mt-1">成效汇总</span>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3 whitespace-nowrap text-slate-400">
                            —
                          </TableCell>
                          <TableCell className="px-4 py-3 whitespace-nowrap">
                            <div className="flex flex-col">
                              <span className="text-slate-800 text-xs font-bold leading-tight">{accountTotals.count}</span>
                              <span className="text-[9px] text-slate-400 font-normal leading-tight mt-1">Meta 账户</span>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3 whitespace-nowrap text-right">
                            <div className="flex flex-col items-end">
                              <span className="text-slate-800 text-xs font-bold leading-tight">${accountTotals.spend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              <span className="text-[9px] text-slate-400 font-normal leading-tight mt-1">总花费</span>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3 whitespace-nowrap text-right">
                            <div className="flex flex-col items-end">
                              <span className="text-emerald-700 text-xs font-bold leading-tight">${accountTotals.purchaseValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                              <span className="text-[9px] text-slate-400 font-normal leading-tight mt-1">总价值</span>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3 whitespace-nowrap text-right">
                            <div className="flex flex-col items-end">
                              <span className="text-slate-800 text-xs font-bold leading-tight">{accountTotals.addToCart.toLocaleString()}</span>
                              <span className="text-[9px] text-slate-400 font-normal leading-tight mt-1">共计</span>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3 whitespace-nowrap text-right font-mono">
                            <div className="flex flex-col items-end">
                              <span className="text-slate-800 text-xs font-bold leading-tight">{accountTotals.atcRate.toFixed(2)}%</span>
                              <span className="text-[9px] text-slate-400 font-normal leading-tight mt-1">平均</span>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3 whitespace-nowrap text-right">
                            <div className="flex flex-col items-end">
                              <span className="text-slate-800 text-xs font-bold leading-tight">{accountTotals.initiateCheckout.toLocaleString()}</span>
                              <span className="text-[9px] text-slate-400 font-normal leading-tight mt-1">共计</span>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3 whitespace-nowrap text-right font-mono">
                            <div className="flex flex-col items-end">
                              <span className="text-slate-800 text-xs font-bold leading-tight">{accountTotals.checkoutRate.toFixed(2)}%</span>
                              <span className="text-[9px] text-slate-400 font-normal leading-tight mt-1">平均</span>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3 whitespace-nowrap text-right">
                            <div className="flex flex-col items-end">
                              <span className="text-slate-800 text-xs font-bold leading-tight">{accountTotals.purchases.toLocaleString()}</span>
                              <span className="text-[9px] text-slate-400 font-normal leading-tight mt-1">共计</span>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3 whitespace-nowrap text-right font-mono">
                            <div className="flex flex-col items-end">
                              <span className="text-slate-800 text-xs font-bold leading-tight">${accountTotals.cpp.toFixed(2)}</span>
                              <span className="text-[9px] text-slate-400 font-normal leading-tight mt-1">平均</span>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3 whitespace-nowrap text-right">
                            <div className="flex flex-col items-end">
                              <span className="text-blue-700 text-xs font-bold leading-tight">{accountTotals.roas.toFixed(2)}x</span>
                              <span className="text-[9px] text-slate-400 font-normal leading-tight mt-1">平均</span>
                            </div>
                          </TableCell>
                          <TableCell className="px-4 py-3 whitespace-nowrap text-center text-slate-400">
                            —
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {isNew && (
            <Card className="shadow-lg border border-slate-100 rounded-xl overflow-hidden bg-white">
              <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-4 px-6">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 rounded-lg bg-blue-50 text-meta-blue">
                    <Store className="w-4 h-4" />
                  </span>
                  <div>
                    <CardTitle className="text-base font-bold text-slate-800">创建新店铺</CardTitle>
                    <p className="text-xs text-slate-400 mt-0.5">请录入店铺的基本属性与授权信息</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                {/* Platform Selection */}
                <div className="space-y-2 pb-4 border-b">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <span>店铺平台 (Store Platform)</span>
                    <span className="text-xs text-slate-400 font-normal">选择你店铺所在的独立站平台以对接对应的订单API接口</span>
                  </label>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { id: "shopline", name: "SHOPLINE", color: "bg-[#0051ff]", desc: "应用 SHOPLINE 订单拉取", icon: "💎" },
                      { id: "shoplazza", name: "Shoplazza (店匠)", color: "bg-[#10b981]", desc: "应用 Shoplazza 订单拉取", icon: "🌐" },
                      { id: "shopify", name: "Shopify", color: "bg-[#95bf47]", desc: "应用 Shopify 订单拉取", icon: "🛍️" },
                    ].map((p) => {
                      const isSelected = (storeData.platform || "shopline") === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            const currentSub = getSubdomainOnly(storeData.domain || "", storeData.platform || "shopline");
                            const nextSuffix = getPlatformSuffix(p.id);
                            setStoreData({
                              ...storeData,
                              platform: p.id,
                              domain: currentSub ? `${currentSub}${nextSuffix}` : ""
                            });
                          }}
                          className={cn(
                            "flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden",
                            isSelected
                              ? "border-meta-blue bg-blue-50/40 ring-2 ring-meta-blue/20"
                              : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/50 bg-white"
                          )}
                        >
                          <span className="text-2xl mt-0.5">{p.icon}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className={cn("w-2 h-2 rounded-full", p.color)} />
                              <span className="text-sm font-bold text-slate-850">{p.name}</span>
                            </div>
                            <span className="text-[11px] text-slate-400 leading-tight block">{p.desc}</span>
                          </div>
                          {isSelected && (
                            <div className="absolute top-1 right-1 w-3 h-3 bg-meta-blue rounded-full flex items-center justify-center">
                              <span className="text-[8px] text-white">✓</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Left Column: Store Details */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b pb-1.5 flex items-center gap-1.5">
                      <Settings className="w-3.5 h-3.5 text-slate-400" /> 基本属性
                    </h3>
                    
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                        店铺名称 <span className="text-red-500">*</span>
                      </label>
                      <Input
                        value={storeData.name || ""}
                        onChange={(e) =>
                          setStoreData({ ...storeData, name: e.target.value })
                        }
                        placeholder="例如: Kolaich"
                        className="h-10 text-sm border-slate-200 focus:border-meta-blue focus:ring-meta-blue rounded-lg"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                        <span>域名 <span className="text-xs text-slate-400 font-normal">(建议内部域名)</span></span>
                      </label>
                      <div className="flex items-center rounded-lg border border-slate-200 bg-white focus-within:border-meta-blue focus-within:ring-1 focus-within:ring-meta-blue h-10 overflow-hidden transition-colors">
                        <input
                          type="text"
                          value={getSubdomainOnly(storeData.domain || "", storeData.platform || "shopline")}
                          onChange={(e) => {
                            let sub = e.target.value.trim();
                            sub = sub.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
                            sub = sub.replace(/\.myshopline\.com$/i, "").replace(/\.myshopline$/i, "")
                                     .replace(/\.myshopify\.com$/i, "").replace(/\.myshopify$/i, "")
                                     .replace(/\.myshoplazz\.com$/i, "").replace(/\.myshoplazz$/i, "")
                                     .replace(/\.myshoplazza\.com$/i, "").replace(/\.myshoplazza$/i, "")
                                     .replace(/\.myshoplaza\.com$/i, "").replace(/\.myshoplaza$/i, "");
                            const suffix = getPlatformSuffix(storeData.platform || "shopline");
                            setStoreData({
                              ...storeData,
                              domain: sub ? `${sub}${suffix}` : ""
                            });
                          }}
                          placeholder="例如: xxxx"
                          className="flex-1 h-full px-3 text-sm border-0 bg-transparent focus:outline-none focus:ring-0 text-right font-medium text-slate-850 placeholder:text-slate-400 placeholder:font-normal"
                        />
                        <span className="h-full flex items-center bg-slate-50 px-3 border-l border-slate-200 text-slate-500 font-mono text-sm select-none shrink-0 font-medium">
                          {getPlatformSuffix(storeData.platform || "shopline")}
                        </span>
                      </div>
                    </div>

                     <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                        店铺时区
                      </label>
                      <div className="flex h-10 w-full items-center rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-500 font-medium">
                        自动解析为店铺后台时区 (当前: {storeData.timezone || "America/Los_Angeles"})
                      </div>
                      <p className="text-[10px] text-slate-400">
                        * 已取消手动自定义。系统将根据接口授权自动与您的店匠/SHOPLINE/Shopify后台时区保持100%同步。
                      </p>
                      {storeData.timezone_fallback_warning && (
                        <div className="mt-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 text-amber-800 text-[11px] leading-relaxed">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold block mb-0.5" id="store-timezone-warning">时区同步风险警告 (Timezone Sync Risk)</span>
                            平台店铺 API 获取时区失败，目前已退回到默认时区 ({storeData.timezone || "America/Los_Angeles"})。这可能会导致小部分订单的付款日期统计存在偏差，建议检查 API 授权配置并在重新保存域或 Token 属性后重新激活。
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column: Authentication & Metrics */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 border-b pb-1.5 flex items-center gap-1.5">
                      <Key className="w-3.5 h-3.5 text-slate-400" /> API授权配置
                    </h3>

                    {(!storeData.platform || storeData.platform === "shopline") && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                          SHOPLINE Access Token <span className="text-xs text-slate-400 font-normal">(用于增量拉单)</span>
                        </label>
                        <Input
                          type="password"
                          value={storeData.shopline_token || ""}
                          onChange={(e) =>
                            setStoreData({
                              ...storeData,
                              shopline_token: e.target.value,
                            })
                          }
                          placeholder="填入 SHOPLINE 秘钥 Access Token"
                          className="h-10 text-sm border-slate-200 focus:border-meta-blue focus:ring-meta-blue rounded-lg"
                        />
                      </div>
                    )}

                    {storeData.platform === "shoplazza" && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                          Shoplazza Access Token <span className="text-xs text-slate-400 font-normal">(用于店匠拉单)</span>
                        </label>
                        <Input
                          type="password"
                          value={storeData.shoplazza_token || ""}
                          onChange={(e) =>
                            setStoreData({
                              ...storeData,
                              shoplazza_token: e.target.value,
                            })
                          }
                          placeholder="填入 Shoplazza 秘钥 Access Token"
                          className="h-10 text-sm border-slate-200 focus:border-meta-blue focus:ring-meta-blue rounded-lg"
                        />
                      </div>
                    )}

                    {storeData.platform === "shopify" && (
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                          Shopify Access Token <span className="text-xs text-slate-400 font-normal">(用于 Shopify 拉单)</span>
                        </label>
                        <Input
                          type="password"
                          value={storeData.shopify_token || ""}
                          onChange={(e) =>
                            setStoreData({
                              ...storeData,
                              shopify_token: e.target.value,
                            })
                          }
                          placeholder="填入 Shopify Access Token"
                          className="h-10 text-sm border-slate-200 focus:border-meta-blue focus:ring-meta-blue rounded-lg"
                        />
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                        预设访客数 <span className="text-xs text-slate-400 font-normal">(默认首期展示)</span>
                      </label>
                      <Input
                        type="number"
                        value={storeData.visitors ?? ""}
                        onChange={(e) =>
                          setStoreData({
                            ...storeData,
                            visitors: parseInt(e.target.value) || 0,
                          })
                        }
                        placeholder="0"
                        className="h-10 text-sm border-slate-200 focus:border-meta-blue focus:ring-meta-blue rounded-lg"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t flex items-center justify-end gap-3 bg-slate-50/50 -mx-6 -mb-6 p-4">
                  <Button
                    variant="outline"
                    onClick={() => navigate("/stores")}
                    className="h-10 text-slate-600 border-slate-200 hover:bg-slate-100 rounded-lg px-5 text-sm"
                  >
                    取消
                  </Button>
                  <Button
                    onClick={handleSaveStore}
                    disabled={saving}
                    className="h-10 bg-meta-blue hover:bg-meta-blue/90 text-white rounded-lg px-6 text-sm flex items-center gap-2 font-semibold"
                  >
                    <Save className="w-4 h-4" /> 保存并创建
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

        </main>
      </div>
    </div>
  );
}
