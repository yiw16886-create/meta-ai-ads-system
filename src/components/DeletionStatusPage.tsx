import React from "react";
import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle2, ArrowLeft, ShieldCheck, Calendar } from "lucide-react";

export function DeletionStatusPage() {
  const [searchParams] = useSearchParams();
  const id = searchParams.get("id") || searchParams.get("code") || "DEL-" + Math.random().toString(36).substr(2, 9).toUpperCase();
  const dateStr = new Date().toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-gray-50 py-16 px-4 sm:px-6 lg:px-8 font-sans flex items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-8 text-center">
          {/* Status Icon */}
          <div className="mx-auto w-16 h-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-6">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-gray-900 mb-2">数据删除申请已受理</h1>
          <p className="text-sm text-gray-500 mb-6">
            根据 Facebook 开放平台政策，我们已彻底清除您绑定的 Facebook 账户数据。
          </p>

          {/* Details Box */}
          <div className="bg-gray-50 rounded-lg p-5 mb-8 text-left space-y-3 border border-gray-100">
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-400">处理状态</span>
              <span className="text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded">
                已删除 (Completed)
              </span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-gray-400" /> 确认编号 (Confirmation Code)
              </span>
              <span className="text-gray-800 font-mono font-bold">{id}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-gray-400 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-gray-400" /> 受理时间
              </span>
              <span className="text-gray-700 font-mono">{dateStr}</span>
            </div>
          </div>

          {/* Explanatory notes */}
          <p className="text-xs text-gray-400 leading-relaxed mb-8 text-center px-2">
            我们已停止对您名下的广告账户及 Business Manager 进行任何 API 同步，
            并已从系统数据库、Redis 缓存和安全备份中完全抹除了您的用户访问令牌。
          </p>

          {/* Action Button */}
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
