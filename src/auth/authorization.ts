import "server-only";

import { getAuthenticatedUserFromHeaders } from "./server-session";
import type { AuthenticatedUser, CardflowUserRole } from "./session";

export type AuthorizationErrorCode = "UNAUTHENTICATED" | "FORBIDDEN";

export class AuthorizationError extends Error {
  readonly code: AuthorizationErrorCode;
  readonly status: 401 | 403;

  constructor(code: AuthorizationErrorCode) {
    super(code === "UNAUTHENTICATED" ? "Authentication is required." : "Access is forbidden.");
    this.name = "AuthorizationError";
    this.code = code;
    this.status = code === "UNAUTHENTICATED" ? 401 : 403;
  }
}

export type AuthenticatedUserResolver = (
  requestHeaders: Headers,
) => Promise<AuthenticatedUser | null>;

export type ServerAuthorization = {
  requireAuthenticatedUser: (requestHeaders: Headers) => Promise<AuthenticatedUser>;
  requireRole: (
    requestHeaders: Headers,
    requiredRole: CardflowUserRole,
  ) => Promise<AuthenticatedUser>;
  requireAdministrator: (requestHeaders: Headers) => Promise<AuthenticatedUser>;
};

export function createServerAuthorization(
  resolveAuthenticatedUser: AuthenticatedUserResolver = getAuthenticatedUserFromHeaders,
): ServerAuthorization {
  async function requireAuthenticatedUser(requestHeaders: Headers): Promise<AuthenticatedUser> {
    const user = await resolveAuthenticatedUser(requestHeaders);

    if (!user) {
      throw new AuthorizationError("UNAUTHENTICATED");
    }

    return user;
  }

  async function requireRole(
    requestHeaders: Headers,
    requiredRole: CardflowUserRole,
  ): Promise<AuthenticatedUser> {
    const user = await requireAuthenticatedUser(requestHeaders);

    if (user.role !== requiredRole) {
      throw new AuthorizationError("FORBIDDEN");
    }

    return user;
  }

  return {
    requireAuthenticatedUser,
    requireRole,
    requireAdministrator: (requestHeaders) => requireRole(requestHeaders, "administrator"),
  };
}
