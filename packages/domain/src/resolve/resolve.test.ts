import { expect, test, describe } from "vitest";
import { parseSpokenQuantity } from "./numbers";
import { resolveUnit, unitsComparable } from "./units";
import { hasNegation } from "./vocabulary";
import { bestMatch, similarity } from "./match";
import { readQuantity, resolveAlias, resolveTerm } from "./index";

describe("spoken quantities", () => {
  test("digits, English words and Hinglish words all read as the same value", () => {
    expect(parseSpokenQuantity("18 sqm")).toBe("18");
    expect(parseSpokenQuantity("eighteen square meter")).toBe("18");
    expect(parseSpokenQuantity("atharah")).toBe("18");
    expect(parseSpokenQuantity("अठारह")).toBe("18");
  });

  test("Indian fractional speech", () => {
    expect(parseSpokenQuantity("dhai cum concrete")).toBe("2.5");     // 2.5
    expect(parseSpokenQuantity("dedh bag")).toBe("1.5");              // 1.5
    expect(parseSpokenQuantity("sava do")).toBe("2.25");              // 2 + 1/4
    expect(parseSpokenQuantity("sadhe teen")).toBe("3.5");            // 3 + 1/2
    expect(parseSpokenQuantity("paune char")).toBe("3.75");           // 4 - 1/4
    expect(parseSpokenQuantity("aadha")).toBe("0.5");
  });

  test("decimal dictation and compound numbers", () => {
    expect(parseSpokenQuantity("do point paanch")).toBe("2.5");
    expect(parseSpokenQuantity("two point four five")).toBe("2.45");
    expect(parseSpokenQuantity("twenty five")).toBe("25");
    expect(parseSpokenQuantity("do sau")).toBe("200");
    expect(parseSpokenQuantity("dhai hazar")).toBe("2500");
    expect(parseSpokenQuantity("ek lakh")).toBe("100000");
  });

  test("no number means null — never a guess", () => {
    expect(parseSpokenQuantity("kaafi zyada concrete")).toBeNull();
    expect(parseSpokenQuantity("")).toBeNull();
  });
});

describe("units", () => {
  test("every spoken form of cubic metre canonicalises to m3", () => {
    for (const form of ["cum", "cubic meter", "CBM", "ghan meter", "m3", "घन मीटर"]) {
      expect(resolveUnit(form)?.code).toBe("m3");
    }
  });

  test("Indian trading units are known, with brass as 100 cft", () => {
    expect(resolveUnit("brass")?.toBase).toBe("2.8316846592");
    expect(resolveUnit("cft")?.code).toBe("ft3");
    expect(resolveUnit("bori")?.code).toBe("bag");
    expect(resolveUnit("ton")?.code).toBe("mt");
    expect(resolveUnit("qtl")?.code).toBe("quintal");
  });

  test("comparability follows dimension, and unknown units stay unknown", () => {
    expect(unitsComparable("cum", "cft")).toBe(true);
    expect(unitsComparable("cum", "kg")).toBe(false);
    expect(resolveUnit("thingummy")).toBeNull();
  });
});

describe("negation", () => {
  test("shortage and absence are detected in both languages", () => {
    expect(hasNegation("cement nahi aaya")).toBe(true);
    expect(hasNegation("सीमेंट नहीं आया")).toBe(true);
    expect(hasNegation("cement khatam ho gaya")).toBe(true);
    expect(hasNegation("no work at basement today")).toBe(true);
    expect(hasNegation("cement delivery delayed")).toBe(true);
  });

  test("a plain positive statement is not flagged", () => {
    expect(hasNegation("cement received twenty bags")).toBe(false);
  });
});

describe("matching against project records", () => {
  const locations = [
    { id: "loc-1", name: "Tower A / Level 3" },
    { id: "loc-2", name: "Tower B / Level 3" },
    { id: "loc-3", name: "Basement parking" },
  ];

  test("a full reference inside a sentence resolves", () => {
    const { match } = bestMatch("finished slab at Tower A / Level 3 today", locations);
    expect(match?.candidate.id).toBe("loc-1");
  });

  test("two equally plausible records are left for a human, not guessed", () => {
    const { match, ambiguous } = bestMatch("level 3", locations);
    expect(match).toBeNull();
    expect(ambiguous.length).toBeGreaterThanOrEqual(2);
  });

  test("similarity is order-insensitive and typo tolerant", () => {
    expect(similarity("basement parking", "Basement parking")).toBe(1);
    expect(similarity("parking basement", "Basement parking")).toBeGreaterThan(0.8);
    expect(similarity("basment parkng", "Basement parking")).toBeGreaterThan(0.55);
  });
});

describe("the resolution cascade", () => {
  const materials = [
    { id: "mat-steel", name: "TMT steel Fe 500D" },
    { id: "mat-cement", name: "Cement OPC 43" },
  ];
  const trades = [{ id: "trade-mason", name: "Mason" }, { id: "trade-helper", name: "Helper" }];

  test("Hinglish material words resolve to the project's catalogue row", () => {
    const result = resolveTerm({ phrase: "sariya khatam ho gaya", kind: "material", records: materials });
    expect(result.canonicalValue).toBe("tmt steel");
    expect(result.entityId).toBe("mat-steel");
    expect(result.method).toBe("alias");
    expect(result.confident).toBe(true);
  });

  test("Hindi script resolves the same way", () => {
    const result = resolveTerm({ phrase: "सीमेंट आया", kind: "material", records: materials });
    expect(result.entityId).toBe("mat-cement");
  });

  test("trade slang resolves to the trade record", () => {
    expect(resolveTerm({ phrase: "chhe mistri the", kind: "trade", records: trades }).entityId)
      .toBe("trade-mason");
    expect(resolveTerm({ phrase: "beldar 4", kind: "trade", records: trades }).entityId)
      .toBe("trade-helper");
  });

  test("an unknown term resolves to nothing and invents nothing", () => {
    const result = resolveTerm({ phrase: "zorbium panels", kind: "material", records: materials });
    expect(result.method).toBe("unresolved");
    expect(result.entityId).toBeNull();
    expect(result.canonicalValue).toBeNull();
    expect(result.confident).toBe(false);
    expect(result.rawText).toBe("zorbium panels"); // raw words preserved for the reviewer
  });

  test("a learned project alias overrides the seeded vocabulary", () => {
    const learned = [{
      kind: "material", alias: "steel", canonicalValue: "Cement OPC 43",
      canonicalId: "mat-cement", projectScoped: true,
    }];
    const result = resolveTerm({ phrase: "steel", kind: "material", records: materials, learned });
    expect(result.entityId).toBe("mat-cement"); // project truth beats the generic seed
    expect(result.method).toBe("alias");
  });

  test("longer aliases win over their own substrings", () => {
    expect(resolveAlias("white cement bag", "material")?.canonicalValue).toBe("cement");
  });
});

describe("quantity + unit reading", () => {
  test("value and unit are normalised together", () => {
    const reading = readQuantity("dhai cum concrete poured");
    expect(reading.value).toBe("2.5");
    expect(reading.unit?.code).toBe("m3");
  });

  test("a number with an unrecognised unit is flagged, not defaulted", () => {
    const reading = readQuantity("18 whatsits");
    expect(reading.value).toBe("18");
    expect(reading.unit).toBeNull();
    expect(reading.unitUnknown).toBe(true);
  });

  test("bags stay a count, tons become mass", () => {
    expect(readQuantity("bees bori cement").unit?.code).toBe("bag");
    expect(readQuantity("do ton sariya").unit?.code).toBe("mt");
  });
});
