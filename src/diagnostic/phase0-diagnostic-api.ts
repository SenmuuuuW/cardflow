import "server-only";

import {
  AuthorizationError,
  createServerAuthorization,
  type ServerAuthorization,
} from "@/auth/authorization";

import {
  phase0DiagnosticRawRecord,
  toPhase0DiagnosticRecordForRole,
} from "./phase0-diagnostic-record";

const protectedResponseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
} as const;

export type Phase0DiagnosticApi = {
  getRecord: (request: Request) => Promise<Response>;
  runAdministratorProbe: (request: Request) => Promise<Response>;
};

function createAuthorizationErrorResponse(error: AuthorizationError): Response {
  return Response.json(
    { error: { code: error.code } },
    {
      status: error.status,
      headers: protectedResponseHeaders,
    },
  );
}

export function createPhase0DiagnosticApi(
  authorization: ServerAuthorization = createServerAuthorization(),
): Phase0DiagnosticApi {
  return {
    async getRecord(request: Request): Promise<Response> {
      try {
        const user = await authorization.requireAuthenticatedUser(request.headers);

        return Response.json(
          {
            record: toPhase0DiagnosticRecordForRole(user.role, phase0DiagnosticRawRecord),
          },
          { headers: protectedResponseHeaders },
        );
      } catch (error) {
        if (error instanceof AuthorizationError) {
          return createAuthorizationErrorResponse(error);
        }

        throw error;
      }
    },

    async runAdministratorProbe(request: Request): Promise<Response> {
      try {
        await authorization.requireAdministrator(request.headers);

        return Response.json(
          { status: "administrator-authorized" },
          { headers: protectedResponseHeaders },
        );
      } catch (error) {
        if (error instanceof AuthorizationError) {
          return createAuthorizationErrorResponse(error);
        }

        throw error;
      }
    },
  };
}

const phase0DiagnosticApi = createPhase0DiagnosticApi();

export function getPhase0DiagnosticApi(): Phase0DiagnosticApi {
  return phase0DiagnosticApi;
}
