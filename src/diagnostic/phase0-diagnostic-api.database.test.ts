import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createServerAuthorization } from "@/auth/authorization";
import { createCardflowAuth, type CardflowAuth } from "@/auth/config";
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
import {
  createPhase0DiagnosticRecordReader,
} from "./phase0-diagnostic-record-query";
import {
  phase0DiagnosticSeedRecords,
  seedPhase0DiagnosticData,
  type Phase0SeedCredentials,
} from "./phase0-diagnostic-seed";
import { applyMigrations, resetTestDatabase } from "../../scripts/db-migrations";

const authBaseUrl = "https://cardflow.test";
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const phase0SeedCredentials: Phase0SeedCredentials = {
  administratorEmail: "phase0-admin@cardflow.test",
  administratorDisplayName: "Phase 0 Test Administrator",
  administratorPassword: "phase0-administrator-test-password",
  warehouseEmail: "phase0-warehouse@cardflow.test",
  warehouseDisplayName: "Phase 0 Test Warehouse",
  warehousePassword: "phase0-warehouse-test-password",
};

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

async function signIn(email: string, password: string): Promise<Response> {
  return getAuth().handler(
    createAuthRequest("sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
}

async function getSessionHeaders(email: string, password: string): Promise<Headers> {
  const response = await signIn(email, password);

  expect(response.status).toBe(200);

  return new Headers({ cookie: toCookieHeader(getSetCookieHeaders(response)) });
}

function getDiagnosticRecordsRequest(headers?: HeadersInit): Request {
  return new Request(`${authBaseUrl}/api/diagnostic/records`, { headers });
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

const expectedAdministratorRecords = [...phase0DiagnosticSeedRecords]
  .sort((left, right) => left.itemLabel.localeCompare(right.itemLabel))
  .map((record) => ({
    id: record.id,
    itemLabel: record.itemLabel,
    expectedQuantity: record.expectedQuantity,
    statusLabel: record.statusLabel,
    purchaseCostCents: record.purchaseCostCents,
    purchaseCurrency: record.purchaseCurrency,
  }));

const expectedWarehouseRecords = expectedAdministratorRecords.map((record) => ({
  id: record.id,
  itemLabel: record.itemLabel,
  expectedQuantity: record.expectedQuantity,
  statusLabel: record.statusLabel,
}));

describe("P0-05 authorization with P0-06 diagnostic records", () => {
  beforeAll(async () => {
    await applyMigrations(testDatabaseUrl, { resetTestDatabase: true });
    connection = createDatabaseConnection(testDatabaseUrl);
    auth = createCardflowAuth(connection.db, {
      baseUrl: authBaseUrl,
      secret: "test-only-better-auth-secret-that-is-long-enough",
    });
    await seedPhase0DiagnosticData({
      database: connection.db,
      credentials: phase0SeedCredentials,
      environment: { NODE_ENV: "test" },
    });
    diagnosticApi = createPhase0DiagnosticApi(
      createServerAuthorization((requestHeaders) =>
        resolveAuthenticatedUserFromHeaders(requestHeaders, {
          auth: getAuth(),
          database: getConnection().db,
        }),
      ),
      createPhase0DiagnosticRecordReader(connection.db),
    );
  });

  afterAll(async () => {
    await connection?.close();
    await resetTestDatabase(testDatabaseUrl);
  });

  it("returns a generic 401 response without diagnostic records for unauthenticated callers", async () => {
    const recordsResponse = await getDiagnosticApi().getRecords(getDiagnosticRecordsRequest());
    const probeResponse = await getDiagnosticApi().runAdministratorProbe(
      getAdministratorProbeRequest(),
    );
    const recordsPayload = await recordsResponse.json();
    const probePayload = await probeResponse.json();

    expect(recordsResponse.status).toBe(401);
    expect(probeResponse.status).toBe(401);
    expectProtectedResponseHeaders(recordsResponse);
    expectProtectedResponseHeaders(probeResponse);
    expect(recordsPayload).toEqual({ error: { code: "UNAUTHENTICATED" } });
    expect(probePayload).toEqual({ error: { code: "UNAUTHENTICATED" } });
    expect(hasKeyAtAnyDepth(recordsPayload, "purchaseCostCents")).toBe(false);
    expect(hasKeyAtAnyDepth(recordsPayload, "purchaseCurrency")).toBe(false);
  });

  it("allows an administrator to receive the complete approved diagnostic list and probe", async () => {
    const sessionHeaders = await getSessionHeaders(
      phase0SeedCredentials.administratorEmail,
      phase0SeedCredentials.administratorPassword,
    );
    const recordsResponse = await getDiagnosticApi().getRecords(
      getDiagnosticRecordsRequest(sessionHeaders),
    );
    const probeResponse = await getDiagnosticApi().runAdministratorProbe(
      getAdministratorProbeRequest(sessionHeaders),
    );

    expect(recordsResponse.status).toBe(200);
    expect(probeResponse.status).toBe(200);
    expectProtectedResponseHeaders(recordsResponse);
    expectProtectedResponseHeaders(probeResponse);
    await expect(recordsResponse.json()).resolves.toEqual({
      records: expectedAdministratorRecords,
    });
    await expect(probeResponse.json()).resolves.toEqual({ status: "administrator-authorized" });
  });

  it("returns a cost-free list for warehouse users and rejects the administrator probe", async () => {
    const sessionHeaders = await getSessionHeaders(
      phase0SeedCredentials.warehouseEmail,
      phase0SeedCredentials.warehousePassword,
    );
    const recordsResponse = await getDiagnosticApi().getRecords(
      getDiagnosticRecordsRequest(sessionHeaders),
    );
    const probeResponse = await getDiagnosticApi().runAdministratorProbe(
      getAdministratorProbeRequest(sessionHeaders),
    );
    const recordsPayload = await recordsResponse.json();
    const probePayload = await probeResponse.json();

    expect(recordsResponse.status).toBe(200);
    expect(probeResponse.status).toBe(403);
    expectProtectedResponseHeaders(recordsResponse);
    expectProtectedResponseHeaders(probeResponse);
    expect(recordsPayload).toEqual({ records: expectedWarehouseRecords });
    expect(probePayload).toEqual({ error: { code: "FORBIDDEN" } });
    expect(hasKeyAtAnyDepth(recordsPayload, "purchaseCostCents")).toBe(false);
    expect(hasKeyAtAnyDepth(recordsPayload, "purchaseCurrency")).toBe(false);
    expect(hasKeyAtAnyDepth(recordsPayload, "internalProcurementReference")).toBe(false);
    expect(hasKeyAtAnyDepth(probePayload, "purchaseCostCents")).toBe(false);
  });

  it("ignores query, header, cookie, and request-body role claims from a warehouse session", async () => {
    const forgedHeaders = await getSessionHeaders(
      phase0SeedCredentials.warehouseEmail,
      phase0SeedCredentials.warehousePassword,
    );
    const originalCookie = forgedHeaders.get("cookie");

    forgedHeaders.set("cookie", `${originalCookie}; cardflow-role=administrator`);
    forgedHeaders.set("x-cardflow-role", "administrator");

    const recordsResponse = await getDiagnosticApi().getRecords(
      new Request(
        `${authBaseUrl}/api/diagnostic/records?include=purchaseCost&fields=purchaseCostCents&role=administrator`,
        { headers: forgedHeaders },
      ),
    );
    const probeHeaders = new Headers(forgedHeaders);
    probeHeaders.set("content-type", "application/json");
    const probeResponse = await getDiagnosticApi().runAdministratorProbe(
      getAdministratorProbeRequest(probeHeaders, JSON.stringify({ role: "administrator" })),
    );
    const recordsPayload = await recordsResponse.json();
    const probePayload = await probeResponse.json();

    expect(recordsResponse.status).toBe(200);
    expect(probeResponse.status).toBe(403);
    expect(recordsPayload).toEqual({ records: expectedWarehouseRecords });
    expect(probePayload).toEqual({ error: { code: "FORBIDDEN" } });
    expect(hasKeyAtAnyDepth(recordsPayload, "purchaseCostCents")).toBe(false);
    expect(hasKeyAtAnyDepth(recordsPayload, "purchaseCurrency")).toBe(false);
  });

  it("uses the current persisted role rather than client-visible state for an existing session", async () => {
    const forgedHeaders = await getSessionHeaders(
      phase0SeedCredentials.administratorEmail,
      phase0SeedCredentials.administratorPassword,
    );

    try {
      await getConnection().db
        .update(users)
        .set({ role: "china_warehouse" })
        .where(eq(users.accountIdentifier, phase0SeedCredentials.administratorEmail));

      forgedHeaders.set("x-cardflow-role", "administrator");

      const recordsResponse = await getDiagnosticApi().getRecords(
        new Request(`${authBaseUrl}/api/diagnostic/records?role=administrator`, {
          headers: forgedHeaders,
        }),
      );
      const probeResponse = await getDiagnosticApi().runAdministratorProbe(
        getAdministratorProbeRequest(forgedHeaders, JSON.stringify({ role: "administrator" })),
      );
      const recordsPayload = await recordsResponse.json();

      expect(recordsResponse.status).toBe(200);
      expect(probeResponse.status).toBe(403);
      expect(recordsPayload).toEqual({ records: expectedWarehouseRecords });
      expect(hasKeyAtAnyDepth(recordsPayload, "purchaseCostCents")).toBe(false);
      expect(hasKeyAtAnyDepth(recordsPayload, "purchaseCurrency")).toBe(false);
    } finally {
      await getConnection().db
        .update(users)
        .set({ role: "administrator" })
        .where(eq(users.accountIdentifier, phase0SeedCredentials.administratorEmail));
    }
  });
});
