import type { Request, Response, NextFunction } from "express";
import { hasAdminSession } from "./adminAuth";

/**
 * Backwards-compat shim for the legacy admin gate.
 *
 * Several routes that predate the cookie-based admin login (aiRuns,
 * community, challenges, b2bPlanner, …) still gate on the legacy shape:
 *
 *     const session = (req as Request & { session?: { isAdmin?: boolean } })
 *       .session;
 *     if (session?.isAdmin === true) ...
 *
 * That flag was historically set by the old token-based admin login. The
 * new admin login (POST /admin/login) issues a signed cookie verified by
 * `hasAdminSession()` instead — and never sets `session.isAdmin`. Without
 * this shim, every legacy admin endpoint silently 401s/403s for a user
 * who logged in through the new flow even though they're a real admin.
 *
 * This middleware runs once per request, near the top of the chain, and
 * mirrors the new cookie-session into the legacy flag so all the existing
 * gates work without per-route surgery. We set both the cookie-derived
 * `req.session.isAdmin` and a typed `req.adminUsername` for routes that
 * want to attribute writes (the gate helper in adminGate.ts already does
 * this for ops/catalog scope; this is for everyone else).
 *
 * Side-effects:
 *   - If the request has no admin cookie: no-op. We do NOT clear an
 *     existing `session.isAdmin` someone else set legitimately.
 *   - If the request has an admin cookie: ensures `req.session` exists
 *     (as a plain object — we are NOT replacing express-session here)
 *     and sets `isAdmin = true`. Idempotent.
 */
export function adminSessionShim(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  const admin = hasAdminSession(req);
  if (!admin) {
    next();
    return;
  }
  // Some requests have no `session` property at all (we don't use
  // express-session in this app — the customer phone-OTP flow stores
  // the session row in PG and resolves `req.user` directly). Legacy
  // code reads `req.session?.isAdmin`, so the shape is what matters.
  const r = req as Request & {
    session?: { isAdmin?: boolean };
    adminUsername?: string;
  };
  if (!r.session) r.session = {};
  r.session.isAdmin = true;
  r.adminUsername = admin.username;
  next();
}
