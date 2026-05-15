import React, { useState, useEffect } from "react";
import axios from "axios";
import { Lock, Eye, EyeOff, RefreshCcw, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface LoginPageProps {
  onLogin: () => void;
}

export function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  
  const [token, setToken] = useState(new URLSearchParams(window.location.search).get("token"));
  const [invitedEmail, setInvitedEmail] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);

  useEffect(() => {
    if (token) {
      const verifyToken = async () => {
        try {
          const res = await axios.post('/api/auth/verify-token', { token });
          if (res.data.success) {
            setInvitedEmail(res.data.data.email);
            setIsRegistering(true);
          } else {
            toast.error(res.data.error || "邀请链接无效");
            setToken(null);
          }
        } catch (e) {
          toast.error("验证邀请码失败");
          setToken(null);
        }
      };
      verifyToken();
    }
  }, [token]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await axios.post('/api/auth/login', { email, password });
      if (res.data.success) {
        localStorage.setItem("isAuthenticated", "true");
        localStorage.setItem("user", JSON.stringify(res.data.user));
        toast.success("登录成功，欢迎回来");
        onLogin();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || "账号或密码错误");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await axios.post('/api/auth/register', { token, password });
      if (res.data.success) {
        toast.success("账户激活成功，请登录");
        setIsRegistering(false);
        setToken(null);
        setEmail(invitedEmail);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || "注册失败");
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
              {isRegistering ? <UserPlus className="text-white w-7 h-7" /> : <Lock className="text-white w-7 h-7" />}
            </div>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">
            {isRegistering ? "激活您的账户" : "Meta Insights Pro"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {isRegistering ? `为 ${invitedEmail} 设置登录密码` : "店铺多平台整合面板"}
          </p>
        </CardHeader>
        <CardContent className="pt-8">
          <form onSubmit={isRegistering ? handleRegister : handleLogin} className="space-y-5">
            {!isRegistering && (
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700">账户名</label>
                <Input 
                  placeholder="请输入账户/邮箱" 
                  value={email} 
                  onChange={(e) => setEmail(e.target.value)} 
                  required
                  className="h-12 border-gray-200 focus:border-meta-blue focus:ring-meta-blue"
                />
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700">
                {isRegistering ? "设置新密码" : "登录密码"}
              </label>
              <div className="relative">
                <Input 
                  type={showSecret ? "text" : "password"} 
                  placeholder={isRegistering ? "请设置您的访问密码" : "请输入访问密码"} 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
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
              {loading ? <RefreshCcw className="animate-spin w-5 h-5 mr-2" /> : (isRegistering ? "激活并继续" : "立即登录")}
            </Button>
            <div className="text-center">
              <p className="text-xs text-meta-text-muted">受加密协议保护，仅限授人员操作</p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
