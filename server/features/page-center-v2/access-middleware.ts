import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "../../middlewares/auth.middleware.js";
import {
  evaluatePageCenterV2Access,
  type PageCenterV2AccessDecision,
  type PageCenterV2Environment,
} from "./access.js";

export type PageCenterV2Request = AuthenticatedRequest & {
  pageCenterV2Access?: PageCenterV2AccessDecision;
};

export function noStore(res: Response) {
  res.setHeader("Cache-Control", "private, no-store");
}

export function requirePageCenterV2(environment: PageCenterV2Environment) {
  return (req: PageCenterV2Request, res: Response, next: NextFunction) => {
    noStore(res);
    if (!req.user) {
      return res.status(401).json({
        success: false,
        code: "PAGE_CENTER_V2_UNAUTHENTICATED",
        message: "请先登录后再访问公共主页中心。",
      });
    }

    const decision = evaluatePageCenterV2Access(req.user, environment);
    req.pageCenterV2Access = decision;
    if (!decision.moduleEnabled) {
      return res.status(404).json({
        success: false,
        code: "PAGE_CENTER_V2_DISABLED",
        message: "公共主页中心 B 通道当前未启用。",
      });
    }
    if (!decision.available) {
      return res.status(403).json({
        success: false,
        code: "PAGE_CENTER_V2_NOT_IN_COHORT",
        message: "当前用户不在公共主页中心 B 组。",
      });
    }
    return next();
  };
}
