import { type Request, type Response, type NextFunction } from "express";
import type { AuthUser } from "@workspace/api-zod";
import { overrideDb } from "@workspace/db";
import { clearSession, getSession, getSessionId } from "../lib/auth";

/**
 * Task #7 bulkhead: any request matched here is routed off the main
 * DB pool for its session lookup. Keep the matcher tight — only the
 * clinical override path needs this carve-out today.
 *
 * We use `req.path` (not `req.url`) so a query string or trailing
 * fragment cannot bypass the matcher, and we compare the *suffix*
 * after stripping any reverse-proxy / base-path prefix so deployments
 * mounted under a path other than `/` still bulkhead correctly.
 */
const OVERRIDE_PATH_SUFFIX = "/api/delivery/dispatch/override";
function isOverrideCriticalPath(req: Request): boolean {
  if (req.method !== "POST") return false;
  // req.path is already query-string-stripped. originalUrl carries the
  // pre-rewrite URL when an upstream proxy strips a base path; we test
  // both so the matcher works in either deployment topology.
  const candidates = [req.path, req.originalUrl?.split("?")[0] ?? ""];
  return candidates.some(
    (p) => p === OVERRIDE_PATH_SUFFIX || p.endsWith(OVERRIDE_PATH_SUFFIX),
  );
}

declare global {
  namespace Express {
    interface User extends AuthUser {}

    interface Request {
      isAuthenticated(): this is AuthedRequest;

      user?: User | undefined;
    }

    export interface AuthedRequest {
      user: User;
    }
  }
}

/**
 * Phone-OTP sessions live in the `sessions` table and are looked up by the
 * `sid` cookie (or `Authorization: Bearer <sid>` header). They have no
 * refresh-token flow — sessions are valid until their expiry row is reached.
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  req.isAuthenticated = function (this: Request) {
    return this.user != null;
  } as Request["isAuthenticated"];

  const sid = getSessionId(req);
  if (!sid) {
    next();
    return;
  }

  // Task #7 bulkhead: the clinical override critical path NEVER
  // touches the main DB pool. If the staff member is session-authed
  // we still resolve `req.user` (so audit logs carry their identity),
  // but we do it via the dedicated `overrideDb` carve-out — even
  // when the main pool is fully saturated by background dispatch
  // work, the override path can always resolve its session. The
  // route handler still enforces ops scope via `isOpsRequest`.
  const sessionDb = isOverrideCriticalPath(req) ? overrideDb : undefined;
  const session = sessionDb
    ? await getSession(sid, sessionDb)
    : await getSession(sid);
  if (!session?.user?.id) {
    await clearSession(res, sid, sessionDb);
    next();
    return;
  }

  req.user = session.user;
  next();
}
