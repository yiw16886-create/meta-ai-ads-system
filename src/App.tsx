import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Dashboard } from "./components/Dashboard";
import { LoginPage } from "./components/LoginPage";
import { AccountDetailsPage } from "./components/AccountDetailsPage";
import { StoreDetailsPage } from "./components/StoreDetailsPage";
import { FloatingAIChat } from "./components/FloatingAIChat";
import { PrivacyPage } from "./components/PrivacyPage";
import { DataDeletionPage } from "./components/DataDeletionPage";
import { DeletionStatusPage } from "./components/DeletionStatusPage";
import { Toaster } from "sonner";

function AppContent({ isAuthenticated, setIsAuthenticated, checking, setChecking, handleLogin, handleLogout }: any) {
  const location = useLocation();

  useEffect(() => {
    console.log("🚀 Route change detected:", location.pathname, location.search);
    try {
      const urlParams = new URLSearchParams(location.search);
      const token = urlParams.get("token");
      if (token) {
        console.log("🔑 Found active invitation token in URL. Forcing unauthenticated state for password setup.");
        localStorage.removeItem("isAuthenticated");
        localStorage.removeItem("user");
        setIsAuthenticated(false);
      } else {
        const auth = localStorage.getItem("isAuthenticated");
        if (auth === "true") {
          setIsAuthenticated(true);
        }
      }
    } catch (e) {
      console.warn("Storage or location access failed in AppContent:", e);
    } finally {
      setChecking(false);
    }
  }, [location.pathname, location.search, setIsAuthenticated, setChecking]);

  if (checking) {
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    try {
      localStorage.clear();
      setIsAuthenticated(false);
    } catch (e) {
      console.error("Failed to clear localStorage on logout", e);
    }
  };

  return (
    <BrowserRouter>
      <Toaster position="top-center" richColors />
      <AppContent
        isAuthenticated={isAuthenticated}
        setIsAuthenticated={setIsAuthenticated}
        checking={checking}
        setChecking={setChecking}
        handleLogin={handleLogin}
        handleLogout={handleLogout}
      />
    </BrowserRouter>
  );
}
