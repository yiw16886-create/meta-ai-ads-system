import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

interface FatigueProps {
  creativeFatigue: number; // 0-100
  audienceFatigue: number; // 0-100
  isLoading?: boolean;
}

export function FatigueMonitor({
  creativeFatigue,
  audienceFatigue,
  isLoading,
}: FatigueProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-medium tracking-tight">
          衰退雷达 (Fatigue Radar)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 mt-4">
        {isLoading ? (
          <div className="space-y-6 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-full"></div>
            <div className="h-4 bg-gray-200 rounded w-full"></div>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium flex items-center gap-2">
                  素材疲劳度 (Creative)
                  {creativeFatigue > 80 && (
                    <Badge
                      variant="destructive"
                      className="h-5 px-1.5 whitespace-nowrap"
                    >
                      重度衰退
                    </Badge>
                  )}
                </span>
                <span className="text-gray-500">{creativeFatigue}%</span>
              </div>
              <Progress
                value={creativeFatigue}
                className={`h-2 ${creativeFatigue > 80 ? "[&>div]:bg-red-500" : "[&>div]:bg-slate-800"}`}
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="font-medium flex items-center gap-2">
                  受众饱和度 (Audience)
                  {audienceFatigue > 80 && (
                    <Badge
                      variant="destructive"
                      className="h-5 px-1.5 whitespace-nowrap"
                    >
                      重度枯竭
                    </Badge>
                  )}
                </span>
                <span className="text-gray-500">{audienceFatigue}%</span>
              </div>
              <Progress
                value={audienceFatigue}
                className={`h-2 ${audienceFatigue > 80 ? "[&>div]:bg-orange-500" : "[&>div]:bg-slate-800"}`}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
