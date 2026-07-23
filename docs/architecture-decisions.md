# Architecture Decisions

## Status

Recommendation for approval only. This document does not initialize a framework, select a hosting vendor, or define a final database schema.

## Context

CardFlow is a small internal web system for one US administrator and one or two China warehouse employees. Its expected design capacity is about 50 cards per day. The system must preserve a continuous evidence chain from purchase through bulk shipment, but it is not an e-commerce storefront, customer-order fulfillment tool, or general ERP.

The architectural priorities are, in order:

1. Correct server-enforced state and permission rules.
2. Complete and traceable evidence.
3. Efficient use on a mobile browser in the China warehouse.
4. Automation only after the core path is proven.

Two constraints shape every option:

- Warehouse users must never receive purchase-cost fields from an API response.
- State changes and later inventory locks must be validated in server-side transactions, not inferred from hidden front-end controls.

The final deployment and media path must be selected only after the Phase 0 China Wi-Fi and 5G upload trial.

## Options considered

### Option A: TypeScript modular monolith with PostgreSQL and object storage

One responsive web application contains the browser UI and a server-side application boundary. PostgreSQL holds relational business data and audit records. An S3-compatible object store holds high-resolution images and future video evidence; browsers upload directly through server-issued, short-lived upload permissions rather than sending large files through the application server.

An implementation could use a mature full-stack TypeScript framework such as Next.js, PostgreSQL, and an ORM/query layer. The exact framework, ORM, authentication provider, app host, database host, and storage vendor remain open.

### Option B: Browser app with a managed backend-as-a-service

A responsive TypeScript browser app uses a managed service for authentication, PostgreSQL, storage, and generated data access. Server-side functions or transactional database procedures would perform every state transition and sensitive operation.

This has a fast starting path, but direct client access requires unusually disciplined row-level policies, field-safe views, and restricted function boundaries. It must not rely on a client query or front-end UI to suppress purchase costs.

### Option C: Separate browser client and dedicated API service

A responsive React client is deployed separately from a dedicated Node API (for example, a service built with Fastify or NestJS). The API owns authorization, workflow transitions, PostgreSQL transactions, and signed-media upload issuance. Object storage is separate.

This is a conventional and capable design, but adds two deployable application surfaces, cross-service contracts, and more operational work for a two-person MVP team.

## Comparison

| Evaluation area | Option A: modular monolith | Option B: managed backend-as-a-service | Option C: separate client and API |
| --- | --- | --- | --- |
| Development speed for two people | Fast. One codebase and one server boundary keep the workflow close to the UI. | Fastest initial setup, but sensitive rules require careful policy and function design. | Moderate to slow. Separate contracts and deployments add setup before workflow value. |
| Mobile browser support | Strong. A responsive web UI can target warehouse phones without a native app. | Strong. The client is still a responsive web UI. | Strong. The client is still a responsive web UI. |
| Role-based server permissions | Strong. Server routes/services can resolve roles and choose role-safe response types. | Conditional. Can be strong with row-level policies plus server-only functions, but generated/direct data access increases the chance of a policy or projection mistake. | Strong. A dedicated API has a clear authorization boundary. |
| Relational data and transactions | Strong. PostgreSQL transactions can protect state changes and future batch locks. | Strong database foundation, but complex transition logic belongs in carefully reviewed transactional functions. | Strong. PostgreSQL transactions are naturally owned by the API. |
| High-resolution image and video uploads | Strong with server-issued upload intents and direct object-storage uploads. | Generally strong through managed storage, subject to provider behavior and the same retry design. | Strong with signed uploads, but the API and client must coordinate separately. |
| China network accessibility | Unknown until the Phase 0 Wi-Fi and 5G trial. App, auth, and storage endpoints must all be tested. | Unknown until the same trial. Managed service availability cannot be assumed. | Unknown until the same trial. More endpoints can make diagnosis and routing more complex. |
| Deployment complexity | Moderate: application, database, and object storage, potentially from separate providers. | Low to moderate: fewer managed services, but provider-specific configuration and policy tooling. | High: client deployment, API deployment, database, and object storage. |
| Maintenance cost | Low to moderate. One application codebase and explicit server rules. | Low initially; can rise if provider-specific policies/functions become difficult to audit or migrate. | Highest. Two application runtimes and an API contract need ongoing coordination. |

## Recommendation

Recommend **Option A: a TypeScript modular monolith with PostgreSQL and S3-compatible object storage**, subject to two conditions:

1. The implementation team has no contrary language or hosting constraint that makes TypeScript an unsuitable choice.
2. The Phase 0 China connectivity and ten-image upload test validates the chosen app, authentication, and media endpoints on both warehouse Wi-Fi and 5G.

This is the smallest architecture that still puts sensitive reads, workflow guards, transactional changes, audit creation, and upload finalization in a single server-owned boundary. It keeps the MVP deliberately smaller than a multi-service ERP while retaining a relational database for later inventory locking and traceability.

Option B is a viable fallback if the real China trial clearly favors a particular managed platform and its server-side policy model can prove the same protections. Option C should be reserved for a later need that the modular monolith cannot meet; current scale and user count do not justify its extra operational overhead.

## Required implementation patterns for the recommended option

These are architectural requirements, not a final schema or framework prescription.

### Server-side authorization and response shaping

1. Authenticate the request and resolve the role on the server from a trusted session and persisted role assignment.
2. Authorize each operation on the server before querying or changing protected data.
3. Return explicit role-safe response types. Warehouse queries must omit purchase-cost fields at the query/service boundary; the browser must never receive them.
4. Treat the browser role and hidden controls as untrusted convenience UI only.
5. Cover the warehouse-cost exclusion with an API-level automated test.

### Transactional workflow operations

1. Put state-transition validation in a single server-side policy/service boundary.
2. Read the current state, validate role, required evidence, and allowed transition, write the change, and append an audit record in one database transaction.
3. Use the same transaction discipline later when adding cards to a shipment batch so one inventory unit cannot be reserved twice.
4. Do not make the UI the source of truth for available transitions.

### Retry-safe media uploads

1. The browser asks the server for an upload intent tied to one logical media attachment and an idempotency key.
2. The server returns the existing intent for a replay rather than allocating another logical record.
3. The browser uploads directly to the server-approved storage location using short-lived credentials or signed URLs.
4. A server-side finalization step validates the intent and is idempotent, so a lost browser response or retry creates one `MediaAttachment` only.
5. Phase 0 uploads are isolated from inventory creation. When uploads later attach to inventory, retry behavior must never create another `InventoryUnit`.

This pattern supports the required high-resolution images and a future unboxing-video flow without requiring the application server to proxy large files. Exact file types, size limits, retention, and cleanup policy remain open.

### Deployment and China validation

Deployments should preserve the three logical components: server application, relational database, and object storage. The concrete region/provider decision must follow measured Phase 0 results, not assumptions about cross-border availability.

The Phase 0 diagnostic route must test all relevant paths together:

- warehouse sign-in and a protected, role-safe list;
- selection and upload of ten high-resolution images;
- visible progress;
- a failed-upload retry without duplicate records; and
- refresh recovery without losing the draft or re-uploading completed files.

Test these on actual warehouse Wi-Fi and 5G before starting Phase 1 workflow work.

## Decisions intentionally deferred

The guide does not supply enough evidence to make these choices now:

1. The application, authentication, database, and object-storage providers and their deployment regions.
2. The outcome of the China Wi-Fi and 5G trial, including which endpoint fails if a result is unacceptable.
3. The exact authentication and account-provisioning method for the administrator and warehouse users.
4. Final database fields, indexes, migration details, and data-retention policies.
5. Accepted image/video formats, size or duration limits, storage lifecycle, and evidence-retention requirements.
6. The exact idempotency-key lifetime, upload-intent cleanup behavior, and how a client proves that a retry represents the same logical file.
7. Backup, recovery, and operational monitoring requirements for production data and media.
8. The final audit-log retention and visibility details beyond the stated requirement that it record actor and time and cannot be modified by warehouse users.
9. Any later automation, additional roles, integrations, or native-app work; none are required for the MVP.

## Consequences of approval

Once this recommendation is approved, the next work is Phase 0 only: establish the repository and quality gates, set up authentication and the two roles, build the minimum persistent/upload foundation, and run the China connectivity test before implementing the operational workflow.
