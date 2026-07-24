import "server-only";

import {
  AuthorizationError,
  createServerAuthorization,
  type ServerAuthorization,
} from "@/auth/authorization";

import {
  toPhase0DiagnosticRecordsForRole,
} from "./phase0-diagnostic-record";
import {
  listPhase0DiagnosticRecords,
  type Phase0DiagnosticRecordReader,
} from "./phase0-diagnostic-record-query";

const protectedResponseHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
} as const;

export type Phase0DiagnosticApi = {
  getRecords: (request: Request) => Promise<Response>;
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
  diagnosticRecordReader: Phase0DiagnosticRecordReader = {
    list: listPhase0DiagnosticRecords,
  },
): Phase0DiagnosticApi {
  return {
    async getRecords(request: Request): Promise<Response> {
      try {
        const user = await authorization.requireAuthenticatedUser(request.headers);
        const records = await diagnosticRecordReader.list();

        return Response.json(
          {
            records: toPhase0DiagnosticRecordsForRole(user.role, records),
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
