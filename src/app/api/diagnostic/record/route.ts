import { getPhase0DiagnosticApi } from "@/diagnostic/phase0-diagnostic-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return getPhase0DiagnosticApi().getRecord(request);
}
