"use client";

import { useState } from "react";
import { fieldDecisionAction } from "@/app/actions/review";
import type { FieldRow } from "../view-model";

// Per-section editable fields for the "edit" decision. Values are serialized to the item
// patch the domain layer validates (packages/domain/src/dpr/edit.ts).
const EDIT_FIELDS: Record<string, { key: string; label: string; type?: "number" | "select"; options?: string[]; nested?: "quantity" }[]> = {
  work_items: [
    { key: "description", label: "Description" },
    { key: "value", label: "Quantity", nested: "quantity" },
    { key: "unit", label: "Unit", nested: "quantity" },
    { key: "location", label: "Location" },
  ],
  labour: [
    { key: "trade", label: "Trade" },
    { key: "count", label: "Count", type: "number" },
  ],
  materials: [
    { key: "name", label: "Material" },
    { key: "status", label: "Status", type: "select", options: ["received", "used", "delayed", "required"] },
  ],
  equipment: [
    { key: "name", label: "Equipment" },
    { key: "status", label: "Status", type: "select", options: ["used", "unavailable"] },
  ],
  safety_quality: [{ key: "note", label: "Observation" }],
  blockers: [
    { key: "description", label: "Blocker" },
    { key: "cause", label: "Cause" },
    { key: "owner", label: "Owner" },
    { key: "expected_resolution", label: "Expected resolution" },
  ],
  tomorrow_plan: [{ key: "item", label: "Planned item" }],
  weather_site_condition: [{ key: "value", label: "Site condition" }],
};

const sectionOf = (path: string): string =>
  path.startsWith("weather_site_condition") ? "weather_site_condition" : path.split("[")[0];

export function FieldDecisionPanel({ reportId, row }: { reportId: string; row: FieldRow }) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const section = sectionOf(row.path);
  const fields = EDIT_FIELDS[section] ?? [];

  const buildPatch = (): string => {
    const patch: Record<string, unknown> = {};
    for (const field of fields) {
      const raw = values[field.key];
      if (raw === undefined || raw === "") continue;
      const parsed = field.type === "number" ? Number(raw) : raw;
      if (field.nested === "quantity") {
        const quantity = (patch.quantity ?? {}) as Record<string, unknown>;
        quantity[field.key] = parsed;
        patch.quantity = quantity;
      } else {
        patch[field.key] = parsed;
      }
    }
    // quantity patches must carry both value and unit for schema validity
    if (patch.quantity) {
      const q = patch.quantity as { value?: unknown; unit?: unknown };
      patch.quantity = { value: q.value ?? null, unit: q.unit ?? null };
    }
    return JSON.stringify(patch);
  };

  return (
    <div className="field-decisions" aria-label="Decisions for the selected field">
      <div className="field-decisions__row">
        {(["confirm", "mark_unknown", "remove"] as const).map((decision) => (
          <form key={decision} action={fieldDecisionAction}>
            <input type="hidden" name="reportId" value={reportId} />
            <input type="hidden" name="path" value={row.path} />
            <input type="hidden" name="decision" value={decision} />
            <button type="submit" className="secondary-button">
              {decision === "confirm" ? "Confirm" : decision === "mark_unknown" ? "Mark unknown" : "Remove"}
            </button>
          </form>
        ))}
        <button type="button" className="secondary-button" onClick={() => setEditing((e) => !e)}>
          {editing ? "Cancel edit" : "Edit"}
        </button>
      </div>

      {editing && (
        <form action={fieldDecisionAction} className="admin-form field-decisions__edit">
          <input type="hidden" name="reportId" value={reportId} />
          <input type="hidden" name="path" value={row.path} />
          <input type="hidden" name="decision" value="edit" />
          <input type="hidden" name="newValue" value={buildPatch()} />
          {fields.map((field) => (
            <label key={field.key}>{field.label}
              {field.type === "select" ? (
                <select
                  value={values[field.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                >
                  <option value="">(keep current)</option>
                  {field.options!.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  type={field.type === "number" ? "number" : "text"}
                  value={values[field.key] ?? ""}
                  placeholder="(keep current)"
                  onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                />
              )}
            </label>
          ))}
          <button type="submit" className="primary-button">Save correction</button>
          <small>Corrections create a new revision; the original account is preserved.</small>
        </form>
      )}
    </div>
  );
}
