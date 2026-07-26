import { confirmResolutionAction } from "@/app/actions/resolution";

/**
 * Shows how each spoken phrase was mapped onto the project's records, and lets the reviewer
 * correct it. A correction is learned for the project, so the same words resolve on their
 * own next time — this panel is where the system's accuracy actually comes from.
 *
 * Confident mappings are shown as settled with their method; anything unconfident is
 * presented as a shortlist to choose from, never silently applied.
 */

export type ResolutionRow = {
  id: string;
  fieldPath: string;
  entityKind: string;
  rawText: string;
  canonicalValue: string | null;
  entityId: string | null;
  method: string;
  score: string | null;
  /** The ranked shortlist the cascade was choosing between, best first. */
  candidates?: { id: string; name: string; score: number }[] | null;
  /** The LLM tier's one-line justification. Displayed for judgement, never used as a value. */
  reason?: string | null;
  confirmedAt: Date | string | null;
};

export type ResolutionOption = { id: string; name: string };

const METHOD_COPY: Record<string, string> = {
  exact: "matched the record name",
  alias: "known site term",
  fuzzy: "close match",
  semantic: "meaning match",
  llm: "model suggestion",
  manual: "confirmed by a reviewer",
  unresolved: "not matched",
};

/**
 * Anything the cascade decided by meaning or by model still wants a human nod. Showing them
 * beside the genuinely unmatched phrases is deliberate: these are the mappings most likely
 * to be subtly wrong, and they are invisible if filed under "done".
 *
 * The `alias` case is the subtle one: the dictionary can normalise a phrase to a canonical
 * term ("read as TMT steel") while linking to NO project record, because this project has no
 * matching row. That is not settled — nothing is actually linked — so it belongs in the
 * decision list, but ONLY when there is a record the reviewer could pick (an empty dropdown is
 * not a decision). For record-less kinds like trade or unit the normalisation is genuinely all
 * there is, and the row stays under "Mapped".
 */
export const needsAttention = (
  row: ResolutionRow, optionsByKind: Record<string, ResolutionOption[]>,
): boolean => {
  if (row.confirmedAt) return false;
  if (row.method === "unresolved" || row.method === "llm" || row.method === "semantic") return true;
  if (row.method === "alias" && row.entityId === null) {
    return (optionsByKind[row.entityKind]?.length ?? 0) > 0;
  }
  return false;
};

export function ResolutionPanel({
  reportId, rows, optionsByKind, canReview,
}: {
  reportId: string;
  rows: ResolutionRow[];
  /** Selectable project records per entity kind, for corrections. */
  optionsByKind: Record<string, ResolutionOption[]>;
  canReview: boolean;
}) {
  if (rows.length === 0) return null;
  const open = rows.filter((row) => needsAttention(row, optionsByKind));
  const settled = rows.filter((row) => !needsAttention(row, optionsByKind));

  return (
    <section className="page-shell surface-card admin-section" aria-labelledby="resolution-heading">
      <h2 id="resolution-heading">What the site said → project records</h2>
      <p className="page-lead">
        Site wording is mapped to this project&apos;s locations, activities and materials.
        Confirming a mapping teaches it for future reports; nothing is applied to the record
        without your confirmation.
      </p>

      {open.length > 0 && (
        <div className="resolution-group">
          <h3>Needs your decision ({open.length})</h3>
          <p className="resolution-hint">
            Nothing here has been applied to the project record yet. Confirming also teaches
            the wording, so the next report resolves it without asking.
          </p>
          <ul className="resolution-list">
            {open.map((row) => (
              <li key={row.id} className="resolution-item resolution-item--open">
                {row.canonicalValue && row.method !== "unresolved" ? (
                  <p className="resolution-proposal">
                    Read as <strong>{row.canonicalValue}</strong> — confirm or change it.
                  </p>
                ) : null}
                <div>
                  <strong>&ldquo;{row.rawText}&rdquo;</strong>
                  <small>{row.fieldPath} · {row.entityKind.replaceAll("_", " ")} · {METHOD_COPY[row.method] ?? row.method}</small>
                  {row.reason ? <small className="resolution-reason">Why: {row.reason}</small> : null}
                </div>
                {canReview ? (
                  <form action={confirmResolutionAction} className="resolution-form">
                    <input type="hidden" name="reportId" value={reportId} />
                    <input type="hidden" name="linkId" value={row.id} />
                    <input type="hidden" name="canonicalValue" value={row.canonicalValue ?? row.rawText} />
                    <label className="sr-only" htmlFor={`entity-${row.id}`}>
                      Matching record for {row.rawText}
                    </label>
                    <select id={`entity-${row.id}`} name="entityId" defaultValue={row.entityId ?? ""}>
                      <option value="">Leave unmatched</option>
                      {/* Suggested first: the ranked shortlist turns this into one click
                          instead of a hunt through every record on the project. */}
                      {(row.candidates ?? []).length > 0 ? (
                        <optgroup label="Suggested">
                          {(row.candidates ?? []).map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
                          ))}
                        </optgroup>
                      ) : null}
                      <optgroup label="All records on this project">
                        {(optionsByKind[row.entityKind] ?? []).map((option) => (
                          <option key={option.id} value={option.id}>{option.name}</option>
                        ))}
                      </optgroup>
                    </select>
                    <button type="submit" className="secondary-button">Confirm &amp; remember</button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}

      {settled.length > 0 && (
        <div className="resolution-group">
          <h3>Mapped ({settled.length})</h3>
          <div className="table-scroll" tabIndex={0} aria-label="Resolved site terms">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Said</th>
                  <th scope="col">Read as</th>
                  <th scope="col">Kind</th>
                  <th scope="col">How</th>
                </tr>
              </thead>
              <tbody>
                {settled.map((row) => (
                  <tr key={row.id}>
                    <td>&ldquo;{row.rawText}&rdquo;</td>
                    <td>{row.canonicalValue ?? "—"}</td>
                    <td>{row.entityKind.replaceAll("_", " ")}</td>
                    <td>
                      {METHOD_COPY[row.method] ?? row.method}
                      {row.confirmedAt ? " ✓" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
