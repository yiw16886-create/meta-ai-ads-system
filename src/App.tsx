import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Dashboard } from "./components/Dashboard";
import { LoginPage } from "./components/LoginPage";
import { AcceptInvitePage } from "./components/AcceptInvitePage";
import { AccountDetailsPage } from "./components/AccountDetailsPage";
import { StoreDetailsPage } from "./components/StoreDetailsPage";
import { FloatingAIChat } from "./components/FloatingAIChat";
import { PrivacyPage } from "./components/PrivacyPage";
import { DataDeletionPage } from "./components/DataDeletionPage";
import { DeletionStatusPage } from "./components/DeletionStatusPage";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Toaster } from "sonner";
import { AuthProvider, useAuth, type AuthUser } from "./contexts/AuthContext";

function AppContent() {
  const { isAuthenticated, isLoading, login, logout } = useAuth();
  const location = useLocation();

  // 处理 URL 中的邀请 token
  useEffect(() => {
    try {
      const urlParams = new URLSearchParams(location.search);
      const token = urlParams.get("token");
      if (token) {
        // 有邀请 token 时清除当前登录状态，允许未登录访问
        logout();
      }
    } catch (e) {
      console.warn("Storage access failed in AppContent:", e);
    }
  }, [location.pathname, location.search, logout]);

  const handleLogin = (token: string, user: AuthUser) => {
    login(token, user);
  };

  const handleLogout = () => {
    logout();
  };

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/data-deletion-instructions" element={<DataDeletionPage />} />
      <Route path="/deletion-status" element={<DeletionStatusPage />} />
      <Route path="/accept-invite" element={<AcceptInvitePage onLogin={handleLogin} />} />
      <Route
        path="/*"
        element={
          !isAuthenticated ? (
            <LoginPage onLogin={handleLogin} />
          ) : (
            <>
              <Routes>
                <Route path="/" element={<Dashboard onLogout={handleLogout} />} />
                <Route path="/account/:accountId" element={<AccountDetailsPage onLogout={handleLogout} />} />
                <Route path="/store/new" element={<StoreDetailsPage onLogout={handleLogout} isNew={true} />} />
                <Route path="/store/:storeId" element={<StoreDetailsPage onLogout={handleLogout} />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              <FloatingAIChat />
            </>
          )
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-center" richColors />
        <ErrorBoundary>
          <AppContent />
        </ErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  );
}
