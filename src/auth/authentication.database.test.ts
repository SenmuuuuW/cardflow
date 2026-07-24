import { randomUUID } from "node:crypto";

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createCardflowAuth, type CardflowAuth } from "@/auth/config";
import { provisionAccount } from "@/auth/provisioning";
import { resolveAuthenticatedUserFromHeaders } from "@/auth/session";
import { createDatabaseConnection, type DatabaseConnection } from "@/db/client";
import { accounts, sessions, users } from "@/db/schema";
import { applyMigrations, resetTestDatabase } from "../../scripts/db-migrations";

const authBaseUrl = "https://cardflow.test";
const testPassword = "cardflow-test-password-only";
const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL must be set before running database tests.");
}

let auth: CardflowAuth | undefined;
let connection: DatabaseConnection | undefined;

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

async function provisionTestAccount(role: "administrator" | "china_warehouse") {
  const email = `${role}-${randomUUID()}@cardflow.test`;
  const result = await provisionAccount(
    {
      email,
      displayName: `P0-04 ${role}`,
      role,
      password: testPassword,
    },
    getConnection().db,
  );

  return { email, user: result.user };
}

async function signIn(email: string, password = testPassword): Promise<Response> {
  return getAuth().handler(
    createAuthRequest("sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    }),
  );
}

describe("P0-04 authentication and roles", () => {
  beforeAll(async () => {
    await applyMigrations(testDatabaseUrl, { resetTestDatabase: true });
    connection = createDatabaseConnection(testDatabaseUrl);
    auth = createCardflowAuth(connection.db, {
      baseUrl: authBaseUrl,
      secret: "test-only-better-auth-secret-that-is-long-enough",
    });
  });

  afterAll(async () => {
    await connection?.close();
    await resetTestDatabase(testDatabaseUrl);
  });

  it("applies the committed migration with Better Auth support tables", async () => {
    const result = await getConnection().db.execute(sql`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
      order by table_name
    `);

    expect(result.rows.map((row) => String(row.table_name))).toEqual(
      expect.arrayContaining(["accounts", "sessions", "users", "verifications"]),
    );
  });

  it("provisions one administrator and one China warehouse account", async () => {
    const administrator = await provisionTestAccount("administrator");
    const warehouse = await provisionTestAccount("china_warehouse");

    expect(administrator.user.role).toBe("administrator");
    expect(warehouse.user.role).toBe("china_warehouse");

    const persistedRoles = await getConnection().db
      .select({ role: users.role })
      .from(users)
      .where(
        sql`${users.accountIdentifier} in (${administrator.email}, ${warehouse.email})`,
      );

    expect(persistedRoles.map((user) => user.role).sort()).toEqual([
      "administrator",
      "china_warehouse",
    ]);
  });

  it("keeps provisioning idempotent without changing an existing role or password", async () => {
    const email = `rerun-${randomUUID()}@cardflow.test`;
    const initialPassword = "initial-test-password";
    const changedPassword = "replacement-test-password";

    const first = await provisionAccount(
      {
        email,
        displayName: "Initial display name",
        role: "administrator",
        password: initialPassword,
      },
      getConnection().db,
    );
    const replay = await provisionAccount(
      {
        email: email.toUpperCase(),
        displayName: "Replacement display name",
        role: "china_warehouse",
        password: changedPassword,
      },
      getConnection().db,
    );

    expect(first.status).toBe("created");
    expect(replay).toMatchObject({
      status: "existing",
      user: {
        id: first.user.id,
        displayName: "Initial display name",
        role: "administrator",
      },
    });

    const persistedUsers = await getConnection().db
      .select()
      .from(users)
      .where(eq(users.accountIdentifier, email));
    const persistedAccounts = await getConnection().db
      .select()
      .from(accounts)
      .where(eq(accounts.userId, first.user.id));

    expect(persistedUsers).toHaveLength(1);
    expect(persistedAccounts).toHaveLength(1);
    expect((await signIn(email, initialPassword)).status).toBe(200);
    expect((await signIn(email, changedPassword)).status).toBe(401);
  });

  it("rejects public email/password sign-up without creating a user", async () => {
    const email = `public-sign-up-${randomUUID()}@cardflow.test`;

    const response = await getAuth().handler(
      createAuthRequest("sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          name: "Unapproved account",
          password: testPassword,
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "EMAIL_PASSWORD_SIGN_UP_DISABLED",
    });

    const persistedUsers = await getConnection().db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.accountIdentifier, email));

    expect(persistedUsers).toHaveLength(0);
  });

  it("creates a database session and secure HTTP-only cookie for a valid login", async () => {
    const { email, user } = await provisionTestAccount("administrator");

    const response = await signIn(email);
    const setCookieHeaders = getSetCookieHeaders(response);

    expect(response.status).toBe(200);
    expect(setCookieHeaders.length).toBeGreaterThan(0);
    expect(setCookieHeaders.some((header) => /HttpOnly/i.test(header))).toBe(true);
    expect(setCookieHeaders.some((header) => /Secure/i.test(header))).toBe(true);
    expect(setCookieHeaders.some((header) => /SameSite=Lax/i.test(header))).toBe(true);

    const persistedSessions = await getConnection().db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.userId, user.id));

    expect(persistedSessions).toHaveLength(1);
  });

  it("does not create a session for an invalid password", async () => {
    const { email, user } = await provisionTestAccount("china_warehouse");

    const response = await signIn(email, "wrong-test-password");
    const persistedSessions = await getConnection().db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.userId, user.id));

    expect(response.status).toBe(401);
    expect(persistedSessions).toHaveLength(0);
  });

  it("returns no authenticated user for missing or invalid session headers used by the diagnostic guard", async () => {
    const dependencies = {
      auth: getAuth(),
      database: getConnection().db,
    };

    await expect(resolveAuthenticatedUserFromHeaders(new Headers(), dependencies)).resolves.toBeNull();
    await expect(
      resolveAuthenticatedUserFromHeaders(
        new Headers({ cookie: "better-auth.session_token=not-a-valid-session" }),
        dependencies,
      ),
    ).resolves.toBeNull();
  });

  it("resolves the role from persisted server data rather than browser-provided values", async () => {
    const { email, user } = await provisionTestAccount("administrator");
    const signInResponse = await signIn(email);
    const cookieHeader = toCookieHeader(getSetCookieHeaders(signInResponse));
    const requestHeaders = new Headers({
      cookie: `${cookieHeader}; cardflow-role=administrator`,
      "x-cardflow-role": "administrator",
    });

    await getConnection().db
      .update(users)
      .set({ role: "china_warehouse" })
      .where(eq(users.id, user.id));

    await expect(
      resolveAuthenticatedUserFromHeaders(requestHeaders, {
        auth: getAuth(),
        database: getConnection().db,
      }),
    ).resolves.toMatchObject({
      id: user.id,
      role: "china_warehouse",
    });
  });

  it("does not let a signed-in browser update the persisted role through Better Auth", async () => {
    const { email, user } = await provisionTestAccount("administrator");
    const signInResponse = await signIn(email);
    const cookieHeader = toCookieHeader(getSetCookieHeaders(signInResponse));

    const updateResponse = await getAuth().handler(
      createAuthRequest("update-user", {
        method: "POST",
        headers: {
          cookie: cookieHeader,
          "content-type": "application/json",
        },
        body: JSON.stringify({ role: "china_warehouse" }),
      }),
    );

    expect(updateResponse.status).toBe(400);

    const [persistedUser] = await getConnection().db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, user.id));

    expect(persistedUser?.role).toBe("administrator");
  });

  it("sign-out removes the active database session and invalidates its cookie", async () => {
    const { email, user } = await provisionTestAccount("china_warehouse");
    const signInResponse = await signIn(email);
    const cookieHeader = toCookieHeader(getSetCookieHeaders(signInResponse));

    const signOutResponse = await getAuth().handler(
      createAuthRequest("sign-out", {
        method: "POST",
        headers: { cookie: cookieHeader },
      }),
    );

    expect(signOutResponse.status).toBe(200);

    const persistedSessions = await getConnection().db
      .select({ id: sessions.id })
      .from(sessions)
      .where(eq(sessions.userId, user.id));

    expect(persistedSessions).toHaveLength(0);
    await expect(
      resolveAuthenticatedUserFromHeaders(new Headers({ cookie: cookieHeader }), {
        auth: getAuth(),
        database: getConnection().db,
      }),
    ).resolves.toBeNull();
  });
});
