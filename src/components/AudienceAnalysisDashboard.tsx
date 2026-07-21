import React, { useState, useEffect, useMemo, useRef } from "react";
import axios from "axios";
import { format } from "date-fns";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Users, MapPin, MonitorPlay, CalendarDays, AlertTriangle, Search, ChevronsUpDown, Check, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export function AudienceAnalysisDashboard({ startDate, endDate }: { startDate: Date; endDate: Date }) {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"gender_age" | "country" | "placement">("gender_age");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any[]>([]);

  // Sorting and Slider states
  const [sortField, setSortField] = useState<string>("purchases");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [scrollPercent, setScrollPercent] = useState<number>(0);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const handleTableScroll = () => {
    if (tableContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = tableContainerRef.current;
      const maxScroll = scrollWidth - clientWidth;
      if (maxScroll > 0) {
        setScrollPercent((scrollLeft / maxScroll) * 100);
      }
    }
  };
  
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchAccounts = async () => {
      try {
        const res = await axios.get("/api/accounts/list");
        if (Array.isArray(res.data) && res.data.length > 0) {
          setAccounts(res.data);
          setSelectedAccount(res.data[0].accountId); // Default to first account
        }
      } catch (e) {
        console.error("Failed to fetch accounts", e);
      }
    };
    fetchAccounts();
  }, []);

  useEffect(() => {
    if (!selectedAccount || !startDate || !endDate) return;

    const fetchInsights = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`/api/accounts/${selectedAccount}/audience-insights`, {
          params: {
            startDate: format(startDate, "yyyy-MM-dd"),
            endDate: format(endDate, "yyyy-MM-dd"),
            breakdown: activeTab,
          }
        });
        
        let processedData = res.data.map((item: any) => {
          let name = '未知';
          if (activeTab === "placement") {
            const platformMap: Record<string, string> = {
                'facebook': 'Facebook',
                'instagram': 'Instagram',
                'audience_network': 'Audience Network',
                'messenger': 'Messenger'
            };
            const posMap: Record<string, string> = {
                'feed': '信息流',
                'story': '快拍',
                'reels': 'Reels',
                'instream_video': '插播视频',
                'search': '搜索结果',
                'messages': '消息',
                'marketplace': 'Marketplace',
                'right_hand_column': '右侧边栏',
                'explore': '发现',
                'unknown': '未知'
            };
            const plt = platformMap[item.publisher_platform] || item.publisher_platform || '未知';
            const pos = posMap[item.platform_position] || item.platform_position || '未知';
            
            // For placements, omit platform if not meaningful, but usually both are passed.
            if (item.publisher_platform) {
                name = `${plt} - ${pos}`;
            }
          } else if (activeTab === "country") {
            const countryMap: Record<string, string> = {
                'AF': '阿富汗',
                'AX': '奥兰群岛',
                'AL': '阿尔巴尼亚',
                'DZ': '阿尔及利亚',
                'AS': '美属萨摩亚',
                'AD': '安道尔',
                'AO': '安哥拉',
                'AI': '安圭拉',
                'AQ': '南极洲',
                'AG': '安提瓜和巴布达',
                'AR': '阿根廷',
                'AM': '亚美尼亚',
                'AW': '阿鲁巴',
                'AU': '澳大利亚',
                'AT': '奥地利',
                'AZ': '阿塞拜疆',
                'BS': '巴哈马',
                'BH': '巴林',
                'BD': '孟加拉国',
                'BB': '巴巴多斯',
                'BY': '白俄罗斯',
                'BE': '比利时',
                'BZ': '伯利兹',
                'BJ': '贝宁',
                'BM': '百慕大',
                'BT': '不丹',
                'BO': '玻利维亚',
                'BQ': '荷属沙巴',
                'BA': '波黑',
                'BW': '博茨瓦纳',
                'BV': '布维岛',
                'BR': '巴西',
                'IO': '英属印度洋领地',
                'BN': '文莱',
                'BG': '保加利亚',
                'BF': '布基纳法索',
                'BI': '布隆迪',
                'CV': '佛得角',
                'KH': '柬埔寨',
                'CM': '喀麦隆',
                'CA': '加拿大',
                'KY': '开曼群岛',
                'CF': '中非',
                'TD': '乍得',
                'CL': '智利',
                'CN': '中国',
                'CX': '圣诞岛',
                'CC': '科科斯群岛',
                'CO': '哥伦比亚',
                'KM': '科摩罗',
                'CD': '刚果(金)',
                'CG': '刚果(布)',
                'CK': '库克群岛',
                'CR': '哥斯达黎加',
                'CI': '科特迪瓦',
                'HR': '克罗地亚',
                'CU': '古巴',
                'CW': '库拉索',
                'CY': '塞浦路斯',
                'CZ': '捷克',
                'DK': '丹麦',
                'DJ': '吉布提',
                'DM': '多米尼克',
                'DO': '多米尼加',
                'EC': '厄瓜多尔',
                'EG': '埃及',
                'SV': '萨尔瓦多',
                'GQ': '赤道几内亚',
                'ER': '厄立特里亚',
                'EE': '爱沙尼亚',
                'SZ': '斯威士兰',
                'ET': '埃塞俄比亚',
                'FK': '马尔维纳斯群岛',
                'FO': '法罗群岛',
                'FJ': '斐济',
                'FI': '芬兰',
                'FR': '法国',
                'GF': '法属圭亚那',
                'PF': '法属波利尼西亚',
                'TF': '法属南部领地',
                'GA': '加蓬',
                'GM': '冈比亚',
                'GE': '格鲁吉亚',
                'DE': '德国',
                'GH': '加纳',
                'GI': '直布罗陀',
                'GR': '希腊',
                'GL': '格陵兰',
                'GD': '格林纳达',
                'GP': '瓜德罗普',
                'GU': '关岛',
                'GT': '危地马拉',
                'GG': '根西岛',
                'GN': '几内亚',
                'GW': '几内亚比绍',
                'GY': '圭亚那',
                'HT': '海地',
                'HM': '赫德岛和麦克唐纳群岛',
                'VA': '梵蒂冈',
                'HN': '洪都拉斯',
                'HK': '香港',
                'HU': '匈牙利',
                'IS': '冰岛',
                'IN': '印度',
                'ID': '印尼',
                'IR': '伊朗',
                'IQ': '伊拉克',
                'IE': '爱尔兰',
                'IM': '马恩岛',
                'IL': '以色列',
                'IT': '意大利',
                'JM': '牙买加',
                'JP': '日本',
                'JE': '泽西岛',
                'JO': '约旦',
                'KZ': '哈萨克斯坦',
                'KE': '肯尼亚',
                'KI': '基里巴斯',
                'KP': '朝鲜',
                'KR': '韩国',
                'KW': '科威特',
                'KG': '吉尔吉斯斯坦',
                'LA': '老挝',
                'LV': '拉脱维亚',
                'LB': '黎巴嫩',
                'LS': '莱索托',
                'LR': '利比里亚',
                'LY': '利比亚',
                'LI': '列支敦士登',
                'LT': '立陶宛',
                'LU': '卢森堡',
                'MO': '澳门',
                'MG': '马达加斯加',
                'MW': '马拉维',
                'MY': '马来西亚',
                'MV': '马尔代夫',
                'ML': '马里',
                'MT': '马耳他',
                'MH': '马绍尔群岛',
                'MQ': '马提尼克',
                'MR': '毛里塔尼亚',
                'MU': '毛里求斯',
                'YT': '马约特',
                'MX': '墨西哥',
                'FM': '密克罗尼西亚',
                'MD': '摩尔多瓦',
                'MC': '摩纳哥',
                'MN': '蒙古',
                'ME': '黑山',
                'MS': '蒙特塞拉特',
                'MA': '摩洛哥',
                'MZ': '莫桑比克',
                'MM': '缅甸',
                'NA': '纳米比亚',
                'NR': '瑙鲁',
                'NP': '尼泊尔',
                'NL': '荷兰',
                'NC': '新喀里多尼亚',
                'NZ': '新西兰',
                'NI': '尼加拉瓜',
                'NE': '尼日尔',
                'NG': '尼日利亚',
                'NU': '纽埃',
                'NF': '诺福克岛',
                'MK': '北马其顿',
                'MP': '北马里亚纳群岛',
                'NO': '挪威',
                'OM': '阿曼',
                'PK': '巴基斯坦',
                'PW': '帕劳',
                'PS': '巴勒斯坦',
                'PA': '巴拿马',
                'PG': '巴布亚新几内亚',
                'PY': '巴拉圭',
                'PE': '秘鲁',
                'PH': '菲律宾',
                'PN': '皮特凯恩群岛',
                'PL': '波兰',
                'PT': '葡萄牙',
                'PR': '波多黎各',
                'QA': '卡塔尔',
                'RE': '留尼汪',
                'RO': '罗马尼亚',
                'RU': '俄罗斯',
                'RW': '卢旺达',
                'BL': '圣巴泰勒米',
                'SH': '圣赫勒拿',
                'KN': '圣基茨和尼维斯',
                'LC': '圣卢西亚',
                'MF': '法属圣马丁',
                'PM': '圣皮埃尔和密克隆',
                'VC': '圣文森特和格林纳丁斯',
                'WS': '萨摩亚',
                'SM': '圣马力诺',
                'ST': '圣多美和普林西比',
                'SA': '沙特阿拉伯',
                'SN': '塞内加尔',
                'RS': '塞尔维亚',
                'SC': '塞舌尔',
                'SL': '塞拉利昂',
                'SG': '新加坡',
                'SX': '荷属圣马丁',
                'SK': '斯洛伐克',
                'SI': '斯洛文尼亚',
                'SB': '所罗门群岛',
                'SO': '索马里',
                'ZA': '南非',
                'GS': '南乔治亚和南桑威奇群岛',
                'SS': '南苏丹',
                'ES': '西班牙',
                'LK': '斯里兰卡',
                'SD': '苏丹',
                'SR': '苏里南',
                'SJ': '斯瓦尔巴和扬马延',
                'SE': '瑞典',
                'CH': '瑞士',
                'SY': '叙利亚',
                'TW': '台湾',
                'TJ': '塔吉克斯坦',
                'TZ': '坦桑尼亚',
                'TH': '泰国',
                'TL': '东帝汶',
                'TG': '多哥',
                'TK': '托克劳',
                'TO': '汤加',
                'TT': '特立尼达和多巴哥',
                'TN': '突尼斯',
                'TR': '土耳其',
                'TM': '土库曼斯坦',
                'TC': '特克斯和凯科斯群岛',
                'TV': '图瓦卢',
                'UG': '乌干达',
                'UA': '乌克兰',
                'AE': '阿联酋',
                'GB': '英国',
                'UK': '英国',
                'US': '美国',
                'UM': '美属本土外小岛屿',
                'UY': '乌拉圭',
                'UZ': '乌兹别克斯坦',
                'VU': '瓦努阿图',
                'VE': '委内瑞拉',
                'VN': '越南',
                'VG': '英属维尔京群岛',
                'VI': '美属维尔京群岛',
                'WF': '瓦利斯和富图纳',
                'EH': '西撒哈拉',
                'YE': '也门',
                'ZM': '赞比亚',
                'ZW': '津巴布韦'
            };
            name = item.country ? (countryMap[item.country.toUpperCase()] || item.country) : '未知';
          } else if (activeTab === "gender_age") {
            const genderMap: Record<string, string> = {
                'male': '男性',
                'female': '女性',
                'unknown': '未知'
            };
            const gender = genderMap[item.gender] || item.gender || '未知';
            name = `${gender} ${item.age || '未知'}`;
          }

          const actions = item.actions || [];
          const getActionVal = (type: string) => {
             const found = actions.find((a: any) => a.action_type === type);
             return found ? parseFloat(found.value) : 0;
          };
          
          const purchases = getActionVal("purchase") || getActionVal("omni_purchase");
          const addsToCart = getActionVal("add_to_cart") || getActionVal("omni_add_to_cart");
          const spend = parseFloat(item.spend || "0");
          const cpp = purchases > 0 ? spend / purchases : 0;
          const reach = parseInt(item.reach || "0");
          const impressions = parseInt(item.impressions || "0");
          const frequency = reach > 0 ? impressions / reach : 0;
          const inline_link_clicks = parseFloat(item.inline_link_clicks || "0");
          const inline_link_click_ctr = parseFloat(item.inline_link_click_ctr || "0");
          const cost_per_inline_link_click = parseFloat(item.cost_per_inline_link_click || "0");
          const clicks = parseFloat(item.clicks || "0");
          const ctr = parseFloat(item.ctr || "0");
          const cpc = parseFloat(item.cpc || "0");

          return {
            ...item,
            name,
            spend,
            purchases,
            cpp,
            addsToCart,
            linkClicks: inline_link_clicks,
            linkCTR: inline_link_click_ctr,
            cpcLink: cost_per_inline_link_click,
            clicks,
            ctr,
            cpc,
            reach,
            impressions,
            frequency
          };
        });
        
        // Default to sorting by purchases descending as requested
        processedData.sort((a: any, b: any) => (b.purchases || 0) - (a.purchases || 0));

        setData(processedData);
      } catch (err: any) {
        console.error(err);
        const errMsg = err.response?.data?.error || err.response?.data?.message || err.message || "获取受众数据失败";
        toast.error(`同步失败: ${errMsg}`);
      } finally {
        setLoading(false);
      }
    };

    fetchInsights();
  }, [selectedAccount, startDate, endDate, activeTab]);

  const sortedData = useMemo(() => {
    const sorted = [...data];
    if (sortField) {
      sorted.sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];

        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;

        if (typeof valA === "string" && typeof valB === "string") {
          return sortDirection === "asc"
            ? valA.localeCompare(valB)
            : valB.localeCompare(valA);
        }

        return sortDirection === "asc" ? valA - valB : valB - valA;
      });
    }
    return sorted;
  }, [data, sortField, sortDirection]);

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  const renderSortHeader = (label: string, field: string, align: "left" | "right" = "right") => {
    const isSorted = sortField === field;
    return (
      <TableHead
        className={cn(
          "font-semibold select-none cursor-pointer hover:bg-slate-100 transition-colors whitespace-nowrap h-11 text-slate-800",
          align === "right" ? "text-right" : "text-left",
          field === "name" ? "sticky left-0 z-30 bg-[#f9fafb] shadow-[1px_0_0_#e5e7eb] px-4" : ""
        )}
        onClick={() => toggleSort(field)}
      >
        <div className={cn("inline-flex items-center gap-1.5", align === "right" ? "justify-end w-full" : "justify-start")}>
          <span>{label}</span>
          <span className={cn("inline-block text-slate-400 group-hover:text-slate-600 transition-colors", isSorted && "text-meta-blue")}>
            {isSorted ? (
              sortDirection === "asc" ? (
                <ArrowUp className="w-3.5 h-3.5" />
              ) : (
                <ArrowDown className="w-3.5 h-3.5" />
              )
            ) : (
              <ArrowUpDown className="w-3.5 h-3.5 opacity-40 hover:opacity-100" />
            )}
          </span>
        </div>
      </TableHead>
    );
  };

  const filteredAccounts = accounts.filter(acc => 
    (acc.accountName || acc.accountId || "").toLowerCase().includes((searchQuery || "").toLowerCase()) ||
    (acc.accountId || "").includes(searchQuery || "")
  );

  const totalPurchases = data.reduce((sum, item) => sum + (item.purchases || 0), 0);
  const totalSpend = data.reduce((sum, item) => sum + (item.spend || 0), 0);
  const totalImpressions = data.reduce((sum, item) => sum + (item.impressions || 0), 0);
  const totalReach = data.reduce((sum, item) => sum + (item.reach || 0), 0);
  const totalClicks = data.reduce((sum, item) => sum + (item.clicks || 0), 0);
  const totalLinkClicks = data.reduce((sum, item) => sum + (item.linkClicks || 0), 0);
  const totalAddsToCart = data.reduce((sum, item) => sum + (item.addsToCart || 0), 0);

  const totalCPP = totalPurchases > 0 ? totalSpend / totalPurchases : 0;
  const totalFrequency = totalReach > 0 ? totalImpressions / totalReach : 0;
  const totalCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const totalLinkCTR = totalImpressions > 0 ? (totalLinkClicks / totalImpressions) * 100 : 0;
  const totalCPC = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const totalCPCLink = totalLinkClicks > 0 ? totalSpend / totalLinkClicks : 0;

  return (
    <div className="flex flex-col h-full bg-[#f9fafb]">
      <div className="p-4 bg-white border-b flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
          <span className="text-[14px] font-semibold text-meta-dark">选择分析账户：</span>
          
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger render={
              <Button
                variant="outline"
                role="combobox"
                className="w-[300px] h-9 justify-between font-normal bg-white"
              />
            }>
              {selectedAccount 
                ? (accounts.find(acc => acc.accountId === selectedAccount)?.accountName || selectedAccount)
                : "选择广告账户..."}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </PopoverTrigger>
            <PopoverContent className="w-[300px] p-0" align="start">
              <div className="flex items-center border-b px-3">
                <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                <input
                  className="flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="搜索账户..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className="max-h-[300px] overflow-y-auto p-1">
                {filteredAccounts.length === 0 ? (
                  <p className="p-4 text-center text-sm text-gray-500">未找到匹配的账户</p>
                ) : (
                  filteredAccounts.map((acc) => (
                    <div
                      key={acc.accountId}
                      className={cn(
                        "relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-slate-100 hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 break-all",
                        selectedAccount === acc.accountId ? "bg-blue-50 text-blue-600 font-medium" : ""
                      )}
                      onClick={() => {
                        setSelectedAccount(acc.accountId);
                        setOpen(false);
                      }}
                    >
                      <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">{acc.accountName || acc.accountId}</span>
                      {selectedAccount === acc.accountId && (
                        <Check className="ml-auto h-4 w-4 text-blue-600" />
                      )}
                    </div>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>

        </div>
        
        <div className="flex bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab("gender_age")}
            className={cn("px-4 py-1.5 text-[13px] font-medium rounded-md transition-colors", activeTab === "gender_age" ? "bg-white text-meta-blue shadow-sm" : "text-gray-600 hover:text-gray-900")}
          >
            <Users className="w-4 h-4 inline-block mr-1.5 align-text-bottom" />
            性别与年龄
          </button>
          <button
            onClick={() => setActiveTab("country")}
            className={cn("px-4 py-1.5 text-[13px] font-medium rounded-md transition-colors", activeTab === "country" ? "bg-white text-meta-blue shadow-sm" : "text-gray-600 hover:text-gray-900")}
          >
            <MapPin className="w-4 h-4 inline-block mr-1.5 align-text-bottom" />
            国家/地区
          </button>
          <button
            onClick={() => setActiveTab("placement")}
            className={cn("px-4 py-1.5 text-[13px] font-medium rounded-md transition-colors", activeTab === "placement" ? "bg-white text-meta-blue shadow-sm" : "text-gray-600 hover:text-gray-900")}
          >
            <MonitorPlay className="w-4 h-4 inline-block mr-1.5 align-text-bottom" />
            广告版位
          </button>
        </div>
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        {!selectedAccount ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Users className="w-12 h-12 mb-2 opacity-50" />
            <p>请先选择一个广告账户以查看受众分析</p>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center h-[400px]">
            <Loader2 className="w-8 h-8 animate-spin text-meta-blue" />
            <p className="mt-4 text-sm text-gray-500">正在分析受众数据...</p>
          </div>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[400px] text-gray-400">
            <p>未找到该维度的受众数据 (请检查所选日期范围)</p>
          </div>
        ) : (
          <div className="space-y-6">
            <Card className="shadow-sm border-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-[15px]">核心受众消耗占比 (Top 10)</CardTitle>
              </CardHeader>
              <CardContent className="h-[350px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart data={data.slice(0, 10)} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 12, fill: '#6B7280' }} 
                      angle={-45}
                      textAnchor="end"
                    />
                    <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 12, fill: '#6B7280' }} 
                      tickFormatter={(val) => `$${val}`}
                    />
                    <RechartsTooltip 
                      cursor={{ fill: '#F3F4F6' }}
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      formatter={(value: any) => [`$${parseFloat(value).toFixed(2)}`, '花费金额']}
                    />
                    <Bar dataKey="spend" fill="#2563eb" radius={[4, 4, 0, 0]} maxBarSize={60} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="shadow-sm border-none overflow-hidden flex flex-col">
              <CardHeader className="bg-[#f9fafb] border-b pb-3">
                <CardTitle className="text-[15px]">受众成效明细报表</CardTitle>
              </CardHeader>
              <div 
                ref={tableContainerRef}
                onScroll={handleTableScroll}
                className="overflow-auto custom-scrollbar max-h-[500px] mb-0 border-b"
              >
                <Table className="text-[13px] border-collapse relative w-max min-w-full">
                  <TableHeader className="sticky top-0 z-20 bg-[#f9fafb] shadow-sm">
                    <TableRow>
                      {renderSortHeader("受众维度", "name", "left")}
                      {renderSortHeader("购物次数", "purchases", "right")}
                      {renderSortHeader("单次购物费用", "cpp", "right")}
                      {renderSortHeader("花费金额", "spend", "right")}
                      {renderSortHeader("展示次数", "impressions", "right")}
                      {renderSortHeader("覆盖人数", "reach", "right")}
                      {renderSortHeader("频次", "frequency", "right")}
                      {renderSortHeader("链接点击量", "linkClicks", "right")}
                      {renderSortHeader("链接点击率", "linkCTR", "right")}
                      {renderSortHeader("单次链接点击", "cpcLink", "right")}
                      {renderSortHeader("点击量", "clicks", "right")}
                      {renderSortHeader("点击率", "ctr", "right")}
                      {renderSortHeader("单次点击", "cpc", "right")}
                      {renderSortHeader("加入购物车", "addsToCart", "right")}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedData.map((row, idx) => {
                      return (
                        <TableRow key={idx} className="hover:bg-gray-50 border-b group">
                          <TableCell className="font-medium px-4 sticky left-0 z-10 bg-white group-hover:bg-gray-50 shadow-[1px_0_0_#e5e7eb] text-meta-blue max-w-[200px] truncate" title={row.name}>{row.name}</TableCell>
                          <TableCell className="text-right font-semibold">{row.purchases}</TableCell>
                          <TableCell className="text-right">${row.cpp.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-medium text-meta-dark">
                            ${row.spend.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">{row.impressions.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{row.reach.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{row.frequency.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{row.linkClicks}</TableCell>
                          <TableCell className="text-right">{row.linkCTR.toFixed(2)}%</TableCell>
                          <TableCell className="text-right">${row.cpcLink.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{row.clicks}</TableCell>
                          <TableCell className="text-right">{row.ctr.toFixed(2)}%</TableCell>
                          <TableCell className="text-right">${row.cpc.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{row.addsToCart}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                  {sortedData.length > 0 && (
                    <TableFooter className="sticky bottom-0 z-20 bg-gray-50 shadow-[0_-1px_0_#e5e7eb] font-semibold border-t">
                      <TableRow className="hover:bg-gray-50">
                        <TableCell className="px-4 sticky left-0 z-30 bg-gray-50 shadow-[1px_0_0_#e5e7eb]">
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold">{data.length} 个受众维度的汇总</span>
                            <span className="text-xs font-normal text-muted-foreground mt-0.5">成效汇总</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right align-top pt-4 text-sm">{totalPurchases}</TableCell>
                        <TableCell className="text-right align-top pt-4">${totalCPP.toFixed(2)}</TableCell>
                        <TableCell className="text-right align-top pt-4 text-meta-dark">${totalSpend.toFixed(2)}</TableCell>
                        <TableCell className="text-right align-top pt-4">{totalImpressions.toLocaleString()}</TableCell>
                        <TableCell className="text-right align-top pt-4">{totalReach.toLocaleString()}</TableCell>
                        <TableCell className="text-right align-top pt-4">{totalFrequency.toFixed(2)}</TableCell>
                        <TableCell className="text-right align-top pt-4">{totalLinkClicks.toLocaleString()}</TableCell>
                        <TableCell className="text-right align-top pt-4">{totalLinkCTR.toFixed(2)}%</TableCell>
                        <TableCell className="text-right align-top pt-4">${totalCPCLink.toFixed(2)}</TableCell>
                        <TableCell className="text-right align-top pt-4">{totalClicks.toLocaleString()}</TableCell>
                        <TableCell className="text-right align-top pt-4">{totalCTR.toFixed(2)}%</TableCell>
                        <TableCell className="text-right align-top pt-4">${totalCPC.toFixed(2)}</TableCell>
                        <TableCell className="text-right align-top pt-4">{totalAddsToCart.toLocaleString()}</TableCell>
                      </TableRow>
                    </TableFooter>
                  )}
                </Table>
              </div>

              {/* Slider & Scrolling controls right beneath the summary footer */}
              {data.length > 0 && (
                <div className="px-4 py-3 bg-slate-50 border-t flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs text-slate-500">
                  <div className="flex items-center gap-3 flex-1">
                    <span className="shrink-0 font-bold text-slate-700 select-none">左右滑动 ↔:</span>
                    <div className="flex-1 max-w-sm h-1.5 bg-slate-200 rounded-full relative group">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={scrollPercent}
                        onChange={(e) => {
                          const percent = parseFloat(e.target.value);
                          setScrollPercent(percent);
                          if (tableContainerRef.current) {
                            const { scrollWidth, clientWidth } = tableContainerRef.current;
                            tableContainerRef.current.scrollLeft = (percent / 100) * (scrollWidth - clientWidth);
                          }
                        }}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                      />
                      <div 
                        className="absolute left-0 top-0 h-full bg-meta-blue rounded-full transition-all duration-75"
                        style={{ width: `${scrollPercent}%` }}
                      />
                      <div 
                        className="absolute h-3.5 w-3.5 bg-white border-2 border-meta-blue rounded-full -top-1 shadow cursor-pointer transition-transform group-hover:scale-110"
                        style={{ left: `calc(${scrollPercent}% - 7px)` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 justify-end">
                    <Button
                      variant="outline"
                      size="xs"
                      className="h-7 text-xs px-3 border-slate-200 bg-white"
                      onClick={() => {
                        if (tableContainerRef.current) {
                          tableContainerRef.current.scrollBy({ left: -250, behavior: "smooth" });
                        }
                      }}
                    >
                      ← 向左
                    </Button>
                    <Button
                      variant="outline"
                      size="xs"
                      className="h-7 text-xs px-3 border-slate-200 bg-white"
                      onClick={() => {
                        if (tableContainerRef.current) {
                          tableContainerRef.current.scrollBy({ left: 250, behavior: "smooth" });
                        }
                      }}
                    >
                      向右 →
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

