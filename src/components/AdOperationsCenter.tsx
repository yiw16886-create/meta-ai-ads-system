import React, { useState, useEffect } from "react";
import axios from "axios";
import {
  Megaphone,
  Plus,
  RefreshCw,
  ShieldCheck,
  History,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Clock,
  DollarSign,
  Globe,
  Search,
  X,
  Lock,
  Layers,
  Building2,
  ExternalLink,
  ChevronRight
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

interface CampaignItem {
  id: string;
  name: string;
  status: string;
  dailyBudget?: number;
  objective?: string;
  createdTime?: string;
}

interface ActionLogItem {
  id: string;
  action: string;
  accountId: string | null;
  status: string;
  requestJson: any;
  resultJson: any;
  errorMessage: string | null;
  createdAt: string;
}

export function AdOperationsCenter() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);

  // Tab & Search State
  const [activeTab, setActiveTab] = useState<"campaigns" | "logs">("campaigns");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "PAUSED">("ALL");

  // Draft Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftBudget, setDraftBudget] = useState("50");
  const [targetCountry, setTargetCountry] = useState("US");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Action Logs State
  const [actionLogs, setActionLogs] = useState<ActionLogItem[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Fetch Accounts
  const fetchAccounts = async () => {
    try {
      const res = await axios.get("/api/accounts");
      if (res.data && Array.isArray(res.data.data) && res.data.data.length > 0) {
        setAccounts(res.data.data);
        if (!selectedAccountId) {
          const firstAct = res.data.data[0].fb_account_id || res.data.data[0].id;
          setSelectedAccountId(firstAct);
        }
      } else {
        const mapRes = await axios.get("/api/mappings");
        if (Array.isArray(mapRes.data) && mapRes.data.length > 0) {
          const list = mapRes.data.map((m: any) => ({
            fb_account_id: m.accountId,
            name: m.accountName || m.accountId,
          }));
          setAccounts(list);
          if (!selectedAccountId) {
            setSelectedAccountId(list[0].fb_account_id);
          }
        }
      }
    } catch (e) {
      console.error("加载关联广告账户失败:", e);
    }
  };

  // Fetch Campaigns
  const fetchCampaigns = async (actId: string) => {
    if (!actId) return;
    setLoadingCampaigns(true);
    try {
      const cleanId = actId.replace(/^act_/, "").trim();
      const res = await axios.get(`/api/ad-operations/accounts/${cleanId}/campaigns`);
      if (res.data?.success) {
        setCampaigns(res.data.campaigns || []);
      }
    } catch (e: any) {
      console.error("加载广告系列失败:", e);
      toast.error(e.response?.data?.error || "加载广告系列失败");
    } finally {
      setLoadingCampaigns(false);
    }
  };

  // Fetch Action Logs
  const fetchActionLogs = async () => {
    setLoadingLogs(true);
    try {
      const res = await axios.get("/api/ad-operations/actions");
      if (res.data?.success) {
        setActionLogs(res.data.logs || []);
      }
    } catch (e) {
      console.error("加载操作日志失败:", e);
    } finally {
      setLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
    fetchActionLogs();
  }, []);

  useEffect(() => {
    if (selectedAccountId) {
      fetchCampaigns(selectedAccountId);
    }
  }, [selectedAccountId]);

  // Handle Draft Submit
  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountId) {
      toast.error("请先选择要创建草稿的广告账户");
      return;
    }
    if (!draftName.trim()) {
      toast.error("请输入草稿系列名称");
      return;
    }
    if (!draftBudget || Number(draftBudget) < 1) {
      toast.error("每日预算须至少为 1 美元");
      return;
    }

    setIsSubmitting(true);
    const submitToast = toast.loading("正在进行账户归属校验并下发 PAUSED 草稿...");

    try {
      const cleanId = selectedAccountId.replace(/^act_/, "").trim();
      const res = await axios.post("/api/ad-operations/drafts", {
        accountId: cleanId,
        name: draftName.trim(),
        dailyBudget: Number(draftBudget),
        targetCountry: targetCountry.trim() || undefined,
      });

      if (res.data?.success) {
        toast.success(`PAUSED 草稿下发成功！Campaign ID: ${res.data.campaignId}`, { id: submitToast });
        setDraftName("");
        setIsModalOpen(false);
        fetchCampaigns(selectedAccountId);
        fetchActionLogs();
      }
    } catch (e: any) {
      const errMsg = e.response?.data?.error || e.message || "创建草稿失败";
      toast.error(`创建草稿失败: ${errMsg}`, { id: submitToast, duration: 6000 });
      fetchActionLogs();
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered Campaigns
  const filteredCampaigns = campaigns.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "ALL" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const selectedAccountName =
    accounts.find(
      (a) => (a.fb_account_id || a.id || a.accountId) === selectedAccountId
    )?.name || selectedAccountId;

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-12">
      {/* 1. 顶部 Header 与 操作工具栏 */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 bg-blue-50 text-meta-blue rounded-xl flex items-center justify-center flex-shrink-0">
            <Megaphone className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              智能广告中心
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                PAUSED 安全模式
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              安全便捷地在拥有归属权力的 Meta 广告账户中创建销售系列草稿与核验审计日志
            </p>
          </div>
        </div>

        {/* 右侧控制组 */}
        <div className="flex flex-wrap items-center gap-3">
          {/* 账户切换 Dropdown */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5">
            <Building2 className="w-4 h-4 text-slate-400" />
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-700 outline-none cursor-pointer max-w-[220px] truncate"
            >
              {accounts.length === 0 ? (
                <option value="">暂无关联广告账户</option>
              ) : (
                accounts.map((acc) => {
                  const actId = acc.fb_account_id || acc.id || acc.accountId;
                  const name = acc.name || acc.accountName || actId;
                  return (
                    <option key={actId} value={actId}>
                      {name} ({actId.startsWith("act_") ? actId : `act_${actId}`})
                    </option>
                  );
                })
              )}
            </select>
          </div>

          <Button
            onClick={() => fetchCampaigns(selectedAccountId)}
            variant="outline"
            size="sm"
            disabled={loadingCampaigns}
            className="h-9 px-3.5 border-slate-200 text-slate-700 bg-white hover:bg-slate-50 text-xs font-semibold rounded-xl"
          >
            <RefreshCw className={cn("w-3.5 h-3.5 mr-1.5", loadingCampaigns && "animate-spin")} />
            刷新
          </Button>

          {/* 触发 Modal 弹窗的主要按键 */}
          <Button
            onClick={() => setIsModalOpen(true)}
            size="sm"
            className="h-9 px-4 bg-meta-blue hover:bg-blue-600 text-white font-bold text-xs rounded-xl shadow-sm gap-1.5"
          >
            <Plus className="w-4 h-4" />
            新建 PAUSED 草稿
          </Button>
        </div>
      </div>

      {/* 2. 状态 & 指标条 (KPI Strip) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border border-slate-200/80 shadow-sm bg-white rounded-xl p-4">
          <div className="text-slate-400 text-xs font-medium flex items-center justify-between">
            <span>关联 Meta 账户数</span>
            <Building2 className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-900 mt-2">
            {accounts.length} <span className="text-xs font-normal text-slate-400">个</span>
          </div>
        </Card>

        <Card className="border border-slate-200/80 shadow-sm bg-white rounded-xl p-4">
          <div className="text-slate-400 text-xs font-medium flex items-center justify-between">
            <span>当前选中账户</span>
            <Layers className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-xs font-bold font-mono text-slate-800 mt-2 truncate">
            {selectedAccountId ? (selectedAccountId.startsWith("act_") ? selectedAccountId : `act_${selectedAccountId}`) : "未选中"}
          </div>
        </Card>

        <Card className="border border-slate-200/80 shadow-sm bg-white rounded-xl p-4">
          <div className="text-slate-400 text-xs font-medium flex items-center justify-between">
            <span>当前账户 Campaign</span>
            <FileSpreadsheet className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-900 mt-2">
            {campaigns.length} <span className="text-xs font-normal text-slate-400">个系列</span>
          </div>
        </Card>

        <Card className="border border-emerald-100 bg-emerald-50/40 shadow-sm rounded-xl p-4">
          <div className="text-emerald-700 text-xs font-medium flex items-center justify-between">
            <span>下发防护状态</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-xs font-bold text-emerald-800 mt-2 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            PAUSED 强制暂停生效中
          </div>
        </Card>
      </div>

      {/* 3. Segmented Tab 控制栏 */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center space-x-6">
            <button
              onClick={() => setActiveTab("campaigns")}
              className={cn(
                "py-4 text-xs font-bold transition-all relative flex items-center gap-2",
                activeTab === "campaigns"
                  ? "text-meta-blue border-b-2 border-meta-blue"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              <FileSpreadsheet className="w-4 h-4" />
              广告系列管理 ({filteredCampaigns.length})
            </button>
            <button
              onClick={() => setActiveTab("logs")}
              className={cn(
                "py-4 text-xs font-bold transition-all relative flex items-center gap-2",
                activeTab === "logs"
                  ? "text-meta-blue border-b-2 border-meta-blue"
                  : "text-slate-500 hover:text-slate-800"
              )}
            >
              <History className="w-4 h-4" />
              操作与安全审计日志 ({actionLogs.length})
            </button>
          </div>

          {/* 状态安全提示线 */}
          <div className="hidden md:flex items-center gap-2 text-[11px] text-slate-400">
            <Lock className="w-3.5 h-3.5 text-slate-400" />
            所有操作均要求 Account Ownership 权属核验
          </div>
        </div>

        {/* TAB 1: Campaigns List */}
        {activeTab === "campaigns" && (
          <div className="p-6 space-y-4">
            {/* 列表顶部工具栏：搜索 & 状态 Filter */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="搜索 Campaign 名称 / ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-xs border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex items-center gap-1.5 self-end sm:self-auto bg-slate-100 p-1 rounded-xl">
                {(["ALL", "ACTIVE", "PAUSED"] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={cn(
                      "px-3 py-1 text-[11px] font-bold rounded-lg transition-all",
                      statusFilter === st
                        ? "bg-white text-slate-800 shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    )}
                  >
                    {st === "ALL" ? "全部状态" : st}
                  </button>
                ))}
              </div>
            </div>

            {/* Campaign 表格 */}
            <div className="border border-slate-100 rounded-xl overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="font-bold text-slate-700 text-xs">Campaign 名称 & ID</TableHead>
                    <TableHead className="font-bold text-slate-700 text-xs">投放状态</TableHead>
                    <TableHead className="font-bold text-slate-700 text-xs">每日预算</TableHead>
                    <TableHead className="font-bold text-slate-700 text-xs">广告目标</TableHead>
                    <TableHead className="font-bold text-slate-700 text-xs text-right">防护规则</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingCampaigns ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-40 text-center text-slate-400 text-xs">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-meta-blue" />
                        正在加载关联账户广告系列...
                      </TableCell>
                    </TableRow>
                  ) : filteredCampaigns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-40 text-center text-slate-400 text-xs">
                        未搜索到符合条件的 Campaign 记录
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredCampaigns.map((c) => {
                      const isPaused = c.status === "PAUSED";
                      const isActive = c.status === "ACTIVE";
                      return (
                        <TableRow key={c.id} className="hover:bg-slate-50/80 transition-colors">
                          <TableCell className="font-medium text-slate-800 py-3">
                            <div className="font-bold text-slate-900 text-xs">{c.name}</div>
                            <div className="text-[11px] font-mono text-slate-400 mt-0.5">ID: {c.id}</div>
                          </TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                "px-2.5 py-0.5 text-[11px] font-bold rounded-full inline-flex items-center gap-1",
                                isPaused && "bg-amber-50 text-amber-700 border border-amber-200",
                                isActive && "bg-emerald-50 text-emerald-700 border border-emerald-200",
                                !isPaused && !isActive && "bg-slate-100 text-slate-600"
                              )}
                            >
                              <span
                                className={cn(
                                  "w-1.5 h-1.5 rounded-full",
                                  isPaused && "bg-amber-500",
                                  isActive && "bg-emerald-500",
                                  !isPaused && !isActive && "bg-slate-400"
                                )}
                              />
                              {c.status}
                            </span>
                          </TableCell>
                          <TableCell className="font-mono text-xs font-semibold text-slate-700">
                            {c.dailyBudget !== undefined ? `$${c.dailyBudget.toFixed(2)} / 天` : "—"}
                          </TableCell>
                          <TableCell className="text-xs text-slate-600">
                            {c.objective || "OUTCOME_SALES"}
                          </TableCell>
                          <TableCell className="text-right text-xs text-slate-400">
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                              <ShieldCheck className="w-3 h-3 text-emerald-600" /> 权属受控
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* TAB 2: Action Logs */}
        {activeTab === "logs" && (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500">
                记录对 Meta API 调用的全部请求与返回结果，支持归属审计与异常追溯
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchActionLogs}
                disabled={loadingLogs}
                className="text-xs text-slate-600 hover:text-slate-900"
              >
                <RefreshCw className={cn("w-3.5 h-3.5 mr-1", loadingLogs && "animate-spin")} />
                刷新审计日志
              </Button>
            </div>

            <div className="border border-slate-100 rounded-xl overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="font-bold text-slate-700 text-xs">时间</TableHead>
                    <TableHead className="font-bold text-slate-700 text-xs">动作指令</TableHead>
                    <TableHead className="font-bold text-slate-700 text-xs">广告账户 ID</TableHead>
                    <TableHead className="font-bold text-slate-700 text-xs">处理状态</TableHead>
                    <TableHead className="font-bold text-slate-700 text-xs">响应明细 / 拦截信息</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingLogs ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center text-slate-400 text-xs">
                        正在加载操作与安全审计日志...
                      </TableCell>
                    </TableRow>
                  ) : actionLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="h-32 text-center text-slate-400 text-xs">
                        暂无相关广告操作记录
                      </TableCell>
                    </TableRow>
                  ) : (
                    actionLogs.map((log) => {
                      const isSuccess = log.status === "SUCCESS";
                      return (
                        <TableRow key={log.id} className="hover:bg-slate-50/80 transition-colors">
                          <TableCell className="font-mono text-xs text-slate-500 whitespace-nowrap">
                            {new Date(log.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell className="font-mono text-xs font-semibold text-slate-800">
                            {log.action}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-slate-600">
                            {log.accountId ? `act_${log.accountId}` : "—"}
                          </TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                "px-2 py-0.5 text-[10px] font-bold rounded-full inline-flex items-center gap-1",
                                isSuccess
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-red-50 text-red-700 border border-red-200"
                              )}
                            >
                              {log.status}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs text-slate-600 max-w-sm truncate">
                            {log.errorMessage ? (
                              <span className="text-red-600 font-mono text-[11px]">
                                {log.errorMessage}
                              </span>
                            ) : log.resultJson ? (
                              <span className="text-emerald-700 font-mono text-[11px]">
                                {JSON.stringify(log.resultJson)}
                              </span>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      {/* 4. MODAL 对话框：新建 PAUSED 销售草稿 */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div
            className="bg-white w-full max-w-lg rounded-2xl shadow-xl border border-slate-200 overflow-hidden relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-meta-blue flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">新建 Sales 销售广告草稿</h3>
                  <p className="text-[11px] text-slate-500">仅允许下发至您拥有归属权力的 Meta 广告账户</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full hover:bg-slate-200/60 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateDraft} className="p-6 space-y-4">
              {/* 账户选择 */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  目标 Meta 广告账户
                </label>
                <select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-meta-blue focus:bg-white"
                  required
                >
                  {accounts.map((acc) => {
                    const actId = acc.fb_account_id || acc.id || acc.accountId;
                    const name = acc.name || acc.accountName || actId;
                    return (
                      <option key={actId} value={actId}>
                        {name} ({actId.startsWith("act_") ? actId : `act_${actId}`})
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* 草稿系列名称 */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  草稿系列名称 (Campaign Name)
                </label>
                <Input
                  placeholder="例如: US_Summer_Sale_Campaign_Draft"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className="h-10 text-xs border-slate-200 rounded-xl"
                  required
                />
              </div>

              {/* 每日预算 与 国家/地区 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                    每日预算 ($ USD)
                  </label>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="50"
                    value={draftBudget}
                    onChange={(e) => setDraftBudget(e.target.value)}
                    className="h-10 text-xs font-mono border-slate-200 rounded-xl"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Globe className="w-3.5 h-3.5 text-slate-400" />
                    目标国家/地区
                  </label>
                  <Input
                    placeholder="US"
                    value={targetCountry}
                    onChange={(e) => setTargetCountry(e.target.value)}
                    className="h-10 text-xs uppercase font-mono border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              {/* 安全与机制指示说明 */}
              <div className="bg-amber-50/70 border border-amber-200/80 p-3 rounded-xl space-y-1 text-xs text-amber-900">
                <div className="font-bold flex items-center gap-1 text-amber-950">
                  <ShieldCheck className="w-4 h-4 text-amber-600" />
                  强制 PAUSED 暂停防护警示
                </div>
                <p className="text-[11px] leading-relaxed text-amber-800">
                  草稿下发后状态将严格锁定为 <strong>PAUSED (暂停)</strong>，绝不会直接进入 ACTIVE 投放状态，请安心至 Meta 官方后台预览与复核。
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsModalOpen(false)}
                  className="h-10 px-4 text-xs font-semibold border-slate-200 text-slate-600 rounded-xl"
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting || !selectedAccountId}
                  className="h-10 px-5 bg-meta-blue hover:bg-blue-600 text-white font-bold text-xs rounded-xl shadow-sm gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      下发草稿中...
                    </>
                  ) : (
                    <>
                      确认下发 PAUSED 草稿
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
