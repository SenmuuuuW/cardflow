# Phase 0 Plan: Foundation and Upload Validation

## Purpose and boundary

Phase 0 proves that CardFlow can safely support the two initial roles and that a China warehouse user can reliably reach the system and upload high-resolution card images. It is a foundation phase, not the start of purchase, receiving, photography, inventory, exception, or shipment workflows.

The architecture recommendation in `docs/architecture-decisions.md` must be approved before implementation begins. File paths below are intentionally described by area rather than treated as a final project structure.

Phase 0 exit gate: a China warehouse user must complete the login/list and ten-image test on both the warehouse Wi-Fi and a 5G connection, including refresh and retry behavior. Full workflow development must not begin before that result is reviewed.

## Reviewable tasks

### P0-01: Establish the repository baseline

**Objective:** Create the approved application foundation and repository conventions without building business workflow screens.

**Expected files or areas:** Repository root; package manager manifest and lockfile; environment-variable example; ignore rules; application bootstrap; developer documentation.

**Acceptance criteria:**

- The project starts with one documented local command after the approved stack is initialized.
- Secrets and local environment files are excluded from version control.
- The repository contains no placeholder purchase, receiving, inventory, exception, or shipment pages.
- The selected implementation matches the approved architecture decision.

**Dependencies:** Approval of the architecture recommendation and availability of a provisional Phase 0 test deployment approach. The final production provider and region remain deferred to the China trial.

**Risks:** Choosing a hosting or framework convention before the China connectivity test could create unnecessary rework. Keep provider selection separate from the local foundation where possible.

### P0-02: Add local quality gates

**Objective:** Make linting, type checking, and automated tests runnable from the start.

**Approved testing decision:** Vitest runs pure tests in its default `node` environment. Its configuration resolves `@/` to `src/`; browser-testing adapters are not part of P0-02.

**Expected files or areas:** Linter, formatter if selected, TypeScript configuration, test-runner configuration, package scripts, and a minimal test fixture.

**Acceptance criteria:**

- `lint`, `typecheck`, and `test` are documented and runnable locally.
- Each command exits successfully on the clean baseline.
- The test setup can exercise server authorization and upload idempotency without relying on a browser-only check.
- Future Phase 0 tasks run all three commands before review.

**Dependencies:** P0-01.

**Risks:** A test setup coupled too tightly to the UI will make server-rule tests slow or weak. Keep core server rules independently testable.

### P0-03: Initialize the minimum persistent data foundation

**Objective:** Connect the approved relational database and introduce only the persistence needed for authenticated users, roles, upload-test records, and mock data.

**P0-03 implementation decision:** PostgreSQL is accessed through Drizzle ORM and node-postgres. Local Docker Compose provides logically separate `cardflow_development` and `cardflow_test` databases. The test migration path resets only `TEST_DATABASE_URL`, then applies the committed SQL migration. Database connections used by the application are server-only and cached across development reloads.

**Provisional schema decision:** `users` stores a provider-neutral account identifier, display name, and one persisted PostgreSQL enum role. `phase0_diagnostic_upload_sessions` and `phase0_diagnostic_upload_intents` are explicitly diagnostic structures, not authentication sessions or final media attachments. The intent table records client file metadata and has a unique `(session_id, idempotency_key)` constraint. Authentication identity linkage, final attachment targets and lifecycle, storage keys, upload finalization, cleanup policy, and automatic `updated_at` behavior remain deferred.

**Expected files or areas:** Database connection configuration; migration tooling; initial migration(s); server data-access layer; local/test database configuration.

**Acceptance criteria:**

- A fresh database can be migrated reproducibly in local and test environments.
- The initial model supports users, roles, and retry-safe media-upload test metadata without claiming to be the final business schema.
- The local and test migration path is documented well enough to recreate the Phase 0 baseline.
- Database access is available only to server-side code.

**Dependencies:** P0-01 and the approved architecture.

**Risks:** Treating the Phase 0 tables as a final schema can prematurely constrain later package, inventory, exception, and shipment modeling. Keep later fields explicitly provisional.

### P0-04: Implement authentication and the two initial roles

**Objective:** Establish authenticated sessions and server-derived `administrator` and `china_warehouse` roles.

**P0-04 implementation decision:** Better Auth uses the existing PostgreSQL/Drizzle foundation for email/password credential accounts and database-backed sessions. The existing `users` table remains the application-user table and preserves the two-value PostgreSQL role enum. Only a server-only provisioning command creates accounts; public sign-up is disabled. The session helper validates the Better Auth session, then reads the persisted CardFlow role for every request. HTTPS deployments use secure HTTP-only cookies; local loopback development uses the necessary HTTP exception.

**Expected files or areas:** Authentication configuration; session handling; user and role persistence; server middleware or request guards; role seed/setup path.

**Acceptance criteria:**

- Unauthenticated requests cannot use protected application or API routes.
- A test administrator and a test China warehouse user can sign in.
- The server resolves the role from trusted session and persisted data, not from a browser-supplied role value.
- Roles have only the two initial values; expanding role granularity is deferred.

**Dependencies:** P0-03.

**Risks:** Browser-visible role flags or client-only route hiding would create an authorization bypass. Provisioning must remain idempotent and must not silently modify an existing role or password.

### P0-05: Establish the server permission boundary and safe response shapes

**Objective:** Prove that permission enforcement and purchase-cost exclusion occur before data reaches the warehouse browser.

**P0-05 implementation decision:** A small server-only authorization layer validates the Better Auth session and resolves the current persisted PostgreSQL role for each protected request. It exposes explicit authenticated, role, and administrator guards with stable `401` unauthenticated and `403` forbidden responses. The non-production Phase 0 diagnostic record has separate explicit administrator and warehouse response mappers; warehouse responses are an allow-list and never serialize purchase-cost or internal procurement fields. Query parameters, request bodies, headers, cookies, and browser state never supply an authoritative role.

**Expected files or areas:** Server authorization policy/module; protected query/service layer; role-specific response types; authorization tests; mock protected records.

**Acceptance criteria:**

- Administrator-only actions and records are rejected for a warehouse session on the server.
- A warehouse API response does not serialize purchase-cost fields, including when a caller manually requests or guesses those fields.
- A test confirms that front-end hiding is not the mechanism protecting costs.
- Authorization failures are covered by automated tests.

**Dependencies:** P0-02, P0-03, and P0-04.

**Risks:** A generic database object passed directly to a route can accidentally expose newly added sensitive fields. Use explicit role-safe server response shapes.

### P0-06: Add controlled mock data

**Objective:** Provide repeatable non-production records for role, list, and upload tests without starting the full business workflow.

**P0-06 implementation decision:** `phase0_diagnostic_records` holds three fixed synthetic records with stable IDs, positive quantities, non-negative costs, and a narrow diagnostic-only currency representation. `phase0_diagnostic_seed_accounts` and `phase0_diagnostic_seed_records` record only accounts and records created by the server-only seed process so reset can remove only seed-owned rows and Better Auth account/session rows. The seed reconciles fixed records and preserves existing account roles and passwords; a role conflict or unowned fixed record ID fails closed. The role-safe diagnostic list remains server-derived, explicitly mapped, and cost-free for warehouse responses. Seed and reset refuse production-like environments, require a local development or test database URL, and introduce no operational model.

**Expected files or areas:** Seed scripts or fixtures; test-data documentation; development reset command; minimal read-only test endpoint or server query.

**Acceptance criteria:**

- A developer can seed and reset deterministic test users and records.
- The administrator test data can verify purchase-cost visibility; warehouse fixtures and responses omit that data.
- Mock data is clearly labeled and cannot be confused with operational inventory.
- The test list contains only the minimum data needed for connectivity verification.
- Reset removes only seed-owned accounts and deterministic diagnostic records, while preserving unrelated users and records.

**Dependencies:** P0-03 through P0-05.

**Risks:** Mock records that resemble a partial operational workflow may become an unofficial data model. Do not add receiving, inventory, or shipment behavior merely to make the test page look complete.

### P0-07: Define the retry-safe upload contract

**Objective:** Create the server-side upload-session and finalization design used by the Phase 0 image test and later media evidence.

**Expected files or areas:** Server upload endpoints or actions; upload-intent persistence; object-storage adapter; signed-upload policy; media metadata/finalization service; server tests.

**Acceptance criteria:**

- The server issues a stable upload intent and idempotency key before the browser uploads a file.
- Retrying a request with the same key returns or resumes the same logical upload rather than creating another media record.
- Finalization is idempotent and records one attachment for one successful upload intent.
- The Phase 0 upload test creates no `InventoryUnit`; later integration must preserve the rule that a media retry cannot create a duplicate inventory unit.
- The design supports high-resolution images now and leaves room for future unboxing video evidence without defining unsupported file limits.

**Dependencies:** P0-02 through P0-05 and the selected object-storage approach.

**Risks:** A direct upload can succeed while the browser loses the finalization response. The server must reconcile the existing intent instead of assuming that a retry is a new upload.

### P0-08: Build the China connectivity test surface

**Objective:** Create a deliberately narrow, protected diagnostic surface for sign-in and role-safe list loading from China.

**Expected files or areas:** Responsive test route; authenticated list query; minimal UI components; connectivity-test instructions; browser test coverage where practical.

**Acceptance criteria:**

- The page is usable in a mobile browser and authenticates the warehouse test user.
- It loads a small, role-safe server-provided list after sign-in.
- It contains no operational purchase, receiving, photography, inventory, exception, or shipment workflow controls.
- The page is ready to be used on both China warehouse Wi-Fi and 5G.

**Dependencies:** P0-04 through P0-06.

**Risks:** A local or US-only test cannot establish China accessibility. The acceptance trial must use the real warehouse network conditions.

### P0-09: Add the ten-image upload test and visible progress

**Objective:** Extend the diagnostic surface with a high-resolution image upload test that gives the warehouse user clear progress feedback.

**Expected files or areas:** Upload-test UI; file-selection state; upload client; progress components; upload-status query; accessibility and mobile layout checks.

**Acceptance criteria:**

- A warehouse user can select ten high-resolution images in one test session.
- The page displays meaningful per-file and/or aggregate upload progress while uploads are active.
- Completed, pending, and failed states are distinguishable without reloading the page.
- The UI uses only the server-issued upload contract from P0-07.

**Dependencies:** P0-07 and P0-08.

**Risks:** Browser progress events, storage-provider behavior, and mobile network interruptions can differ. The UX must be verified on the target networks rather than inferred from local development.

### P0-10: Add failure recovery and duplicate-prevention tests

**Objective:** Make interrupted uploads recoverable without duplicate media records or unintended inventory-unit creation.

**Expected files or areas:** Retry controls; upload-status reconciliation; idempotency and database-transaction tests; failure simulation in the upload test surface.

**Acceptance criteria:**

- A simulated interrupted or failed upload can be retried from the UI.
- Retrying the same logical file/upload intent results in one completed media record, not multiple records.
- A request replay and a finalization replay are covered by automated server tests.
- A retry cannot create an `InventoryUnit`; no inventory-unit creation is part of Phase 0.

**Dependencies:** P0-07 and P0-09.

**Risks:** Retrying with a newly generated client identifier would bypass idempotency. The retry control must reuse the persisted upload intent/key for the same logical file.

### P0-11: Preserve upload drafts across page refresh

**Objective:** Keep the test session and its known upload outcomes recoverable after a page refresh or browser interruption.

**Expected files or areas:** Draft/session persistence; upload-status reconciliation endpoint or query; client recovery logic; refresh/recovery tests.

**Acceptance criteria:**

- After refresh, the user can see the same draft session and the server-confirmed state of each upload.
- Already-completed uploads are not submitted again merely because the page refreshed.
- Failed or unfinished uploads remain eligible for retry using their original upload intent.
- The recovery path does not expose purchase costs or bypass authentication.

**Dependencies:** P0-07, P0-09, and P0-10.

**Risks:** Browser-only draft storage can become stale after an upload reaches storage. The server remains the source of truth for completed upload state.

### P0-12: Run the cross-border acceptance trial and record the result

**Objective:** Validate the Phase 0 foundation under the actual connectivity conditions that will be used by China warehouse staff.

**Expected files or areas:** Test checklist; test evidence/notes outside production records; issue tracker or decision record updates; any narrowly justified configuration changes.

**Acceptance criteria:**

- On China warehouse Wi-Fi and on 5G, the warehouse test user can sign in and load the protected list.
- On each connection, the user completes the ten-image test with visible progress.
- At least one refresh/recovery scenario and one failed-upload retry scenario are exercised.
- The observed results establish whether the proposed deployment region and media path are acceptable, or identify the narrow change needed before Phase 1.
- `lint`, `typecheck`, and `test` pass for the final Phase 0 implementation.

**Dependencies:** P0-02 and P0-04 through P0-11; access to the real China networks and test user.

**Risks:** This task cannot be substituted with a synthetic latency test. A failed real-network trial is a design signal, not a reason to proceed into full workflow development.

## Phase 0 completion checklist

- Authentication and both initial roles are enforced by the server.
- A warehouse API response has been tested to confirm it never includes purchase-cost fields.
- The database setup, deterministic mock data, lint, typecheck, and tests are in place.
- The diagnostic page validates sign-in, list loading, ten high-resolution image uploads, progress, retry safety, and refresh recovery.
- The real China Wi-Fi and 5G trial is complete and the deployment/media result has been reviewed.
- No full operational workflow has been implemented or implied by the diagnostic surface.
