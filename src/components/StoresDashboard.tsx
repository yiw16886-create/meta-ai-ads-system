import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Plus, Store, Link as LinkIcon, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function StoresDashboard() {
  const navigate = useNavigate();
  const [stores, setStores] = useState<any[]>([]);
  const [mappings, setMappings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // For modal (can be simplified)
  // Let's implement a very simple fetching logic first
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

  return (
    <div className="flex-1 overflow-y-auto space-y-6 pb-12">
      <div className="flex justify-between items-center bg-white p-6 rounded-[12px] shadow-sm border border-[#e5e7eb]">
        <div>
          <h2 className="text-xl font-bold">店铺管理</h2>
          <p className="text-sm text-gray-500 mt-1">
            管理独立站店铺，并关联对应的 Meta 广告账户
          </p>
        </div>
        <Button onClick={() => navigate("/store/new")}>添加店铺</Button>
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
                </div>

                <div className="flex items-center gap-2 text-sm text-gray-600 mt-4 border-t pt-4">
                  <LinkIcon className="h-4 w-4" />
                  <span>
                    已关联{" "}
                    {
                      mappings.filter(
                        (m) => m.store?.toLowerCase() === store.name?.toLowerCase()
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
    </div>
  );
}
