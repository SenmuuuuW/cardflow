# Product Scope

## What CardFlow does

CardFlow is an internal operating system for a US administrator and a China warehouse team of one or two people. It maintains a continuous evidence chain from purchase order, to received package, to individual physical card, to consolidated shipment back to the United States.

It is designed to ensure that each physical card has a visible status, traceable evidence, a responsible operator, and server-enforced workflow rules. The intended MVP capacity is approximately 50 cards per day.

## What CardFlow does not do

- It is not a consumer-facing ecommerce website, a Shopify replacement, or a marketplace.
- It does not fulfill individual customer orders or ship cards individually to buyers.
- It is not a general-purpose ERP.
- It does not prioritize automation ahead of a proven, evidence-complete operating workflow.

## Responsibilities

### US administrator

- Create purchase orders and view purchase costs.
- Decide exception outcomes.
- Create or cancel consolidated shipment tasks.
- Review all statuses and audit records.

### China warehouse

- Receive packages and upload unboxing video evidence.
- Verify actual quantity and condition against the expected order.
- Capture front and back images for every card, plus defect images when needed.
- Assign storage locations, protect inventory, and execute assigned consolidated shipments.
- Submit evidence for exceptions; the administrator decides the outcome.

Warehouse employees must never receive purchase-cost fields from an API. Frontend field hiding is not a substitute for server-side data isolation.

## Six MVP work areas

| Work area | MVP purpose |
| --- | --- |
| Administrator home | Surface exceptions, overdue work, pending shipments, and global search. |
| Purchase orders | Create orders manually or by CSV import; retain packages and a timeline. |
| Receiving | Scan packages, upload unboxing video, and verify actual receipt. |
| Photography | Capture front, back, and defect images; support retakes. |
| Inventory | Track one ID per card with status, storage location, and QR code. |
| Consolidated shipment | Select cards, lock inventory, pack, weigh, and record logistics. |

## Evidence and audit requirements

- Purchase-order screenshots, unboxing videos, card images, defect evidence, and shipping-label evidence belong with their relevant record.
- Receiving cannot complete without an unboxing video or an administrator's written waiver. A difference between expected and actual quantity requires an exception record.
- Each physical card requires a high-resolution front image and back image; a defect close-up is required when a problem is found.
- A consolidated shipment cannot be marked shipped without inventory verification, a pre-packing group photo, weight, shipping-label image, and tracking number.
- Exceptions are independent tasks, not informal notes. Their results can include requesting more evidence, accepting into inventory, return, refund, or closure.
- Workflow activity must retain the specific account and time. Audit records are viewable by the administrator and cannot be modified by the warehouse role.
- Missing evidence, unresolved quantity differences, or incorrect inventory selection must block the relevant workflow step rather than merely show a warning.
