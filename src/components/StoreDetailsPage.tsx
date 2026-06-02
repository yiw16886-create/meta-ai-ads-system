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
    shopline_token: "",
    shopify_token: "",
    domain: "",
    timezone: "GMT+8",
    visitors: 0,
    accounts: [],
  });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [accountsInsights, setAccountsInsights] = useState<any[]>([]);
  const [loadingInsights, setLoadingInsights] = useState(false);
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
      }).filter((item: any) => item.spend > 0);

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

  const handleAddAccount = async (
    fb_account_id: string,
    fb_account_name: string,
    fb_access_token: string,
  ) => {
    if (!fb_account_id) return toast.error("请输入广告账户 ID");
    try {
      await axios.post(`/api/stores/${storeId}/accounts`, {
        fb_account_id,
        fb_account_name,
        fb_access_token,
      });
      toast.success("广告账户已添加");
      fetchStore().then(name => name && fetchInsights(name));
    } catch (err) {
      toast.error("保存账户失败");
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
                            提示: 请使用 SHOPLINE 授予的内部域名以绕过自定义域名的 Cloudflare 防火墙。
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

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-700">STORE_Token</label>
                          <Input
                            type="password"
                            value={storeData.shopline_token || ""}
                            onChange={(e) =>
                              setStoreData({
                                ...storeData,
                                shopline_token: e.target.value,
                              })
                            }
                            placeholder="填入秘钥可拉取订单"
                            className="h-9 text-sm border-slate-200 focus:border-meta-blue focus:ring-meta-blue rounded-lg"
                          />
                        </div>

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

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                        STORE_Token <span className="text-xs text-slate-400 font-normal">(用于增量拉单)</span>
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
                <AddAccountDialog onAdd={handleAddAccount} />
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
    </div>
  );
}

function AddAccountDialog({
  onAdd,
}: {
  onAdd: (id: string, name: string, token: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [accountName, setAccountName] = useState("");
  const [token, setToken] = useState("");

  const handleSubmit = () => {
    onAdd(accountId, accountName, token);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className={buttonVariants({ size: "sm" })}>
        <Plus className="w-4 h-4 mr-1" /> 添加账户
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="space-y-4 pt-2">
          <h4 className="font-medium text-sm">关联 Meta 广告账户</h4>
          <Input
            placeholder="账户 ID (如: act_12345)"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          />
          <Input
            placeholder="账户名称 (可选)"
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
          />
          <Input
            placeholder="Meta Access Token (可选，留空使用全局配置)"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <Button onClick={handleSubmit} className="w-full">
            确认添加
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
