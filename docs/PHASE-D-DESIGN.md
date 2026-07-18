# Phase D design — commercial operations data model

**Date:** 2026-07-19 · Working design for materials/procurement, labour/equipment,
Measurement Book, budgets. Follows rules.md §7 (money = integer paise + currency code;
quantities = numeric text + unit; append-only for certified/financial records) and the
conventions in memory.md §14 (Phase B entry).

## Materials and procurement

- `material` — catalogue: id, org, name, unit (UCUM-ish code, e.g. bag/kg/cum), hsn_code?,
  reorder_threshold numeric?, active.
- `supplier` — id, org, name, gstin?, phone?, email?, address?.
- `project_supplier` — project-scoped relationship (org, project, supplier, notes).
- `material_receipt` — a challan: id, org, project, supplier?, challan_number?, receipt_date,
  attachment_id? (photo evidence), ocr_run_id?, status: draft → reviewed (human) → posted
  (stock applied exactly once; posting writes stock_transactions in the same tx; unique
  guard on receipt id in stock_transaction source refs makes retry idempotent).
- `material_receipt_line` — receipt_id, material_id?, description_raw (as OCR read it),
  quantity numeric, unit, rate_paise?, amount_paise?, confidence_band.
- `invoice` — id, org, project, supplier?, invoice_number, invoice_date, gstin?,
  subtotal_paise, tax_paise, total_paise, status: draft → reviewed → approved (accountant/
  invoice.review), attachment_id?, ocr metadata. Approved invoices feed cost lines.
- `invoice_line` — invoice_id, description, hsn?, quantity, unit, rate_paise, tax_rate_bp
  (basis points), amount_paise, cost_code_id?.
- `stock_transaction` — append-only ledger: id, org, project, material_id, kind:
  received|issued|consumed|adjusted|returned, quantity (signed by kind at query time),
  unit, source_kind/source_id (receipt line, DPR material entry, manual), note, created_by.
  Current stock = sum over ledger; no mutable "current level" column.
- `rfq` + `rfq_item` + `rfq_quote` — RFQ per project with items (material, qty, unit);
  supplier quotes entered manually (rate_paise, delivery_days, notes); comparison view.
- `purchase_order` — DRAFT ONLY workflow: draft → approved (procurement.approve) →
  exported. Never sent automatically. po_line mirrors rfq items with chosen supplier.
- OCR: `DocumentExtractionPort` in packages/ai (extractChallan, extractInvoice) with a
  deterministic mock (fixture-driven) and an OpenAI vision implementation behind
  AI_PROVIDER. Extraction output validates against a versioned zod schema
  (`challan.v1`, `invoice.v1`) with per-field confidence bands; null when unsupported.
  Runs as a job (`document.extract`) on the existing queue; results land as draft
  receipt/invoice lines for human review. Nothing touches stock or costs before review.

## Labour and equipment

- `labour_contractor` — org, project?, name, trade?.
- `labour_attendance` — org, project, date, contractor_id?, trade, headcount int,
  hours_worked numeric?, location_id?, activity_id?, source report_id?, created_by.
  Daily totals, no individual worker identities (no biometrics by scope).
- `equipment` — org, register: name, kind, owned|rented, supplier_id?, identifier?.
- `equipment_assignment` — org, project, equipment_id, from_date, to_date?.
- `equipment_log` — append-only: org, project, equipment_id, date, hours_used numeric?,
  fuel_litres numeric?, downtime_hours numeric?, note, report_id?, created_by.
- `equipment_service` — due_date? and/or due_hours?; deterministic reminder = due_date
  within N days OR cumulative hours ≥ due_hours.
- Productivity view: attendance headcount vs approved DPR work-item quantities per
  activity/day — deterministic join, surfaced on project overview; no scoring.

## Measurement Book (e-MB Preview)

- `mb_entry` — id, org, project, mb_number (unique per project, sequential), work_item
  description, activity_id?, location_id?, contractor_id?, measurement_date,
  length/breadth/depth/count numerics (nullable), unit, quantity numeric (server-computed
  = product of provided dims × count, formula string stored, e.g. "L×B×D×n"),
  status: draft → submitted → verified | rejected → certified, created_by,
  verified_by?, certified_by?, timestamps. **Append-only after certification**: a
  correction inserts a new entry with `corrects_entry_id` and the old row gets
  `superseded_by`; values never change in place.
- `mb_evidence` — entry_id, attachment-style object (object_key, checksum, lat?, lng?,
  captured_at?) — geotagged photos.
- Deterministic calculation lives in domain (`packages/domain/src/mb/calc.ts`) with tests;
  server recomputes and refuses client-supplied quantity mismatches.
- Exports: MB register CSV + RA-bill supporting statement (certified entries grouped by
  work item with quantities and evidence refs).
- Label everywhere: “Measurement Book (e-MB Preview)” — not legally authoritative.

## Budgets and cost

- `cost_code` — org-level chart: code, name, parent_id?.
- `budget` — org, project, version int (new version on revision, prior immutable),
  status: draft|active|superseded, created_by; `budget_line` — budget_id, cost_code_id,
  description, quantity?, unit?, amount_paise. CSV import (columns: code, description,
  quantity, unit, amount_inr).
- `cost_entry` — append-only actuals: org, project, cost_code_id?, kind:
  labour|material|equipment|invoice|other, amount_paise, source_kind/source_id
  (approved invoice line, attendance calc, manual), entry_date, created_by. Approved
  invoices post cost entries on approval (exactly once, idempotency key per invoice).
- Committed = approved POs; invoiced = approved invoices; paid = manual `payment`
  record (org, invoice_id, amount_paise, paid_date, reference) — recorded, never executed.
- EAC (deterministic, explainable): actual-to-date + max(remaining budget on lines with
  no overrun, committed-not-invoiced) — formula string returned with every figure.
- INR formatting: `packages/domain/src/money.ts` — paise integers, `formatINR` with
  Indian digit grouping (12,34,567.89), GST fields as basis points.

## Sequencing inside Phase D

D1 materials+suppliers+receipt/OCR review+stock ledger → D2 invoices+costs+budgets →
D3 labour+equipment → D4 Measurement Book → D5 RFQ/PO + exports. Each with RLS,
capability checks (`material.*`, `procurement.*`, `budget.*`, `mb.*`, `labour.manage`,
`equipment.manage`, `invoice.review`), audit events, and tests per the Phase B pattern.
