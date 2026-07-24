import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/auth/server";

export const runtime = "nodejs";

const handlers = toNextJsHandler(getAuth());

export const { GET, POST } = handlers;
