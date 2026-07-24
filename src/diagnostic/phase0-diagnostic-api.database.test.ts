import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createServerAuthorization } from "@/auth/authorization";
import { createCardflowAuth, type CardflowAuth } from "@/auth/config";
import { provisionAccount } from "@/auth/provisioning";
import { resolveAuthenticatedUserFromHeaders } from "@/auth/session";
import {
  createDatabaseConnection,
  type DatabaseConnection,
} from "@/db/client";
import { users } from "@/db/schema";

import {
  createPhase0DiagnosticApi,
  type Phase0DiagnosticApi,
} from "./phase0-diagnostic-api";
import { phase0DiagnosticRawRecord } from "./phase0-diagnostic-record";
import { applyMigrations, resetTestDatabase } from "../../scripts/db-migrations";

const authBaseUrl = "https://cardflow.test";
const testPassword = "cardflow-test-password-only";
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL must be set before running database tests.");
}

let auth: CardflowAuth | undefined;
let connection: DatabaseConnection | undefined;
let diagnosticApi: Phase0DiagnosticApi | undefined;

function getAuth(): CardflowAuth {
  if (!auth) {
    throw new Error("The test auth instance has not been initialized.");
  }

  return auth;
}

function getConnection(): DatabaseConnection {
  if (!connection) {
    throw new Error("The test database connection has not been initialized.");
  }

  return connection;
}

function getDiagnosticApi(): Phase0DiagnosticApi {
  if (!diagnosticApi) {
    throw new Error("The Phase 0 diagnostic API has not been initialized.");
  }

  return diagnosticApi;
}

function createAuthRequest(
  path: string,
  init: Omit<RequestInit, "headers"> & { headers?: HeadersInit } = {},
): Request {
  const headers = new Headers(init.headers);

  headers.set("origin", authBaseUrl);

  return new Request(`${authBaseUrl}/api/auth/${path}`, {
    ...init,
    headers,
  });
}

function getSetCookieHeaders(response: Response): string[] {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const cookies = headers.getSetCookie?.() ?? [];

  if (cookies.length > 0) {
    return cookies;
  }

  const setCookie = response.headers.get("set-cookie");
  return setCookie ? [setCookie] : [];
}

function toCookieHeader(setCookieHeaders: string[]): string {
  return setCookieHeaders.map((header) => header.split(";", 1)[0]).join("; ");
}

function hasKeyAtAnyDepth(value: unknown, key: string): boolean {
  if (!value || typeof value !== "object") {
    return false;
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasKeyAtAnyDepth(item, key));
  }

  const record = value as Record<string, unknown>;

  return (
    Object.hasOwn(record, key) ||
    Object.values(record).some((item) => hasKeyAtAnyDepth(item, key))
  );
}

async function provisionTestAccount(role: "administrator" | "china_warehouse") {
  const email = `${role}-${randomUUID()}@cardflow.test`;
  const result = await provisionAccount(
    {
      email,
      displayName: `P0-05 ${role}`,
      role,
      password: testPassword,
    },
    getConnection().db,
  );

  return { email, user: result.user };
}

async function signIn(email: string): Promise<Response> {
  return getAuth().handler(
    createAuthRequest("sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password: testPassword }),
    }),
  );
}

async function getSessionHeaders(email: string): Promise<Headers> {
  const response = await signIn(email);

  expect(response.status).toBe(200);

  return new Headers({ cookie: toCookieHeader(getSetCookieHeaders(response)) });
}

function getDiagnosticRecordRequest(headers?: HeadersInit): Request {
  return new Request(`${authBaseUrl}/api/diagnostic/record`, { headers });
}

function getAdministratorProbeRequest(headers?: HeadersInit, body?: string): Request {
  return new Request(`${authBaseUrl}/api/diagnostic/administrator-probe`, {
    method: "POST",
    headers,
    body,
  });
}

function expectProtectedResponseHeaders(response: Response): void {
  expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
}

describe("P0-05 server authorization boundary", () => {
  beforeAll(async () => {
    await applyMigrations(testDatabaseUrl, { resetTestDatabase: true });
    connection = createDatabaseConnection(testDatabaseUrl);
    auth = createCardflowAuth(connection.db, {
      baseUrl: authBaseUrl,
      secret: "test-only-better-auth-secret-that-is-long-enough",
    });
    diagnosticApi = createPhase0DiagnosticApi(
      createServerAuthorization((requestHeaders) =>
        resolveAuthenticatedUserFromHeaders(requestHeaders, {
          auth: getAuth(),
          database: getConnection().db,
        }),
      ),
    );
  });

  afterAll(async () => {
    await connection?.close();
    await resetTestDatabase(testDatabaseUrl);
  });

  it("returns generic 401 responses without a protected record for unauthenticated callers", async () => {
    const recordResponse = await getDiagnosticApi().getRecord(getDiagnosticRecordRequest());
    const probeResponse = await getDiagnosticApi().runAdministratorProbe(
      getAdministratorProbeRequest(),
    );
    const recordPayload = await recordResponse.json();
    const probePayload = await probeResponse.json();

    expect(recordResponse.status).toBe(401);
    expect(probeResponse.status).toBe(401);
    expectProtectedResponseHeaders(recordResponse);
    expectProtectedResponseHeaders(probeResponse);
    expect(recordPayload).toEqual({ error: { code: "UNAUTHENTICATED" } });
    expect(probePayload).toEqual({ error: { code: "UNAUTHENTICATED" } });
    expect(hasKeyAtAnyDepth(recordPayload, "purchaseCostCents")).toBe(false);
    expect(hasKeyAtAnyDepth(recordPayload, "purchaseCurrency")).toBe(false);
    expect(hasKeyAtAnyDepth(probePayload, "purchaseCostCents")).toBe(false);
    expect(hasKeyAtAnyDepth(probePayload, "purchaseCurrency")).toBe(false);
  });

  it("allows an administrator to receive the approved cost shape and administrator probe", async () => {
    const administrator = await provisionTestAccount("administrator");
    const sessionHeaders = await getSessionHeaders(administrator.email);
    const recordResponse = await getDiagnosticApi().getRecord(
      getDiagnosticRecordRequest(sessionHeaders),
    );
    const probeResponse = await getDiagnosticApi().runAdministratorProbe(
      getAdministratorProbeRequest(sessionHeaders),
    );

    expect(recordResponse.status).toBe(200);
    expect(probeResponse.status).toBe(200);
    expectProtectedResponseHeaders(recordResponse);
    expectProtectedResponseHeaders(probeResponse);
    await expect(recordResponse.json()).resolves.toEqual({
      record: {
        id: phase0DiagnosticRawRecord.id,
        itemLabel: phase0DiagnosticRawRecord.itemLabel,
        expectedQuantity: phase0DiagnosticRawRecord.expectedQuantity,
        statusLabel: phase0DiagnosticRawRecord.statusLabel,
        purchaseCostCents: phase0DiagnosticRawRecord.purchaseCostCents,
        purchaseCurrency: phase0DiagnosticRawRecord.purchaseCurrency,
      },
    });
    await expect(probeResponse.json()).resolves.toEqual({ status: "administrator-authorized" });
  });

  it("returns an explicit cost-free warehouse shape and rejects the administrator probe", async () => {
    const warehouse = await provisionTestAccount("china_warehouse");
    const sessionHeaders = await getSessionHeaders(warehouse.email);
    const recordResponse = await getDiagnosticApi().getRecord(
      getDiagnosticRecordRequest(sessionHeaders),
    );
    const probeResponse = await getDiagnosticApi().runAdministratorProbe(
      getAdministratorProbeRequest(sessionHeaders),
    );
    const recordPayload = await recordResponse.json();
    const probePayload = await probeResponse.json();

    expect(recordResponse.status).toBe(200);
    expect(probeResponse.status).toBe(403);
    expectProtectedResponseHeaders(recordResponse);
    expectProtectedResponseHeaders(probeResponse);
    expect(recordPayload).toEqual({
      record: {
        id: phase0DiagnosticRawRecord.id,
        itemLabel: phase0DiagnosticRawRecord.itemLabel,
        expectedQuantity: phase0DiagnosticRawRecord.expectedQuantity,
        statusLabel: phase0DiagnosticRawRecord.statusLabel,
      },
    });
    expect(probePayload).toEqual({ error: { code: "FORBIDDEN" } });
    expect(hasKeyAtAnyDepth(recordPayload, "purchaseCostCents")).toBe(false);
    expect(hasKeyAtAnyDepth(recordPayload, "purchaseCurrency")).toBe(false);
    expect(hasKeyAtAnyDepth(recordPayload, "internalProcurementReference")).toBe(false);
    expect(hasKeyAtAnyDepth(probePayload, "purchaseCostCents")).toBe(false);
    expect(hasKeyAtAnyDepth(probePayload, "purchaseCurrency")).toBe(false);
  });

  it("ignores query, header, cookie, and request-body role claims from a warehouse session", async () => {
    const warehouse = await provisionTestAccount("china_warehouse");
    const forgedHeaders = await getSessionHeaders(warehouse.email);
    const originalCookie = forgedHeaders.get("cookie");

    forgedHeaders.set("cookie", `${originalCookie}; cardflow-role=administrator`);
    forgedHeaders.set("x-cardflow-role", "administrator");

    const recordResponse = await getDiagnosticApi().getRecord(
      new Request(
        `${authBaseUrl}/api/diagnostic/record?include=purchaseCost&fields=purchaseCostCents&role=administrator`,
        { headers: forgedHeaders },
      ),
    );
    const probeHeaders = new Headers(forgedHeaders);
    probeHeaders.set("content-type", "application/json");

    const probeResponse = await getDiagnosticApi().runAdministratorProbe(
      getAdministratorProbeRequest(probeHeaders, JSON.stringify({ role: "administrator" })),
    );
    const recordPayload = await recordResponse.json();
    const probePayload = await probeResponse.json();

    expect(recordResponse.status).toBe(200);
    expect(probeResponse.status).toBe(403);
    expect(recordPayload).toEqual({
      record: {
        id: phase0DiagnosticRawRecord.id,
        itemLabel: phase0DiagnosticRawRecord.itemLabel,
        expectedQuantity: phase0DiagnosticRawRecord.expectedQuantity,
        statusLabel: phase0DiagnosticRawRecord.statusLabel,
      },
    });
    expect(probePayload).toEqual({ error: { code: "FORBIDDEN" } });
    expect(hasKeyAtAnyDepth(recordPayload, "purchaseCostCents")).toBe(false);
    expect(hasKeyAtAnyDepth(recordPayload, "purchaseCurrency")).toBe(false);
  });

  it("uses the current persisted role rather than client-visible state for an existing session", async () => {
    const administrator = await provisionTestAccount("administrator");
    const forgedHeaders = await getSessionHeaders(administrator.email);

    await getConnection().db
      .update(users)
      .set({ role: "china_warehouse" })
      .where(eq(users.id, administrator.user.id));

    forgedHeaders.set("x-cardflow-role", "administrator");

    const recordResponse = await getDiagnosticApi().getRecord(
      new Request(`${authBaseUrl}/api/diagnostic/record?role=administrator`, {
        headers: forgedHeaders,
      }),
    );
    const probeResponse = await getDiagnosticApi().runAdministratorProbe(
      getAdministratorProbeRequest(forgedHeaders, JSON.stringify({ role: "administrator" })),
    );
    const recordPayload = await recordResponse.json();

    expect(recordResponse.status).toBe(200);
    expect(probeResponse.status).toBe(403);
    expect(recordPayload).toEqual({
      record: {
        id: phase0DiagnosticRawRecord.id,
        itemLabel: phase0DiagnosticRawRecord.itemLabel,
        expectedQuantity: phase0DiagnosticRawRecord.expectedQuantity,
        statusLabel: phase0DiagnosticRawRecord.statusLabel,
      },
    });
    expect(hasKeyAtAnyDepth(recordPayload, "purchaseCostCents")).toBe(false);
    expect(hasKeyAtAnyDepth(recordPayload, "purchaseCurrency")).toBe(false);
  });
});
