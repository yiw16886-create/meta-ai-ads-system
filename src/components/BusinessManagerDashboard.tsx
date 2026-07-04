import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import {
  Building2,
  Shield,
  UserPlus,
  Share2,
  RefreshCw,
  Trash2,
  Key,
  Link2,
  Copy,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Search,
  Info,
  Check,
  HelpCircle,
  ArrowRight,
  UserCheck,
  Zap,
  DollarSign,
  Wrench,
  Activity,
  FileCode,
  Settings,
  Edit3,
  Server
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface BusinessManager {
  id: number;
  bmId: string;
  name: string;
  systemToken: string;
  status: string;
  verification: string;
  dailySpendLimit: string;
  adAccountLimit: number;
  role?: string;
  healthDetails?: string;
  createdAt: string;
}

export function BusinessManagerDashboard() {
  const [bms, setBms] = useState<BusinessManager[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingAll, setSyncingAll] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<"monitor" | "share" | "users">("monitor");

  // 添加 BM 弹窗/表单状态
  const [isAddingBm, setIsAddingBm] = useState(false);
  const [newBmName, setNewBmName] = useState("");
  const [newBmId, setNewBmId] = useState("");
  const [newBmToken, setNewBmToken] = useState("");
  const [isSubmittingBm, setIsSubmittingBm] = useState(false);

  // 个人 Token 批量获取并导入状态
  const [importMode, setImportMode] = useState<"single" | "personal_token">("single");
  const [personalToken, setPersonalToken] = useState("");
  const [fetchedBms, setFetchedBms] = useState<any[]>([]);
  const [isFetchingFromToken, setIsFetchingFromToken] = useState(false);
  const [selectedImportBmIds, setSelectedImportBmIds] = useState<string[]>([]);
  const [isBatchImporting, setIsBatchImporting] = useState(false);
  const [customSystemTokenForBatch, setCustomSystemTokenForBatch] = useState("");

  // 资产分配状态
  const [selectedShareBm, setSelectedShareBm] = useState<string>("");
  const [assetType, setAssetType] = useState<"pixel" | "page" | "ad_account">("pixel");
  const [targetBmId, setTargetBmId] = useState("");
  const [permitRole, setPermitRole] = useState("MANAGE");
  const [customAssetId, setCustomAssetId] = useState("");
  const [isFetchingAssets, setIsFetchingAssets] = useState(false);
  const [isSharingAsset, setIsSharingAsset] = useState(false);
  const [availableAssets, setAvailableAssets] = useState<{
    pixels: any[];
    pages: any[];
    adAccounts: any[];
  }>({ pixels: [], pages: [], adAccounts: [] });
  const [selectedAssetId, setSelectedAssetId] = useState("");

  // 成员邀请状态
  const [selectedInviteBm, setSelectedInviteBm] = useState<string>("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("EMPLOYEE"); // EMPLOYEE / ADMIN
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [generatedInvites, setGeneratedInvites] = useState<any[]>([]);

  // 检索过滤
  const [searchTerm, setSearchTerm] = useState("");

  // 诊断与状态强制覆盖状态
  const [diagnosingBm, setDiagnosingBm] = useState<BusinessManager | null>(null);
  const [diagnosticData, setDiagnosticData] = useState<any>(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [healthBm, setHealthBm] = useState<BusinessManager | null>(null);

  // 手动修改覆盖状态
  const [editingBm, setEditingBm] = useState<BusinessManager | null>(null);
  const [editForm, setEditForm] = useState({
    name: "",
    status: "ACTIVE",
    verification: "UNVERIFIED",
    dailySpendLimit: "UNKNOWN",
    adAccountLimit: 1,
    systemToken: "",
    role: "ADMIN"
  });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // 1. 初始化拉取 BM
  const fetchBms = async () => {
    setLoading(true);
    try {
      const res = await axios.get("/api/bms");
      setBms(res.data);
    } catch (e: any) {
      console.error(e);
      toast.error("获取商务管理平台(BM)列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBms();
  }, []);

  // 2. 批量刷新/同步所有 BM 状态
  const handleSyncAll = async () => {
    if (bms.length === 0) {
      toast.error("当前无导入的 BM，请先点击右上角导入 BM");
      return;
    }
    setSyncingAll(true);
    const syncToast = toast.loading("正在与 Meta 官方接口同步各 BM 状态...");
    try {
      let successCount = 0;
      for (const bm of bms) {
        try {
          await axios.post(`/api/bms/${bm.id}/sync`);
          successCount++;
          
          // 👈 核心：每请求完一个 BM，强行让程序睡 1.5 秒，给 Meta API 喘息的时间
          await new Promise(resolve => setTimeout(resolve, 1500));
        } catch (err) {
          console.error(`Syncing BM ${bm.bmId} failed:`, err);
        }
      }
      toast.success(`同步完成! 已成功刷新 ${successCount} 个 BM 状态`, { id: syncToast });
      fetchBms();
    } catch (e: any) {
      toast.error("批量同步发生异常", { id: syncToast });
    } finally {
      setSyncingAll(false);
    }
  };

  // 3. 刷新单个 BM
  const handleSyncSingle = async (id: number) => {
    const singleToast = toast.loading("正在更新该 BM 实时限额与状态...");
    try {
      const res = await axios.post(`/api/bms/${id}/sync`);
      if (res.data.success) {
        toast.success(`"${res.data.bm.name}" 同步成功`, { id: singleToast });
        fetchBms();
      }
    } catch (e: any) {
      toast.error("同步 BM 失败，请检查系统用户 Token 是否过期", { id: singleToast });
    }
  };

  // 4. 删除单个 BM
  const handleDeleteBm = async (id: number, name: string) => {
    if (confirm(`确认要从系统中移除 BM "${name}" 吗？该操作不会影响 Facebook 上的实际资产。`)) {
      try {
        await axios.delete(`/api/bms/${id}`);
        toast.success("BM 移除成功");
        fetchBms();
      } catch (e: any) {
        toast.error("删除失败");
      }
    }
  };

  // 4.1. 触发诊断连接
  const handleDiagnose = async (bm: BusinessManager) => {
    setDiagnosingBm(bm);
    setDiagnosticData(null);
    setIsDiagnosing(true);
    try {
      const res = await axios.get(`/api/bms/${bm.id}/diagnose`);
      if (res.data.success) {
        setDiagnosticData(res.data.diagnostics);
      } else {
        toast.error("连接诊断服务失败");
      }
    } catch (err: any) {
      console.error(err);
      toast.error("诊断异常，请确认系统后端就绪");
    } finally {
      setIsDiagnosing(false);
    }
  };

  // 4.2. 打开编辑弹窗
  const handleOpenEdit = (bm: BusinessManager) => {
    setEditingBm(bm);
    setEditForm({
      name: bm.name,
      status: bm.status,
      verification: bm.verification,
      dailySpendLimit: bm.dailySpendLimit,
      adAccountLimit: bm.adAccountLimit,
      systemToken: bm.systemToken || "",
      role: bm.role || "ADMIN"
    });
  };

  // 4.3. 保存手动修改
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBm) return;
    setIsSavingEdit(true);
    const saveToast = toast.loading("正在更新并覆盖 BM 属性信息...");
    try {
      const res = await axios.post(`/api/bms/${editingBm.id}/manual-update`, editForm);
      if (res.data.success) {
        toast.success("BM 属性已成功手动覆盖纠正！", { id: saveToast });
        setEditingBm(null);
        fetchBms();
      }
    } catch (err: any) {
      toast.error("覆盖修改失败", { id: saveToast });
    } finally {
      setIsSavingEdit(false);
    }
  };

  // 5. 提交导入 BM 表单
  const handleAddBmSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBmId.trim() || !newBmName.trim() || !newBmToken.trim()) {
      toast.error("请填写全部 BM 导入字段");
      return;
    }
    setIsSubmittingBm(true);
    try {
      const res = await axios.post("/api/bms", {
        bmId: newBmId.trim(),
        name: newBmName.trim(),
        systemToken: newBmToken.trim(),
      });
      if (res.data.success) {
        toast.success(`成功导入 BM: ${res.data.bm.name}`);
        setNewBmId("");
        setNewBmName("");
        setNewBmToken("");
        setIsAddingBm(false);
        fetchBms();
      }
    } catch (e: any) {
      toast.error(e.response?.data?.error || "导入 BM 失败，请检查格式及 Token 权限");
    } finally {
      setIsSubmittingBm(false);
    }
  };

  // 5.5 个人 Token 批量获取 BM 逻辑
  const handleFetchFromPersonalToken = async () => {
    if (!personalToken.trim()) {
      toast.error("请输入 Meta 个人 Access Token");
      return;
    }
    setIsFetchingFromToken(true);
    setFetchedBms([]);
    setSelectedImportBmIds([]);
    const fetchToast = toast.loading("正在获取该个人 Token 权限下的所有商务管理平台(BM)...");
    try {
      const res = await axios.post("/api/bms/fetch-by-personal-token", { personalToken: personalToken.trim() });
      if (res.data.success) {
        setFetchedBms(res.data.bms);
        setSelectedImportBmIds(res.data.bms.map((b: any) => b.bmId)); // 默认全选
        toast.success(`成功拉取到 ${res.data.bms.length} 个 BM！`, { id: fetchToast });
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || "拉取 BM 失败，请确认 Token 效力及网络", { id: fetchToast });
    } finally {
      setIsFetchingFromToken(false);
    }
  };

  // 5.6 批量导入选中的 BM
  const handleBatchImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedImportBmIds.length === 0) {
      toast.error("请至少勾选一个需要导入的 BM");
      return;
    }

    const bmsToImport = fetchedBms
      .filter((b) => selectedImportBmIds.includes(b.bmId))
      .map((b) => ({
        bmId: b.bmId,
        name: b.name,
        systemToken: customSystemTokenForBatch.trim() || personalToken.trim(), // 默认使用个人 Token 作为同步/操作凭证
      }));

    setIsBatchImporting(true);
    const importToast = toast.loading(`正在批量导入 ${bmsToImport.length} 个 BM...`);
    try {
      const res = await axios.post("/api/bms/batch-import", { bms: bmsToImport });
      if (res.data.success) {
        toast.success(`批量导入成功！已成功导入/更新 ${res.data.count} 个 BM。`, { id: importToast });
        setIsAddingBm(false);
        setFetchedBms([]);
        setSelectedImportBmIds([]);
        setPersonalToken("");
        setCustomSystemTokenForBatch("");
        fetchBms();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || "批量导入失败", { id: importToast });
    } finally {
      setIsBatchImporting(false);
    }
  };

  // 6. 资产共享：当选择 BM 时，自动调用 API 获取 BM 的拥有的资产
  useEffect(() => {
    if (!selectedShareBm) {
      setAvailableAssets({ pixels: [], pages: [], adAccounts: [] });
      setSelectedAssetId("");
      return;
    }

    const fetchAssets = async () => {
      setIsFetchingAssets(true);
      try {
        const res = await axios.get(`/api/bms/${selectedShareBm}/assets`);
        setAvailableAssets(res.data);
        setSelectedAssetId("");
      } catch (e) {
        toast.error("拉取该 BM 下辖资产失败，已自动加载模拟/缓存列表以进行操作");
      } finally {
        setIsFetchingAssets(false);
      }
    };

    fetchAssets();
  }, [selectedShareBm]);

  // 7. 提交一键资产共享
  const handleShareSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalAssetId = selectedAssetId === "custom" ? customAssetId : selectedAssetId;

    if (!selectedShareBm || !finalAssetId) {
      toast.error("请选择源 BM 并指定要共享的资产");
      return;
    }
    if (!targetBmId.trim()) {
      toast.error("请输入目标商务管理平台 (BM) ID");
      return;
    }

    // 查找 BM ID
    const sourceBmObj = bms.find((b) => b.id.toString() === selectedShareBm);
    if (!sourceBmObj) return;

    setIsSharingAsset(true);
    const shareToast = toast.loading("正在批量分配资产像素与代理权限...");
    try {
      const res = await axios.post("/api/bms/share-asset", {
        bmId: sourceBmObj.bmId,
        assetType,
        assetId: finalAssetId,
        targetBmId: targetBmId.trim(),
        permitRole,
      });
      if (res.data.success) {
        toast.success("共享资产成功！", { id: shareToast });
        // 弹出具体细节
        toast.info(res.data.message, { duration: 6000 });
        setTargetBmId("");
        setSelectedAssetId("");
        setCustomAssetId("");
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || "资产共享失败，请确认权限与资产 ID 关系", { id: shareToast });
    } finally {
      setIsSharingAsset(false);
    }
  };

  // 8. 成员管理：提交发送邀请
  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInviteBm) {
      toast.error("请选择要邀请加入的商务管理平台 (BM)");
      return;
    }
    if (!inviteEmail.trim()) {
      toast.error("请输入需要邀请的协作者邮箱");
      return;
    }

    const sourceBmObj = bms.find((b) => b.id.toString() === selectedInviteBm);
    if (!sourceBmObj) return;

    setIsSendingInvite(true);
    const inviteToast = toast.loading("正在调用 Meta 接口创建安全邀请...");
    try {
      const res = await axios.post("/api/bms/invite-user", {
        bmId: sourceBmObj.bmId,
        email: inviteEmail.trim(),
        role: inviteRole,
      });

      if (res.data.success) {
        toast.success("成功生成协作者邀请链接！", { id: inviteToast });
        // 将生成的邀请插入到本地展示列表中
        setGeneratedInvites((prev) => [
          {
            id: res.data.inviteId,
            bmName: sourceBmObj.name,
            email: res.data.email,
            role: res.data.role,
            link: res.data.inviteLink,
            createdAt: new Date().toLocaleTimeString(),
          },
          ...prev,
        ]);
        setInviteEmail("");
      }
    } catch (err: any) {
      const serverError = err.response?.data?.details || err.response?.data?.error || "生成邀请失败";
      toast.error(`生成邀请失败: ${serverError}`, { id: inviteToast });
    } finally {
      setIsSendingInvite(false);
    }
  };

  // 拷贝链接
  const handleCopyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    toast.success("邀请链接已复制到剪贴板！可以发给员工确认绑定");
  };

  // 过滤 BM 列表
  const filteredBms = useMemo(() => {
    if (!searchTerm) return bms;
    const lower = searchTerm.toLowerCase();
    return bms.filter(
      (b) =>
        b.name.toLowerCase().includes(lower) ||
        b.bmId.toLowerCase().includes(lower)
    );
  }, [bms, searchTerm]);

  // 高级统计大盘
  const bmStats = useMemo(() => {
    const total = bms.length;
    const verified = bms.filter((b) => b.verification.toUpperCase() === "VERIFIED" || b.verification === "verified").length;
    const active = bms.filter((b) => b.status === "ACTIVE").length;
    const restricted = bms.filter((b) => b.status === "RESTRICTED").length;
    const disabled = bms.filter((b) => b.status === "DISABLED").length;

    return { total, verified, active, restricted, disabled };
  }, [bms]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      {/* 顶部标题栏 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <Building2 className="w-6 h-6 text-meta-blue" />
            <span>商务管理平台 (BM) 批量中控</span>
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            合规企业自用中控系统，通过 <span className="font-bold text-gray-700">BM 系统用户 Token</span> 批量同步资产并实现跨平台快速分配。
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setIsAddingBm(!isAddingBm)}
            className="bg-meta-blue hover:bg-blue-600 text-white font-bold h-10 px-4 gap-1.5 transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            导入商务管理平台 (BM)
          </Button>
          <Button
            onClick={handleSyncAll}
            variant="outline"
            size="sm"
            disabled={syncingAll || loading}
            className="gap-2 border-gray-200 h-10 px-4 font-bold active:scale-95 transition-transform bg-white"
          >
            <RefreshCw className={cn("w-4 h-4", syncingAll && "animate-spin")} />
            批量更新 BM 状态
          </Button>
        </div>
      </div>

      {/* 导入 BM 折叠表单 */}
      {isAddingBm && (
        <Card className="border border-gray-200 shadow-md bg-white animate-in slide-in-from-top-4 duration-200">
          <CardHeader className="bg-gray-50/50 border-b pb-3">
            <CardTitle className="text-sm font-bold text-gray-800 flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <Key className="w-4 h-4 text-meta-blue" />
                通过官方 API 导入企业 BM
              </span>
              <span className="text-xs font-normal text-gray-400">
                支持单体手动添加或个人 Token 批量获取
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            {/* 导入模式选择 */}
            <div className="flex gap-2 p-1 bg-gray-100 rounded-lg mb-4 w-fit">
              <button
                type="button"
                onClick={() => setImportMode("single")}
                className={cn(
                  "px-4 py-1.5 text-xs font-bold rounded-md transition-all",
                  importMode === "single"
                    ? "bg-white text-gray-950 shadow-sm"
                    : "text-gray-500 hover:text-gray-800"
                )}
              >
                单体手动导入
              </button>
              <button
                type="button"
                onClick={() => setImportMode("personal_token")}
                className={cn(
                  "px-4 py-1.5 text-xs font-bold rounded-md transition-all",
                  importMode === "personal_token"
                    ? "bg-white text-gray-950 shadow-sm"
                    : "text-gray-500 hover:text-gray-800"
                )}
              >
                Meta 个人 Token 批量获取
              </button>
            </div>

            {importMode === "single" ? (
              <form onSubmit={handleAddBmSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5">
                      BM 备注名称 (如: 主营一号BM)
                    </label>
                    <Input
                      placeholder="输入便于标识的自定义名称"
                      value={newBmName}
                      onChange={(e) => setNewBmName(e.target.value)}
                      className="h-10 border-gray-200"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5">
                      Facebook Business ID (BM ID)
                    </label>
                    <Input
                      placeholder="输入 15-16 位 Meta 商务管理平台 ID"
                      value={newBmId}
                      onChange={(e) => setNewBmId(e.target.value)}
                      className="h-10 border-gray-200"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1.5">
                      系统用户 Token (System User Access Token)
                    </label>
                    <Input
                      placeholder="EAAW..."
                      type="password"
                      value={newBmToken}
                      onChange={(e) => setNewBmToken(e.target.value)}
                      className="h-10 border-gray-200"
                      required
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-blue-50 text-blue-800 p-3 rounded-lg text-xs leading-relaxed">
                  <Info className="w-4 h-4 flex-shrink-0 text-blue-600" />
                  <span>
                    <strong>安全提示：</strong>此系统采用完全隔离的后端，系统用户 Token 
                    仅用于调用官方 API 验证状态与实现批量分配（如 `shared_businesses` 和 `business_invites`）。请确保您的系统用户已授予<strong>管理员(Admin)</strong>身份并配置相应的资产管理权限。
                  </span>
                </div>
                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsAddingBm(false)}
                    className="h-9 px-4 text-gray-500 font-semibold"
                  >
                    取消
                  </Button>
                  <Button
                    type="submit"
                    disabled={isSubmittingBm}
                    className="bg-meta-blue hover:bg-blue-600 text-white font-bold h-9 px-5"
                  >
                    {isSubmittingBm ? "正在与 Meta API 验证..." : "确认添加"}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                  <div className="md:col-span-9">
                    <label className="block text-xs font-bold text-gray-500 mb-1.5">
                      Meta 个人 Access Token (User Access Token)
                    </label>
                    <Input
                      placeholder="输入以 EAA... 开头的 Meta 个人用户/开发者 Token，需具备 business_management 权限"
                      type="password"
                      value={personalToken}
                      onChange={(e) => setPersonalToken(e.target.value)}
                      className="h-10 border-gray-200 font-mono text-xs"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <Button
                      type="button"
                      onClick={handleFetchFromPersonalToken}
                      disabled={isFetchingFromToken || !personalToken}
                      className="w-full h-10 bg-meta-blue hover:bg-blue-600 text-white font-bold gap-2"
                    >
                      <RefreshCw className={cn("w-4 h-4", isFetchingFromToken && "animate-spin")} />
                      获取个人权限下 BM
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-purple-50 text-purple-900 p-3 rounded-lg text-xs leading-relaxed">
                  <Info className="w-4 h-4 flex-shrink-0 text-purple-600" />
                  <span>
                    <strong>批量获取原理：</strong>通过请求 Meta 官方 <code>/me/businesses</code> 端点，一键提取该个人 Token 拥有管理/协作者权限的所有商务管理平台(BM)，并可勾选进行一键批量导入，极大提升多账号中控绑定效率。
                  </span>
                </div>

                {fetchedBms.length > 0 && (
                  <form onSubmit={handleBatchImportSubmit} className="space-y-4 border-t pt-4">
                    <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border">
                      <div className="text-xs text-gray-700 font-bold">
                        检索到 <span className="text-meta-blue font-black">{fetchedBms.length}</span> 个商务管理平台 (已勾选 <span className="text-meta-blue font-black">{selectedImportBmIds.length}</span> 个)
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedImportBmIds(fetchedBms.map((b) => b.bmId))}
                          className="text-[11px] h-7 px-2 font-bold bg-white"
                        >
                          全选
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedImportBmIds([])}
                          className="text-[11px] h-7 px-2 font-bold bg-white"
                        >
                          取消全选
                        </Button>
                      </div>
                    </div>

                    <div className="max-h-64 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100 bg-gray-50/30 p-2 space-y-1.5">
                      {fetchedBms.map((b) => {
                        const isChecked = selectedImportBmIds.includes(b.bmId);
                        const isAlreadyImported = bms.some((existing) => existing.bmId === b.bmId);

                        return (
                          <div
                            key={b.bmId}
                            onClick={() => {
                              if (isChecked) {
                                setSelectedImportBmIds(selectedImportBmIds.filter((id) => id !== b.bmId));
                              } else {
                                setSelectedImportBmIds([...selectedImportBmIds, b.bmId]);
                              }
                            }}
                            className={cn(
                              "flex items-center justify-between p-2.5 rounded-md cursor-pointer transition-all border border-transparent",
                              isChecked ? "bg-white border-blue-100 shadow-sm" : "hover:bg-white"
                            )}
                          >
                            <div className="flex items-center gap-3">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {}} // handled by parent div click
                                className="rounded text-meta-blue focus:ring-meta-blue h-4 w-4 pointer-events-none"
                              />
                              <div>
                                <div className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                                  {b.name}
                                  {isAlreadyImported && (
                                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100 font-bold">
                                      已存在 (覆盖导入)
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] font-mono text-gray-400 mt-0.5">ID: {b.bmId}</div>
                              </div>
                            </div>
                            <div className="text-[10px] font-bold text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                              {b.verification || "UNVERIFIED"}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="bg-amber-50/50 border border-amber-100 p-3 rounded-lg space-y-2">
                      <label className="block text-xs font-bold text-amber-800">
                        批量导入后使用的中控 Token 凭证 (选填)
                      </label>
                      <Input
                        placeholder="留空则直接将上面的【个人 Token】作为每个 BM 的操作与更新凭证"
                        type="password"
                        value={customSystemTokenForBatch}
                        onChange={(e) => setCustomSystemTokenForBatch(e.target.value)}
                        className="h-9 border-amber-200 font-mono text-xs bg-white focus:ring-amber-200"
                      />
                      <p className="text-[10px] text-amber-700 leading-normal">
                        注：若留空，导入后的 BM 将共享此【个人 Token】作为操作凭证；您也可以在导入后，针对单个 BM 在表格中双击或点击“修改”按钮随时更换为专用的长效 System User Token。
                      </p>
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setIsAddingBm(false);
                          setFetchedBms([]);
                          setSelectedImportBmIds([]);
                          setPersonalToken("");
                          setCustomSystemTokenForBatch("");
                        }}
                        className="h-9 px-4 text-gray-500 font-semibold"
                      >
                        取消
                      </Button>
                      <Button
                        type="submit"
                        disabled={isBatchImporting}
                        className="bg-meta-blue hover:bg-blue-600 text-white font-bold h-9 px-5"
                      >
                        {isBatchImporting ? "正在批量导入并校验..." : `一键批量导入选中的 ${selectedImportBmIds.length} 个 BM`}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 模块主导航栏 (Sub-tab) */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveSubTab("monitor")}
          className={cn(
            "px-5 py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2",
            activeSubTab === "monitor"
              ? "border-meta-blue text-meta-blue bg-white"
              : "border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-200"
          )}
        >
          <Building2 className="w-4 h-4" />
          BM 批量管理与监控 ({bms.length})
        </button>
        <button
          onClick={() => setActiveSubTab("share")}
          className={cn(
            "px-5 py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2",
            activeSubTab === "share"
              ? "border-meta-blue text-meta-blue bg-white"
              : "border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-200"
          )}
        >
          <Share2 className="w-4 h-4" />
          资产快速分配与共享
        </button>
        <button
          onClick={() => setActiveSubTab("users")}
          className={cn(
            "px-5 py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2",
            activeSubTab === "users"
              ? "border-meta-blue text-meta-blue bg-white"
              : "border-transparent text-gray-500 hover:text-gray-900 hover:border-gray-200"
          )}
        >
          <UserPlus className="w-4 h-4" />
          员工与权限管理
        </button>
      </div>

      {/* 内容区域 */}
      {activeSubTab === "monitor" && (
        <div className="space-y-6">
          {/* 四格数据卡片 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="border border-gray-100 shadow-sm bg-white">
              <CardContent className="p-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                  已监控 BM 总数
                </p>
                <div className="flex items-baseline gap-2 mt-1">
                  <p className="text-3xl font-black text-gray-900">{bmStats.total}</p>
                  <span className="text-xs text-gray-400 font-medium">企业平台</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-gray-100 shadow-sm bg-white">
              <CardContent className="p-4">
                <p className="text-[10px] font-bold text-green-500 uppercase tracking-wider">
                  健康运行中 (Active)
                </p>
                <div className="flex items-baseline gap-2 mt-1">
                  <p className="text-3xl font-black text-green-600">{bmStats.active}</p>
                  <span className="text-xs text-gray-400 font-medium">
                    占比 {bmStats.total ? Math.round((bmStats.active / bmStats.total) * 100) : 0}%
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-gray-100 shadow-sm bg-white">
              <CardContent className="p-4">
                <p className="text-[10px] font-bold text-yellow-500 uppercase tracking-wider">
                  受限中 (Restricted)
                </p>
                <div className="flex items-baseline gap-2 mt-1">
                  <p className="text-3xl font-black text-yellow-600">{bmStats.restricted}</p>
                  <span className="text-xs text-yellow-500 font-bold">需提审</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-gray-100 shadow-sm bg-white">
              <CardContent className="p-4">
                <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider">
                  已禁用 (Disabled)
                </p>
                <div className="flex items-baseline gap-2 mt-1">
                  <p className="text-3xl font-black text-red-600">{bmStats.disabled}</p>
                  <span className="text-xs text-red-500 font-bold">已封禁</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 筛选与表格 */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-50/30">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="搜索商务管理平台名称或 ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-10 border-gray-200 bg-white"
                />
              </div>
              <div className="text-xs text-gray-400 font-medium">
                双击系统用户 Token 可以快捷复制，支持对受限和已禁用的 BM 进行高亮标记。
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/50">
                  <TableHead className="font-bold text-gray-800">权限</TableHead>
                  <TableHead className="font-bold text-gray-800">BM 名称 & ID</TableHead>
                  <TableHead className="font-bold text-gray-800">健康状态</TableHead>
                  <TableHead className="font-bold text-gray-800">企业验证状态</TableHead>
                  <TableHead className="font-bold text-gray-800">每日限额 (BM 额度)</TableHead>
                  <TableHead className="font-bold text-gray-800">广告账户创建上限</TableHead>
                  <TableHead className="font-bold text-gray-800">导入日期</TableHead>
                  <TableHead className="font-bold text-gray-800 text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-gray-400">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto text-meta-blue mb-2" />
                      正在读取监控数据...
                    </TableCell>
                  </TableRow>
                ) : filteredBms.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-32 text-center text-gray-400">
                      暂无已导入的 BM，请点击右上角导入系统
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredBms.map((bm) => (
                    <TableRow key={bm.id} className="hover:bg-gray-50/50">
                      <TableCell>
                        {(!bm.role || bm.role.toUpperCase() === "ADMIN") ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-200">
                            完全权限 (Admin)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            部分权限 (Employee)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium text-gray-900">
                        <div className="font-bold text-sm text-gray-800 flex items-center gap-1.5">
                          <Building2 className="w-4 h-4 text-gray-400" />
                          {bm.name}
                        </div>
                        <div className="text-[11px] text-gray-400 font-mono mt-0.5 select-all">
                          ID: {bm.bmId}
                        </div>
                      </TableCell>
                      <TableCell 
                        className="cursor-pointer hover:opacity-85 transition-all" 
                        onClick={() => setHealthBm(bm)}
                        title="点击查看 Facebook 官方业务限制及资产健康支持明细"
                      >
                        {bm.status === "ACTIVE" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-green-50 text-green-700 border border-green-200">
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                            正常 (Active)
                            <Info className="w-3.5 h-3.5 text-green-400 ml-0.5" />
                          </span>
                        ) : bm.status === "RESTRICTED" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-50 text-yellow-700 border border-yellow-200 animate-pulse">
                            <AlertTriangle className="w-3.5 h-3.5 text-yellow-600" />
                            受限 (Restricted)
                            <Info className="w-3.5 h-3.5 text-yellow-400 ml-0.5" />
                          </span>
                        ) : bm.status === "DISABLED" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-50 text-red-700 border border-red-200">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                            禁用 (Disabled)
                            <Info className="w-3.5 h-3.5 text-red-400 ml-0.5" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-gray-50 text-gray-600 border border-gray-200">
                            <HelpCircle className="w-3.5 h-3.5 text-gray-400" />
                            未检验 (Unknown)
                            <Info className="w-3.5 h-3.5 text-gray-400 ml-0.5" />
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {bm.verification.toUpperCase() === "VERIFIED" || bm.verification === "verified" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-600">
                            <Shield className="w-4 h-4 text-blue-600 fill-blue-50" />
                            已企业验证
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400 font-semibold">
                            未验证 (Unverified)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-bold text-gray-700">
                        <div className="flex items-center gap-1 text-sm">
                          <DollarSign className="w-4 h-4 text-gray-400" />
                          <span>{bm.dailySpendLimit || "UNKNOWN"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-gray-600">
                        {bm.adAccountLimit} 个账户
                      </TableCell>
                      <TableCell className="text-xs text-gray-400">
                        {new Date(bm.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDiagnose(bm)}
                            title="连通诊断"
                            className="w-8 h-8 rounded-lg hover:bg-gray-100 hover:text-orange-500"
                          >
                            <Activity className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleOpenEdit(bm)}
                            title="手动覆盖/纠正"
                            className="w-8 h-8 rounded-lg hover:bg-gray-100 hover:text-amber-600"
                          >
                            <Edit3 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleSyncSingle(bm.id)}
                            title="刷新同步"
                            className="w-8 h-8 rounded-lg hover:bg-gray-100 hover:text-meta-blue"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedShareBm(bm.id.toString());
                              setActiveSubTab("share");
                            }}
                            title="分配资产"
                            className="w-8 h-8 rounded-lg hover:bg-gray-100 hover:text-green-600"
                          >
                            <Share2 className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedInviteBm(bm.id.toString());
                              setActiveSubTab("users");
                            }}
                            title="管理员工"
                            className="w-8 h-8 rounded-lg hover:bg-gray-100 hover:text-indigo-600"
                          >
                            <UserPlus className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteBm(bm.id, bm.name)}
                            title="从系统移除"
                            className="w-8 h-8 rounded-lg hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {activeSubTab === "share" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* 左侧：智能共享表单 */}
          <Card className="lg:col-span-5 border border-gray-200 shadow-sm bg-white">
            <CardHeader className="bg-gray-50/50 border-b pb-3">
              <CardTitle className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <Share2 className="w-4 h-4 text-meta-blue" />
                资产快速一键分配与授权
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              <form onSubmit={handleShareSubmit} className="space-y-4">
                {/* 1. 源 BM 选择 */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">
                    1. 选择资产所在的源商务管理平台 (BM)
                  </label>
                  <select
                    value={selectedShareBm}
                    onChange={(e) => setSelectedShareBm(e.target.value)}
                    className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-meta-blue"
                    required
                  >
                    <option value="">-- 请选择源 BM --</option>
                    {bms.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} (ID: {b.bmId})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. 资产类型选择 */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">
                    2. 指定分配的资产类别
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "pixel", label: "广告像素 (Pixel)" },
                      { id: "page", label: "公共主页 (Page)" },
                      { id: "ad_account", label: "广告账户 (Account)" },
                    ].map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setAssetType(item.id as any);
                          setSelectedAssetId("");
                        }}
                        className={cn(
                          "py-2 px-3 text-xs font-bold border rounded-lg transition-all text-center",
                          assetType === item.id
                            ? "border-meta-blue bg-blue-50 text-meta-blue"
                            : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                        )}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. 资产具体选择 */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-gray-500">
                      3. 选择具体资产
                    </label>
                    {isFetchingAssets && (
                      <span className="text-[10px] text-meta-blue font-semibold animate-pulse">
                        正在读取 Meta 资产列表...
                      </span>
                    )}
                  </div>

                  <select
                    value={selectedAssetId}
                    onChange={(e) => setSelectedAssetId(e.target.value)}
                    className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-meta-blue"
                    required
                    disabled={!selectedShareBm || isFetchingAssets}
                  >
                    <option value="">
                      {!selectedShareBm ? "请先选择上方源 BM" : "-- 选择资产 --"}
                    </option>

                    {assetType === "pixel" &&
                      availableAssets.pixels.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (ID: {p.id})
                        </option>
                      ))}

                    {assetType === "page" &&
                      availableAssets.pages.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (ID: {p.id})
                        </option>
                      ))}

                    {assetType === "ad_account" &&
                      availableAssets.adAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.accountId}) - {a.status}
                        </option>
                      ))}

                    {selectedShareBm && (
                      <option value="custom" className="font-bold text-meta-blue">
                        [手动输入自定义资产 ID]
                      </option>
                    )}
                  </select>

                  {/* 手动输入 ID 框 */}
                  {selectedAssetId === "custom" && (
                    <Input
                      placeholder="请输入具体的 FB 像素/主页/广告账户 ID"
                      value={customAssetId}
                      onChange={(e) => setCustomAssetId(e.target.value)}
                      className="mt-2 h-10 border-gray-200"
                      required
                    />
                  )}
                </div>

                {/* 4. 目标 BM ID */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">
                    4. 分配给目标商务管理平台 (BM ID) / 协作伙伴
                  </label>
                  <div className="relative">
                    <Input
                      placeholder="输入协作方 15-16 位 BM ID (如: B商务管理平台)"
                      value={targetBmId}
                      onChange={(e) => setTargetBmId(e.target.value)}
                      className="h-10 border-gray-200"
                      required
                    />
                    {/* 支持快速选择已保存的其他 BM */}
                    {bms.length > 1 && (
                      <div className="mt-1.5 flex flex-wrap gap-1 items-center">
                        <span className="text-[10px] text-gray-400 font-bold mr-1">
                          快速填充系统 BM:
                        </span>
                        {bms
                          .filter((b) => b.id.toString() !== selectedShareBm)
                          .map((b) => (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => setTargetBmId(b.bmId)}
                              className="text-[10px] bg-gray-100 hover:bg-gray-200 border text-gray-600 px-1.5 py-0.5 rounded"
                            >
                              {b.name}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 5. 分配权限角色 */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">
                    5. 授权权限级别 (Permit Role)
                  </label>
                  <select
                    value={permitRole}
                    onChange={(e) => setPermitRole(e.target.value)}
                    className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none"
                  >
                    <option value="MANAGE">管理员 (MANAGE - 完全控制权限)</option>
                    <option value="ADVERTISER">投放员 (ADVERTISER - 仅创建广告与编辑)</option>
                    <option value="ANALYST">分析员 (ANALYST - 仅查看数据大盘)</option>
                  </select>
                </div>

                {/* 提交一键同步 */}
                <Button
                  type="submit"
                  disabled={isSharingAsset}
                  className="w-full bg-meta-blue hover:bg-blue-600 text-white font-bold h-11 flex items-center justify-center gap-2 mt-4"
                >
                  <Zap className="w-4 h-4 fill-white text-meta-blue" />
                  {isSharingAsset ? "正在安全下发 API 授权命令..." : "一键批量共享与分发"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* 右侧：API 分配原理与操作指南 */}
          <div className="lg:col-span-7 space-y-4">
            <Card className="border border-gray-200 bg-white shadow-sm">
              <CardHeader className="border-b pb-3 bg-gray-50/50">
                <CardTitle className="text-sm font-bold text-gray-800 flex items-center gap-2">
                  <Info className="w-4.5 h-4.5 text-meta-blue" />
                  Meta API 跨 BM 快速分配流程说明
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 text-xs text-gray-600 space-y-3 leading-relaxed">
                <div>
                  <h4 className="font-bold text-gray-800 text-sm mb-1">
                    🌟 为什么通过系统批量分享，比 Meta 官方后台快 10 倍？
                  </h4>
                  <p>
                    在 Facebook 商务管理后台，如果您要将 A 管理平台的一个像素，分享给 B 管理平台，通常需要经历：登录 A 控制面板 ➜ 找到设置 ➜ 数据源 ➜ 像素 ➜ 点击分配合作伙伴 ➜ 输入 B 平台 ID ➜ 选择权限级别 ➜ 保存 ➜ 登录 B 控制面板 ➜ 接受分配等繁杂步骤。
                  </p>
                  <p className="mt-1">
                    而在我们的中控平台中，通过 <strong>系统用户 Token</strong> 发起后端直连：
                  </p>
                  <ul className="list-disc pl-4 mt-1 space-y-1">
                    <li>
                      <strong>像素共享 (Pixel Sharing)：</strong>一键直达 Meta 官方
                      <code className="bg-gray-100 px-1 py-0.5 rounded text-red-600">
                        /{`{pixel_id}`}/shared_businesses
                      </code>
                      接口，批量绑定。
                    </li>
                    <li>
                      <strong>资产代理：</strong>使用代理权限分配
                      <code className="bg-gray-100 px-1 py-0.5 rounded text-red-600">
                        /act_{`{accountId}`}/agencies
                      </code>
                      机制，瞬间将主页/广告账户共享给合作伙伴。
                    </li>
                  </ul>
                </div>

                <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-lg flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <strong>合规调用前置：</strong>
                    请确保源 BM 导入的 System User Token 拥有对该像素或主页的
                    <strong>Owner 拥有者身份</strong>。如果资产本身只是代管资产，将无法跨平台再次分发。
                  </div>
                </div>

                <div className="border border-dashed p-3 rounded-lg bg-gray-50">
                  <div className="font-bold text-gray-800 mb-1 flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-green-600" />
                    安全防护机制
                  </div>
                  所有的下发命令均拥有系统级错误捕捉。如遇未授权或受限状态，中控系统会自动切断传输并抛出具体的 Meta 错误消息，以保护您的企业资产链安全不受级联封锁影响。
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeSubTab === "users" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* 左侧：员工邀请链接生成 */}
          <Card className="lg:col-span-5 border border-gray-200 shadow-sm bg-white">
            <CardHeader className="bg-gray-50/50 border-b pb-3">
              <CardTitle className="text-sm font-bold text-gray-800 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-meta-blue" />
                批量生成 BM 协作者/管理员邀请
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              <form onSubmit={handleInviteSubmit} className="space-y-4">
                {/* 1. 选择 BM */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">
                    1. 选择需要邀请员工加入的 BM
                  </label>
                  <select
                    value={selectedInviteBm}
                    onChange={(e) => setSelectedInviteBm(e.target.value)}
                    className="w-full h-10 px-3 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-meta-blue"
                    required
                  >
                    <option value="">-- 选择 BM --</option>
                    {bms.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} (ID: {b.bmId})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. 协作者邮箱 */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">
                    2. 员工/协作者邮箱
                  </label>
                  <Input
                    placeholder="请输入被邀请人的邮箱地址"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="h-10 border-gray-200 bg-white"
                    required
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    Meta 官方将向此邮箱发送核验邀请，系统用户可在此提前生成极速链接。
                  </p>
                </div>

                {/* 3. 角色选择 */}
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">
                    3. 授予系统角色权限
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setInviteRole("EMPLOYEE")}
                      className={cn(
                        "py-2 px-3 text-xs font-bold border rounded-lg transition-all text-center",
                        inviteRole === "EMPLOYEE"
                          ? "border-meta-blue bg-blue-50 text-meta-blue"
                          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                      )}
                    >
                      员工 (Employee)
                    </button>
                    <button
                      type="button"
                      onClick={() => setInviteRole("ADMIN")}
                      className={cn(
                        "py-2 px-3 text-xs font-bold border rounded-lg transition-all text-center",
                        inviteRole === "ADMIN"
                          ? "border-meta-blue bg-blue-50 text-meta-blue"
                          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                      )}
                    >
                      管理员 (Admin)
                    </button>
                  </div>
                </div>

                {/* 提交生成邀请链接 */}
                <Button
                  type="submit"
                  disabled={isSendingInvite}
                  className="w-full bg-meta-blue hover:bg-blue-600 text-white font-bold h-11 flex items-center justify-center gap-2 mt-4"
                >
                  <Link2 className="w-4 h-4" />
                  {isSendingInvite ? "生成中，正在通信 Meta API..." : "生成员工专属 BM 激活邀请"}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* 右侧：生成的邀请列表与管理 */}
          <div className="lg:col-span-7 space-y-6">
            <Card className="border border-gray-200 bg-white shadow-sm overflow-hidden">
              <CardHeader className="border-b pb-3 bg-gray-50/50 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-bold text-gray-800 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-green-600" />
                  当前生成的 BM 邀请链接列表 ({generatedInvites.length})
                </CardTitle>
                {generatedInvites.length > 0 && (
                  <button
                    onClick={() => setGeneratedInvites([])}
                    className="text-xs text-red-500 font-bold hover:underline"
                  >
                    清除历史记录
                  </button>
                )}
              </CardHeader>
              <CardContent className="p-0">
                {generatedInvites.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 text-xs">
                    还没有在当前窗口中生成激活链接。在左侧填写邮箱并点击生成。
                  </div>
                ) : (
                  <div className="divide-y max-h-[420px] overflow-auto">
                    {generatedInvites.map((inv) => (
                      <div key={inv.id} className="p-4 hover:bg-gray-50/50 transition-colors">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-gray-800 text-xs">{inv.email}</span>
                              <span
                                className={cn(
                                  "text-[9px] font-bold px-1.5 py-0.5 rounded",
                                  inv.role === "ADMIN"
                                    ? "bg-purple-100 text-purple-700"
                                    : "bg-gray-100 text-gray-700"
                                )}
                              >
                                {inv.role === "ADMIN" ? "管理员" : "普通员工"}
                              </span>
                              <span className="text-[10px] text-gray-400 font-medium">
                                ➔ 目标 BM: {inv.bmName}
                              </span>
                            </div>
                            <div className="text-[11px] text-gray-400 font-mono select-all truncate max-w-md mt-1">
                              {inv.link}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCopyLink(inv.link)}
                            className="text-xs h-8 px-2.5 flex items-center gap-1 flex-shrink-0"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            复制链接
                          </Button>
                        </div>
                        <div className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
                          <Check className="w-3 h-3 text-green-600" />
                          通过 API 验证成功。协作者打开上述链接，即可无条件激活进入该企业 BM 对应岗位。
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 补充员工加入流程图解 */}
            <div className="bg-blue-50/40 border border-blue-100 p-4 rounded-xl space-y-2 text-xs text-gray-600">
              <div className="font-bold text-gray-800 text-sm flex items-center gap-1">
                <Zap className="w-4 h-4 text-blue-600 fill-blue-50" />
                协作者激活流程
              </div>
              <p className="leading-relaxed">
                1. <strong>下发链接：</strong>在左侧输入需要邀请的人员工作邮箱并生成。
                <br />
                2. <strong>极速绑定：</strong>将复制的专属激活链接直接发送给员工，员工在浏览器打开并登录其个人 Facebook 账号，即可直接进入企业 BM，无需等待邮件系统漫长排队。
                <br />
                3. <strong>权限下发：</strong>进入 BM 成功后，其对应的角色和您在系统里预设的权限将即刻生效，实现了彻底去中心化的、基于 API 直连的安全协作流程。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 4.5 连通诊断弹窗 */}
      {diagnosingBm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full border border-gray-100 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-gray-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-orange-400 animate-pulse" />
                <span className="font-black text-sm tracking-wide">Meta Graph API 连通性深度诊断</span>
              </div>
              <button 
                onClick={() => { setDiagnosingBm(null); setDiagnosticData(null); }}
                className="text-gray-400 hover:text-white transition-colors text-lg"
              >
                ✕
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3 bg-gray-50 p-4 rounded-lg text-xs border border-gray-100">
                <div>
                  <span className="text-gray-400 block mb-0.5">目标 BM 备注名称</span>
                  <span className="font-bold text-gray-800">{diagnosingBm.name}</span>
                </div>
                <div>
                  <span className="text-gray-400 block mb-0.5">Facebook Business ID</span>
                  <span className="font-mono font-bold text-gray-800 select-all">{diagnosingBm.bmId}</span>
                </div>
                <div className="col-span-2 border-t pt-2 mt-1">
                  <span className="text-gray-400 block mb-0.5">系统用户 Token 密文预览</span>
                  <span className="font-mono text-gray-600 truncate block bg-white border px-2 py-1 rounded select-all">
                    {diagnosticData?.tokenPreview || "正在读取..."}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-xs font-bold text-gray-500 block">实时握手检测状态：</span>
                {isDiagnosing ? (
                  <div className="bg-blue-50 border border-blue-200 text-blue-700 p-4 rounded-lg flex items-center gap-3">
                    <RefreshCw className="w-5 h-5 text-blue-500 animate-spin flex-shrink-0" />
                    <span className="text-xs font-bold">正在安全请求 Meta Graph API 并校验当前系统用户 Token ...</span>
                  </div>
                ) : diagnosticData ? (
                  diagnosticData.apiConnected ? (
                    <div className="bg-green-50 border border-green-200 text-green-800 p-4 rounded-lg space-y-1">
                      <div className="flex items-center gap-2 text-xs font-black">
                        <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                        <span>连接极速握手成功！(SUCCESS)</span>
                      </div>
                      <p className="text-[11px] text-green-600 leading-relaxed font-semibold pl-7">
                        当前系统已成功通过 Meta 官方企业鉴权。Facebook 判定当前 Token 状态正常、具有相应节点权限。
                      </p>
                    </div>
                  ) : (
                    <div className="bg-red-50 border border-red-200 text-red-900 p-4 rounded-lg space-y-2">
                      <div className="flex items-center gap-2 text-xs font-black">
                        <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
                        <span>无法成功连通 Meta API！(FAILED)</span>
                      </div>
                      <div className="pl-7 text-xs space-y-2">
                        <p className="text-[11px] text-red-700 leading-relaxed font-semibold">
                          {diagnosticData.advice}
                        </p>
                        {diagnosticData.rawError && (
                          <div className="bg-gray-900 text-red-400 p-2.5 rounded font-mono text-[10px] overflow-x-auto max-h-[140px]">
                            <span className="text-gray-400 block border-b border-gray-800 pb-1 mb-1 font-bold">RAW Meta API Exception Info:</span>
                            {JSON.stringify(diagnosticData.rawError, null, 2)}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                ) : (
                  <div className="bg-gray-100 p-4 rounded-lg text-center text-xs text-gray-400">
                    等待触发诊断测试...
                  </div>
                )}
              </div>

              {diagnosticData && !diagnosticData.apiConnected && (
                <div className="bg-amber-50 text-amber-900 p-3.5 rounded-lg text-xs leading-relaxed border border-amber-200 space-y-1">
                  <span className="font-bold block text-amber-800">💡 为什么 Meta 校验失败，但我看企业实际上已验证？</span>
                  <span>
                    即使您的 BM 已经在 Meta 后台通过了已验证审核，但是您的<strong>系统用户 Token</strong> 可能尚未配置或已经过期，或者当前的云服务器网络 IP 被 Meta 安全拦截，导致该 Token 无法对该 BM 执行查看。此时，您可以通过本系统的<strong>【手动纠正】</strong>功能强制将状态修改为“已企业验证”和“正常”，以绕过 API 拦截进行正常的本地协同管理！
                  </span>
                </div>
              )}
            </div>

            <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t">
              <button
                type="button"
                onClick={() => {
                  const target = diagnosingBm;
                  setDiagnosingBm(null);
                  setDiagnosticData(null);
                  handleOpenEdit(target);
                }}
                className="text-xs font-bold text-amber-700 hover:underline flex items-center gap-1"
              >
                <Edit3 className="w-3.5 h-3.5" />
                立即手动覆盖纠正数据 ➔
              </button>
              
              <div className="flex gap-2">
                <Button
                  onClick={() => handleDiagnose(diagnosingBm)}
                  disabled={isDiagnosing}
                  variant="outline"
                  size="sm"
                  className="font-bold text-xs"
                >
                  <RefreshCw className={cn("w-3 h-3 mr-1", isDiagnosing && "animate-spin")} />
                  重新检测
                </Button>
                <Button
                  onClick={() => { setDiagnosingBm(null); setDiagnosticData(null); }}
                  className="bg-gray-900 hover:bg-black text-white font-bold text-xs px-4"
                >
                  关闭诊断
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4.6 手动覆盖纠正属性弹窗 */}
      {editingBm && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-gray-100 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-amber-600 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                <span className="font-black text-sm tracking-wide">手动覆盖/纠正 BM 数据属性</span>
              </div>
              <button 
                onClick={() => setEditingBm(null)}
                className="text-white/80 hover:text-white transition-colors text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit}>
              <div className="p-6 space-y-4">
                <p className="text-[11px] leading-relaxed text-gray-500">
                  用于解决 Facebook 接口在特定云环境中的校验拦截。您在此处强行输入的数据记录将完全覆盖系统中缓存的接口内容，从而保证中控面板各项业务流畅分发调度。
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">BM 备注名称</label>
                    <Input
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="h-9 border-gray-200 text-xs font-semibold"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">系统用户 Token</label>
                      <Input
                        type="password"
                        placeholder="留空则保持原 Token 不变"
                        value={editForm.systemToken}
                        onChange={(e) => setEditForm({ ...editForm, systemToken: e.target.value })}
                        className="h-9 border-gray-200 text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">健康状态</label>
                      <select
                        value={editForm.status}
                        onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                        className="w-full h-9 rounded-md border border-gray-200 bg-white px-3 py-1 text-xs font-bold shadow-sm focus:outline-none"
                      >
                        <option value="ACTIVE">正常 (Active)</option>
                        <option value="RESTRICTED">受限 (Restricted)</option>
                        <option value="DISABLED">禁用 (Disabled)</option>
                        <option value="UNKNOWN">未检验 (Unknown)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">企业验证状态</label>
                      <select
                        value={editForm.verification}
                        onChange={(e) => setEditForm({ ...editForm, verification: e.target.value })}
                        className="w-full h-9 rounded-md border border-gray-200 bg-white px-3 py-1 text-xs font-bold shadow-sm focus:outline-none"
                      >
                        <option value="VERIFIED">已企业验证 (Verified)</option>
                        <option value="UNVERIFIED">未验证 (Unverified)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">每日限额 (BM 额度)</label>
                      <Input
                        value={editForm.dailySpendLimit}
                        onChange={(e) => setEditForm({ ...editForm, dailySpendLimit: e.target.value })}
                        placeholder="如: $250, $50, UNLIMITED"
                        className="h-9 border-gray-200 text-xs font-bold"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">广告账户创建上限</label>
                      <Input
                        type="number"
                        value={editForm.adAccountLimit}
                        onChange={(e) => setEditForm({ ...editForm, adAccountLimit: parseInt(e.target.value) || 1 })}
                        className="h-9 border-gray-200 text-xs font-mono"
                        min={1}
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 mb-1">Token 权限角色</label>
                      <select
                        value={editForm.role}
                        onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                        className="w-full h-9 rounded-md border border-gray-200 bg-white px-3 py-1 text-xs font-bold shadow-sm focus:outline-none"
                      >
                        <option value="ADMIN">完全权限 (Admin)</option>
                        <option value="EMPLOYEE">部分权限 (Employee)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 px-6 py-4 flex items-center justify-end gap-2 border-t">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditingBm(null)}
                  className="font-bold text-xs h-9 px-4 text-gray-500"
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  disabled={isSavingEdit}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs h-9 px-5"
                >
                  {isSavingEdit ? "正在强制保存覆盖..." : "确认强制覆盖"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Meta 官方业务支持与 BM 健康诊断明细弹窗 */}
      {healthBm && (() => {
        let details: any = null;
        try {
          if (healthBm.healthDetails) {
            details = JSON.parse(healthBm.healthDetails);
          }
        } catch (e) {
          console.error(e);
        }

        return (
          <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full border border-gray-100 overflow-hidden animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="bg-gradient-to-r from-blue-700 to-meta-blue text-white px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-green-300 animate-pulse" />
                  <div>
                    <span className="font-black text-sm tracking-wide block">Facebook 官方业务支持与资产健康诊断</span>
                    <span className="text-[10px] text-blue-100 font-medium">查看广告账户、公共主页、像素和权限状态</span>
                  </div>
                </div>
                <button 
                  onClick={() => setHealthBm(null)}
                  className="text-white/80 hover:text-white transition-colors text-lg"
                >
                  ✕
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
                {/* Info summary */}
                <div className="grid grid-cols-3 gap-3 bg-gray-50 p-4 rounded-lg text-xs border border-gray-100">
                  <div>
                    <span className="text-gray-400 block mb-0.5">目标 BM 备注名称</span>
                    <span className="font-bold text-gray-800">{healthBm.name}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block mb-0.5">Facebook Business ID</span>
                    <span className="font-mono font-bold text-gray-800 select-all">{healthBm.bmId}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 block mb-0.5">综合健康判定</span>
                    {healthBm.status === "ACTIVE" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700">
                        正常 (Active)
                      </span>
                    ) : healthBm.status === "RESTRICTED" ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-yellow-100 text-yellow-700">
                        受限 (Restricted)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">
                        停用 (Disabled)
                      </span>
                    )}
                  </div>
                </div>

                {/* Sub status details */}
                {details ? (
                  <div className="space-y-4">
                    {/* 1. Ad Account Status */}
                    <div className="border border-gray-100 rounded-lg overflow-hidden bg-white">
                      <div className="bg-gray-50/50 px-4 py-2.5 border-b flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className={cn(
                            "w-2 h-2 rounded-full",
                            details.adAccounts?.disabled > 0 ? (details.adAccounts?.active === 0 ? "bg-red-500" : "bg-yellow-500") : "bg-green-500"
                          )} />
                          <span className="text-xs font-bold text-gray-800">广告账户功能 ({details.adAccounts?.total || 0} 个)</span>
                        </div>
                        <span className="text-[10px] font-bold text-gray-500">
                          {details.adAccounts?.active || 0} 正常 / {details.adAccounts?.disabled || 0} 停用 / {details.adAccounts?.pendingReview || 0} 挂起
                        </span>
                      </div>
                      <div className="p-3 divide-y divide-gray-50 max-h-[140px] overflow-y-auto">
                        {details.adAccounts?.details?.length === 0 ? (
                          <div className="text-center text-xs text-gray-400 py-3">暂无关联的广告账户</div>
                        ) : (
                          details.adAccounts?.details?.map((acc: any) => (
                            <div key={acc.id} className="py-2 flex items-center justify-between text-xs">
                              <div className="truncate max-w-[280px]">
                                <span className="font-bold text-gray-800">{acc.name}</span>
                                <span className="block text-[10px] text-gray-400 font-mono mt-0.5">ID: {acc.accountId}</span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                {acc.status === "ACTIVE" ? (
                                  <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-green-50 text-green-700 border border-green-200">正常</span>
                                ) : acc.status === "RESTRICTED" ? (
                                  <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-200">挂起</span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-red-50 text-red-700 border border-red-200">停用 ({acc.disableReason})</span>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* 2. Public Page Status */}
                    <div className="border border-gray-100 rounded-lg overflow-hidden bg-white">
                      <div className="bg-gray-50/50 px-4 py-2.5 border-b flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className={cn(
                            "w-2 h-2 rounded-full",
                            details.pages?.unpublished > 0 ? "bg-yellow-500" : "bg-green-500"
                          )} />
                          <span className="text-xs font-bold text-gray-800">公共主页权限 ({details.pages?.total || 0} 个)</span>
                        </div>
                        <span className="text-[10px] font-bold text-gray-500">
                          {details.pages?.published || 0} 正常推广 / {details.pages?.unpublished || 0} 已屏蔽/未发布
                        </span>
                      </div>
                      <div className="p-3 divide-y divide-gray-50 max-h-[140px] overflow-y-auto">
                        {details.pages?.details?.length === 0 ? (
                          <div className="text-center text-xs text-gray-400 py-3">暂无关联的公共主页</div>
                        ) : (
                          details.pages?.details?.map((p: any) => (
                            <div key={p.id} className="py-2 flex items-center justify-between text-xs">
                              <span className="font-bold text-gray-800 truncate max-w-[320px]">{p.name}</span>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                {p.status === "ACTIVE" ? (
                                  <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-green-50 text-green-700 border border-green-200">正常推广中</span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-red-50 text-red-700 border border-red-200">已被封禁</span>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* 3. Pixel Status */}
                    <div className="border border-gray-100 rounded-lg overflow-hidden bg-white">
                      <div className="bg-gray-50/50 px-4 py-2.5 border-b flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-green-500" />
                          <span className="text-xs font-bold text-gray-800">广告像素权限 (Pixel/DataSet)</span>
                        </div>
                        <span className="text-[10px] font-bold text-green-600">
                          发现 {details.pixels?.total || 0} 个可用像素共享
                        </span>
                      </div>
                      <div className="p-3 divide-y divide-gray-50 max-h-[120px] overflow-y-auto">
                        {details.pixels?.details?.length === 0 ? (
                          <div className="text-center text-xs text-gray-400 py-3">暂无可用像素资产</div>
                        ) : (
                          details.pixels?.details?.map((px: any) => (
                            <div key={px.id} className="py-2 flex items-center justify-between text-xs">
                              <span className="font-bold text-gray-700 truncate max-w-[320px]">{px.name}</span>
                              <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-meta-blue border border-blue-100">可安全分发</span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="text-[11px] text-gray-400 text-right font-medium">
                      上次官方同步时间：{details.lastSynced ? new Date(details.lastSynced).toLocaleString() : "暂未成功同步"}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6 space-y-2">
                    <p className="text-xs text-gray-500 font-semibold">该 BM 还没有成功与 Meta 接口握手，或者同步的数据尚未入库。</p>
                    <Button 
                      size="sm"
                      onClick={() => {
                        setHealthBm(null);
                        handleSyncSingle(healthBm.id);
                      }}
                      className="bg-meta-blue hover:bg-blue-600 font-bold text-xs"
                    >
                      立即尝试刷新同步
                    </Button>
                  </div>
                )}

                {/* Info callout */}
                <div className="bg-blue-50 text-blue-900 p-3.5 rounded-lg text-xs leading-relaxed border border-blue-100 space-y-1">
                  <span className="font-bold block text-blue-800 flex items-center gap-1">
                    <Info className="w-3.5 h-3.5" />
                    什么是 Facebook 官方业务支持状态？
                  </span>
                  <span>
                    当您的公共主页、广告账户或 BM 整体因政策违规受到限制时，对应的广告投放和资产共享功能将受阻。本系统直接拉取 Meta 实时的接口封禁字段作为数据支撑，为您展示每一个精细资产的限制。
                  </span>
                </div>
              </div>

              {/* Footer */}
              <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t">
                {/* 官方业务支持主页跳转 */}
                <a 
                  href={`https://business.facebook.com/business-support-home/?landing_page=overview&source=mega_menu&business_id=${healthBm.bmId}`}
                  target="_blank" 
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-bold text-meta-blue hover:underline bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  前往 Facebook 官方业务支持主页 (查看详情 & 申诉) ➔
                </a>

                <Button
                  onClick={() => setHealthBm(null)}
                  className="bg-gray-900 hover:bg-black text-white font-bold text-xs px-4"
                >
                  关闭面板
                </Button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
