import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface SpendRiskProps {
  currentSpend: number;
  dailyBudget: number;
  isLoading?: boolean;
}

export function SpendRiskPanel({
  currentSpend,
  dailyBudget,
  isLoading,
}: SpendRiskProps) {
  const percentage = dailyBudget > 0 ? (currentSpend / dailyBudget) * 100 : 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-medium tracking-tight">
          日预算过载监控 (Spend Velocity)
        </CardTitle>
        <CardDescription>
          Pacing compared to daily budget limits
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4 animate-pulse mt-4">
            <div className="h-6 bg-gray-200 rounded w-full"></div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="flex justify-between items-end">
              <div>
                <span className="text-3xl font-bold tracking-tighter">
                  ${currentSpend.toFixed(0)}
                </span>
                <span className="text-sm text-gray-500 ml-1">
                  / ${dailyBudget.toFixed(0)}
                </span>
              </div>
              <span
                className={`text-sm font-semibold ${percentage >= 95 ? "text-red-500" : "text-slate-700"}`}
              >
                {percentage.toFixed(1)}% Used
              </span>
            </div>
            <Progress
              value={Math.min(percentage, 100)}
              className={`h-3 ${percentage >= 95 ? "[&>div]:bg-red-500" : percentage > 75 ? "[&>div]:bg-yellow-500" : "[&>div]:bg-blue-600"}`}
            />
            {percentage >= 95 && (
              <p className="text-xs text-red-600 font-medium bg-red-50 p-2 rounded">
                🚨 警告：已触及跑飞/限额边缘，请检查消耗配置。
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
