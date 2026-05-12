import { type Request, type Response, type NextFunction } from "express";
import type { AuthUser } from "@workspace/api-zod";
import { clearSession, getSession, getSessionId } from "../lib/auth";

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

  // Task #7 bulkhead fast path: the clinical override route enforces
  // its OWN ops scope via `isOpsRequest` (x-admin-token / admin cookie
  // / OPS_USER_IDS allowlist). When the request is gated by the admin
  // token there is no session SID anyway, so we deliberately skip the
  // main-pool `getSession()` lookup to keep the override path off the
  // saturated main DB pool. If a SID *is* present (operator logged in
  // via session) we fall through to the normal lookup so req.user is
  // populated for audit logging.
  if (
    req.method === "POST" &&
    req.url.startsWith("/api/delivery/dispatch/override") &&
    req.header("x-admin-token") &&
    !getSessionId(req)
  ) {
    next();
    return;
  }

  const sid = getSessionId(req);
  if (!sid) {
    next();
    return;
  }

  const session = await getSession(sid);
  if (!session?.user?.id) {
    await clearSession(res, sid);
    next();
    return;
  }

  req.user = session.user;
  next();
}
