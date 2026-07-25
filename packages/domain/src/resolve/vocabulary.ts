/**
 * Seed construction vocabulary: what site teams in India actually say, mapped to canonical
 * terms. English, Hindi (Devanagari) and Hinglish transliterations sit side by side because
 * one engineer's "sariya", another's "loha" and the drawing's "TMT steel" are one material.
 *
 * This dictionary is the deterministic first pass of resolution — cheap, offline, auditable,
 * and identical every run. The LLM is only consulted for what this cannot decide, and
 * reviewer confirmations are learned back into the per-project dictionary (see
 * `term_alias`), so accuracy climbs with use instead of depending on prompt luck.
 *
 * Canonical values are lower-case English terms. They are NOT project records: mapping to a
 * project's own material/activity/location rows happens afterwards in the matcher, using
 * these canonical forms as the query.
 */

export type VocabularyKind = "trade" | "material" | "activity" | "equipment";

export type VocabularyEntry = {
  kind: VocabularyKind;
  canonical: string;
  aliases: string[];
};

export const VOCABULARY: VocabularyEntry[] = [
  // ---- trades -------------------------------------------------------------
  { kind: "trade", canonical: "mason", aliases: ["mistri", "mistry", "mestri", "mason", "masons", "raj mistri", "rajmistri", "मिस्त्री", "राज मिस्त्री"] },
  { kind: "trade", canonical: "helper", aliases: ["helper", "helpers", "beldar", "beldaar", "majdoor", "mazdoor", "mazdur", "labour", "labor", "labourer", "coolie", "मजदूर", "बेलदार", "हेल्पर"] },
  { kind: "trade", canonical: "bar bender", aliases: ["bar bender", "bar benders", "barbender", "steel fixer", "sariya wala", "sariyawala", "loha mistri", "fitter steel", "लोहा मिस्त्री", "सरिया वाला"] },
  { kind: "trade", canonical: "carpenter", aliases: ["carpenter", "carpenters", "badhai", "barhai", "badhaee", "shuttering carpenter", "बढ़ई", "कारपेंटर"] },
  { kind: "trade", canonical: "plasterer", aliases: ["plasterer", "plaster mistri", "palastar mistri", "plastering mason", "प्लास्टर मिस्त्री"] },
  { kind: "trade", canonical: "plumber", aliases: ["plumber", "plumbers", "nal mistri", "plumbing", "पलंबर", "प्लंबर"] },
  { kind: "trade", canonical: "electrician", aliases: ["electrician", "electricians", "bijli mistri", "wireman", "बिजली मिस्त्री", "इलेक्ट्रीशियन"] },
  { kind: "trade", canonical: "painter", aliases: ["painter", "painters", "rangai wala", "putai wala", "पेंटर", "रंगाई"] },
  { kind: "trade", canonical: "welder", aliases: ["welder", "welders", "jhalai wala", "jhalaiwala", "वेल्डर", "झलाई"] },
  { kind: "trade", canonical: "tile mason", aliases: ["tile mason", "tiles mistri", "tile mistri", "marble mistri", "flooring mason", "टाइल मिस्त्री"] },
  { kind: "trade", canonical: "operator", aliases: ["operator", "operators", "machine operator", "crane operator", "jcb operator", "driver", "ऑपरेटर"] },
  { kind: "trade", canonical: "supervisor", aliases: ["supervisor", "mukadam", "mukkadam", "jamadar", "foreman", "सुपरवाइजर", "मुकादम"] },
  { kind: "trade", canonical: "rigger", aliases: ["rigger", "riggers", "scaffolder", "scaffolding gang"] },
  { kind: "trade", canonical: "security", aliases: ["security", "guard", "chowkidar", "चौकीदार"] },

  // ---- materials ----------------------------------------------------------
  { kind: "material", canonical: "cement", aliases: ["cement", "simenti", "siment", "cemento", "opc", "ppc", "opc 43", "opc 53", "ppc cement", "सीमेंट"] },
  { kind: "material", canonical: "tmt steel", aliases: ["tmt", "tmt steel", "tmt bar", "sariya", "saria", "sarya", "loha", "steel", "rebar", "reinforcement steel", "सरिया", "लोहा", "स्टील"] },
  { kind: "material", canonical: "sand", aliases: ["sand", "reta", "retta", "baalu", "balu", "bajri sand", "river sand", "m sand", "रेत", "बालू"] },
  { kind: "material", canonical: "aggregate", aliases: ["aggregate", "gitti", "gitty", "kapchi", "kapchee", "metal", "crush", "crusher", "stone chips", "20mm", "40mm", "गिट्टी", "कपची"] },
  { kind: "material", canonical: "brick", aliases: ["brick", "bricks", "ita", "eent", "int", "eentein", "red brick", "ईंट", "इट"] },
  { kind: "material", canonical: "aac block", aliases: ["aac block", "aac blocks", "block", "blocks", "fly ash block", "siporex", "एएसी ब्लॉक", "ब्लॉक"] },
  { kind: "material", canonical: "ready mix concrete", aliases: ["rmc", "ready mix", "ready mix concrete", "transit mix", "concrete", "आरएमसी"] },
  { kind: "material", canonical: "binding wire", aliases: ["binding wire", "binding tar", "tar", "binding", "बाइंडिंग तार"] },
  { kind: "material", canonical: "shuttering ply", aliases: ["shuttering ply", "ply", "plywood", "shuttering plate", "centring plate", "form ply", "प्लाई", "शटरिंग प्लाई"] },
  { kind: "material", canonical: "water", aliases: ["water", "pani", "paani", "पानी"] },
  { kind: "material", canonical: "paint", aliases: ["paint", "emulsion", "primer", "putty", "distemper", "पेंट", "पुट्टी"] },
  { kind: "material", canonical: "tiles", aliases: ["tiles", "tile", "vitrified tiles", "marble", "granite", "टाइल", "मार्बल"] },
  { kind: "material", canonical: "pipe", aliases: ["pipe", "pipes", "pvc pipe", "cpvc pipe", "gi pipe", "conduit pipe", "पाइप"] },
  { kind: "material", canonical: "electrical cable", aliases: ["cable", "wire", "wiring", "electrical wire", "conduit", "केबल", "तार"] },
  { kind: "material", canonical: "admixture", aliases: ["admixture", "plasticizer", "superplasticizer", "chemical"] },
  { kind: "material", canonical: "waterproofing compound", aliases: ["waterproofing", "waterproofing chemical", "membrane", "वाटरप्रूफिंग"] },

  // ---- activities ---------------------------------------------------------
  { kind: "activity", canonical: "concreting", aliases: ["concreting", "concrete", "casting", "dhalai", "dalai", "pouring", "pour", "cast", "ढलाई", "कास्टिंग"] },
  { kind: "activity", canonical: "slab work", aliases: ["slab", "chhat", "chat", "roof slab", "chhat dhalai", "छत", "स्लैब"] },
  { kind: "activity", canonical: "column work", aliases: ["column", "columns", "pillar", "khamba", "कॉलम", "खंभा"] },
  { kind: "activity", canonical: "beam work", aliases: ["beam", "beams", "बीम"] },
  { kind: "activity", canonical: "foundation work", aliases: ["foundation", "footing", "footings", "neev", "neenv", "nींv", "raft", "pile cap", "नींव"] },
  { kind: "activity", canonical: "plastering", aliases: ["plaster", "plastering", "palastar", "palster", "punning", "प्लास्टर"] },
  { kind: "activity", canonical: "masonry", aliases: ["masonry", "brickwork", "block work", "blockwork", "chinai", "chunai", "चिनाई"] },
  { kind: "activity", canonical: "shuttering", aliases: ["shuttering", "centring", "centering", "formwork", "shuttering fixing", "शटरिंग"] },
  { kind: "activity", canonical: "deshuttering", aliases: ["deshuttering", "de shuttering", "shuttering removal", "shuttering kholna", "stripping"] },
  { kind: "activity", canonical: "reinforcement", aliases: ["reinforcement", "bar bending", "binding", "sariya bandhna", "steel fixing", "cutting bending", "सरिया बांधना"] },
  { kind: "activity", canonical: "curing", aliases: ["curing", "tarai", "paani dena", "water curing", "तराई", "क्यूरिंग"] },
  { kind: "activity", canonical: "excavation", aliases: ["excavation", "digging", "khudai", "cutting", "खुदाई"] },
  { kind: "activity", canonical: "backfilling", aliases: ["backfilling", "filling", "bharai", "back fill", "भराई"] },
  { kind: "activity", canonical: "pcc", aliases: ["pcc", "plain cement concrete", "lean concrete", "पीसीसी"] },
  { kind: "activity", canonical: "rcc", aliases: ["rcc", "reinforced concrete", "आरसीसी"] },
  { kind: "activity", canonical: "waterproofing", aliases: ["waterproofing", "water proofing", "membrane laying"] },
  { kind: "activity", canonical: "painting", aliases: ["painting", "paint work", "rangai", "putai", "पुताई", "रंगाई"] },
  { kind: "activity", canonical: "flooring", aliases: ["flooring", "tiling", "tile laying", "farsh", "फर्श", "फ्लोरिंग"] },
  { kind: "activity", canonical: "mep works", aliases: ["mep", "plumbing work", "electrical work", "hvac", "fire fighting", "conduiting"] },

  // ---- equipment ----------------------------------------------------------
  { kind: "equipment", canonical: "tower crane", aliases: ["tower crane", "crane", "क्रेन"] },
  { kind: "equipment", canonical: "excavator", aliases: ["excavator", "jcb", "poclain", "poklain", "backhoe", "जेसीबी"] },
  { kind: "equipment", canonical: "concrete mixer", aliases: ["mixer", "mixture machine", "mixer machine", "concrete mixer", "मिक्सर"] },
  { kind: "equipment", canonical: "concrete pump", aliases: ["concrete pump", "boom placer", "pump", "पंप"] },
  { kind: "equipment", canonical: "vibrator", aliases: ["vibrator", "needle vibrator", "वाइब्रेटर"] },
  { kind: "equipment", canonical: "dumper", aliases: ["dumper", "tipper", "truck", "trolley", "डंपर"] },
  { kind: "equipment", canonical: "hoist", aliases: ["hoist", "material lift", "lift", "winch"] },
  { kind: "equipment", canonical: "roller", aliases: ["roller", "compactor", "plate compactor", "रोलर"] },
  { kind: "equipment", canonical: "generator", aliases: ["generator", "dg", "dg set", "जनरेटर"] },
  { kind: "equipment", canonical: "welding machine", aliases: ["welding machine", "welding set", "वेल्डिंग मशीन"] },
];

/**
 * Words that flip the meaning of a statement. Extraction that ignores these turns
 * "cement nahi aaya" (cement did NOT arrive) into a received-materials entry — the single
 * most damaging class of error in a daily report, because it feeds stock and cost.
 */
export const NEGATION_MARKERS = [
  "not", "no", "never", "without", "nahi", "nahin", "nahí", "naahi", "na",
  "bina", "band", "khatam", "khatm", "nil", "cancelled", "cancel", "stopped",
  "unavailable", "missing", "short", "shortage", "pending", "delayed", "delay", "deri",
  "नहीं", "नही", "बिना", "बंद", "खत्म", "देरी", "रुका",
];

export const SHORTAGE_MARKERS = [
  "khatam", "khatm", "short", "shortage", "finished", "out of stock", "stock out",
  "nahi hai", "nahi bacha", "खत्म", "कम पड़ा",
];

/** Flat alias → canonical seeds for the alias dictionary, per kind. */
export function vocabularySeeds(): { kind: VocabularyKind; alias: string; canonicalValue: string }[] {
  return VOCABULARY.flatMap((entry) =>
    entry.aliases.map((alias) => ({ kind: entry.kind, alias, canonicalValue: entry.canonical })));
}

/**
 * True when the phrase contains a negation/shortage marker as a whole word.
 * Both sides are NFC-normalised: Devanagari text arriving from speech providers is not
 * consistently composed, so "नहीं" written two different ways must still match.
 */
export function hasNegation(text: string): boolean {
  const clean = (value: string) =>
    value.toLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  const haystack = ` ${clean(text)} `;
  return NEGATION_MARKERS.some((marker) => haystack.includes(` ${clean(marker)} `));
}
