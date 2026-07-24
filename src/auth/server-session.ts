import "server-only";

import { headers } from "next/headers";

import { getDatabase } from "@/db/client";

import { getAuth } from "./server";
import {
  resolveAuthenticatedUserFromHeaders,
  type AuthenticatedUser,
} from "./session";

export async function getAuthenticatedUserFromHeaders(
  requestHeaders: Headers,
): Promise<AuthenticatedUser | null> {
  return resolveAuthenticatedUserFromHeaders(requestHeaders, {
    auth: getAuth(),
    database: getDatabase(),
  });
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  return getAuthenticatedUserFromHeaders(new Headers(await headers()));
}
