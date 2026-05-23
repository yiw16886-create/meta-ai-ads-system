import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface DataPoint {
  date: string;
  roas: number;
  breakeven: number;
}

interface TrendChartProps {
  data: DataPoint[];
  isLoading?: boolean;
}

export function RoasTrendChart({ data, isLoading }: TrendChartProps) {
  return (
    <Card className="col-span-full xl:col-span-2">
      <CardHeader>
        <CardTitle className="text-lg font-medium tracking-tight">
          ROAS 衰减与爆发趋势预测 (14d)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="w-full h-[250px] bg-slate-50 animate-pulse rounded-md"></div>
        ) : (
          <div className="h-[250px] w-full mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data}
                margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#E5E7EB"
                />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#6B7280" }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#6B7280" }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "8px",
                    border: "none",
                    boxShadow:
                      "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
                  }}
                  itemStyle={{ fontSize: "14px", fontWeight: 500 }}
                />
                {/* Breakeven constraint line */}
                <ReferenceLine
                  y={data[0]?.breakeven || 1.5}
                  stroke="#ef4444"
                  strokeDasharray="3 3"
                  label={{
                    position: "insideTopLeft",
                    value: "ROAS 盈亏线",
                    fill: "#ef4444",
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="roas"
                  stroke="#0f172a"
                  strokeWidth={3}
                  dot={{ r: 4, strokeWidth: 2, fill: "#fff" }}
                  activeDot={{ r: 6, stroke: "#0f172a", strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
