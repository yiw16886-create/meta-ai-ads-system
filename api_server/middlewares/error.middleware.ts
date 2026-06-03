import { Request, Response, NextFunction } from "express";
import config from "../config/index";

export interface AppError extends Error {
  status?: number;
  statusCode?: number;
}

export function errorMiddleware(
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "An unexpected system error occurred";

  console.error(`💥 [Error Interceptor] [${req.method}] ${req.path} -> Status: ${status}`, err);

  res.status(status).json({
    success: false,
    error: message,
    ...(config.env.nodeEnv !== "production" ? { stack: err.stack } : {}),
  });
}
