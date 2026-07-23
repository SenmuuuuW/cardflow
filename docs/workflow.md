# CardFlow Workflow Rules

## Purpose

This document turns the receiving, photography, inventory, and consolidated-shipment SOP into server-enforced workflow rules. It describes required behavior, not a final API or database implementation.

The client may guide an operator through the next action, but the server is the authority for permissions, evidence checks, state transitions, locking, and audit records. Hiding a button or a field in the UI is never enforcement.

## The Eight Main Card States

These are the eight main states from the development guide. The Chinese labels are retained as the source labels; the English identifiers are working names only and are not yet a final enum.

| Order | Source label | Working identifier | Meaning |
| --- | --- | --- | --- |
| 1 | 待到仓 | `AWAITING_ARRIVAL` | Purchase work is recorded and the card is expected to arrive in China. |
| 2 | 待开箱 | `AWAITING_UNBOXING` | The package has been signed for/received and is waiting to be opened. |
| 3 | 核验中 | `VERIFYING` | The warehouse is comparing actual received cards, quantity, and condition with the purchase record. |
| 4 | 待拍照 | `AWAITING_PHOTOGRAPHY` | Each physical card has a unique inventory ID and is waiting for required evidence photography. |
| 5 | 可售库存 | `SELLABLE_INVENTORY` | Required card photography is complete and there is no serious unresolved exception preventing inventory availability. |
| 6 | 已锁定 | `LOCKED` | The card has been assigned to a consolidated shipment batch and cannot be assigned again. |
| 7 | 打包中 | `PACKING` | The card is being verified, packed, and weighed as part of its locked batch. |
| 8 | 已发货 | `SHIPPED` | The batch dispatch evidence is complete, including the logistics number. |

`ExceptionRecord` handling is an exception branch and gate, not a ninth normal card state.

## Permitted Normal Transitions

| From | To | Business action and server preconditions |
| --- | --- | --- |
| `AWAITING_ARRIVAL` | `AWAITING_UNBOXING` | A package has been received/signed for and associated with the relevant purchase work. The receiving record must identify the package and responsible operator. |
| `AWAITING_UNBOXING` | `VERIFYING` | Warehouse receiving begins. The system records the package scan/association and begins unboxing and verification work. Completion, not merely entry, is blocked without the required unboxing evidence or administrator-written exemption. |
| `VERIFYING` | `AWAITING_PHOTOGRAPHY` | Receipt is complete: expected versus actual quantities have been checked, outer-package issues have been recorded, and the unboxing video or administrator-written exemption exists. A quantity mismatch must create an exception and cannot take this normal path. The resulting physical cards each receive one unique inventory ID before photography. |
| `AWAITING_PHOTOGRAPHY` | `SELLABLE_INVENTORY` | The unit has complete high-resolution front and back photos, any discovered issue has the required condition evidence/description, and no serious unresolved exception blocks availability. The guide permits this to happen automatically; administrator-by-administrator approval is not required. |
| `SELLABLE_INVENTORY` | `LOCKED` | An administrator creates a shipment batch and selects the card. The server verifies that the unit is sellable, has a current storage location, is eligible, and is not already in an active batch, then locks all selected units atomically. Location assignment is required before bulk-shipment preparation; whether it also gates entry into sellable inventory remains unresolved. |
| `LOCKED` | `PACKING` | Warehouse shipment work begins for the assigned batch. The operator must scan and verify the inventory ID and storage location. A scan for the wrong card must block the action immediately. |
| `PACKING` | `SHIPPED` | The entire batch has its inventory verified, packing/pre-shipment photo, parcel weight, waybill/label photo, and tracking number. The server must reject the transition if any required item is missing. |

`SHIPPED` is terminal for the initial MVP. Customer delivery, return intake, and downstream US fulfillment are outside this workflow.

## Rework and Cancellation Paths

Only explicit, traceable rework should move a card backward.

- `SELLABLE_INVENTORY -> AWAITING_PHOTOGRAPHY`: the administrator may spot-check a card and return it for re-photography. The reason and actor must be audited; prior evidence must remain traceable rather than being silently replaced.
- Shipment-task cancellation is within the administrator's listed authority, but the guide does not define the precise release path for already locked or packing cards. Whether a canceled `LOCKED` card returns to sellable inventory, and whether interrupted packing can be reversed, is an unresolved decision. Do not implement a backward transition until that policy is approved.
- No other backward transition is assumed. A state may not be manually edited to skip evidence or repairs.

## Exception Branches

Exceptions are independent tasks. They must not be hidden in notes or treated as an optional warning.

| Trigger | Target and required response | Effect on normal workflow |
| --- | --- | --- |
| Quantity discrepancy: missing, extra, or wrong card | Create an `ExceptionRecord` linked to the relevant package and/or purchase-order item; retain receiving evidence. | Expected quantity not equal to actual quantity cannot complete normal receiving. |
| Condition issue: white spots, edge wear, scratch, dent, or similar | Create an `ExceptionRecord` for the physical card when identifiable, with condition description and supporting evidence. | It may prevent automatic sellable inventory status when considered serious; the severity policy is unresolved. |
| Authenticity or description issue: suspected counterfeit or mismatch with seller description | Create an `ExceptionRecord` with supporting evidence. | The card cannot bypass exception handling to become normal sellable inventory. |
| Logistics issue: damaged outer package | Create an `ExceptionRecord` linked to the package and retain package evidence. | Receiving and later verification must reflect the issue; whether it blocks all contained cards depends on the eventual exception policy. |
| Wrong-card scan during shipment packing | Reject the scan/packing action immediately and record the attempt as needed for auditability. | The non-matching card must not move into packing or shipment. |
| Missing shipping evidence | Do not create a false shipped state. | `PACKING -> SHIPPED` is rejected until all required evidence exists. |

The guide lists possible administrator outcomes as supplementary evidence, accepted inventory, return, refund, or closure. Every handling step must retain the operator and timestamp. The exact mapping of each outcome back to the card lifecycle is intentionally unresolved.

## Mandatory Evidence and Workflow Gates

| Stage or transition | Required evidence or validation |
| --- | --- |
| Receipt completion | Package scan/association, outer-package inspection record, item-by-item expected versus actual verification, and an unboxing video. An administrator-written exemption is the only guide-listed alternative to the video. |
| Quantity discrepancy | A distinct exception record; normal receipt completion is not allowed. |
| Photography completion | High-resolution front photo and high-resolution back photo for every inventory unit. If a problem is found, record its condition description and related evidence. |
| Inventory identity | Exactly one unique inventory ID for every physical card; quantity is fixed at one. Upload or request retries must not create a duplicate unit. |
| Re-photography | The administrator's return/spot-check decision and the new evidence must remain traceable. |
| Shipment locking | A current storage location and a recorded batch assignment made in one server transaction so a card cannot enter two batches. |
| Shipment packing | Per-card inventory-ID and storage-location scan verification; a mismatch blocks packing. |
| Shipment completion | Inventory verification, packing/pre-shipment photo, parcel weight, waybill/label photo, and tracking number. Missing any one prevents the shipped state. |
| Exception handling | Evidence submission, administrator outcome, actor, and timestamp for each material handling step. |

## Rules That Must Be Enforced on the Server

The following are correctness and access-control requirements, not front-end conventions.

1. Authenticate the caller and authorize the action by role. Only the administrator can create/cancel purchase or shipment work, decide exception outcomes, and access purchase costs; warehouse users execute warehouse tasks and submit evidence.
2. Never return purchase-cost fields to warehouse callers. This includes nested records, list/search responses, exports, errors, and audit-related payloads. Field omission must happen in server-side query and serialization logic.
3. Validate the current state, permitted destination, caller role, and all evidence prerequisites before every transition. Direct API calls must receive the same rejection as an unavailable UI action.
4. Require an unboxing video or administrator-written exemption before receipt can complete. Require an exception record when expected and actual quantities differ.
5. Issue and preserve one unique inventory identity per physical card. Creation requests and upload-related retries need server-side idempotency or equivalent uniqueness protection so they resolve to the same unit instead of creating duplicates.
6. Make media upload retry-safe. A retried front/back photo, unboxing video, or shipping image must not create duplicate evidence records or trigger duplicate inventory creation. The implementation mechanism is still open, but the result is mandatory.
7. Treat open exceptions as workflow gates where the guide requires them. A card with a serious unresolved exception cannot automatically become sellable, and a mismatch cannot complete normal receiving.
8. Lock inventory and create shipment assignment atomically. Concurrent requests must not place one inventory unit in two active shipment batches.
9. Validate packing scans against both the locked batch and assigned storage location. A wrong inventory ID must be blocked before the card can advance.
10. Validate all dispatch evidence before marking a batch and its cards shipped. A tracking number alone is insufficient.
11. Write an audit record for material state changes, evidence actions, exception handling, lock/release decisions, and shipment actions, with the responsible account and timestamp.

## Open Workflow Decisions

- The guide does not define whether the first three states are represented per expected card, per receipt line, or by provisional inventory records before physical identification.
- The storage-location assignment is required by the business flow and shipment scan, but its exact lifecycle gate is not specified.
- "Serious" exception, evidence sufficiency, exception ownership, and the transition effect of accepting inventory, returning, refunding, or closing are not yet defined.
- The precise cancellation/release flow for a locked or packing shipment is not specified.
- The guide does not define partial shipment behavior, replacement labels, or whether every card in a batch changes to `SHIPPED` atomically.
- IDs, scan/QR requirements, upload idempotency keys, and media replacement/version behavior need a technical design after the cross-border upload test.

These gaps should be resolved explicitly before the relevant phase is implemented. They are not permission to bypass the state machine or make workflow behavior client-controlled.
