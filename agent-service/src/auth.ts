/**
 * Verifies that the requesting Wiki.js user is in the admin group.
 *
 * In production, the reverse proxy (Caddy) should forward the user's session
 * cookie to this service, and we validate it against the Wiki.js GraphQL
 * `me` query. For MVP we accept the header `X-User` with a JSON payload
 * `{ "user": "<email>", "groups": ["admins"] }` injected by the proxy or by
 * a thin middleware on the Wiki.js side.
 *
 * Replace this with proper SSO/JWT verification before going to production.
 */
import type { Request, Response, NextFunction } from "express";
import { config } from "./config.js";

export interface AuthedUser {
  user: string;
  groups: string[];
}

declare module "express-serve-static-core" {
  interface Request {
    auth?: AuthedUser;
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const raw = req.header("X-User");
  if (!raw) {
    res.status(401).json({ error: "missing X-User header" });
    return;
  }
  try {
    const parsed = JSON.parse(raw) as AuthedUser;
    if (!parsed.groups?.includes(config.adminGroup)) {
      res.status(403).json({ error: "admin group required" });
      return;
    }
    req.auth = parsed;
    next();
  } catch {
    res.status(400).json({ error: "invalid X-User header" });
  }
}
