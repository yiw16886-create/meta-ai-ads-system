import useSWR from "swr";
import {
  CheckCircle2,
  Flag,
  KeyRound,
  LockKeyhole,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import {
  fetchPageCenterV2Overview,
  type PageCenterV2Section,
} from "./api";

const OVERVIEW_KEY = "/api/page-center-v2/overview";

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
        <LockKeyhole aria-hidden="true" className="h-4 w-4" />
        当前不可执行写操作
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

export default function PageCenterV2() {
  const { data, error, isLoading } = useSWR(
    OVERVIEW_KEY,
    fetchPageCenterV2Overview,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
    },
  );

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
              当前为只读模块骨架。OAuth、主页授权和 MCP 工具将按阶段独立接入，
              不复用旧页面的写操作入口。
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <ShieldCheck aria-hidden="true" className="h-8 w-8 text-emerald-300" />
              <div>
                <p className="text-xs text-slate-400">当前模式</p>
                <p className="mt-1 font-semibold">隔离 · 只读 · 可回滚</p>
              </div>
            </div>
          </div>
        </div>
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
