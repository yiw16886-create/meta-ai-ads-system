import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import axios from 'axios';

// Set up global axios request interceptor for multi-user isolation
axios.interceptors.request.use((config) => {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    if (user && user.id) {
      config.headers["x-user-id"] = String(user.id);
    }
    const token = localStorage.getItem("token");
    if (token) {
      config.headers["Authorization"] = `Bearer ${token}`;
    }
  } catch (e) {
    console.warn("Failed to parse user from localStorage in axios interceptor", e);
  }
  return config;
});

// Set up global axios response interceptor to handle authorization failures
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const isUnauthorized = error.response && (
      error.response.status === 401 ||
      (error.response.status === 403 && 
       error.response.data && 
       typeof error.response.data.error === "string" && 
       (error.response.data.error.includes("Token") || 
        error.response.data.error.includes("验证") || 
        error.response.data.error.includes("过期")))
    );
    if (isUnauthorized) {
      console.warn("Unauthorized or expired token access - clearing session");
      try {
        localStorage.clear();
        if (window.location.pathname !== "/") {
          window.location.href = "/";
        } else {
          window.location.reload();
        }
      } catch (e) {
        console.error("Failed to clear local session", e);
      }
    }
    return Promise.reject(error);
  }
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
