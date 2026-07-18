// Minimal RFC 4180 CSV parsing for import templates (locations, activities, budget lines,
// schedules). Handles quoted fields, escaped quotes, CRLF; rejects ragged rows.

export type CsvTable = { header: string[]; rows: string[][] };

export function parseCsv(text: string): CsvTable {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\n") {
      pushRow();
    } else if (ch === "\r") {
      if (text[i + 1] === "\n") { pushRow(); i += 1; } else pushRow();
    } else {
      field += ch;
    }
  }
  if (inQuotes) throw new Error("Unterminated quoted field");
  if (field.length > 0 || row.length > 0) pushRow();

  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (nonEmpty.length === 0) throw new Error("CSV is empty");
  const [header, ...body] = nonEmpty;
  const trimmedHeader = header.map((h) => h.trim().toLowerCase());
  for (const [index, r] of body.entries()) {
    if (r.length !== header.length) {
      throw new Error(`Row ${index + 2} has ${r.length} fields, expected ${header.length}`);
    }
  }
  return { header: trimmedHeader, rows: body.map((r) => r.map((c) => c.trim())) };
}

/** Maps rows to objects keyed by header; requires the listed columns to exist. */
export function csvRecords(
  table: CsvTable, requiredColumns: string[],
): Record<string, string>[] {
  for (const col of requiredColumns) {
    if (!table.header.includes(col)) throw new Error(`Missing required column: ${col}`);
  }
  return table.rows.map((row) =>
    Object.fromEntries(table.header.map((h, i) => [h, row[i] ?? ""])));
}
