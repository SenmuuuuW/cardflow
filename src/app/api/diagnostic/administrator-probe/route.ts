import { getPhase0DiagnosticApi } from "@/diagnostic/phase0-diagnostic-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return getPhase0DiagnosticApi().runAdministratorProbe(request);
}
