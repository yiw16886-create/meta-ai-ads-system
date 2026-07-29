import React, { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Loader2,
  SearchX,
  ShieldCheck,
  Calendar,
} from "lucide-react";

type DeletionRequest = {
  confirmationCode: string;
  status: "RECEIVED" | "COMPLETED" | "NO_DATA" | "FAILED";
  requestedAt: string;
  completedAt: string | null;
};

export function DeletionStatusPage() {
  const [searchParams] = useSearchParams();
  const confirmationCode = searchParams.get("id") || searchParams.get("code") || "";
  const [request, setRequest] = useState<DeletionRequest | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!confirmationCode) {
      setError("缺少删除确认编号，无法查询处理状态。");
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    fetch(`/api/auth/facebook/deletion-status/${encodeURIComponent(confirmationCode)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !body.success) {
          throw new Error(body.error || "无法查询删除状态");
        }
        setRequest(body.deletionRequest);
      })
      .catch((fetchError) => {
        if (fetchError.name !== "AbortError") {
          setError(fetchError.message || "无法查询删除状态");
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [confirmationCode]);

  const status = request?.status;
  const isComplete = status === "COMPLETED" || status === "NO_DATA";
  const statusLabel =
    status === "COMPLETED"
      ? "已删除 (Completed)"
      : status === "NO_DATA"
        ? "未发现可删除数据"
        : status === "FAILED"
          ? "处理失败"
          : "处理中";
  const date = request?.completedAt || request?.requestedAt;
  const dateStr = date
    ? new Date(date).toLocaleString("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  const StatusIcon = loading
    ? Loader2
    : error
      ? SearchX
      : status === "FAILED"
        ? AlertCircle
        : isComplete
          ? CheckCircle2
          : Clock3;

  return (
    <div className="min-h-screen bg-gray-50 py-16 px-4 sm:px-6 lg:px-8 font-sans flex items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-8 text-center">
          <div
            className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-6 ${
              error || status === "FAILED"
                ? "bg-red-50 text-red-500"
                : isComplete
                  ? "bg-emerald-50 text-emerald-500"
                  : "bg-amber-50 text-amber-500"
            }`}
          >
            <StatusIcon className={`w-10 h-10 ${loading ? "animate-spin" : ""}`} />
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            {loading ? "正在查询删除状态" : error ? "无法查询删除申请" : "数据删除申请状态"}
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            {loading
              ? "正在读取服务器记录，请稍候。"
              : error
                ? error
                : status === "COMPLETED"
                  ? "服务器已完成删除并核验相关 Facebook 授权及同步数据。"
                  : status === "NO_DATA"
                    ? "系统中未找到与该 Facebook 用户关联的可删除数据。"
                    : status === "FAILED"
                      ? "删除任务未通过完成核验，请联系管理员处理。"
                      : "申请已受理，服务器仍在处理或等待核验。"}
          </p>

          <div className="bg-gray-50 rounded-lg p-5 mb-8 text-left space-y-3 border border-gray-100">
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-400">处理状态</span>
              <span className="font-semibold bg-white px-2 py-0.5 rounded text-gray-700">
                {loading ? "查询中" : error ? "未知" : statusLabel}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs gap-4">
              <span className="text-gray-400 flex items-center gap-1 shrink-0">
                <ShieldCheck className="w-3.5 h-3.5" /> 确认编号
              </span>
              <span className="text-gray-800 font-mono font-bold break-all text-right">
                {confirmationCode || "—"}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs gap-4">
              <span className="text-gray-400 flex items-center gap-1 shrink-0">
                <Calendar className="w-3.5 h-3.5" /> 状态时间
              </span>
              <span className="text-gray-700 font-mono text-right">{dateStr}</span>
            </div>
          </div>

          <p className="text-xs text-gray-400 leading-relaxed mb-8 text-center px-2">
            本页面只展示服务器中已持久化的删除任务状态，不会生成确认编号或推测删除结果。
          </p>

          <div className="space-y-3">
            <Link
              to="/"
              className="block w-full text-center py-2.5 px-4 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-sm font-medium transition-colors"
            >
              返回系统首页
            </Link>
            <Link
              to="/privacy"
              className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> 参阅隐私政策
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
