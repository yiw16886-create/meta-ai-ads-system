import express from "express";
import path from "path";
import config from "./config/index.js";
import routes from "./routes/index.js";
import { errorMiddleware, loggerMiddleware } from "./middlewares/index.js";
import { checkDb } from "./config/db-init.js";
import { initCronJobs } from "./jobs/sync.job.js";

const app = express();

// Global Request Interceptors & Parsers
app.use(express.json());
app.use(loggerMiddleware);

// API Routing Table
app.use("/api", routes);

// Centralized Health-Check Output
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    env: config.env.nodeEnv,
    vercel: config.env.isVercel,
    dbUrlPrefix: config.db.url ? config.db.url.substring(0, 20) + "..." : null,
  });
});

// Front-end Assets Delivery & Vite Hot Reload Middleware
async function configureFrontend() {
  if (config.env.nodeEnv !== "production") {
    console.log("🛠️ Initializing Vite development middleware...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true, host: "0.0.0.0", allowedHosts: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else if (!config.env.isVercel) {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }
}

// Global Exception Interceptor
app.use(errorMiddleware);

// Boot sequence handling environment variances (Standalone vs. Serverless)
if (!config.env.isVercel) {
  configureFrontend().then(() => {
    app.listen(config.port, "0.0.0.0", () => {
      console.log(`✅ Server is ready on port ${config.port}`);
      // Asynchronous non-blocking handshake
      checkDb().catch((err) => console.error("❌ DB Check failed:", err));
      initCronJobs();
    });
  });
} else {
  checkDb().catch((err) => console.error("❌ Serverless DB Check failed:", err));
}

// Global process fail-safe bounds
process.on("uncaughtException", (err) => console.error("🔥 UNCAUGHT EXCEPTION:", err));
process.on("unhandledRejection", (r) => console.error("🔥 UNHANDLED REJECTION:", r));

export default app;
