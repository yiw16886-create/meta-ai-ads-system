import React, { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Dashboard } from "./components/Dashboard";
import { LoginPage } from "./components/LoginPage";
import { AccountDetailsPage } from "./components/AccountDetailsPage";
import { StoreDetailsPage } from "./components/StoreDetailsPage";
import { FloatingAIChat } from "./components/FloatingAIChat";
import { Toaster } from "sonner";

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    console.log("🚀 App component mounted");
    try {
      const auth = localStorage.getItem("isAuthenticated");
      if (auth === "true") {
        setIsAuthenticated(true);
      }
    } catch (e) {
      console.warn("Storage access failed");
    } finally {
      setChecking(false);
    }
  }, []);

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    try {
      localStorage.removeItem("isAuthenticated");
      setIsAuthenticated(false);
    } catch (e) {}
  };

  if (checking) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Toaster position="top-center" richColors />
      {!isAuthenticated ? (
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
      )}
    </BrowserRouter>
  );
}
