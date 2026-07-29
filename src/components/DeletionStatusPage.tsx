import React, { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import axios from "axios";
import { CheckCircle2, ArrowLeft, ShieldCheck, Calendar, Search, AlertCircle, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface DeletionRecord {
  confirmationCode: string;
  status: "RECEIVED" | "COMPLETED" | "FAILED" | string;
  requestedAt: string;
  completedAt?: string | null;
}

export function DeletionStatusPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialCode = (searchParams.get("id") || searchParams.get("code") || "").trim();

  const [inputCode, setInputCode] = useState(initialCode);
  const [queryCode, setQueryCode] = useState(initialCode);
  const [loading, setLoading] = useState(false);
  const [record, setRecord] = useState<DeletionRecord | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchStatus = async (codeToQuery: string) => {
    if (!codeToQuery) {
      setRecord(null);
      setErrorMsg(null);
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setRecord(null);

    try {
      const res = await axios.get(`/api/auth/facebook/deletion-status/${codeToQuery}`);
      if (res.data?.success && res.data?.deletionRequest) {
        setRecord(res.data.deletionRequest);
      } else {
        setErrorMsg(res.data?.error || "未找到该删除申请记录");
      }
    } catch (err: any) {
      const serverErr = err.response?.data?.error || "未找到与该确认编号匹配的数据删除申请";
      setErrorMsg(serverErr);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (queryCode) {
      fetchStatus(queryCode);
    }
  }, [queryCode]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = inputCode.trim();
    if (clean) {
      setSearchParams({ id: clean });
      setQueryCode(clean);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-16 px-4 sm:px-6 lg:px-8 font-sans flex items-center justify-center">
      <div className="max-w-md w-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-8 text-center">
          {/* Header Banner */}
          <div className="mb-6">
            {record?.status === "COMPLETED" ? (
              <div className="mx-auto w-16 h-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10" />
              </div>
            ) : record?.status === "RECEIVED" ? (
              <div className="mx-auto w-16 h-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center animate-pulse">
                <Clock className="w-10 h-10" />
              </div>
            ) : record?.status === "FAILED" ? (
              <div className="mx-auto w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center">
                <XCircle className="w-10 h-10" />
              </div>
            ) : (
              <div className="mx-auto w-16 h-16 bg-slate-100 text-slate-500 rounded-full flex items-center justify-center">
                <ShieldCheck className="w-10 h-10" />
              </div>
            )}
          </div>

          <h1 className="text-xl font-bold text-gray-900 mb-2">
            Facebook 用户数据删除状态核验
          </h1>
          <p className="text-xs text-gray-500 mb-6 leading-relaxed">
            根据 Facebook 开放平台数据保护政策，您可以通过输入数据删除 Confirmation Code 核验真实状态。
          </p>

          {/* Search Box */}
          <form onSubmit={handleSearch} className="flex gap-2 mb-6">
            <Input
              type="text"
              placeholder="请输入 DEL-XXXXXXXXXXXX"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
              className="font-mono text-xs h-10 uppercase border-gray-200"
            />
            <Button
              type="submit"
              disabled={loading || !inputCode.trim()}
              className="bg-gray-900 hover:bg-gray-800 text-white font-medium h-10 px-4 text-xs gap-1"
            >
              <Search className="w-3.5 h-3.5" />
              查询
            </Button>
          </form>

          {/* Dynamic Content */}
          {loading ? (
            <div className="p-8 text-center text-xs text-gray-400">
              <Clock className="w-5 h-5 animate-spin mx-auto mb-2 text-gray-400" />
              正在通信服务器查询核验真实状态...
            </div>
          ) : errorMsg ? (
            <div className="p-4 rounded-lg bg-red-50 border border-red-100 text-left text-xs text-red-700 space-y-1 mb-6">
              <div className="font-bold flex items-center gap-1.5 text-red-800">
                <AlertCircle className="w-4 h-4 text-red-500" />
                查询失败
              </div>
              <p>{errorMsg}</p>
            </div>
          ) : record ? (
            <div className="bg-gray-50 rounded-lg p-5 mb-6 text-left space-y-3 border border-gray-100">
              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400">处理状态</span>
                {record.status === "COMPLETED" ? (
                  <span className="text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    已完成删除 (Completed)
                  </span>
                ) : record.status === "RECEIVED" ? (
                  <span className="text-amber-600 font-semibold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    已受理并进行中 (Processing)
                  </span>
                ) : (
                  <span className="text-red-600 font-semibold bg-red-50 px-2 py-0.5 rounded border border-red-200">
                    处理异常 (Failed)
                  </span>
                )}
              </div>

              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-gray-400" /> 确认编号 (Confirmation Code)
                </span>
                <span className="text-gray-800 font-mono font-bold">{record.confirmationCode}</span>
              </div>

              <div className="flex justify-between items-center text-xs">
                <span className="text-gray-400 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-gray-400" /> 受理时间
                </span>
                <span className="text-gray-700 font-mono">
                  {new Date(record.requestedAt).toLocaleString()}
                </span>
              </div>

              {record.completedAt && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-gray-400" /> 完成时间
                  </span>
                  <span className="text-gray-700 font-mono">
                    {new Date(record.completedAt).toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div className="p-6 bg-gray-50 border border-gray-100 rounded-lg text-xs text-gray-400 mb-6">
              请在上方输入框中输入 Confirmation Code (格式为 DEL-XXXXXXXXXXXX) 查看详细删除结果。
            </div>
          )}

          {/* Action Links */}
          <div className="space-y-3">
            <Link
              to="/"
              className="block w-full text-center py-2.5 px-4 bg-gray-900 hover:bg-gray-800 text-white rounded-lg text-xs font-medium transition-colors"
            >
              返回系统首页
            </Link>
            <Link
              to="/privacy"
              className="inline-flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> 参阅应用隐私政策
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
