import React, { useState, useEffect } from "react";
import axios from "axios";
import { Lock, Eye, EyeOff, RefreshCcw, UserPlus, KeyRound, ArrowLeft } from "lucide-react";
import { motion } from "motion/react";
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
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  
  const [token, setToken] = useState(new URLSearchParams(window.location.search).get("token"));
  const [invitedEmail, setInvitedEmail] = useState("");
  const [mode, setMode] = useState<"login" | "register" | "reset">("login");

  useEffect(() => {
    if (token) {
      console.log("🔍 Found activation token, verifying...");
      const verifyToken = async () => {
        try {
          const res = await axios.post('/api/auth/verify-token', { token });
          if (res.data.success) {
            setInvitedEmail(res.data.data.email);
            setMode("register");
            toast.success("邀请验证成功，请设置登录密码");
          } else {
            toast.error(res.data.error || "邀请链接无效");
            setToken(null);
          }
        } catch (e) {
          console.error("Token verification error:", e);
          toast.error("验证邀请码失败，请联系管理员");
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
        if (res.data.token) {
          localStorage.setItem("token", res.data.token);
        }
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
    
    if (password !== confirmPassword) {
      toast.error("两次输入的密码不一致");
      return;
    }
    
    if (password.length < 6) {
      toast.error("密码长度至少需要 6 个字符");
      return;
    }

    setLoading(true);
    try {
      const payload = token ? { token, password } : { email, password };
      const res = await axios.post('/api/auth/register', payload);
      if (res.data.success) {
        toast.success(token ? "账户激活成功，正为您进入仪表板..." : "注册成功，正为您进入仪表板...");
        
        // Auto-login after successful registration
        localStorage.setItem("isAuthenticated", "true");
        localStorage.setItem("user", JSON.stringify(res.data.user));
        if (res.data.token) {
          localStorage.setItem("token", res.data.token);
        }
        
        // Clear token from URL
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Brief delay before redirecting to dashboard
        setTimeout(() => {
          onLogin();
        }, 1000);
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || "注册失败");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast.error("两次输入的密码不一致");
      return;
    }
    
    if (password.length < 6) {
      toast.error("密码长度至少需要 6 个字符");
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post('/api/auth/reset-password', { email, new_password: password });
      if (res.data.success) {
        toast.success("密码重置成功，请使用新密码登录");
        setMode("login");
        setPassword("");
        setConfirmPassword("");
      }
    } catch (error: any) {
      toast.error(error.response?.data?.error || "密码重置失败");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    if (mode === "login") {
      handleLogin(e);
    } else if (mode === "register") {
      handleRegister(e);
    } else {
      handleResetPassword(e);
    }
  };

  // Helper colors & styles based on state
  const isInvitedRegister = !!token && mode === "register";
  const ringColor = mode === "register" ? "ring-green-500" : mode === "reset" ? "ring-amber-500" : "ring-meta-blue";
  const accentColor = mode === "register" ? "bg-green-500" : mode === "reset" ? "bg-amber-500" : "bg-meta-blue";
  const btnColor = mode === "register" ? "bg-green-600 hover:bg-green-700" : mode === "reset" ? "bg-amber-600 hover:bg-amber-700" : "bg-meta-blue hover:bg-blue-600";

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#f0f2f5] p-4 font-sans">
      <Card className={`w-full max-w-[420px] shadow-2xl border-none overflow-hidden transition-all duration-500 ${mode !== "login" ? `ring-2 ${ringColor} ring-offset-4` : ''}`}>
        <CardHeader className="space-y-2 text-center pb-8 border-b bg-white relative">
          {mode !== "login" && !token && (
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setPassword("");
                setConfirmPassword("");
              }}
              className="absolute left-6 top-8 text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1 text-sm font-medium cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" /> 返回
            </button>
          )}
          
          <div className="flex justify-center mb-4">
            <motion.div 
              key={mode}
              initial={{ scale: 0.8, opacity: 0, rotate: -15 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              transition={{ type: "spring", stiffness: 200 }}
              className={`w-16 h-16 ${accentColor} rounded-2xl flex items-center justify-center shadow-lg`}
            >
              {mode === "register" ? (
                <UserPlus className="text-white w-8 h-8" />
              ) : mode === "reset" ? (
                <KeyRound className="text-white w-8 h-8" />
              ) : (
                <Lock className="text-white w-8 h-8" />
              )}
            </motion.div>
          </div>
          
          <CardTitle className="text-2xl font-black tracking-tight text-gray-900">
            {isInvitedRegister ? "激活您的管理账户" : mode === "register" ? "创建新账户" : mode === "reset" ? "重置访问密码" : "Meta Insights Pro"}
          </CardTitle>
          
          <div className="flex flex-col items-center gap-1">
            {isInvitedRegister ? (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                {invitedEmail}
              </span>
            ) : (
              <p className="text-sm text-gray-500">
                {mode === "register" ? "快速注册多用户隔离账户" : mode === "reset" ? "请输入您的绑定邮箱来设置新密码" : "Meta 广告数据整合与分析平台"}
              </p>
            )}
            {isInvitedRegister && (
              <p className="text-xs text-meta-text-muted mt-2">
                请为您的账户设置访问密码，设置完成后将自动进入系统
              </p>
            )}
          </div>
        </CardHeader>
        
        <CardContent className="pt-8 pb-10 bg-white">
          <form onSubmit={handleSubmit} className="space-y-5">
            {!isInvitedRegister && (
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-700">账户邮箱</label>
                <div className="relative">
                  <Input 
                    type="email"
                    placeholder="请输入您的邮箱地址" 
                    value={email} 
                    onChange={(e) => setEmail(e.target.value)} 
                    required
                    className="h-12 bg-gray-50 border-gray-200 focus:bg-white focus:border-meta-blue focus:ring-meta-blue transition-all"
                  />
                </div>
              </div>
            )}
            
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-700">
                {mode === "register" ? "账户密码" : mode === "reset" ? "设置新密码" : "访问密码"}
              </label>
              <div className="relative">
                <Input 
                  type={showSecret ? "text" : "password"} 
                  placeholder={mode === "register" ? "设置至少 6 位数的密码" : mode === "reset" ? "设置至少 6 位数的新密码" : "请输入您的密码"} 
                  value={password} 
                  onChange={(e) => setPassword(e.target.value)} 
                  required
                  className="h-12 bg-gray-50 pr-12 border-gray-200 focus:bg-white focus:border-meta-blue focus:ring-meta-blue transition-all"
                />
                <button 
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-meta-blue transition-colors cursor-pointer"
                >
                  {showSecret ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {mode !== "login" && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                className="space-y-2"
              >
                <label className="text-sm font-bold text-gray-700">再次确认密码</label>
                <Input 
                  type={showSecret ? "text" : "password"} 
                  placeholder="请再次输入以确认" 
                  value={confirmPassword} 
                  onChange={(e) => setConfirmPassword(e.target.value)} 
                  required
                  className="h-12 bg-gray-50 border-gray-200 focus:bg-white focus:border-meta-blue focus:ring-meta-blue transition-all"
                />
              </motion.div>
            )}

            <Button 
              type="submit" 
              className={`w-full h-12 ${btnColor} text-white font-black text-lg shadow-xl shadow-blue-500/10 transition-all active:scale-[0.98] mt-4`} 
              disabled={loading}
            >
              {loading ? (
                <RefreshCcw className="animate-spin w-5 h-5 mr-2" />
              ) : (
                mode === "register" ? "注 册" : mode === "reset" ? "重置密码" : "登 录"
              )}
            </Button>
            
            {/* Front-end mode toggling links */}
            {mode === "login" && (
              <div className="flex items-center justify-between mt-4 text-xs font-semibold text-gray-500">
                <button
                  type="button"
                  onClick={() => {
                    setMode("register");
                    setPassword("");
                    setConfirmPassword("");
                  }}
                  className="text-meta-blue hover:underline cursor-pointer"
                >
                  没有账号？立即注册
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("reset");
                    setPassword("");
                    setConfirmPassword("");
                  }}
                  className="text-amber-600 hover:underline cursor-pointer"
                >
                  忘记密码？
                </button>
              </div>
            )}

            {mode !== "login" && !token && (
              <div className="text-center mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setPassword("");
                    setConfirmPassword("");
                  }}
                  className="text-xs font-semibold text-meta-text-muted hover:text-meta-blue hover:underline cursor-pointer"
                >
                  已有账户？返回登录
                </button>
              </div>
            )}
            
            <div className="text-center mt-6">
              <p className="text-[10px] uppercase tracking-widest font-bold text-gray-400">
                Enterprise Data Security Standard
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
