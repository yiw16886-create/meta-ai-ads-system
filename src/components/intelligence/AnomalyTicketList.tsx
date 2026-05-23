import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ActionableSuggestion {
  title: string;
  description: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
}

interface TicketListProps {
  suggestions: ActionableSuggestion[];
  isLoading?: boolean;
}

export function AnomalyTicketList({ suggestions, isLoading }: TicketListProps) {
  return (
    <Card className="col-span-full border-t-4 border-t-slate-900 border-x-0 border-b-0 rounded-none shadow-none bg-slate-50/50">
      <CardHeader>
        <CardTitle className="text-xl font-medium tracking-tight">
          AI 操作决策流 (Action Items)
        </CardTitle>
        <CardDescription>
          Review and approve AI-generated structural modifications
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4 animate-pulse mt-4">
            <div className="h-24 bg-white border border-gray-100 rounded-lg w-full"></div>
            <div className="h-24 bg-white border border-gray-100 rounded-lg w-full"></div>
          </div>
        ) : suggestions.length === 0 ? (
          <div className="text-center py-12 text-sm text-gray-500 font-medium">
            ✅ 无需优化：账户目前不存在需要操作的异常风险点
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
            {suggestions.map((suggestion, idx) => (
              <div
                key={idx}
                className="bg-white border p-5 rounded-lg shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-semibold text-slate-900 tracking-tight leading-snug">
                      {suggestion.title}
                    </h4>
                    <Badge
                      variant={
                        suggestion.priority === "HIGH"
                          ? "destructive"
                          : suggestion.priority === "MEDIUM"
                            ? "default"
                            : "secondary"
                      }
                    >
                      {suggestion.priority}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-600 mb-6 leading-relaxed">
                    {suggestion.description}
                  </p>
                </div>

                <div className="flex gap-2 mt-auto">
                  <Button
                    variant="default"
                    className="w-full font-medium"
                    size="sm"
                  >
                    授权执行
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full text-slate-500"
                    size="sm"
                  >
                    忽略
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
