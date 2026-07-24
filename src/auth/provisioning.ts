import "server-only";

import { and, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";

import type { CardflowDatabase } from "@/db/client";
import { accounts, users, userRoleValues } from "@/db/schema";

import { authPasswordPolicy } from "./config";
import { getDatabase } from "@/db/client";

export type ProvisionAccountInput = {
  email: string;
  displayName: string;
  role: string;
  password: string;
};

export type ProvisionedAccount = {
  id: string;
  email: string;
  displayName: string;
  role: (typeof userRoleValues)[number];
};

export type ProvisionAccountResult = {
  status: "created" | "existing";
  user: ProvisionedAccount;
};

type UserReader = Pick<CardflowDatabase, "select">;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email: string): string {
  const normalizedEmail = email.trim().toLowerCase();

  if (!emailPattern.test(normalizedEmail) || normalizedEmail.length > 255) {
    throw new Error("A valid email address of at most 255 characters is required.");
  }

  return normalizedEmail;
}

function normalizeDisplayName(displayName: string): string {
  const normalizedDisplayName = displayName.trim();

  if (!normalizedDisplayName || normalizedDisplayName.length > 255) {
    throw new Error("A display name between 1 and 255 characters is required.");
  }

  return normalizedDisplayName;
}

function normalizeRole(role: string): (typeof userRoleValues)[number] {
  if (!userRoleValues.includes(role as (typeof userRoleValues)[number])) {
    throw new Error("Role must be administrator or china_warehouse.");
  }

  return role as (typeof userRoleValues)[number];
}

function validatePassword(password: string): void {
  if (
    password.length < authPasswordPolicy.minimumLength ||
    password.length > authPasswordPolicy.maximumLength
  ) {
    throw new Error(
      `Password must be between ${authPasswordPolicy.minimumLength} and ${authPasswordPolicy.maximumLength} characters long.`,
    );
  }
}

async function findExistingAccount(
  database: UserReader,
  email: string,
): Promise<ProvisionedAccount | null> {
  const [user] = await database
    .select({
      id: users.id,
      email: users.accountIdentifier,
      displayName: users.displayName,
      role: users.role,
    })
    .from(users)
    .where(eq(users.accountIdentifier, email))
    .limit(1);

  if (!user) {
    return null;
  }

  const [credentialAccount] = await database
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(eq(accounts.userId, user.id), eq(accounts.providerId, "credential")),
    )
    .limit(1);

  if (!credentialAccount) {
    throw new Error(
      `Existing account ${email} does not have a credential login and was left unchanged.`,
    );
  }

  return user;
}

function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  if ("code" in error && error.code === "23505") {
    return true;
  }

  return "cause" in error && isUniqueConstraintError(error.cause);
}

export async function provisionAccount(
  input: ProvisionAccountInput,
  database: CardflowDatabase = getDatabase(),
): Promise<ProvisionAccountResult> {
  const email = normalizeEmail(input.email);
  const displayName = normalizeDisplayName(input.displayName);
  const role = normalizeRole(input.role);

  const existingAccount = await findExistingAccount(database, email);

  if (existingAccount) {
    return { status: "existing", user: existingAccount };
  }

  validatePassword(input.password);
  const passwordHash = await hashPassword(input.password);

  try {
    const user = await database.transaction(async (transaction) => {
      const accountCreatedDuringRetry = await findExistingAccount(transaction, email);

      if (accountCreatedDuringRetry) {
        return { status: "existing" as const, user: accountCreatedDuringRetry };
      }

      const [createdUser] = await transaction
        .insert(users)
        .values({
          accountIdentifier: email,
          displayName,
          emailVerified: false,
          image: null,
          role,
        })
        .returning({
          id: users.id,
          email: users.accountIdentifier,
          displayName: users.displayName,
          role: users.role,
        });

      if (!createdUser) {
        throw new Error("Provisioning failed to create the user account.");
      }

      await transaction.insert(accounts).values({
        accountId: createdUser.id,
        providerId: "credential",
        userId: createdUser.id,
        password: passwordHash,
      });

      return { status: "created" as const, user: createdUser };
    });

    return user;
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const accountCreatedDuringConcurrentProvisioning = await findExistingAccount(database, email);

    if (!accountCreatedDuringConcurrentProvisioning) {
      throw error;
    }

    return { status: "existing", user: accountCreatedDuringConcurrentProvisioning };
  }
}
