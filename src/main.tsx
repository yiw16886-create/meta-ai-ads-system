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
    if (error.response && error.response.status === 401) {
      console.warn("Unauthorized access - clearing session");
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
