# CardFlow Agent Guide

This is the working index for future Codex agents. Keep it concise; the detailed decisions live in `docs/`.

## Read before editing

| Change area | Required reading |
| --- | --- |
| Any product behavior | `docs/product-scope.md` and `docs/workflow.md` |
| Domain or persistence behavior | `docs/domain-model.md` |
| Phase 0 work | `docs/phase-0-plan.md` and `docs/architecture-decisions.md` |
| Any implementation | This guide and all documentation relevant to the change |

## Non-negotiable rules

- Keep business rules, permissions, and state-transition validation on the server.
- Never expose purchase-cost fields to China warehouse users through any API response.
- Never bypass the documented state transitions.
- Upload retries must not create duplicate inventory units or duplicate business records.
- Record workflow actions so the responsible account and time remain auditable.

## Engineering discipline

- Use clear domain names and existing project conventions; avoid ambiguous abbreviations.
- Keep changes small, focused, and reviewable. Do not mix unrelated changes into a commit.
- Run lint, typecheck, and tests for every implementation change; report any check that cannot run.
