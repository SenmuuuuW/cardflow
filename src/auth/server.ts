import "server-only";

import { getDatabase } from "@/db/client";

import { createCardflowAuth, type CardflowAuth, type CardflowAuthConfiguration } from "./config";

declare global {
  var cardflowAuth: CardflowAuth | undefined;
}

function getRequiredEnvironmentValue(name: "BETTER_AUTH_SECRET" | "BETTER_AUTH_URL"): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} must be set before server authentication is used.`);
  }

  return value;
}

export function getAuthConfigurationFromEnvironment(): CardflowAuthConfiguration {
  const secret = getRequiredEnvironmentValue("BETTER_AUTH_SECRET");

  if (secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be at least 32 characters long.");
  }

  const baseUrl = getRequiredEnvironmentValue("BETTER_AUTH_URL");

  try {
    const parsedBaseUrl = new URL(baseUrl);

    if (parsedBaseUrl.protocol !== "http:" && parsedBaseUrl.protocol !== "https:") {
      throw new Error("Unsupported Better Auth URL protocol.");
    }
  } catch {
    throw new Error("BETTER_AUTH_URL must be an absolute HTTP or HTTPS URL.");
  }

  return { baseUrl, secret };
}

export function getAuth(): CardflowAuth {
  if (!globalThis.cardflowAuth) {
    globalThis.cardflowAuth = createCardflowAuth(
      getDatabase(),
      getAuthConfigurationFromEnvironment(),
    );
  }

  return globalThis.cardflowAuth;
}
