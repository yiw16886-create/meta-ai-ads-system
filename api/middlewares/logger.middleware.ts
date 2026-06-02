import { Request, Response, NextFunction } from "express";

export function loggerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const start = Date.now();
  
  // Custom response logging on finish
  res.on("finish", () => {
    const duration = Date.now() - start;
    const { method, originalUrl } = req;
    const { statusCode } = res;
    
    // Colored console logging mimic
    let statusColor = "\x1b[32m"; // Green
    if (statusCode >= 400 && statusCode < 500) {
      statusColor = "\x1b[33m"; // Yellow
    } else if (statusCode >= 500) {
      statusColor = "\x1b[31m"; // Red
    }
    
    console.log(
      `[API Access] ${method} ${originalUrl} -> Status: ${statusColor}${statusCode}\x1b[0m (${duration}ms)`
    );
  });

  next();
}
