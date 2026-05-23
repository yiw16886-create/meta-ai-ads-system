import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface HealthProps {
  score: number;
  isLoading?: boolean;
}

export function HealthScorecard({ score, isLoading }: HealthProps) {
  let statusColor = "bg-green-500";
  let statusText = "健康 (Healthy)";

  if (score < 50) {
    statusColor = "bg-red-500";
    statusText = "高危 (Critical)";
  } else if (score < 80) {
    statusColor = "bg-yellow-500";
    statusText = "承压 (Warning)";
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xl font-medium tracking-tight">
          AI 健康指数 (Health Score)
        </CardTitle>
        <CardDescription>
          Based on deep-funnel metrics and anomalies
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2 animate-pulse mt-4">
            <div className="h-8 bg-gray-200 rounded w-16"></div>
            <div className="h-2 bg-gray-200 rounded w-full mt-2"></div>
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <span className="text-4xl font-bold tracking-tighter">
                {score}
              </span>
              <span
                className={`text-xs font-semibold px-2 py-1 rounded text-white ${statusColor}`}
              >
                {statusText}
              </span>
            </div>
            <Progress value={score} className="h-2" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
