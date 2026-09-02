import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import {
  decideMcpOAuthAuthorizationRequest,
  fetchMcpOAuthAuthorizationRequest,
  type McpOAuthAuthorizationRequest,
} from "./api";

const SCOPE_LABELS: Record<string, string> = {
  "page_center:read": "查看公共主页中心数据",
  "page_center:write": "执行经过确认的公共主页操作",
};

export default function McpOAuthConsentPage() {
  const [searchParams] = useSearchParams();
  const requestId = searchParams.get("request_id") || "";
  const [request, setRequest] = useState<McpOAuthAuthorizationRequest | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!requestId) {
      setError("授权请求缺少 request_id。");
      return;
    }
    let active = true;
    fetchMcpOAuthAuthorizationRequest(requestId)
      .then((data) => active && setRequest(data))
      .catch((cause) => {
        if (active) setError(cause.response?.data?.message || "授权请求不存在或已过期。");
      });
    return () => {
      active = false;
    };
  }, [requestId]);

  const decide = async (approved: boolean) => {
    if (!requestId || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const redirectUrl = await decideMcpOAuthAuthorizationRequest(requestId, approved);
      window.location.assign(redirectUrl);
    } catch (cause: any) {
      setError(cause.response?.data?.message || "无法处理授权请求，请重新发起连接。");
      setSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12">
      <section className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" aria-labelledby="oauth-consent-title">
        <div className="mb-5 flex items-center gap-3">
          <div className="rounded-xl bg-blue-50 p-3 text-blue-700"><KeyRound aria-hidden="true" /></div>
          <div>
            <p className="text-sm font-medium text-blue-700">Page Center B 通道</p>
            <h1 id="oauth-consent-title" className="text-xl font-semibold text-slate-950">连接 MCP 客户端</h1>
          </div>
        </div>

        {error ? (
          <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>
        ) : request ? (
          <>
            <p className="text-sm leading-6 text-slate-600">
              <strong className="text-slate-900">{request.clientName}</strong> 请求代表当前网站账户访问独立公共主页中心。
            </p>
            <div className="my-5 rounded-xl border border-slate-200 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-900">
                <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" /> 请求权限
              </div>
              <ul className="space-y-2 text-sm text-slate-600">
                {request.scope.map((scope) => <li key={scope}>• {SCOPE_LABELS[scope] || scope}</li>)}
              </ul>
            </div>
            <p className="mb-5 text-xs leading-5 text-slate-500">
              授权仅绑定当前网站用户和组织；不会改变数据中心、项目看板、账户健康监控或店铺管理权限。
            </p>
            <div className="flex justify-end gap-3">
              <button type="button" disabled={submitting} onClick={() => decide(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50">拒绝</button>
              <button type="button" disabled={submitting} onClick={() => decide(true)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{submitting ? "处理中…" : "允许连接"}</button>
            </div>
          </>
        ) : (
          <p role="status" className="text-sm text-slate-600">正在读取授权请求…</p>
        )}
      </section>
    </main>
  );
}
