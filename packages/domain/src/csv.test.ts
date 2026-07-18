import { expect, test } from "vitest";
import { csvRecords, parseCsv } from "./csv";

test("parses quoted fields, escaped quotes, CRLF", () => {
  const t = parseCsv('name,kind\r\n"Tower ""A""",building\r\n"Zone, North",zone\n');
  expect(t.header).toEqual(["name", "kind"]);
  expect(t.rows).toEqual([['Tower "A"', "building"], ["Zone, North", "zone"]]);
});

test("rejects ragged rows, empty files, missing columns", () => {
  expect(() => parseCsv("a,b\n1\n")).toThrow(/expected 2/);
  expect(() => parseCsv("\n\n")).toThrow(/empty/i);
  expect(() => csvRecords(parseCsv("name\nx"), ["name", "unit"])).toThrow(/missing required column: unit/i);
});

test("csvRecords maps by lowercased header", () => {
  const recs = csvRecords(parseCsv("Name,Unit\nCement,bag"), ["name"]);
  expect(recs).toEqual([{ name: "Cement", unit: "bag" }]);
});
