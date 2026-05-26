import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.js';
import { PUBLIC_STRIP_FIELDS } from '../utils/encryption.js';

/**
 * Strips fields that should never appear in public API responses.
 * Applied to any user object (or array of user objects) in res.json().
 */
function stripPublicFields(obj: Record<string, any>): Record<string, any> {
  const result = { ...obj };
  for (const field of PUBLIC_STRIP_FIELDS) {
    delete result[field];
  }
  return result;
}

/**
 * Returns only the fields necessary for a public profile view.
 * Callers (owner / admin) should bypass this and use the full object instead.
 */
export function minimizePublicProfile(user: Record<string, any>): Record<string, any> {
  return stripPublicFields(user);
}

/**
 * Express middleware: rewrites res.json so that any response containing a
 * `data` property that looks like a user object (has `email`) is stripped of
 * sensitive fields before being sent — unless the requester is the same user
 * or an admin.
 *
 * Usage: apply to public-facing user profile endpoints.
 */
export function dataMinimizationMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const originalJson = res.json.bind(res);

  res.json = function (body: any) {
    if (body && body.success && body.data) {
      const requesterId = req.user?.id?.toString();
      const isAdmin = !!req.user?.adminRole;

      const minimize = (user: Record<string, any>) => {
        if (!user || typeof user !== 'object') return user;
        const userId = (user.id || user._id)?.toString();
        // Owner or admin get full profile
        if (isAdmin || (requesterId && requesterId === userId)) return user;
        return minimizePublicProfile(user);
      };

      if (Array.isArray(body.data)) {
        body = { ...body, data: body.data.map(minimize) };
      } else if (body.data.email !== undefined) {
        body = { ...body, data: minimize(body.data) };
      }
    }
    return originalJson(body);
  };

  next();
}

/**
 * Strips a single user plain object of all sensitive fields for safe
 * serialization (e.g. when embedding user inside other responses).
 */
export function sanitizeUserForResponse(
  user: Record<string, any>,
  requesterId?: string,
  isAdmin = false
): Record<string, any> {
  if (!user) return user;
  const userId = (user.id || user._id)?.toString();
  if (isAdmin || (requesterId && requesterId === userId)) return user;
  return minimizePublicProfile(user);
}
