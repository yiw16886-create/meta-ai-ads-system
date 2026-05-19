import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { RefreshCcw, AlertTriangle, Info, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function MonitoringDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all"); // Default to All to show everything first
  const [hideInactive, setHideInactive] = useState(false); // Default to FALSE to show all initially
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ 
    key: 'amountSpent', 
    direction: 'desc' 
  });

  const fetchData = async (forceRefresh = false) => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/monitoring/accounts${forceRefresh ? "?refresh=true" : ""}`);
      const rawAccounts = res.data.accounts || [];
      const uniqueData = Array.from(new Map(rawAccounts.map((item: any) => [item.id, item])).values());
      setData(uniqueData);
      setStats(res.data.stats);
      if (forceRefresh) {
        toast.success("同步完成: 已获取 Meta 实时数据并更新数据库");
      }
    } catch (e: any) {
      toast.error(e.response?.data?.error || "数据拉取失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'desc';
    if (sortConfig.key === key && sortConfig.direction === 'desc') {
      direction = 'asc';
    }
    setSortConfig({ key, direction });
  };

  const filteredAndSortedData = useMemo(() => {
    let result = [...data];

    // Filter by months spend (Inactive hide)
    if (hideInactive) {
      result = result.filter(acc => acc.hasSpendLast30Days);
    }

    // Filter by status
    if (statusFilter !== "all") {
      result = result.filter(acc => acc.accountStatus.toString() === statusFilter);
    }

    // Filter by search term
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      result = result.filter(acc => 
        acc.name.toLowerCase().includes(lowerSearch) || 
        acc.accountId.toLowerCase().includes(lowerSearch)
      );
    }

    // Sort
    result.sort((a, b) => {
      const valA = a[sortConfig.key];
      const valB = b[sortConfig.key];

      // Handle nulls/Infinities
      if (valA === Infinity || valA === null) return sortConfig.direction === 'asc' ? 1 : -1;
      if (valB === Infinity || valB === null) return sortConfig.direction === 'asc' ? -1 : 1;

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [data, statusFilter, searchTerm, sortConfig, hideInactive]);

  if (loading && data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 bg-white rounded-xl border border-gray-100">
        <RefreshCcw className="w-10 h-10 animate-spin text-meta-blue" />
        <div className="text-center">
          <p className="text-gray-900 font-bold">正在加载监控数据</p>
          <p className="text-gray-400 text-xs mt-1">优先从本地数据库加载缓存，点同步按钮获取 Meta 实时限额</p>
        </div>
      </div>
    );
  }

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (sortConfig.key !== columnKey) return <ArrowUpDown className="ml-2 h-4 w-4 text-gray-400" />;
    return sortConfig.direction === 'asc' ? 
      <ArrowUp className="ml-2 h-4 w-4 text-meta-blue" /> : 
      <ArrowDown className="ml-2 h-4 w-4 text-meta-blue" />;
  };

  const lastUpdate = data.length > 0 && data[0].lastUpdatedInCache ? new Date(data[0].lastUpdatedInCache).toLocaleString() : "未知";

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Stats Header */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">总抓取账户</p>
          <p className="text-2xl font-black text-gray-900 mt-1">{stats?.total || 0}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">正常状态 (Active)</p>
          <p className="text-2xl font-black text-green-600 mt-1">{stats?.active || 0}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">30天内有消耗</p>
          <p className="text-2xl font-black text-meta-blue mt-1">{stats?.hasSpend || 0}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">不活跃/异常</p>
          <p className="text-2xl font-black text-red-500 mt-1">{(stats?.total || 0) - (stats?.active || 0)}</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">广告账户实时监控</h2>
          <p className="text-sm text-gray-500 mt-1 flex items-center gap-1.5 font-medium">
            <Info className="w-4 h-4 text-meta-blue" />
            已连接本地消费库。缓存更新于: {lastUpdate}
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => fetchData(true)} 
            variant="outline" 
            size="sm" 
            disabled={loading}
            className="gap-2 border-gray-200 h-10 px-4 font-bold active:scale-95 transition-transform"
          >
            <RefreshCcw className={cn("w-4 h-4", loading && "animate-spin")} />
            更新 Meta 实时限额
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center bg-gray-50/50 p-4 rounded-xl border border-gray-100">
        <div className="md:col-span-5 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input 
            placeholder="搜索账户名或 ID..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 h-11 border-gray-200 bg-white focus:ring-meta-blue"
          />
        </div>
        <div className="md:col-span-3">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-11 border-gray-200 bg-white">
              <SelectValue placeholder="筛选状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态 (All Status)</SelectItem>
              <SelectItem value="1">正常 (Active)</SelectItem>
              <SelectItem value="2">停用 (Disabled)</SelectItem>
              <SelectItem value="3">待清退 (Unsettled)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-4 flex items-center justify-end gap-3 pr-2">
           <div className="flex items-center gap-2">
             <input 
              type="checkbox" 
              id="hideInactive"
              checked={hideInactive} 
              onChange={(e) => setHideInactive(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-meta-blue focus:ring-meta-blue"
             />
             <label htmlFor="hideInactive" className="text-sm font-bold text-gray-600 cursor-pointer select-none">
               只看 30 天内有消耗账户
             </label>
           </div>
           <div className="h-6 w-[1px] bg-gray-200 mx-2" />
           <div className="text-right text-xs font-bold text-gray-400 uppercase tracking-widest">
             显示 {filteredAndSortedData.length} 个
           </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-gray-50/50">
            <TableRow className="hover:bg-transparent border-b border-gray-100">
              <TableHead 
                className="font-bold text-gray-500 h-14 cursor-pointer hover:text-gray-900 transition-colors"
                onClick={() => handleSort('name')}
              >
                <div className="flex items-center">
                  账户名称 <SortIcon columnKey="name" />
                </div>
              </TableHead>
              <TableHead className="font-bold text-gray-500 h-14">账户 ID</TableHead>
              <TableHead 
                className="font-bold text-gray-500 h-14 cursor-pointer hover:text-gray-900 transition-colors"
                onClick={() => handleSort('amountSpent')}
              >
                <div className="flex items-center">
                  花费金额 <SortIcon columnKey="amountSpent" />
                </div>
              </TableHead>
              <TableHead 
                className="font-bold text-gray-500 h-14 cursor-pointer hover:text-gray-900 transition-colors"
                onClick={() => handleSort('spendCap')}
              >
                <div className="flex items-center">
                  总限额 <SortIcon columnKey="spendCap" />
                </div>
              </TableHead>
              <TableHead 
                className="font-bold text-gray-500 h-14 cursor-pointer hover:text-gray-900 transition-colors"
                onClick={() => handleSort('balance')}
              >
                <div className="flex items-center">
                  可用余额 <SortIcon columnKey="balance" />
                </div>
              </TableHead>
              <TableHead 
                className="font-bold text-gray-500 h-14 cursor-pointer hover:text-gray-900 transition-colors"
                onClick={() => handleSort('avgDailySpend')}
              >
                <div className="flex items-center">
                  七日均消 <SortIcon columnKey="avgDailySpend" />
                </div>
              </TableHead>
              <TableHead 
                className="font-bold text-gray-500 h-14 cursor-pointer hover:text-gray-900 transition-colors text-right pr-6"
                onClick={() => handleSort('estimatedDays')}
              >
                <div className="flex items-center justify-end">
                  可用天数 <SortIcon columnKey="estimatedDays" />
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAndSortedData.length > 0 ? (
              filteredAndSortedData.map((acc) => {
                const isDanger = acc.accountStatus !== 1;
                const isLowDays = acc.estimatedDays !== Infinity && acc.estimatedDays !== null && acc.estimatedDays <= 2;

                return (
                  <TableRow 
                    key={acc.id} 
                    className={cn(
                      "group border-gray-50 transition-colors cursor-pointer",
                      isDanger ? "bg-red-50/30 hover:bg-red-50/50" : "hover:bg-gray-50/80"
                    )}
                    onClick={() => navigate(`/account/${acc.accountId}`)}
                  >
                    <TableCell className="py-4">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "w-2 h-2 rounded-full shrink-0",
                          acc.accountStatus === 1 ? "bg-green-500" : "bg-red-500"
                        )} />
                        <span className="font-bold text-gray-900 group-hover:text-meta-blue transition-colors">
                          {acc.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-4 font-mono text-[11px] text-gray-400 font-bold uppercase tracking-wider">
                      {acc.accountId}
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="space-y-1">
                        <div className="font-bold text-gray-900">${(acc.amountSpent ?? 0).toLocaleString()}</div>
                        {acc.spendCap > 0 && (
                          <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div 
                              className={cn(
                                "h-full",
                                acc.usagePercent > 90 ? "bg-red-500" : "bg-meta-blue"
                              )}
                              style={{ width: `${Math.min(acc.usagePercent ?? 0, 100)}%` }}
                            />
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="py-4">
                      <div className="font-bold text-gray-900">
                        {acc.spendCap === 0 ? "无限额" : `$${(acc.spendCap ?? 0).toLocaleString()}`}
                      </div>
                      <div className="text-[10px] font-bold text-gray-400 uppercase">{acc.currency}</div>
                    </TableCell>
                    <TableCell className="py-4">
                      <div className={cn(
                        "font-black tracking-tight",
                        isLowDays ? "text-red-600" : "text-gray-900"
                      )}>
                        {acc.balance === Infinity ? "无限制" : (acc.balance < 0 || acc.balance === null) ? "--" : `$${(acc.balance ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
                      </div>
                    </TableCell>
                    <TableCell className="py-4 font-bold text-gray-700">
                      ${(acc.avgDailySpend ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="py-4 text-right pr-6">
                      <div className={cn(
                        "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-black ring-1 ring-inset",
                        isLowDays ? "bg-red-50 text-red-700 ring-red-100 animate-pulse" : 
                        acc.estimatedDays === Infinity ? "bg-green-50 text-green-700 ring-green-100" :
                        "bg-gray-100 text-gray-700 ring-gray-200"
                      )}>
                        {acc.estimatedDays === Infinity ? "无限制" : (acc.estimatedDays === null ? "--" : `${acc.estimatedDays} 天`)}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-40 text-center">
                  <div className="flex flex-col items-center justify-center text-gray-400">
                    <AlertTriangle className="w-8 h-8 mb-2 opacity-20" />
                    <p className="text-sm font-bold">没有匹配的广告账户</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="px-5 py-3 bg-gray-50 rounded-lg flex items-center justify-between text-[11px] font-bold text-gray-400 border border-gray-100">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 uppercase tracking-widest">
            <RefreshCcw className="w-3 h-3" />
            数据源: META GRAPH API V22.0
          </span>
          <span className="text-gray-200">|</span>
          <span className="uppercase tracking-widest">时区联动已开启</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-green-500 rounded-full" />
          正常监控中
        </div>
      </div>
    </div>
  );
}
