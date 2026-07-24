import "server-only";

import { headers } from "next/headers";

import { getDatabase } from "@/db/client";

import { getAuth } from "./server";
import { resolveAuthenticatedUserFromHeaders } from "./session";

export async function getAuthenticatedUser() {
  return resolveAuthenticatedUserFromHeaders(new Headers(await headers()), {
    auth: getAuth(),
    database: getDatabase(),
  });
}
