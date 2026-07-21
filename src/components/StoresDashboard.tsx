import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Plus, Store, Link as LinkIcon, Trash2, RefreshCw, X, Check, Globe, Clock, Key, Eye, EyeOff } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const getPlatformSuffix = (platform: string): string => {
  if (platform === "shopify") return ".myshopify.com";
  if (platform === "shoplazza") return ".myshoplaza.com";
  return ".myshopline.com"; // default is shopline
};

export function StoresDashboard({ startDate, endDate }: { startDate?: Date; endDate?: Date }) {
  const navigate = useNavigate();
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filterType, setFilterType] = useState<"connected" | "unconnected" | "all">("connected");

  const isApiBound = (store: any) => {
    return !!(store.shopline_token?.trim() || store.shopify_token?.trim() || store.shoplazza_token?.trim());
  };

  const allCount = stores.length;
  
  const connectedStores = stores.filter(store => {
    const apiBound = isApiBound(store);
    return apiBound;
  });

  const unconnectedStores = stores.filter(store => {
    const apiBound = isApiBound(store);
    return !apiBound;
  });

  const displayedStores = filterType === "connected"
    ? connectedStores
    : filterType === "unconnected"
    ? unconnectedStores
    : stores;

  // States for store deletion
  const [deletingStoreId, setDeletingStoreId] = useState<number | null>(null);
  const [deleteStoreName, setDeleteStoreName] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  // States for adding store modal
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newStoreName, setNewStoreName] = useState("");
  const [selectedPlatform, setSelectedPlatform] = useState<"shopline" | "shoplazza" | "shopify">("shopline");
  const [domainPrefix, setDomainPrefix] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [timezone, setTimezone] = useState("GMT+8");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const handleSyncStore = async () => {
    setSyncing(true);
    const syncToast = toast.loading("正在同步店铺与订单数据...");
    try {
      const sDate = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const eDate = endDate || new Date();
      // Format to local YYYY-MM-DD format safely
      const offset = sDate.getTimezoneOffset();
      const localSDate = new Date(sDate.getTime() - (offset * 60 * 1000));
      const localEDate = new Date(eDate.getTime() - (offset * 60 * 1000));
      const startStr = localSDate.toISOString().split('T')[0];
      const endStr = localEDate.toISOString().split('T')[0];

      const response = await axios.post("/api/sync-store", {
        startDate: startStr,
        endDate: endStr
      });
      toast.success(response.data.message || "店铺和订单数据同步成功", {
        id: syncToast,
      });
    } catch (error: any) {
      const respErr = error.response?.data?.error;
      const errMsg = typeof respErr === 'string' ? respErr : (respErr?.message || "同步店铺数据失败");
      toast.error(errMsg, { id: syncToast });
    } finally {
      setSyncing(false);
    }
  };

  const fetchStores = async () => {
    setLoading(true);
    try {
      const storesRes = await axios.get("/api/stores");
      setStores(Array.isArray(storesRes.data) ? storesRes.data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStores();
  }, []);

  const handleDeleteStore = async (storeId: number) => {
    setDeleteLoading(true);
    try {
      const res = await axios.delete(`/api/stores/${storeId}`);
      toast.success(res.data.message || "店铺删除成功");
      setDeletingStoreId(null);
      setDeleteStoreName("");
      // Refresh list
      fetchStores();
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.error || "删除店铺失败，请重试");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDomainChange = (val: string) => {
    let sub = val.trim();
    sub = sub.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
    sub = sub.replace(/\.myshopline\.com$/i, "").replace(/\.myshopline$/i, "")
             .replace(/\.myshopify\.com$/i, "").replace(/\.myshopify$/i, "")
             .replace(/\.myshoplazz\.com$/i, "").replace(/\.myshoplazz$/i, "")
             .replace(/\.myshoplazza\.com$/i, "").replace(/\.myshoplazza$/i, "")
             .replace(/\.myshoplaza\.com$/i, "").replace(/\.myshoplaza$/i, "");
    setDomainPrefix(sub);
  };

  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();

    const userString = localStorage.getItem("user");
    const userRole = userString ? JSON.parse(userString).role : "";
    const isAdmin = userRole === "admin" || userRole === "SUPER_ADMIN";

    if (!isAdmin) {
      toast.error("仅管理员可修改店铺配置");
      return;
    }

    if (!newStoreName.trim()) {
      toast.error("请输入店铺名称");
      return;
    }

    if (!domainPrefix.trim()) {
      toast.error("请输入域名前缀");
      return;
    }

    if (!accessToken.trim()) {
      toast.error("请输入 API Access Token");
      return;
    }

    setIsSubmitting(true);
    try {
      const suffix = getPlatformSuffix(selectedPlatform);
      const fullDomain = `${domainPrefix.trim()}${suffix}`;

      const payload: any = {
        name: newStoreName.trim(),
        platform: selectedPlatform,
        domain: fullDomain,
        timezone: timezone,
        visitors: 0
      };

      if (selectedPlatform === "shopify") {
        payload.shopify_token = accessToken.trim();
      } else if (selectedPlatform === "shoplazza") {
        payload.shoplazza_token = accessToken.trim();
      } else {
        payload.shopline_token = accessToken.trim();
      }

      const res = await axios.post("/api/stores", payload);
      toast.success("店铺保存成功");

      // Reset form & close modal
      setNewStoreName("");
      setDomainPrefix("");
      setAccessToken("");
      setSelectedPlatform("shopline");
      setIsAddModalOpen(false);

      // Refresh stores list
      fetchStores();
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.error || "保存失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto space-y-6 pb-12">
      <div className="flex justify-between items-center bg-white p-6 rounded-[12px] shadow-sm border border-[#e5e7eb]">
        <div>
          <h2 className="text-xl font-bold">店铺管理</h2>
          <p className="text-sm text-gray-500 mt-1">
            管理独立站店铺，并关联对应的 Meta 广告账户
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            className="flex items-center gap-2 text-gray-700 border-gray-300 hover:bg-gray-50"
            onClick={handleSyncStore}
            disabled={syncing}
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
            同步店铺数据
          </Button>
          <Button onClick={() => setIsAddModalOpen(true)}>添加店铺</Button>
        </div>
      </div>

      {/* Tab filter control for stores - Single Choice (单选功能) */}
      {!loading && stores.length > 0 && (
        <div className="bg-white p-4 rounded-[12px] shadow-sm border border-[#e5e7eb] flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">店铺筛选:</span>
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200">
              <button
                type="button"
                onClick={() => setFilterType("connected")}
                className={cn(
                  "px-4 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer",
                  filterType === "connected"
                    ? "bg-white text-slate-900 shadow-sm border border-slate-100 font-bold"
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                已连接店铺 ({connectedStores.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType("unconnected")}
                className={cn(
                  "px-4 py-1.5 rounded-md text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer",
                  filterType === "unconnected"
                    ? "bg-white text-slate-900 shadow-sm border border-slate-100 font-bold"
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                未连接店铺 ({unconnectedStores.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType("all")}
                className={cn(
                  "px-4 py-1.5 rounded-md text-xs font-semibold transition-all cursor-pointer",
                  filterType === "all"
                    ? "bg-white text-slate-900 shadow-sm border border-slate-100 font-bold"
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                全部店铺 ({stores.length})
              </button>
            </div>
          </div>
          <div className="text-xs text-slate-400">
            {filterType === "connected" && "💡 已绑定 API 或已分配广告账户的店铺（未连接的店铺已自动折叠隐藏）"}
            {filterType === "unconnected" && "💡 发现没有关联广告账户且未绑定 API 的潜在闲置店铺"}
            {filterType === "all" && "💡 显示系统内录入的所有店铺"}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center p-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : stores.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-24 text-center">
            <Store className="h-12 w-12 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-1">暂无店铺</h3>
            <p className="text-sm text-gray-500 mb-4">
              请添加一个新的店铺以关联广告账户
            </p>
            <Button onClick={() => setIsAddModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              添加第一个店铺
            </Button>
          </CardContent>
        </Card>
      ) : displayedStores.length === 0 ? (
        <Card className="border-dashed border-2 bg-slate-50 border-slate-200">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Store className="h-10 w-10 text-slate-400 mb-3" />
            <h3 className="text-base font-semibold text-slate-700 mb-1">
              {filterType === "connected" ? "没有已连接的店铺" : "没有未连接的店铺"}
            </h3>
            <p className="text-xs text-slate-500">
              {filterType === "connected" 
                ? "所有店铺都处于未连接状态，您可以点击上方【未连接店铺】按钮查看与管理"
                : "恭喜！目前系统内所有的店铺均已正常配置/关联！"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayedStores.map((store) => {
            const apiBound = isApiBound(store);
            return (
              <Card
                key={store.id}
                className="cursor-pointer hover:shadow-md transition-shadow border-gray-200"
                onClick={() => navigate(`/store/${store.id}`)}
              >
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-blue-50 text-meta-blue flex items-center justify-center rounded-lg">
                        <Store className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900 flex items-center gap-1.5 flex-wrap">
                          {store.name}
                          {store.platform && (
                            <span className={cn(
                              "text-[9px] px-1.5 py-0.5 rounded-full font-semibold tracking-wide uppercase inline-block",
                              store.platform === "shopline" && "bg-blue-50 text-blue-600 border border-blue-200",
                              store.platform === "shoplazza" && "bg-emerald-50 text-emerald-600 border border-emerald-200",
                              store.platform === "shopify" && "bg-green-50 text-green-600 border border-green-200",
                            )}>
                              {store.platform === "shoplazza" ? "店匠" : store.platform}
                            </span>
                          )}
                          {!apiBound && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold bg-amber-50 text-amber-600 border border-amber-200 uppercase inline-block">
                              未连接
                            </span>
                          )}
                          {apiBound && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200 uppercase inline-block">
                              API 已装配
                            </span>
                          )}
                        </h3>
                        <p className="text-xs text-gray-500">
                          {store.domain || "未配置域名"}
                        </p>
                      </div>
                    </div>
                    
                    {/* Delete Button */}
                    <button
                      type="button"
                      title="删除店铺"
                      className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeletingStoreId(store.id);
                        setDeleteStoreName(store.name);
                      }}
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="flex items-center justify-between text-sm text-gray-600 mt-4 border-t pt-4">
                    <span className={cn(
                      "text-xs px-1.5 py-0.5 rounded font-mono",
                      apiBound ? "text-emerald-700 bg-emerald-50" : "text-slate-400 bg-slate-50"
                    )}>
                      {apiBound ? "API ACTIVE" : "NO API"}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modern Confirmation Overlay Dialog */}
      {deletingStoreId !== null && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 transition-opacity duration-300">
          <div className="bg-white p-6 rounded-[12px] max-w-md w-full shadow-xl border border-gray-100 transform scale-100 transition-transform duration-300">
            <div className="flex items-center gap-3 mb-4 text-red-600">
              <div className="h-10 w-10 bg-red-50 rounded-full flex items-center justify-center">
                <Trash2 className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-bold text-gray-900">确认删除店铺</h3>
            </div>
            
            <p className="text-sm text-gray-600 mb-6 leading-relaxed">
              您确定要删除店铺 <span className="font-semibold text-gray-900">"{deleteStoreName}"</span> 吗？
              这将硬删除该店铺关联的所有配置、广告账户关联信息和离线缓存指标，此操作无法撤销。
            </p>

            <div className="flex justify-end gap-3 border-t pt-4">
              <Button 
                variant="outline" 
                onClick={() => { setDeletingStoreId(null); setDeleteStoreName(""); }}
                disabled={deleteLoading}
              >
                取消
              </Button>
              <Button 
                variant="destructive" 
                onClick={() => handleDeleteStore(deletingStoreId)}
                disabled={deleteLoading}
              >
                {deleteLoading ? "正在删除..." : "确认删除"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 添加新店铺 Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 transition-opacity duration-300 animate-in fade-in">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-100 max-w-2xl w-full overflow-hidden transform scale-100 transition-transform duration-300 flex flex-col">
            
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 bg-blue-50 text-meta-blue flex items-center justify-center rounded-lg">
                  <Store className="h-4 w-4 text-meta-blue" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">添加新店铺</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAddModalOpen(false);
                  setNewStoreName("");
                  setDomainPrefix("");
                  setAccessToken("");
                  setSelectedPlatform("shopline");
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form Content */}
            <form onSubmit={handleCreateStore} className="p-6 space-y-6 flex-1 overflow-y-auto">
              {/* Store Platform Radio Group */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                  店铺平台 <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: "shopline" as const, name: "SHOPLINE", icon: "🛒", activeColor: "border-blue-600 bg-blue-50/50 text-blue-600 shadow-sm ring-2 ring-blue-500/20" },
                    { id: "shoplazza" as const, name: "Shoplazza", icon: "🛍️", activeColor: "border-blue-600 bg-blue-50/50 text-blue-600 shadow-sm ring-2 ring-blue-500/20" },
                    { id: "shopify" as const, name: "Shopify", icon: "🔌", activeColor: "border-blue-600 bg-blue-50/50 text-blue-600 shadow-sm ring-2 ring-blue-500/20" }
                  ].map((p) => {
                    const isSelected = selectedPlatform === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPlatform(p.id)}
                        className={cn(
                          "flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all cursor-pointer relative",
                          isSelected
                            ? p.activeColor
                            : "border-slate-200 bg-slate-50/50 hover:border-slate-300 text-slate-700"
                        )}
                      >
                        <div className="text-2xl mb-1 flex items-center justify-center w-6 h-6">{p.icon}</div>
                        <div className="text-sm font-semibold whitespace-nowrap">{p.name}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {/* Store Name */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block">
                      店铺名称 <span className="text-red-500">*</span>
                    </label>
                    <div className="relative flex items-center rounded-lg border border-slate-200 bg-white focus-within:border-meta-blue focus-within:ring-1 focus-within:ring-meta-blue h-10 overflow-hidden transition-colors">
                      <div className="pl-3 text-slate-400 shrink-0">
                        <Store className="h-4 w-4" />
                      </div>
                      <input
                        type="text"
                        value={newStoreName}
                        onChange={(e) => setNewStoreName(e.target.value)}
                        placeholder="例如: Kolaich"
                        required
                        className="flex-1 min-w-0 h-full px-3 text-sm border-0 bg-transparent focus:outline-none focus:ring-0 text-slate-800 placeholder:text-slate-400 font-medium"
                      />
                    </div>
                  </div>

                  {/* Access Token */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 block">
                      API Access Token <span className="text-red-500">*</span>
                    </label>
                    <div className="relative flex items-center rounded-lg border border-slate-200 bg-white focus-within:border-meta-blue focus-within:ring-1 focus-within:ring-meta-blue h-10 overflow-hidden transition-colors">
                      <div className="pl-3 text-slate-400 shrink-0">
                        <Key className="h-4 w-4" />
                      </div>
                      <input
                        type={showToken ? "text" : "password"}
                        value={accessToken}
                        onChange={(e) => setAccessToken(e.target.value)}
                        placeholder={`填入 ${selectedPlatform === "shopify" ? "Shopify" : selectedPlatform === "shoplazza" ? "Shoplazza" : "SHOPLINE"} 秘钥`}
                        required
                        className="flex-1 min-w-0 h-full px-3 text-sm border-0 bg-transparent focus:outline-none focus:ring-0 text-slate-800 placeholder:text-slate-400 font-medium"
                      />
                      <button
                        type="button"
                        onClick={() => setShowToken(!showToken)}
                        className="pr-3 text-slate-400 hover:text-slate-600 transition-colors shrink-0 outline-none"
                      >
                        {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Domain */}
                <div className="col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">
                    <span>店铺域名 <span className="text-red-500">*</span></span>
                  </label>
                  <div className="flex items-center rounded-lg border border-slate-200 bg-white focus-within:border-meta-blue focus-within:ring-1 focus-within:ring-meta-blue h-10 transition-colors">
                    <input
                      type="text"
                      value={domainPrefix}
                      onChange={(e) => handleDomainChange(e.target.value)}
                      placeholder="例如: datevance"
                      required
                      className="flex-1 min-w-0 h-full px-3 text-sm border-0 bg-transparent focus:outline-none focus:ring-0 text-right font-semibold text-slate-800 placeholder:text-slate-400"
                    />
                    <div className="h-full flex items-center bg-[#f1f5f9] px-4 border-l border-slate-200 text-slate-700 text-sm select-none shrink-0 font-bold">
                      {getPlatformSuffix(selectedPlatform)}
                    </div>
                  </div>
                </div>

                {/* Timezone */}
                <div className="col-span-2 space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 block">
                    店铺时区
                  </label>
                  <div className="flex h-10 w-full items-center rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 gap-2 cursor-not-allowed">
                    <Globe className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="truncate">(GMT+08:00) 北京, 上海, 香港, 台北</span>
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4 mt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setNewStoreName("");
                    setDomainPrefix("");
                    setAccessToken("");
                    setSelectedPlatform("shopline");
                  }}
                  className="px-5 py-2.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium h-auto"
                  disabled={isSubmitting}
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  className="px-6 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 shadow-md shadow-blue-500/20 active:scale-95 h-auto"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "正在保存..." : "保存并创建"}
                </Button>
              </div>
            </form>

          </div>
        </div>
      )}
    </div>
  );
}
