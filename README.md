# CardFlow

CardFlow is an internal collaboration and warehouse workflow system for Pokemon cards. It connects a US-based administrator with one or two China warehouse employees from purchase-order creation through receipt, per-card evidence capture, inventory handling, and consolidated shipment to the United States.

The MVP is designed for approximately 50 cards per day. Its purpose is to make every physical card's status, evidence, and responsible operator visible and traceable, while preventing invalid work from progressing.

> **Mandatory:** permission checks and workflow-state validation belong on the server. Hiding a control in the browser is not enforcement. China warehouse users must never receive purchase-cost fields from an API response.

## Users and roles

- **US administrator:** creates purchase orders, views purchase costs, resolves exceptions, creates or cancels consolidated shipment tasks, and reviews all statuses and audit records.
- **China warehouse employee:** receives packages, uploads unboxing evidence, verifies quantity and condition, captures card images, assigns and stores inventory, and executes assigned consolidated shipments. This role submits exception evidence but does not decide outcomes.

## System scope

CardFlow supports the internal chain of custody from a purchase order to a physical card and then to a consolidated outbound shipment. The MVP is organized around six work areas: administrator home, purchase orders, receiving, photography, inventory, and consolidated shipment.

## Non-goals

- A consumer-facing ecommerce site or Shopify replacement.
- Customer-order fulfillment or individual buyer shipments.
- A general-purpose ERP.
- Automation added before the core workflow, evidence, permissions, and state rules are proven.

## Core workflow

1. **Awaiting arrival** - purchase is recorded.
2. **Awaiting unboxing** - package is signed for.
3. **Verification in progress** - quantity and condition are checked.
4. **Awaiting photography** - every physical card has a unique inventory ID.
5. **Sellable inventory** - required images are complete and there is no serious unresolved exception.
6. **Locked** - the card is assigned to a consolidated shipment batch.
7. **Packing** - card, location, and weight are checked.
8. **Shipped** - logistics tracking is complete.

Shortages, wrong cards, suspected counterfeits, obvious defects, and package damage take an exception branch. An exception cannot be hidden in a note or used to bypass the normal state rules.

## Roadmap

| Phase | Focus | Included scope |
| --- | --- | --- |
| Phase 0 | Foundation and uploads | Login, roles, database, mock data, and a China connectivity test page. |
| Phase 1 | Purchase and receiving | Purchase orders, CSV import, packages, and actual-receipt verification. |
| Phase 2 | Photography and exceptions | Per-card IDs, front/back images, exception center, and automatic entry to inventory when requirements are met. |
| Phase 3 | Inventory and shipment | Storage locations, QR codes, consolidated locking, packing, weighing, and logistics. |

Each phase must pass lint, typecheck, and tests. State-machine, permissions, and inventory-locking behavior receive priority coverage.

## Local development

### Prerequisites

- Node.js 22 or later.
- pnpm 10.34.5 or later.
- Docker Desktop with Docker Compose for the local PostgreSQL databases.

### Install

```bash
pnpm install
```

### Development server

```bash
pnpm dev
```

### Quality checks

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

### Test watch mode

```bash
pnpm test:watch
```

### Environment setup

```bash
cp .env.example .env.local
```

P0-03 adds local-only PostgreSQL connection values. P0-04 adds Better Auth configuration: generate a unique local `BETTER_AUTH_SECRET` with `openssl rand -base64 32`, place the output only in `.env.local`, and keep `BETTER_AUTH_URL` at `http://localhost:3000` for local development. HTTP is accepted only for loopback development; a hosted deployment must use HTTPS before secure cookies can be issued. Object storage, deployment provider, and final region remain deferred.

### Authentication and provisioning

CardFlow is invitation/provisioning-only. There is no public registration page, and the Better Auth sign-up endpoint is disabled. Provision each initial account through the server-only command after applying the development migration:

```bash
pnpm provision:phase0-user
```

The command prompts for an email, display name, role, and masked password. It can instead read `CARDFLOW_PROVISION_EMAIL`, `CARDFLOW_PROVISION_DISPLAY_NAME`, `CARDFLOW_PROVISION_ROLE`, and `CARDFLOW_PROVISION_PASSWORD` from the environment. Use the command once for `administrator` and once for `china_warehouse`. Re-running it for an existing email preserves the stored display name, role, and password rather than changing them.

Provisioned users sign in at `/login`; `/diagnostic` is the only protected Phase 0 surface and shows the server-resolved display name and role. CI uses a test-only Better Auth secret and URL, while database tests create ephemeral accounts at runtime. No real credentials are committed.

### P0-05 permission boundary

The Phase 0 diagnostic API has one server-only authorization boundary. `GET /api/diagnostic/records` requires a valid authenticated session and maps the persisted non-production diagnostic records into explicit role-safe response shapes. Administrators receive the approved purchase-cost fields; China warehouse responses construct a separate allow-list shape that omits purchase-cost and internal procurement fields entirely.

`POST /api/diagnostic/administrator-probe` requires the persisted `administrator` role. The server resolves the current role from the authenticated Better Auth session and PostgreSQL record for every request; it ignores claimed roles in browser state, cookies, headers, query parameters, and request bodies. Protected diagnostic responses use `401` for unauthenticated callers, `403` for authenticated callers without permission, and `Cache-Control: private, no-store`. These diagnostic records are not a final business model.

### Controlled Phase 0 mock data

P0-06 adds the provisional `phase0_diagnostic_records` table and seed-ownership ledgers. They are not purchase orders, inventory, or workflow tables and may be removed or replaced after Phase 0. The seed uses three fixed synthetic records: Diagnostic Card Alpha, Beta, and Gamma (Mock).

Set synthetic local-only values for the six `PHASE0_*` variables in `.env.local`, then run the seed after applying the development migration:

```bash
pnpm db:seed:phase0
```

The command provisions one administrator and one China warehouse account through the existing server-only provisioning service, reconciles the three stable diagnostic IDs, and is safe to rerun. It preserves an existing account's role, display name, and password; a conflicting existing role stops the command. It logs only account statuses and diagnostic record IDs, never passwords or secrets.

Reset only the same controlled data with:

```bash
pnpm db:reset:phase0
```

Reset uses the configured Phase 0 email addresses and seed-ownership ledgers to remove only seed-owned accounts, their Better Auth account/session rows, and the three deterministic diagnostic records. It preserves unrelated users and records, is safe to rerun, and never drops schemas or Docker volumes. Both seed and reset refuse production-like environments and require a local development or test database URL; neither runs automatically in production.

### Local database

Start the local PostgreSQL service and apply the development migration:

```bash
pnpm db:start
pnpm db:migrate
```

Docker Compose creates separate `cardflow_development` and `cardflow_test` databases in one local-only PostgreSQL service. It uses trust authentication bound to `127.0.0.1` and must never be treated as a production configuration.

Stop the service without deleting its local volume:

```bash
pnpm db:stop
```

The test database initialization SQL runs when Docker creates a fresh volume. To recreate both local databases from scratch, use `docker compose down -v` before `pnpm db:start`.

### Migrations and database tests

Generate a new migration only after an intentional schema change, then apply committed migrations with:

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:migrate:test
```

`pnpm db:migrate:test` clears and recreates only the local database named by `TEST_DATABASE_URL`; it refuses a URL that is not clearly a test database or targets the same database as `DATABASE_URL`.

Run PostgreSQL integration tests separately from the database-free unit test suite:

```bash
pnpm db:test
```

### Continuous integration

`.github/workflows/ci.yml` runs `pnpm lint`, `pnpm typecheck`, database-free `pnpm test`, a clean PostgreSQL test migration, `pnpm db:test` including authentication, seed/reset, and authorization integration coverage, and `pnpm build` for pushes to `main` and pull requests targeting `main`. It uses only test-local PostgreSQL and test-only authentication environment values.

## Documentation

- [Product scope](docs/product-scope.md)
- [Domain model](docs/domain-model.md)
- [Workflow](docs/workflow.md)
- [Phase 0 plan](docs/phase-0-plan.md)
- [Architecture decisions](docs/architecture-decisions.md)
