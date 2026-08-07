/**
 * AuthContext — JWT 认证上下文
 * 替代原有的 localStorage.isAuthenticated 伪认证
 */
import React, { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

export interface AuthUser {
  id: number;
  email: string;
  role?: string;
  org_id?: string;
}

interface AuthState {
  isAuthenticated: boolean;
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function parseJwt(token: string): { exp?: number; id?: number; email?: string } | null {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

function isValidToken(token: string | null): boolean {
  if (!token) return false;
  const payload = parseJwt(token);
  if (!payload || !payload.exp) return false;
  return payload.exp * 1000 > Date.now();
}

function loadAuthFromStorage(): AuthState {
  try {
    const token = localStorage.getItem("token");
    const userStr = localStorage.getItem("user");

    if (token && isValidToken(token) && userStr) {
      const user = JSON.parse(userStr) as AuthUser;
      return { isAuthenticated: true, user, token, isLoading: false };
    }

    // Token 无效或过期，清理存储
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("isAuthenticated");
    return { isAuthenticated: false, user: null, token: null, isLoading: false };
  } catch {
    return { isAuthenticated: false, user: null, token: null, isLoading: false };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(() => ({
    ...loadAuthFromStorage(),
    isLoading: true,
  }));

  // 初始化时验证 token
  useEffect(() => {
    const loaded = loadAuthFromStorage();
    setState({ ...loaded, isLoading: false });
  }, []);

  const login = useCallback((token: string, user: AuthUser) => {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(user));
    // 保留 isAuthenticated 以兼容可能的旧代码引用
    localStorage.setItem("isAuthenticated", "true");
    setState({ isAuthenticated: true, user, token, isLoading: false });
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("isAuthenticated");
    setState({ isAuthenticated: false, user: null, token: null, isLoading: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
