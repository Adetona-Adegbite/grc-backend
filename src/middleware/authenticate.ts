import { Request, Response, NextFunction } from "express";
import { verifyAccessToken, TokenPayload } from "../utils/jwt";

declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

export interface AuthRequest extends Request {
  user?: TokenPayload;
}

export const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ data: null, error: "No token provided" });
      return;
    }

    const parts = authHeader.split(" ");
    if (parts.length !== 2) {
      res.status(401).json({ data: null, error: "Invalid token format" });
      return;
    }

    const token = parts[1] as string;
    const payload = verifyAccessToken(token) as TokenPayload;
    req.user = payload;
    next();
  } catch (error) {
    res.status(401).json({ data: null, error: "Invalid or expired token" });
  }
};

export const requireRole = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ data: null, error: "Access denied" });
      return;
    }
    next();
  };
};
