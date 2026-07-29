import React, { useEffect, useState } from "react";
import axios from "axios";
import { Bot, Loader2, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const defaults = {
  accountId: "", campaignName: "Sales | US | Toys", adSetName: "US | 25-60 | Toys",
  adName: "Toys | Image | Draft", dailyBudget: 50, countries: ["US"], ageMin: 25,
  ageMax: 60, interestQuery: "Toys", pixelId: "", pageId: "",
  landingUrl: "https://chicwoo.com", imageUrl: "", primaryText: "", headline: "",
};

export function AdOperationsCenter() {
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const canCreate = ["ADMIN", "SUPER_ADMIN"].includes(String(user.role || "").toUpperCase());
  const [form, setForm] = useState(defaults);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [actions, setActions] = useState<any[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState("");

  const update = (key: string, value: any) => {
    setForm((old) => ({ ...old, [key]: value }));
    setConfirmed(false);
  };

  const loadActions = async () => {
    const result = await axios.get("/api/ad-operations/actions");
    setActions(result.data?.actions || []);
  };

  useEffect(() => {
    Promise.all([axios.get("/api/meta/accounts"), loadActions()])
      .then(([result]) => {
        const list = result.data?.accounts || [];
        setAccounts(list);
        if (list[0]?.accountId) update("accountId", list[0].accountId);
      })
      .catch((error) => toast.error(error.response?.data?.error || "加载失败"));
  }, []);

  const queryCampaigns = async () => {
    if (!form.accountId) return toast.error("请选择广告账户");
    setBusy("query");
    try {
      const result = await axios.get(`/api/ad-operations/accounts/${form.accountId}/campaigns`);
      setCampaigns(result.data?.campaigns || []);
      toast.success("查询完成");
    } catch (error: any) {
      toast.error(error.response?.data?.error || "查询失败");
    } finally { setBusy(""); }
  };

  const createDraft = async () => {
    setBusy("create");
    try {
      const result = await axios.post("/api/ad-operations/drafts", form);
      toast.success(`暂停草稿创建成功：${result.data?.result?.adId || ""}`);
      setConfirmed(false);
      await loadActions();
    } catch (error: any) {
      toast.error(error.response?.data?.error || "创建失败");
    } finally { setBusy(""); }
  };

  return (
    <div className="space-y-5 overflow-y-auto pb-8">
      <div className="flex justify-between">
        <div><h1 className="text-2xl font-semibold flex gap-2"><Bot className="text-meta-blue" />智能广告中心</h1><p className="text-sm text-gray-500 mt-1">查询广告结构，创建默认暂停的销量广告草稿。</p></div>
        <div className="h-fit flex gap-2 items-center rounded-lg bg-emerald-50 text-emerald-700 px-3 py-2 text-xs"><ShieldCheck className="w-4 h-4" />禁止直接上线</div>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base flex gap-2"><Search className="w-4 h-4" />账户查询</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <select className="h-10 flex-1 border rounded-md px-3 text-sm" value={form.accountId} onChange={(e) => update("accountId", e.target.value)}>
              <option value="">选择广告账户</option>
              {accounts.map((item) => <option key={item.accountId} value={item.accountId}>{item.name} ({item.accountId})</option>)}
            </select>
            <Button onClick={queryCampaigns} disabled={busy !== ""}>{busy === "query" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}查询广告系列</Button>
          </div>
          {campaigns.map((item) => <div key={item.id} className="grid grid-cols-[1fr_180px_140px] border-b py-3 text-sm"><span>{item.name}</span><span>{item.objective}</span><span>{item.effective_status || item.status}</span></div>)}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">创建销量广告草稿</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {!canCreate && <div className="bg-amber-50 text-amber-800 p-3 rounded-lg text-sm">当前角色仅可查询。</div>}
          <div className="grid grid-cols-3 gap-4">
            <Field name="广告系列名称" value={form.campaignName} onChange={(v) => update("campaignName", v)} />
            <Field name="广告组名称" value={form.adSetName} onChange={(v) => update("adSetName", v)} />
            <Field name="广告名称" value={form.adName} onChange={(v) => update("adName", v)} />
            <Field name="单日预算" type="number" value={form.dailyBudget} onChange={(v) => update("dailyBudget", Number(v))} />
            <Field name="Pixel ID" value={form.pixelId} onChange={(v) => update("pixelId", v)} />
            <Field name="主页 ID" value={form.pageId} onChange={(v) => update("pageId", v)} />
            <Field name="最低年龄" type="number" value={form.ageMin} onChange={(v) => update("ageMin", Number(v))} />
            <Field name="最高年龄" type="number" value={form.ageMax} onChange={(v) => update("ageMax", Number(v))} />
            <Field name="兴趣" value={form.interestQuery} onChange={(v) => update("interestQuery", v)} />
            <Field name="商品落地页" value={form.landingUrl} onChange={(v) => update("landingUrl", v)} />
            <Field name="图片素材 URL" value={form.imageUrl} onChange={(v) => update("imageUrl", v)} />
            <Field name="广告标题" value={form.headline} onChange={(v) => update("headline", v)} />
          </div>
          <label className="block text-sm font-medium">广告正文<textarea className="mt-1 w-full min-h-24 border rounded-md p-3 font-normal" value={form.primaryText} onChange={(e) => update("primaryText", e.target.value)} /></label>
          <label className="flex gap-3 bg-blue-50 p-4 rounded-lg text-sm"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /><span>确认 Campaign、Ad Set、Creative 和 Ad 全部以 <strong>PAUSED</strong> 状态创建。</span></label>
          <Button onClick={createDraft} disabled={!canCreate || !confirmed || busy !== ""}>{busy === "create" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}创建暂停草稿</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">执行记录</CardTitle></CardHeader>
        <CardContent>{actions.length ? actions.map((item) => <div key={item.id} className="grid grid-cols-[180px_1fr_160px_100px] border-b py-2 text-sm"><span>{new Date(item.createdAt).toLocaleString()}</span><span>{item.action}</span><span>{item.accountId}</span><span className={item.status === "SUCCESS" ? "text-emerald-600" : "text-red-600"}>{item.status}</span></div>) : <p className="text-sm text-gray-500">暂无执行记录。</p>}</CardContent>
      </Card>
    </div>
  );
}

function Field({ name, value, onChange, type = "text" }: { name: string; value: any; onChange: (value: string) => void; type?: string }) {
  return <label className="text-sm font-medium">{name}<Input className="mt-1" type={type} value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}
