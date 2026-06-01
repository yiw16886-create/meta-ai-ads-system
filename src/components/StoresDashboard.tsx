import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Plus, Store, Link as LinkIcon, Trash2, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function StoresDashboard({ startDate, endDate }: { startDate?: Date; endDate?: Date }) {
  const navigate = useNavigate();
  const [stores, setStores] = useState<any[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // States for store deletion
  const [deletingStoreId, setDeletingStoreId] = useState<number | null>(null);
  const [deleteStoreName, setDeleteStoreName] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

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

  const fetchStoresAndMappings = async () => {
    setLoading(true);
    try {
      const [storesRes, mappingsRes] = await Promise.all([
        axios.get("/api/stores"),
        axios.get("/api/mappings")
      ]);
      setStores(Array.isArray(storesRes.data) ? storesRes.data : []);
      setMappings(Array.isArray(mappingsRes.data) ? mappingsRes.data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStoresAndMappings();
  }, []);

  const handleDeleteStore = async (storeId: number) => {
    setDeleteLoading(true);
    try {
      const res = await axios.delete(`/api/stores/${storeId}`);
      toast.success(res.data.message || "店铺删除成功");
      setDeletingStoreId(null);
      setDeleteStoreName("");
      // Refresh list
      fetchStoresAndMappings();
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.error || "删除店铺失败，请重试");
    } finally {
      setDeleteLoading(false);
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
          <Button onClick={() => navigate("/store/new")}>添加店铺</Button>
        </div>
      </div>

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
            <Button onClick={() => navigate("/store/new")}>
              <Plus className="h-4 w-4 mr-2" />
              添加第一个店铺
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {stores.map((store) => (
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
                      <h3 className="font-bold text-gray-900">{store.name}</h3>
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

                <div className="flex items-center gap-2 text-sm text-gray-600 mt-4 border-t pt-4">
                  <LinkIcon className="h-4 w-4" />
                  <span>
                    已关联{" "}
                    {
                      mappings.filter(
                        (m) => (m.store || "").toLowerCase() === (store.name || "").toLowerCase()
                      ).length
                    }{" "}
                    个广告账户
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
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
    </div>
  );
}
