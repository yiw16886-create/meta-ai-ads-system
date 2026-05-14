import React, { useState } from "react";
import { Lock, Eye, EyeOff, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface LoginPageProps {
  onLogin: () => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Pure frontend validation using VITE environment variables
      const validId = import.meta.env.VITE_ADMIN_ID || "admin";
      const validSecret = import.meta.env.VITE_ADMIN_SECRET || "123456";

      if (appId === validId && appSecret === validSecret) {
        try {
          localStorage.setItem("isAuthenticated", "true");
        } catch (e) {
          console.warn("localStorage not available, authentication state may not persist");
        }
        toast.success("登录成功，欢迎回来");
        onLogin();
      } else {
        toast.error("应用 ID 或密钥错误");
      }
    } catch (error: any) {
      toast.error("登录时发生错误");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-[#f0f2f5]">
      <Card className="w-[400px] shadow-2xl border-none">
        <CardHeader className="space-y-1 text-center pb-8 border-b">
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 bg-meta-blue rounded-2xl flex items-center justify-center shadow-lg transform rotate-3">
              <Lock className="text-white w-7 h-7" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Meta Insights Pro</CardTitle>
          <p className="text-sm text-muted-foreground">店铺多平台整合面板</p>
        </CardHeader>
        <CardContent className="pt-8">
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">账户名</label>
              <Input 
                placeholder="请输入账户/邮箱" 
                value={appId} 
                onChange={(e) => setAppId(e.target.value)} 
                required
                className="h-12 border-gray-200 focus:border-meta-blue focus:ring-meta-blue"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">登录密码</label>
              <div className="relative">
                <Input 
                  type={showSecret ? "text" : "password"} 
                  placeholder="请输入访问密码" 
                  value={appSecret} 
                  onChange={(e) => setAppSecret(e.target.value)} 
                  required
                  className="h-12 pr-12 border-gray-200 focus:border-meta-blue focus:ring-meta-blue"
                />
                <button 
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-meta-blue transition-colors"
                >
                  {showSecret ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full h-12 bg-meta-blue hover:bg-blue-600 font-bold text-lg shadow-md transition-all active:scale-[0.98]" disabled={loading}>
              {loading ? <RefreshCcw className="animate-spin w-5 h-5 mr-2" /> : "立即登录"}
            </Button>
            <div className="text-center">
              <p className="text-xs text-meta-text-muted">受加密协议保护，仅限授权人员操作</p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
