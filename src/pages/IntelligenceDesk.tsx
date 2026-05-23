import { useEffect, useState } from "react";
import { HealthScorecard } from "../components/intelligence/HealthScorecard";
import { SpendRiskPanel } from "../components/intelligence/SpendRiskPanel";
import { FatigueMonitor } from "../components/intelligence/FatigueMonitor";
import { RoasTrendChart } from "../components/charts/RoasTrendChart";
import { AnomalyTicketList } from "../components/intelligence/AnomalyTicketList";
import { Button } from "@/components/ui/button";
import { useIntelligenceStore } from "../store/useIntelligenceStore";
// In real app, import useQuery from @tanstack/react-query

export function IntelligenceDesk() {
  const { isAiDiagnosticRunning, setAiDiagnosticRunning } =
    useIntelligenceStore();
  const [mockLoading, setMockLoading] = useState(false);

  // Mock Data for Demo
  const mockRoasData = [
    { date: "May 10", roas: 3.1, breakeven: 1.5 },
    { date: "May 11", roas: 2.8, breakeven: 1.5 },
    { date: "May 12", roas: 2.9, breakeven: 1.5 },
    { date: "May 13", roas: 2.4, breakeven: 1.5 },
    { date: "May 14", roas: 2.1, breakeven: 1.5 },
    { date: "May 15", roas: 1.8, breakeven: 1.5 },
    { date: "May 16", roas: 1.3, breakeven: 1.5 }, // Dropping below breakeven
  ];

  const handleRunDiagnosis = () => {
    setMockLoading(true);
    setAiDiagnosticRunning(true);

    // Simulate BullMQ async backend job
    setTimeout(() => {
      setMockLoading(false);
      setAiDiagnosticRunning(false);
    }, 3000);
  };

  return (
    <div className="min-h-screen bg-slate-50/50 pb-20">
      {/* SaaS Top Header Area */}
      <div className="bg-white border-b px-8 py-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 max-w-7xl mx-auto">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              AI Intelligence Desk
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              企业级广告风险排查与智能策略中心
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              onClick={handleRunDiagnosis}
              disabled={mockLoading}
              className="bg-slate-900 hover:bg-slate-800 text-white font-medium shadow-sm transition-all"
            >
              {mockLoading ? (
                <>
                  <span className="w-4 h-4 rounded-full border-2 border-white/20 border-t-white animate-spin mr-2" />
                  Gemini 构建数学模型中...
                </>
              ) : (
                "立刻执行深度核查 (Deep Scan)"
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Bento Grid Main Area */}
      <div className="max-w-7xl mx-auto px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          {/* Row 1 / Top Highlights */}
          <div className="col-span-1 xl:col-span-1">
            <HealthScorecard
              score={mockLoading ? 0 : 42}
              isLoading={mockLoading}
            />
          </div>

          <div className="col-span-1 xl:col-span-1">
            <SpendRiskPanel
              currentSpend={1450}
              dailyBudget={1500}
              isLoading={mockLoading}
            />
          </div>

          <div className="col-span-1 md:col-span-2 xl:col-span-2">
            <FatigueMonitor
              creativeFatigue={mockLoading ? 0 : 85}
              audienceFatigue={mockLoading ? 0 : 40}
              isLoading={mockLoading}
            />
          </div>

          {/* Row 2 / Trend Charts */}
          <RoasTrendChart
            data={mockLoading ? [] : mockRoasData}
            isLoading={mockLoading}
          />

          {/* Additional visual anchor card (e.g. CPA volatility) */}
          <div className="col-span-full xl:col-span-2 bg-white rounded-xl border border-dashed border-gray-300 flex items-center justify-center min-h-[300px]">
            <span className="text-gray-400 font-medium text-sm">
              CPA Volatility Map (Placeholder)
            </span>
          </div>

          {/* Row 3 / AI Actionable Tickets */}
          <AnomalyTicketList
            isLoading={mockLoading}
            suggestions={[
              {
                title: "紧急：素材重度衰退",
                description:
                  "AI 检测到过去 4 天内主要拓新视频的 CTR 下滑了 45%，同时转化成本 (CPA) 突破红线。建议立即停用旧素材组，并启用备用创意。",
                priority: "HIGH",
              },
              {
                title: "预警：ROAS 跌穿盈亏线",
                description:
                  "今日综合购买 ROI (1.3) 已低于预设盈亏线 (1.5)。算法预测如果保持当前配额，明日可能产生较大亏损。建议轻微缩减预算 (-15%) 观察。",
                priority: "MEDIUM",
              },
              {
                title: "结构优化：扩展 Lookalike",
                description:
                  "受众渗透率达 40%，触发饱和判定。建议利用高 LTV 购买者群体，重新生成 5% 的 Lookalike Audience 加入测试。",
                priority: "LOW",
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
