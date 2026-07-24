import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { Lock, Eye, EyeOff, KeyRound, CheckCircle2, AlertCircle, Loader2, ArrowLeft, ShieldCheck } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface AcceptInvitePageProps {
  onLogin: () => void;
}

export function AcceptInvitePage({ onLogin }: AcceptInvitePageProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [verifying, setVerifying] = useState(true);
  const [validToken, setValidToken] = useState(false);
  const [invitedEmail, setInvitedEmail] = useState("");
  const [role, setRole] = useState("member");
  const [errorMessage, setErrorMessage] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    if (!token) {
      setVerifying(false);
      setValidToken(false);
      setErrorMessage("缺失邀请 Token，无法校验激活信息。");
      return;
    }

    const verifyInviteToken = async () => {
      setVerifying(true);
      try {
        const res = await axios.post(
          "/api/auth/verify-token", 
          { token },
          { headers: { "Content-Type": "application/json" } }
        );
        if (!isMounted) return;

        if (res.data && res.data.success) {
          setValidToken(true);
          setInvitedEmail(res.data.data?.email || "");
          setRole(res.data.data?.role || "member");
        } else {
          setValidToken(false);
          setErrorMessage(res.data?.error || "邀请链接无效或已过期");
        }
      } catch (err: any) {
        if (!isMounted) return;
        console.error("Failed to verify invite token:", err);
        setValidToken(false);
        setErrorMessage(
          err.response?.data?.error || "邀请信息校验失败，链接可能已过期或已被使用。"
        );
      } finally {
        if (isMounted) {
          setVerifying(false);
        }
      }
    };

    verifyInviteToken();

    return () => {
      isMounted = false;
    };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password || password.length < 6) {
      toast.error("密码长度至少需要 6 个字符");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("两次输入的密码不一致");
      return;
    }

    setSubmitting(true);
    try {
      const res = await axios.post(
        "/api/auth/register",
        { token, password },
        { headers: { "Content-Type": "application/json" } }
      );

      if (res.data && res.data.success) {
        toast.success("账号激活成功！正为您登录并进入仪表板...");

        // Save session info
        localStorage.setItem("isAuthenticated", "true");
        localStorage.setItem("user", JSON.stringify(res.data.user));
        if (res.data.token) {
          localStorage.setItem("token", res.data.token);
        }

        setTimeout(() => {
          onLogin();
          navigate("/", { replace: true });
        }, 1000);
      } else {
        toast.error(res.data?.error || "激活失败，请重试");
      }
    } catch (err: any) {
      console.error("Account activation error:", err);
      toast.error(err.response?.data?.error || "账号激活失败，请联系系统管理员");
    } finally {
      setSubmitting(false);
    }
  };

  const getRoleDisplayName = (roleName: string) => {
    const r = roleName.toUpperCase();
    if (r === "SUPER_ADMIN") return "超级管理员";
    if (r === "ADMIN") return "管理员";
    return "团队成员";
  };

  return (
    <div className="min-h-screen w-screen flex items-center justify-center bg-slate-900 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.15),rgba(255,255,255,0))] p-4">
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600/10 border border-blue-500/20 text-blue-400 mb-3">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Meta Insights Pro</h1>
          <p className="text-sm text-slate-400 mt-1">团队邀请激活与密码设置</p>
        </div>

        <Card className="bg-slate-800/90 border-slate-700/80 shadow-2xl backdrop-blur-sm text-slate-100 overflow-hidden">
          {verifying ? (
            <CardContent className="p-8 text-center flex flex-col items-center justify-center space-y-4">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-200">邀请信息校验中...</p>
                <p className="text-xs text-slate-400">正在与服务器确认 Token 安全有效性</p>
              </div>
            </CardContent>
          ) : !validToken ? (
            <CardContent className="p-8 text-center space-y-6">
              <div className="mx-auto w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-white">邀请链接失效或无效</h3>
                <p className="text-sm text-slate-400 max-w-xs mx-auto">
                  {errorMessage || "该邀请链接可能已过期、已被使用或不存在。"}
                </p>
              </div>
              <div className="pt-2">
                <Link to="/">
                  <Button variant="outline" className="w-full border-slate-600 text-slate-200 hover:bg-slate-700">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    返回登录页面
                  </Button>
                </Link>
              </div>
            </CardContent>
          ) : (
            <>
              <CardHeader className="space-y-1 pb-4 border-b border-slate-700/50">
                <CardTitle className="text-lg font-semibold text-white flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  完成账户激活
                </CardTitle>
                <CardDescription className="text-slate-400 text-xs">
                  请为您的受邀账户设置专属登录密码
                </CardDescription>
              </CardHeader>

              <CardContent className="p-6 space-y-6">
                <div className="bg-slate-900/60 rounded-lg p-3.5 border border-slate-700/50 space-y-2 text-xs">
                  <div className="flex justify-between items-center text-slate-300">
                    <span className="text-slate-400">受邀邮箱:</span>
                    <span className="font-mono font-medium text-blue-300">{invitedEmail}</span>
                  </div>
                  <div className="flex justify-between items-center text-slate-300">
                    <span className="text-slate-400">分配角色:</span>
                    <span className="bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded font-medium">
                      {getRoleDisplayName(role)}
                    </span>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-blue-400" />
                      设置新密码
                    </label>
                    <div className="relative">
                      <Input
                        type={showPassword ? "text" : "password"}
                        placeholder="请输入至少 6 位的新密码"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="bg-slate-900/80 border-slate-700 text-white placeholder:text-slate-500 pr-10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        required
                        minLength={6}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-blue-400" />
                      确认新密码
                    </label>
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="请再次输入新密码"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="bg-slate-900/80 border-slate-700 text-white placeholder:text-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      required
                      minLength={6}
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={submitting}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 mt-2 shadow-lg shadow-blue-600/20"
                  >
                    {submitting ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        正在激活账户...
                      </span>
                    ) : (
                      "确认设置并激活账号"
                    )}
                  </Button>
                </form>
              </CardContent>
            </>
          )}
        </Card>
      </motion.div>
    </div>
  );
}
