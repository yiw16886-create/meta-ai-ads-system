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
} from "lucide-react";
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
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
  const [accountsInsights, setAccountsInsights] = useState<any[]>([]);
  const [allMappings, setAllMappings] = useState<any[]>([]);
  const [loadingInsights, setLoadingInsights] = useState(false);
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

  const [startDate, setStartDate] = useState<Date>(subDays(new Date(), 1));
  const [endDate, setEndDate] = useState<Date>(subDays(new Date(), 1));

  const [sortConfig, setSortConfig] = useState<{
    key: string;
    direction: "asc" | "desc";
  } | null>(null);

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

  const sortedInsights = useMemo(() => {
    let sortableItems = [...accountsInsights];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let aValue = a[sortConfig.key] !== undefined ? a[sortConfig.key] : "";
        let bValue = b[sortConfig.key] !== undefined ? b[sortConfig.key] : "";
        if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [accountsInsights, sortConfig]);

  const [testPlatform, setTestPlatform] = useState<string>("shoplazza");
  const [shoplazzaProducts, setShoplazzaProducts] = useState<any[]>([]);
  const [testingShoplazza, setTestingShoplazza] = useState(false);
  const [shoplazzaTestError, setShoplazzaTestError] = useState<string | null>(null);
  const [showShoplazzaModal, setShowShoplazzaModal] = useState(false);

  const handleTestConnection = async (platformToTest: string, domainToTest: string, tokenToTest: string) => {
    if (!domainToTest || !tokenToTest) {
      toast.error("错误：请先输入店铺域名及授权秘钥！");
      return;
    }
    setTestPlatform(platformToTest);
    setTestingShoplazza(true);
    setShoplazzaTestError(null);
    setShoplazzaProducts([]);
    setShowShoplazzaModal(true);

    const platformNames: Record<string, string> = {
      shoplazza: "店匠 (Shoplazza)",
      shopify: "Shopify",
      shopline: "SHOPLINE"
    };
    const platformLabel = platformNames[platformToTest] || platformToTest;

    try {
      const response = await axios.post(`/api/stores/test-${platformToTest}-connection`, {
        domain: domainToTest,
        token: tokenToTest
      });
      if (response.data.success) {
        setShoplazzaProducts(response.data.products || []);
        toast.success(response.data.message || `${platformLabel} API 实时数据验证成功！`);
      } else {
        setShoplazzaTestError(response.data.error || "后端接口返回响应失败");
        toast.error(`${platformLabel} API 测试失败`);
      }
    } catch (err: any) {
      console.error(err);
      const errMsg = err.response?.data?.error || err.message || "网络请求失败";
      const errDetails = err.response?.data?.details || `请确保填写的域名格式正确（例如: store-name.myshopify.com）且授权密钥具有 Products 商品查询权限。`;
      setShoplazzaTestError(`${errMsg} - ${errDetails}`);
      toast.error(`${platformLabel} API 连接/身份校验失败`);
    } finally {
      setTestingShoplazza(false);
    }
  };

  const handleTestShoplazza = (domainToTest: string, tokenToTest: string) => handleTestConnection("shoplazza", domainToTest, tokenToTest);
  const handleTestShopify = (domainToTest: string, tokenToTest: string) => handleTestConnection("shopify", domainToTest, tokenToTest);
  const handleTestShopline = (domainToTest: string, tokenToTest: string) => handleTestConnection("shopline", domainToTest, tokenToTest);

  useEffect(() => {
    if (!isNew && storeId) {
      fetchStore().then(storeName => {
        if (storeName) {
          fetchInsights(storeName);
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

  const fetchInsights = async (storeName: string) => {
    setLoadingInsights(true);
    try {
      const [insightsRes, mappingsRes, storeRes] = await Promise.all([
        axios.get("/api/insights", {
          params: {
            startDate: format(startDate, "yyyy-MM-dd"),
            endDate: format(endDate, "yyyy-MM-dd"),
          },
        }),
        axios.get("/api/mappings"),
        axios.get(`/api/stores/${storeId}`).catch(() => ({ data: null })),
      ]);

      const data = insightsRes.data || [];
      const mappingList = mappingsRes.data || [];
      setAllMappings(mappingList);
      const mappingMap: Record<string, any> = {};
      mappingList.forEach((m: any) => {
        const key = m.accountId.replace("act_", "").trim().toLowerCase();
        mappingMap[key] = m;
      });

      // Group data by normalized accountId
      const groupedNormalized: Record<string, any> = {};
      data.forEach((curr: any) => {
        const cleanId = curr.accountId.replace("act_", "").trim().toLowerCase();
        if (!groupedNormalized[cleanId]) {
          groupedNormalized[cleanId] = { ...curr };
        } else {
          groupedNormalized[cleanId].reach = (groupedNormalized[cleanId].reach || 0) + (curr.reach || 0);
          groupedNormalized[cleanId].impressions = (groupedNormalized[cleanId].impressions || 0) + (curr.impressions || 0);
          groupedNormalized[cleanId].clicks = (groupedNormalized[cleanId].clicks || 0) + (curr.clicks || 0);
          groupedNormalized[cleanId].spend = (groupedNormalized[cleanId].spend || 0) + (curr.spend || 0);
          groupedNormalized[cleanId].addToCart = (groupedNormalized[cleanId].addToCart || 0) + (curr.addToCart || 0);
          groupedNormalized[cleanId].initiateCheckout = (groupedNormalized[cleanId].initiateCheckout || 0) + (curr.initiateCheckout || 0);
          groupedNormalized[cleanId].purchases = (groupedNormalized[cleanId].purchases || 0) + (curr.purchases || 0);
          groupedNormalized[cleanId].purchaseValue = (groupedNormalized[cleanId].purchaseValue || 0) + (curr.purchaseValue || 0);
        }
      });

      // Filter mappingList to only those mapped to this store (case insensitive)
      const currentStoreName = storeRes?.data?.name || storeName;
      const storeMappings = mappingList.filter((m: any) => 
        (m.store || "").toLowerCase() === (currentStoreName || "").toLowerCase()
      );

      const finalInsights = storeMappings.map((mapping: any) => {
        const cleanAccId = mapping.accountId.replace("act_", "").trim().toLowerCase();
        const item = groupedNormalized[cleanAccId] || {};
        const spend = item.spend || 0;
        const purchaseValue = item.purchaseValue || 0;
        const clicks = item.clicks || 0;
        const addToCart = item.addToCart || 0;
        const initiateCheckout = item.initiateCheckout || 0;
        const purchases = item.purchases || 0;

        return {
          ...item,
          accountId: mapping.accountId,
          account_id: mapping.accountId,
          account_name: mapping.accountName || item.accountName || mapping.accountId,
          owner: mapping.owner || "",
          store: mapping.store || "",
          project: mapping.project || "",
          reach: item.reach || 0,
          impressions: item.impressions || 0,
          clicks,
          spend,
          addToCart,
          initiateCheckout,
          purchases,
          purchaseValue,
          roas: spend > 0 ? purchaseValue / spend : 0,
          atcRate: clicks > 0 ? (addToCart / clicks) * 100 : 0,
          checkoutRate: clicks > 0 ? (initiateCheckout / clicks) * 100 : 0,
          cpp: purchases > 0 ? spend / purchases : 0,
          sales_amount: 0,
          orders_count: 0,
          visitors: 0,
          conversion_rate: 0,
        };
      }).filter((item: any) => item.spend > 0 || item.impressions > 0 || item.clicks > 0 || item.purchases > 0 || item.purchaseValue > 0);

      setAccountsInsights(finalInsights);
    } catch (err: any) {
      toast.error("加载聚合数据失败");
    } finally {
      setLoadingInsights(false);
    }
  };

  const isAdmin = JSON.parse(localStorage.getItem("user") || "{}").role === "admin";

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
        if (storeData.name) {
          fetchInsights(storeData.name);
        }
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

  const handleAddAccount = async (
    fb_account_id: string,
    fb_account_name: string,
    mapped_store_name: string,
  ) => {
    if (!fb_account_id) return toast.error("请输入广告账户 ID");
    try {
      await axios.post("/api/mappings/batch", {
        mappings: [
          {
            accountId: fb_account_id,
            accountName: fb_account_name || fb_account_id,
            store: mapped_store_name,
            project: "",
            owner: ""
          }
        ]
      });
      toast.success("广告账户已添加并且成功分配至对应店铺");
      fetchStore().then(name => name && fetchInsights(name));
    } catch (err) {
      toast.error("保存账户分配与映射失败");
    }
  };


  const summaryRow = useMemo(() => {
    if (!sortedInsights || sortedInsights.length === 0) return null;
    let spend = 0, purchaseValue = 0, clicks = 0, addToCart = 0, initiateCheckout = 0, purchases = 0;
    sortedInsights.forEach((item: any) => {
      spend += item.spend || 0;
      purchaseValue += item.purchaseValue || 0;
      clicks += item.clicks || 0;
      addToCart += item.addToCart || 0;
      initiateCheckout += item.initiateCheckout || 0;
      purchases += item.purchases || 0;
    });
    return {
      count: sortedInsights.length,
      spend, purchaseValue, addToCart, initiateCheckout, purchases,
      atcRate: clicks > 0 ? (addToCart / clicks) * 100 : 0,
      checkoutRate: clicks > 0 ? (initiateCheckout / clicks) * 100 : 0,
      cpp: purchases > 0 ? spend / purchases : 0,
      roas: spend > 0 ? purchaseValue / spend : 0,
    };
  }, [sortedInsights]);

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
                              onClick={() => setStoreData({ ...storeData, platform: p.id })}
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
                          <label className="text-xs font-bold text-slate-700">域名</label>
                          <Input
                            value={storeData.domain || ""}
                            onChange={(e) => setStoreData({ ...storeData, domain: e.target.value })}
                            placeholder="例如: xxxx.myshopline.com"
                            className="h-9 text-sm border-slate-200 focus:border-meta-blue focus:ring-meta-blue rounded-lg"
                          />
                          <p className="text-[10px] text-slate-400 leading-normal mt-1">
                            提示: 请使用 {storeData.platform === "shoplazza" ? "Shoplazza" : storeData.platform === "shopify" ? "Shopify" : "SHOPLINE"} 内部域名。
                          </p>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-700">店铺时区</label>
                          <select
                            className="flex h-9 w-full rounded-md border border-slate-200 bg-background px-3 py-1 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus:border-meta-blue focus:ring-1 focus:ring-meta-blue cursor-pointer font-medium text-slate-800"
                            value={storeData.timezone || "GMT+8"}
                            onChange={(e) => setStoreData({ ...storeData, timezone: e.target.value })}
                          >
                            <option value="GMT+8">GMT+8 (北京时间 / 台北 / 新加坡)</option>
                            <option value="UTC">UTC (世界协调时间)</option>
                            <option value="GMT-5">GMT-5 (美国东部时间 - EST)</option>
                            <option value="GMT-8">GMT-8 (美国太平洋时间 - PST)</option>
                            <option value="GMT+0">GMT+0 (伦敦 / 格林威治 - GMT)</option>
                            <option value="GMT+1">GMT+1 (巴黎 / 柏林 - CET)</option>
                            <option value="GMT+2">GMT+2 (雅典 / 开罗 - EET)</option>
                            <option value="GMT+9">GMT+9 (东京 / 首尔 - JST)</option>
                          </select>
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
                            {storeData.shopline_token && storeData.domain && (
                              <div className="pt-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => handleTestShopline(storeData.domain, storeData.shopline_token)}
                                  className="h-8 text-[11px] font-bold border-emerald-200 bg-emerald-50/40 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 rounded-lg flex items-center gap-1 cursor-pointer w-full"
                                >
                                  🔍 验证 SHOPLINE 连接并实时查询商品 (不导入)
                                </Button>
                              </div>
                            )}
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
                            {storeData.shoplazza_token && storeData.domain && (
                              <div className="pt-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => handleTestShoplazza(storeData.domain, storeData.shoplazza_token)}
                                  className="h-8 text-[11px] font-bold border-emerald-200 bg-emerald-50/40 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 rounded-lg flex items-center gap-1 cursor-pointer w-full"
                                >
                                  🔍 验证店匠连接并实时查询商品 (不导入)
                                </Button>
                              </div>
                            )}
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
                            {storeData.shopify_token && storeData.domain && (
                              <div className="pt-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => handleTestShopify(storeData.domain, storeData.shopify_token)}
                                  className="h-8 text-[11px] font-bold border-emerald-200 bg-emerald-50/40 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 rounded-lg flex items-center gap-1 cursor-pointer w-full"
                                >
                                  🔍 验证 Shopify 连接并实时查询商品 (不导入)
                                </Button>
                              </div>
                            )}
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
            <div className="grid grid-cols-3 gap-4 mb-6">
              <Card className="bg-white border-[#e5e7eb] shadow-sm">
                <CardContent className="p-4 flex flex-col items-center justify-center h-full">
                  <span className="text-gray-500 text-sm font-medium mb-1">
                    总ROAS
                  </span>
                  <span className="text-2xl font-bold text-blue-600">
                    {((summaryRow?.spend || 0) > 0 ? ((dashboardSummary?.totalSales || 0) / summaryRow!.spend) : 0).toFixed(2)}x
                  </span>
                </CardContent>
              </Card>
              <Card className="bg-white border-[#e5e7eb] shadow-sm col-span-2">
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

          {!isNew && storeData.platform === "shoplazza" && (
            <Card className="bg-white border-[#e5e7eb] shadow-sm mb-6 overflow-hidden">
              <CardHeader className="bg-emerald-50/20 border-b border-[#e5e7eb] py-4 px-6 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 rounded-lg bg-emerald-100/60 text-emerald-600 font-bold text-base">🌐</span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">店匠 (Shoplazza) OpenAPI 集成状态</h3>
                    <p className="text-[10px] text-slate-500 mt-0.5">当前店铺已配置店匠集成。本工具支持直接通过 Open API 验证与即时查询最新商品（只读，不入库）。</p>
                  </div>
                </div>
                <Button 
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => handleTestShoplazza(storeData.domain, storeData.shoplazza_token)}
                  className="text-xs text-emerald-700 hover:text-emerald-800 border-emerald-200 hover:border-emerald-300 bg-emerald-50 hover:bg-emerald-100/70 flex items-center gap-1.5 h-9 rounded-lg cursor-pointer font-semibold shadow-sm transition-all"
                >
                  🔍 一键实时查询店匠商品数据
                </Button>
              </CardHeader>
              <CardContent className="p-5 text-xs text-slate-600 space-y-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2 py-1 rounded-md font-semibold text-[11px] border border-emerald-100">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    已集成 (API Configured)
                  </div>
                  <div className="text-slate-400">|</div>
                  <div className="text-slate-600">
                    <span className="font-semibold text-slate-700">目标接口:</span> {storeData.domain}/openapi/2022-01
                  </div>
                </div>
                <p className="text-slate-500 leading-relaxed text-[11px] bg-slate-50 p-3 rounded-lg border border-slate-100/80">
                  💡 <b className="text-slate-700">说明:</b> 已经配置完整的 OpenAPI 2022-01 兼容支持。根据您的指示，此查询工具是<b className="text-emerald-700">完全只读且纯前端展示</b>的。点击上方按钮可直接向店匠拉取前 10 个在售商品数据，用于确认您的 API 权限并直接展示商品的标题、SKU、条码、库存、价格等，<b className="text-red-600">在此不做任何数据导入、覆盖与落库，非常安全。</b>
                </p>
              </CardContent>
            </Card>
          )}

          {!isNew && storeData.platform === "shopify" && (
            <Card className="bg-white border-[#e5e7eb] shadow-sm mb-6 overflow-hidden">
              <CardHeader className="bg-emerald-50/20 border-b border-[#e5e7eb] py-4 px-6 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 rounded-lg bg-emerald-100/60 text-emerald-600 font-bold text-base">🌐</span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">Shopify OpenAPI 集成状态</h3>
                    <p className="text-[10px] text-slate-500 mt-0.5">当前店铺已配置 Shopify 集成。支持直接通过 API 端口验证并即时查询最新商品（只读，不入库）。</p>
                  </div>
                </div>
                <Button 
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => handleTestShopify(storeData.domain, storeData.shopify_token)}
                  className="text-xs text-emerald-700 hover:text-emerald-800 border-emerald-200 hover:border-emerald-300 bg-emerald-50 hover:bg-emerald-100/70 flex items-center gap-1.5 h-9 rounded-lg cursor-pointer font-semibold shadow-sm transition-all"
                >
                  🔍 一键实时查询 Shopify 商品数据
                </Button>
              </CardHeader>
              <CardContent className="p-5 text-xs text-slate-600 space-y-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2 py-1 rounded-md font-semibold text-[11px] border border-emerald-100">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    已集成 (API Configured)
                  </div>
                  <div className="text-slate-400">|</div>
                  <div className="text-slate-600">
                    <span className="font-semibold text-slate-700">目标接口:</span> {storeData.domain}/admin/api/2024-01
                  </div>
                </div>
                <p className="text-slate-500 leading-relaxed text-[11px] bg-slate-50 p-3 rounded-lg border border-slate-100/80">
                  💡 <b className="text-slate-700">说明:</b> 已经配置完整的 Shopify Admin API (2024-01) 兼容支持。此查询工具是<b className="text-emerald-700">完全只读且纯前端展示</b>的。点击上方按钮可直接向 Shopify 端拉取最新的商品列表，用于确认您的 API 权限与域名连通性，<b className="text-red-600">在此不做任何数据保存、覆盖与落库，非常安全。</b>
                </p>
              </CardContent>
            </Card>
          )}

          {!isNew && (!storeData.platform || storeData.platform === "shopline") && (
            <Card className="bg-white border-[#e5e7eb] shadow-sm mb-6 overflow-hidden">
              <CardHeader className="bg-emerald-50/20 border-b border-[#e5e7eb] py-4 px-6 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="p-2 rounded-lg bg-emerald-100/60 text-emerald-600 font-bold text-base">🌐</span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">SHOPLINE OpenAPI 集成状态</h3>
                    <p className="text-[10px] text-slate-500 mt-0.5">当前店铺已配置 SHOPLINE 集成。支持直接通过 OpenAPI 验证并即时查询最新商品/订单流数据（只读，不入库）。</p>
                  </div>
                </div>
                <Button 
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => handleTestShopline(storeData.domain, storeData.shopline_token)}
                  className="text-xs text-emerald-700 hover:text-emerald-800 border-emerald-200 hover:border-emerald-300 bg-emerald-50 hover:bg-emerald-100/70 flex items-center gap-1.5 h-9 rounded-lg cursor-pointer font-semibold shadow-sm transition-all"
                >
                  🔍 一键实时查询 SHOPLINE 商品数据
                </Button>
              </CardHeader>
              <CardContent className="p-5 text-xs text-slate-600 space-y-4">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-2 py-1 rounded-md font-semibold text-[11px] border border-emerald-100">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    已集成 (API Configured)
                  </div>
                  <div className="text-slate-400">|</div>
                  <div className="text-slate-600">
                    <span className="font-semibold text-slate-700">目标接口:</span> {storeData.domain}/admin/openapi/v20240301
                  </div>
                </div>
                <p className="text-slate-500 leading-relaxed text-[11px] bg-slate-50 p-3 rounded-lg border border-slate-100/80">
                  💡 <b className="text-slate-700">说明:</b> 已经配置完整的 SHOPLINE OpenAPI (v20240301) 兼容支持。此查询工具是<b className="text-emerald-700">完全只读且纯前端展示</b>的。点击上方按钮可直接向 SHOPLINE 拉取最新数据，若 Products 商品接口未暴露或受限，系统会自动尝试通过 Orders 订单列表反查关联商品列表，非常智能。<b className="text-red-600">此过程不做任何数据保存、覆盖与落库，非常安全。</b>
                </p>
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
                          onClick={() => setStoreData({ ...storeData, platform: p.id })}
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
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                        域名 <span className="text-xs text-slate-400 font-normal">(建议内部域名)</span>
                      </label>
                      <Input
                        value={storeData.domain || ""}
                        onChange={(e) =>
                          setStoreData({ ...storeData, domain: e.target.value })
                        }
                        placeholder="例如: xxxx.myshopline.com"
                        className="h-10 text-sm border-slate-200 focus:border-meta-blue focus:ring-meta-blue rounded-lg"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                        店铺时区 <span className="text-red-500">*</span>
                      </label>
                      <select
                        className="flex h-10 w-full rounded-lg border border-slate-200 bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus:border-meta-blue focus:ring-1 focus:ring-meta-blue cursor-pointer font-medium text-slate-800"
                        value={storeData.timezone || "GMT+8"}
                        onChange={(e) => setStoreData({ ...storeData, timezone: e.target.value })}
                      >
                        <option value="GMT+8">GMT+8 (北京时间 / 台北 / 新加坡)</option>
                        <option value="UTC">UTC (世界协调时间)</option>
                        <option value="GMT-5">GMT-5 (美国东部时间 - EST)</option>
                        <option value="GMT-8">GMT-8 (美国太平洋时间 - PST)</option>
                        <option value="GMT+0">GMT+0 (伦敦 / 格林威治 - GMT)</option>
                        <option value="GMT+1">GMT+1 (巴黎 / 柏林 - CET)</option>
                        <option value="GMT+2">GMT+2 (雅典 / 开罗 - EET)</option>
                        <option value="GMT+9">GMT+9 (东京 / 首尔 - JST)</option>
                      </select>
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
                        {storeData.shoplazza_token && storeData.domain && (
                          <div className="pt-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => handleTestShoplazza(storeData.domain, storeData.shoplazza_token)}
                              className="h-9 text-xs font-semibold border-emerald-200 bg-emerald-50/40 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 rounded-lg flex items-center gap-1 cursor-pointer w-full"
                            >
                              🔍 立即验证店匠连接并实时查询商品 (不导入数据)
                            </Button>
                          </div>
                        )}
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

          {!isNew && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
                <CardTitle>已关联的广告账户级数据</CardTitle>
                <AddAccountDialog 
                  onAdd={handleAddAccount} 
                  storeName={storeData.name || ""} 
                  mappings={allMappings} 
                />
              </CardHeader>
              <CardContent className="p-0">
                {loadingInsights ? (
                  <div className="flex justify-center p-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left border-collapse min-w-[800px]">
                      <thead className="bg-[#fbfcff] z-[50]">
                        <tr>
                          <th
                            className="h-10 px-4 align-middle whitespace-nowrap text-foreground border-r border-b border-[#e5e7eb] text-[#4b5563] font-bold text-[12px] cursor-pointer hover:bg-gray-100"
                            onClick={() => requestSort("store")}
                          >
                            店铺{" "}
                            <ArrowUpDown className="w-3 h-3 inline-block ml-1" />
                          </th>
                          <th
                            className="h-10 px-4 align-middle whitespace-nowrap text-foreground border-r border-b border-[#e5e7eb] text-[#4b5563] font-bold text-[12px] cursor-pointer hover:bg-gray-100"
                            onClick={() => requestSort("owner")}
                          >
                            负责人{" "}
                            <ArrowUpDown className="w-3 h-3 inline-block ml-1" />
                          </th>
                          <th
                            className="h-10 px-4 align-middle whitespace-nowrap text-foreground border-r border-b border-[#e5e7eb] text-[#4b5563] font-bold text-[12px] cursor-pointer hover:bg-gray-100"
                            onClick={() => requestSort("account_name")}
                          >
                            广告账户{" "}
                            <ArrowUpDown className="w-3 h-3 inline-block ml-1" />
                          </th>
                          <th
                            className="h-10 px-4 align-middle whitespace-nowrap text-foreground border-r border-b border-[#e5e7eb] text-[#4b5563] font-bold text-[12px] cursor-pointer hover:bg-gray-100"
                            onClick={() => requestSort("spend")}
                          >
                            已花费金额{" "}
                            <ArrowUpDown className="w-3 h-3 inline-block ml-1" />
                          </th>
                          <th
                            className="h-10 px-4 align-middle whitespace-nowrap text-foreground border-r border-b border-[#e5e7eb] text-[#4b5563] font-bold text-[12px] cursor-pointer hover:bg-gray-100"
                            onClick={() => requestSort("purchaseValue")}
                          >
                            购物转化价值{" "}
                            <ArrowUpDown className="w-3 h-3 inline-block ml-1" />
                          </th>
                          <th
                            className="h-10 px-4 align-middle whitespace-nowrap text-foreground border-r border-b border-[#e5e7eb] text-[#4b5563] font-bold text-[12px] cursor-pointer hover:bg-gray-100"
                            onClick={() => requestSort("addToCart")}
                          >
                            加购{" "}
                            <ArrowUpDown className="w-3 h-3 inline-block ml-1" />
                          </th>
                          <th
                            className="h-10 px-4 align-middle whitespace-nowrap text-foreground border-r border-b border-[#e5e7eb] text-[#4b5563] font-bold text-[12px] cursor-pointer hover:bg-gray-100"
                            onClick={() => requestSort("atcRate")}
                          >
                            加购率{" "}
                            <ArrowUpDown className="w-3 h-3 inline-block ml-1" />
                          </th>
                          <th
                            className="h-10 px-4 align-middle whitespace-nowrap text-foreground border-r border-b border-[#e5e7eb] text-[#4b5563] font-bold text-[12px] cursor-pointer hover:bg-gray-100"
                            onClick={() => requestSort("initiateCheckout")}
                          >
                            结账发起{" "}
                            <ArrowUpDown className="w-3 h-3 inline-block ml-1" />
                          </th>
                          <th
                            className="h-10 px-4 align-middle whitespace-nowrap text-foreground border-r border-b border-[#e5e7eb] text-[#4b5563] font-bold text-[12px] cursor-pointer hover:bg-gray-100"
                            onClick={() => requestSort("checkoutRate")}
                          >
                            结账率{" "}
                            <ArrowUpDown className="w-3 h-3 inline-block ml-1" />
                          </th>
                          <th
                            className="h-10 px-4 align-middle whitespace-nowrap text-foreground border-r border-b border-[#e5e7eb] text-[#4b5563] font-bold text-[12px] cursor-pointer hover:bg-gray-100"
                            onClick={() => requestSort("purchases")}
                          >
                            成效{" "}
                            <ArrowUpDown className="w-3 h-3 inline-block ml-1" />
                          </th>
                          <th
                            className="h-10 px-4 align-middle whitespace-nowrap text-foreground border-r border-b border-[#e5e7eb] text-[#4b5563] font-bold text-[12px] cursor-pointer hover:bg-gray-100"
                            onClick={() => requestSort("cpp")}
                          >
                            单次费用{" "}
                            <ArrowUpDown className="w-3 h-3 inline-block ml-1" />
                          </th>
                          <th
                            className="h-10 px-4 align-middle whitespace-nowrap text-foreground border-b border-[#e5e7eb] text-[#4b5563] font-bold text-[12px] cursor-pointer hover:bg-gray-100"
                            onClick={() => requestSort("roas")}
                          >
                            ROAS{" "}
                            <ArrowUpDown className="w-3 h-3 inline-block ml-1" />
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedInsights.length === 0 ? (
                          <tr>
                            <td colSpan={12} className="p-4 text-center text-gray-500">
                              暂无绑定的广告账户数据
                            </td>
                          </tr>
                        ) : (
                          sortedInsights.map((insight: any) => (
                            <tr
                              key={insight.account_id}
                              className="hover:bg-gray-50 border-b border-[#e5e7eb]"
                            >
                              <td className="p-2 px-4 border-r border-[#e5e7eb] text-blue-600 font-medium">
                                {insight.store || "-"}
                              </td>
                              <td className="p-2 px-4 border-r border-[#e5e7eb]">
                                {insight.owner || "-"}
                              </td>
                              <td
                                className="p-2 px-4 border-r border-[#e5e7eb] text-blue-600 font-medium cursor-pointer"
                                onClick={() =>
                                  navigate(`/account/${insight.account_id}`)
                                }
                              >
                                {insight.account_name}
                              </td>
                              <td className="p-2 px-4 border-r border-[#e5e7eb]">
                                ${insight.spend.toFixed(2)}
                              </td>
                              <td className="p-2 px-4 border-r border-[#e5e7eb] text-green-600 font-medium">
                                ${insight.purchaseValue.toFixed(2)}
                              </td>
                              <td className="p-2 px-4 border-r border-[#e5e7eb]">
                                {insight.addToCart}
                              </td>
                              <td className="p-2 px-4 border-r border-[#e5e7eb]">
                                {insight.atcRate.toFixed(2)}%
                              </td>
                              <td className="p-2 px-4 border-r border-[#e5e7eb]">
                                {insight.initiateCheckout}
                              </td>
                              <td className="p-2 px-4 border-r border-[#e5e7eb]">
                                {insight.checkoutRate.toFixed(2)}%
                              </td>
                              <td className="p-2 px-4 border-r border-[#e5e7eb]">
                                {insight.purchases}
                              </td>
                              <td className="p-2 px-4 border-r border-[#e5e7eb]">
                                ${insight.cpp.toFixed(2)}
                              </td>
                              <td className="p-2 px-4 text-blue-700 font-bold">
                                {insight.roas.toFixed(2)}x
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      {summaryRow && (
                        <tfoot className="bg-[#fbfcff] z-[50] sticky bottom-0 shadow-[0_-1px_0_#e5e7eb]">
                          <tr>
                            <td className="p-2 px-4 align-middle whitespace-nowrap text-foreground border-r border-[#e5e7eb] text-[#4b5563]">
                              <div className="text-[13px] font-bold">{summaryRow.count}个广告账户的汇总</div>
                              <div className="text-[11px] font-normal text-muted-foreground">成效汇总</div>
                            </td>
                            <td className="p-2 px-4 align-middle text-center whitespace-nowrap text-foreground border-r border-[#e5e7eb] text-[#4b5563] font-bold">—</td>
                            <td className="p-2 px-4 align-middle whitespace-nowrap text-foreground border-r border-[#e5e7eb] text-[#4b5563]">
                              <div className="text-[13px] font-bold">{summaryRow.count}</div>
                              <div className="text-[11px] font-normal text-muted-foreground">Meta 账户</div>
                            </td>
                            <td className="p-2 px-4 align-middle whitespace-nowrap text-foreground border-r border-[#e5e7eb] text-[#4b5563]">
                              <div className="text-[13px] font-bold">${summaryRow.spend.toFixed(2)}</div>
                              <div className="text-[11px] font-normal text-muted-foreground">总花费</div>
                            </td>
                            <td className="p-2 px-4 align-middle whitespace-nowrap text-foreground border-r border-[#e5e7eb] text-[#16a34a]">
                              <div className="text-[13px] font-bold">${summaryRow.purchaseValue.toFixed(2)}</div>
                              <div className="text-[11px] font-normal text-muted-foreground">总价值</div>
                            </td>
                            <td className="p-2 px-4 align-middle whitespace-nowrap text-foreground border-r border-[#e5e7eb] text-[#4b5563]">
                              <div className="text-[13px] font-bold">{summaryRow.addToCart}</div>
                              <div className="text-[11px] font-normal text-muted-foreground">共计</div>
                            </td>
                            <td className="p-2 px-4 align-middle whitespace-nowrap text-foreground border-r border-[#e5e7eb] text-[#4b5563]">
                              <div className="text-[13px] font-bold">{summaryRow.atcRate.toFixed(2)}%</div>
                              <div className="text-[11px] font-normal text-muted-foreground">平均</div>
                            </td>
                            <td className="p-2 px-4 align-middle whitespace-nowrap text-foreground border-r border-[#e5e7eb] text-[#4b5563]">
                              <div className="text-[13px] font-bold">{summaryRow.initiateCheckout}</div>
                              <div className="text-[11px] font-normal text-muted-foreground">共计</div>
                            </td>
                            <td className="p-2 px-4 align-middle whitespace-nowrap text-foreground border-r border-[#e5e7eb] text-[#4b5563]">
                              <div className="text-[13px] font-bold">{summaryRow.checkoutRate.toFixed(2)}%</div>
                              <div className="text-[11px] font-normal text-muted-foreground">平均</div>
                            </td>
                            <td className="p-2 px-4 align-middle whitespace-nowrap text-foreground border-r border-[#e5e7eb] text-[#4b5563]">
                              <div className="text-[13px] font-bold">{summaryRow.purchases}</div>
                              <div className="text-[11px] font-normal text-muted-foreground">共计</div>
                            </td>
                            <td className="p-2 px-4 align-middle whitespace-nowrap text-foreground border-r border-[#e5e7eb] text-[#4b5563]">
                              <div className="text-[13px] font-bold">${summaryRow.cpp.toFixed(2)}</div>
                              <div className="text-[11px] font-normal text-muted-foreground">平均</div>
                            </td>
                            <td className="p-2 px-4 align-middle whitespace-nowrap text-foreground text-[#1d4ed8]">
                              <div className="text-[13px] font-bold">{summaryRow.roas.toFixed(2)}x</div>
                              <div className="text-[11px] font-normal text-muted-foreground">平均</div>
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </main>
      </div>

      {/* Shoplazza / Shopify / Shopline API Test Real-time Query Modal */}
      <Dialog open={showShoplazzaModal} onOpenChange={setShowShoplazzaModal}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto rounded-xl bg-white p-6 shadow-2xl border border-slate-100">
          <DialogHeader className="border-b pb-4">
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-slate-800 font-bold text-base">
                <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                  <ShoppingBag className="w-5 h-5" />
                </span>
                <div>
                  <span>{testPlatform === "shoplazza" ? "店匠 (Shoplazza)" : testPlatform === "shopify" ? "Shopify" : "SHOPLINE"} 商品数据查询结果</span>
                  <p className="text-[10px] text-slate-400 font-normal mt-0.5">一键实时校验 OpenAPI 连通状态 & 读取商品列表</p>
                </div>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="py-4 space-y-4">
            {testingShoplazza ? (
              <div className="flex flex-col items-center justify-center py-16 space-y-3">
                <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
                <div className="text-sm font-medium text-slate-600">正在与 {testPlatform === "shoplazza" ? "店匠 (Shoplazza)" : testPlatform === "shopify" ? "Shopify" : "SHOPLINE"} {storeData.domain || "配置的主机"} API 发起握手与查询...</div>
                <div className="text-xs text-slate-400">正在调用 endpoints: {testPlatform === "shoplazza" ? "/openapi/2022-01/products" : testPlatform === "shopify" ? "/admin/api/2024-01/products.json" : "/admin/openapi/v20240301/products.json"}</div>
              </div>
            ) : shoplazzaTestError ? (
              <div className="bg-red-50 border border-red-200 rounded-xl p-5 space-y-3">
                <div className="flex items-start gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-red-800">API 连接建立失败</h4>
                    <p className="text-xs text-red-600 mt-1 leading-relaxed">
                      系统正在通过后台代理与您的 {testPlatform === "shoplazza" ? "店匠 (Shoplazza)" : testPlatform === "shopify" ? "Shopify" : "SHOPLINE"} 进行安全 HTTP 信令通信，但服务器返回了错误。
                    </p>
                    <p className="text-xs text-slate-700 bg-white/70 p-2.5 rounded border border-red-100 mt-3 font-mono break-all leading-relaxed max-h-40 overflow-y-auto">
                      {shoplazzaTestError}
                    </p>
                  </div>
                </div>
                <div className="pt-2 border-t border-red-100/50 flex flex-col md:flex-row md:items-center justify-between text-[11px] text-slate-400 gap-2">
                  <span>建议排查: 1. 密钥权限是否缺少商品 / 订单读取权限 2. 域名格式如 `{testPlatform === "shopify" ? "example.myshopify.com" : "example.com"}` 填写是否准确</span>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleTestConnection(
                      testPlatform, 
                      storeData.domain, 
                      testPlatform === "shoplazza" ? storeData.shoplazza_token : testPlatform === "shopify" ? storeData.shopify_token : storeData.shopline_token
                    )}
                    className="h-7 text-[10px] border-red-200 text-red-700 hover:bg-red-100/50 shrink-0 self-end"
                  >
                    重新测试
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold text-emerald-800">✅ 接口联通成功 & 权限校验通过</h4>
                    <p className="text-xs text-emerald-600/90 leading-normal mt-0.5">
                      {testPlatform === "shoplazza" ? "店匠 (Shoplazza)" : testPlatform === "shopify" ? "Shopify" : "SHOPLINE"} OpenAPI 通道正常开启！已成功抓取最新的商品或测试用列表快照预览。
                    </p>
                    <p className="text-[10px] text-slate-500 mt-1 leading-normal italic">
                      ⚠ 请放心：根据您的指令，以下展示的所有商品信息均为临时只读加载展示，此过程零写库、零导入，不会对您当前的系统数据造成任何重载修改。
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 max-h-[50vh] overflow-y-auto p-0.5">
                  {shoplazzaProducts.length === 0 ? (
                    <div className="col-span-2 text-center py-10 bg-slate-50 border rounded-xl text-slate-400 text-xs">
                      连接成功，但是该店铺后台中暂未查询到任何商品。
                    </div>
                  ) : (
                    shoplazzaProducts.map((product) => (
                      <div key={product.id} className="flex gap-3 bg-white p-3 border border-slate-100 rounded-xl hover:shadow-md hover:border-slate-200 transition-all group overflow-hidden">
                        <div className="w-16 h-16 bg-slate-50 rounded-lg overflow-hidden shrink-0 border border-slate-100 flex items-center justify-center">
                          {product.image ? (
                            <img 
                              src={product.image} 
                              alt={product.title} 
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform" 
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <span className="text-xs font-semibold text-slate-400">N/A</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase bg-slate-100 px-1.5 py-0.5 rounded">
                                {product.product_type}
                              </span>
                              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                                ${product.price}
                              </span>
                            </div>
                            <h5 className="text-xs font-bold text-slate-800 leading-snug truncate group-hover:text-blue-600 transition-colors" title={product.title}>
                              {product.title}
                            </h5>
                          </div>
                          
                          <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1.5 border-t border-slate-50 mt-1 font-sans">
                            <span className="truncate" title={product.sku}>
                              SKU: <span className="font-mono text-slate-600 font-medium">{product.sku || "未设置"}</span>
                            </span>
                            <span className="shrink-0 font-medium ml-1">
                              库存: <span className={product.inventory > 0 ? "text-emerald-600 font-bold" : "text-amber-500 font-bold"}>{product.inventory}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="pt-4 border-t flex justify-end gap-2 bg-slate-50/50 -mx-6 -mb-6 p-4">
            <Button
              onClick={() => setShowShoplazzaModal(false)}
              className="bg-slate-800 hover:bg-slate-700 font-medium text-white px-5 rounded-lg text-xs"
            >
              关闭并退出查询
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddAccountDialog({
  onAdd,
  storeName,
  mappings,
}: {
  onAdd: (id: string, name: string, store: string) => void;
  storeName: string;
  mappings: any[];
}) {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [accountName, setAccountName] = useState("");
  const [storeInputName, setStoreInputName] = useState("");

  // Initialize storeInputName when modal opens or storeName changes
  useEffect(() => {
    if (open) {
      setStoreInputName(storeName);
    }
  }, [open, storeName]);

  // Dynamically look up current mapping for accountId when user types it
  const cleanEnteredId = accountId.replace("act_", "").trim().toLowerCase();
  const existingMapping = useMemo(() => {
    if (!cleanEnteredId) return null;
    return mappings.find(m => 
      m.accountId.replace("act_", "").trim().toLowerCase() === cleanEnteredId
    );
  }, [cleanEnteredId, mappings]);

  // When an existing mapping is found, we can optionally prefill or show to user
  useEffect(() => {
    if (existingMapping) {
      if (existingMapping.store) {
        setStoreInputName(existingMapping.store);
      }
      if (existingMapping.accountName && !accountName) {
        setAccountName(existingMapping.accountName);
      }
    }
  }, [existingMapping]);

  const handleSubmit = () => {
    onAdd(accountId, accountName, storeInputName);
    setOpen(false);
    setAccountId("");
    setAccountName("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={cn(buttonVariants({ size: "sm" }), "h-9 font-semibold text-xs")}>
        <Plus className="w-4 h-4 mr-1" /> 添加账户
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="space-y-4 pt-2">
          <h4 className="font-semibold text-sm text-slate-800">关联 Meta 广告账户</h4>
          
          <div className="space-y-1">
            <label className="text-xs text-slate-500 font-medium">账户 ID (如: act_12345)</label>
            <Input
              placeholder="账户 ID"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            />
          </div>

          {existingMapping && (
            <div className="bg-blue-50 border border-blue-100 p-2.5 rounded-lg text-xs space-y-1">
              <div className="text-blue-700 font-semibold flex items-center gap-1">
                <span>ℹ 账户已有关联映射</span>
              </div>
              <div className="text-slate-600">
                账户名称: <span className="font-medium">{existingMapping.accountName || "未知"}</span>
              </div>
              <div className="text-slate-600">
                关联店铺: <span className="text-blue-600 font-bold">{existingMapping.store || "未分配"}</span>
              </div>
              {existingMapping.owner && (
                <div className="text-slate-600">
                  负责人: <span className="font-medium">{existingMapping.owner}</span>
                </div>
              )}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs text-slate-500 font-medium">账户名称 (可选)</label>
            <Input
              placeholder="账户名称"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-500 font-medium">关联店铺名称 (手动填入)</label>
            <Input
              placeholder="请输入关联店铺名称"
              value={storeInputName}
              onChange={(e) => setStoreInputName(e.target.value)}
            />
          </div>

          <Button onClick={handleSubmit} className="w-full bg-meta-blue hover:bg-meta-blue/90 text-white font-semibold">
            确认添加
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
