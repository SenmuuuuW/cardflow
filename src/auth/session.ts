import "server-only";

import { eq } from "drizzle-orm";

import type { CardflowDatabase } from "@/db/client";
import { users, userRoleValues } from "@/db/schema";

import type { CardflowAuth } from "./config";

export type CardflowUserRole = (typeof userRoleValues)[number];

export type AuthenticatedUser = {
  id: string;
  email: string;
  displayName: string;
  role: CardflowUserRole;
};

export type AuthSessionDependencies = {
  auth: CardflowAuth;
  database: CardflowDatabase;
};

// The role is read from PostgreSQL on every resolution, never from client input or a cookie cache.
export async function resolveAuthenticatedUserFromHeaders(
  requestHeaders: Headers,
  dependencies: AuthSessionDependencies,
): Promise<AuthenticatedUser | null> {
  const session = await dependencies.auth.api.getSession({
    headers: requestHeaders,
    query: { disableCookieCache: true },
  });

  if (!session) {
    return null;
  }

  const [user] = await dependencies.database
    .select({
      id: users.id,
      email: users.accountIdentifier,
      displayName: users.displayName,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!user) {
    return null;
  }

  return user;
}
