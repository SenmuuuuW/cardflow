import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { hashPassword, verifyPassword } from "better-auth/crypto";

import type { CardflowDatabase } from "@/db/client";
import * as schema from "@/db/schema";

export const authPasswordPolicy = {
  minimumLength: 8,
  maximumLength: 128,
} as const;

export type CardflowAuthConfiguration = {
  baseUrl: string;
  secret: string;
};

function shouldUseSecureCookies(baseUrl: string): boolean {
  const parsedBaseUrl = new URL(baseUrl);

  if (parsedBaseUrl.protocol === "https:") {
    return true;
  }

  const isLoopbackHost = ["localhost", "127.0.0.1", "[::1]"].includes(
    parsedBaseUrl.hostname,
  );

  if (parsedBaseUrl.protocol !== "http:" || !isLoopbackHost) {
    throw new Error("BETTER_AUTH_URL must use HTTPS outside local loopback development.");
  }

  return false;
}

export function createCardflowAuth(
  database: CardflowDatabase,
  configuration: CardflowAuthConfiguration,
) {
  const useSecureCookies = shouldUseSecureCookies(configuration.baseUrl);

  return betterAuth({
    appName: "CardFlow",
    baseURL: configuration.baseUrl,
    secret: configuration.secret,
    trustedOrigins: [configuration.baseUrl],
    database: drizzleAdapter(database, {
      provider: "pg",
      schema,
      usePlural: true,
      transaction: true,
    }),
    advanced: {
      database: {
        generateId: "uuid",
      },
      useSecureCookies,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: useSecureCookies,
        path: "/",
      },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      requireEmailVerification: false,
      minPasswordLength: authPasswordPolicy.minimumLength,
      maxPasswordLength: authPasswordPolicy.maximumLength,
      password: {
        hash: hashPassword,
        verify: verifyPassword,
      },
    },
    user: {
      fields: {
        email: "accountIdentifier",
        name: "displayName",
        emailVerified: "emailVerified",
        image: "image",
      },
    },
  });
}

export type CardflowAuth = ReturnType<typeof createCardflowAuth>;
