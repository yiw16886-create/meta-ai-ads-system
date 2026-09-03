import { useEffect, useState } from "react";
import useSWR from "swr";
import {
  CheckCircle2,
  ExternalLink,
  Flag,
  KeyRound,
  LockKeyhole,
  MessageSquare,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import {
  createPageCenterMetaConnection,
  disconnectPageCenterMetaConnection,
  fetchPageCenterMetaStatus,
  fetchPageCenterV2Overview,
  verifyPageCenterMetaConnection,
  type PageCenterV2Section,
} from "./api";

const OVERVIEW_KEY = "/api/page-center-v2/overview";
const META_STATUS_KEY = "/api/page-center-v2/meta/status";

const SECTION_ICONS = {
  oauth: KeyRound,
  pages: Flag,
  tools: MessageSquare,
} as const;

function SectionCard({ section }: { section: PageCenterV2Section }) {
  const Icon = SECTION_ICONS[section.id];

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-meta-blue">
          <Icon aria-hidden="true" className="h-5 w-5" />
        </div>
        <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
          阶段 {section.phase}
        </span>
      </div>
      <h2 className="text-base font-semibold text-slate-900">{section.title}</h2>
      <p className="mt-2 min-h-10 text-sm leading-5 text-slate-500">
        {section.description}
      </p>
      <div className="mt-5 flex items-center gap-2 border-t border-slate-100 pt-4 text-xs font-medium text-slate-400">
        {section.status === "ready" ? (
          <><CheckCircle2 aria-hidden="true" className="h-4 w-4 text-emerald-500" />阶段能力已接入</>
        ) : (
          <><LockKeyhole aria-hidden="true" className="h-4 w-4" />等待后续阶段</>
        )}
      </div>
    </article>
  );
}

function LoadingState() {
  return (
    <div
      aria-label="正在加载公共主页中心"
      className="flex h-full items-center justify-center"
      role="status"
    >
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-100 border-t-meta-blue" />
    </div>
  );
}

function ErrorState() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
        <LockKeyhole aria-hidden="true" className="mx-auto h-8 w-8 text-amber-600" />
        <h1 className="mt-3 text-lg font-semibold text-slate-900">B 通道暂不可用</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          功能开关或 B 组权限可能已调整。旧公共主页管理模块未受影响。
        </p>
      </div>
    </div>
  );
}

function PermissionBadge({ allowed, children }: { allowed: boolean; children: string }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${allowed ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
      {allowed ? "已授权" : "未授权"} · {children}
    </span>
  );
}

export default function PageCenterV2() {
  const [action, setAction] = useState<"connect" | "verify" | "disconnect" | null>(null);
  const [actionError, setActionError] = useState("");
  const { data, error, isLoading } = useSWR(
    OVERVIEW_KEY,
    fetchPageCenterV2Overview,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );
  const {
    data: metaStatus,
    mutate: mutateMetaStatus,
    isLoading: isMetaStatusLoading,
  } = useSWR(META_STATUS_KEY, fetchPageCenterMetaStatus, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  });

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "PAGE_CENTER_META_CONNECTED") {
        setActionError("");
        void mutateMetaStatus();
      } else if (event.data?.type === "PAGE_CENTER_META_ERROR") {
        setActionError("Meta 授权未完成，请重新尝试。");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [mutateMetaStatus]);

  async function connectMeta() {
    setAction("connect");
    setActionError("");
    try {
      const url = await createPageCenterMetaConnection();
      const popup = window.open(url, "page-center-meta-oauth", "popup,width=640,height=760");
      if (!popup) setActionError("浏览器阻止了授权窗口，请允许本站弹窗后重试。");
    } catch {
      setActionError("无法启动 Meta 授权，请检查服务端配置。");
    } finally {
      setAction(null);
    }
  }

  async function verifyMeta() {
    setAction("verify");
    setActionError("");
    try {
      await verifyPageCenterMetaConnection();
      await mutateMetaStatus();
    } catch {
      setActionError("权限校验失败或授权已失效，请重新授权。");
    } finally {
      setAction(null);
    }
  }

  async function disconnectMeta() {
    if (!window.confirm("仅断开 Page Center V2 的 Meta 授权，是否继续？")) return;
    setAction("disconnect");
    setActionError("");
    try {
      await disconnectPageCenterMetaConnection();
      await mutateMetaStatus();
    } catch {
      setActionError("断开失败，请稍后重试。");
    } finally {
      setAction(null);
    }
  }

  if (isLoading) return <LoadingState />;
  if (error || !data?.data) return <ErrorState />;

  const overview = data.data;

  return (
    <div className="h-full overflow-y-auto pb-10 pr-1">
      <section className="overflow-hidden rounded-3xl bg-slate-950 text-white shadow-lg">
        <div className="grid gap-8 p-7 lg:grid-cols-[1fr_auto] lg:items-center lg:p-9">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-blue-500/20 px-3 py-1 text-xs font-semibold text-blue-200">
                Page Center V2
              </span>
              <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200">
                B 组 · 独立通道
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              公共主页中心
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              Meta OAuth、主页读取与受控写入工具已独立接入；发布、回复、
              控评和删除均要求 MCP 写作用域、明确确认与幂等键。
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <ShieldCheck aria-hidden="true" className="h-8 w-8 text-emerald-300" />
              <div>
                <p className="text-xs text-slate-400">当前模式</p>
                <p className="mt-1 font-semibold">隔离 · 确认 · 可审计</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="meta-connection" className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h2 id="meta-connection" className="text-lg font-semibold text-slate-900">Meta 主页授权</h2>
            <p className="mt-1 text-sm text-slate-500">
              {isMetaStatusLoading
                ? "正在读取独立授权状态…"
                : metaStatus?.connected
                  ? `已连接${metaStatus.facebookUserName ? ` · ${metaStatus.facebookUserName}` : ""}`
                  : "尚未连接 Meta 个人账号"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="inline-flex items-center gap-2 rounded-xl bg-meta-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              disabled={action !== null}
              onClick={() => void connectMeta()}
              type="button"
            >
              <ExternalLink aria-hidden="true" className="h-4 w-4" />
              {metaStatus?.connected ? "重新授权" : "连接 Meta"}
            </button>
            {metaStatus?.connected ? (
              <>
                <button className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50" disabled={action !== null} onClick={() => void verifyMeta()} type="button">
                  重新校验
                </button>
                <button className="inline-flex items-center gap-2 rounded-xl border border-rose-200 px-4 py-2 text-sm font-medium text-rose-700 disabled:opacity-50" disabled={action !== null} onClick={() => void disconnectMeta()} type="button">
                  <Unplug aria-hidden="true" className="h-4 w-4" />断开
                </button>
              </>
            ) : null}
          </div>
        </div>
        {actionError ? <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800" role="alert">{actionError}</p> : null}
        {metaStatus?.connected ? (
          <div className="mt-5 grid gap-3">
            {metaStatus.pages.length > 0 ? metaStatus.pages.map((page) => (
              <article className="rounded-xl border border-slate-100 bg-slate-50 p-4" key={page.pageId}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-slate-900">{page.pageName}</h3>
                    <p className="mt-1 text-xs text-slate-500">{page.category || "Meta 公共主页"} · ID {page.pageId}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <PermissionBadge allowed={page.canRead}>读取</PermissionBadge>
                    <PermissionBadge allowed={page.canPublish}>发帖</PermissionBadge>
                    <PermissionBadge allowed={page.canManageComments}>评论</PermissionBadge>
                  </div>
                </div>
              </article>
            )) : <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">当前授权未返回可管理的公共主页，请检查 Meta 主页角色和 pages_show_list 权限。</p>}
          </div>
        ) : null}
      </section>

      <section aria-labelledby="page-center-roadmap" className="mt-6">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 id="page-center-roadmap" className="text-lg font-semibold text-slate-900">
              模块接入路线
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              每项能力均通过独立接口逐步开放。
            </p>
          </div>
          <span className="hidden text-xs text-slate-400 sm:inline">
            契约 {overview.contractVersion}
          </span>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {overview.sections.map((section) => (
            <SectionCard key={section.id} section={section} />
          ))}
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 aria-hidden="true" className="mt-0.5 h-5 w-5 text-emerald-600" />
            <div>
              <h2 className="font-semibold text-emerald-950">原有功能保持独立</h2>
              <p className="mt-2 text-sm leading-6 text-emerald-800">
                数据中心、项目类别看板、账户监控、店铺管理及同步任务仍使用原路由与组件。
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <div className="flex items-start gap-3">
            <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 text-blue-600" />
            <div>
              <h2 className="font-semibold text-blue-950">B 组由服务器控制</h2>
              <p className="mt-2 text-sm leading-6 text-blue-800">
                用户名单不会进入浏览器包；关闭功能开关即可隐藏入口并拒绝所有新接口。
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
