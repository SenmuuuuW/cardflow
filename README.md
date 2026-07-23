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

Local development is not initialized yet. This section will be completed after the proposed architecture and Phase 0 plan are approved.

## Documentation

- [Product scope](docs/product-scope.md)
- [Domain model](docs/domain-model.md)
- [Workflow](docs/workflow.md)
- [Phase 0 plan](docs/phase-0-plan.md)
- [Architecture decisions](docs/architecture-decisions.md)
