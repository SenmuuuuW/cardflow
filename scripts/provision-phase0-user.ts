import { config as loadEnvironment } from "dotenv";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { provisionAccount } from "@/auth/provisioning";
import { closeDatabaseConnection } from "@/db/client";

loadEnvironment({ path: ".env.local" });

async function readRequiredValue(
  environmentVariable: string,
  label: string,
  prompt: ReturnType<typeof createInterface>,
): Promise<string> {
  const environmentValue = process.env[environmentVariable]?.trim();

  if (environmentValue) {
    return environmentValue;
  }

  if (!stdin.isTTY) {
    throw new Error(`${environmentVariable} must be set when the provisioning command is non-interactive.`);
  }

  const value = (await prompt.question(`${label}: `)).trim();

  if (!value) {
    throw new Error(`${label} is required.`);
  }

  return value;
}

async function readPassword(): Promise<string> {
  const environmentValue = process.env.CARDFLOW_PROVISION_PASSWORD;

  if (environmentValue) {
    return environmentValue;
  }

  if (!stdin.isTTY) {
    throw new Error("CARDFLOW_PROVISION_PASSWORD must be set when the provisioning command is non-interactive.");
  }

  stdout.write("Password: ");

  return new Promise((resolve, reject) => {
    const wasRaw = stdin.isRaw;
    let password = "";

    const cleanup = () => {
      stdin.off("data", onData);
      stdin.setRawMode(wasRaw);
      stdin.pause();
    };

    const onData = (input: Buffer) => {
      const value = input.toString("utf8");

      if (value === "\r" || value === "\n") {
        cleanup();
        stdout.write("\n");
        resolve(password);
        return;
      }

      if (value === "\u0003") {
        cleanup();
        stdout.write("\n");
        reject(new Error("Provisioning cancelled."));
        return;
      }

      if (value === "\u007f" || value === "\b") {
        password = password.slice(0, -1);
        return;
      }

      password += value;
    };

    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function main(): Promise<void> {
  const prompt = createInterface({ input: stdin, output: stdout });

  try {
    const result = await provisionAccount({
      email: await readRequiredValue("CARDFLOW_PROVISION_EMAIL", "Email", prompt),
      displayName: await readRequiredValue(
        "CARDFLOW_PROVISION_DISPLAY_NAME",
        "Display name",
        prompt,
      ),
      role: await readRequiredValue("CARDFLOW_PROVISION_ROLE", "Role", prompt),
      password: await readPassword(),
    });

    console.log(`${result.status === "created" ? "Provisioned" : "Preserved"} ${result.user.role} account for ${result.user.email}.`);
  } finally {
    prompt.close();
    await closeDatabaseConnection();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
