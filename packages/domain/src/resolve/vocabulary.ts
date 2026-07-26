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
  { kind: "trade", canonical: "helper", aliases: ["helper", "helpers", "beldar", "beldaar", "beldars", "khalasi", "majdoor", "mazdoor", "mazdoors", "mazdur", "labour", "labor", "labourer", "labourers", "laborer", "laborers", "worker", "workers", "coolie", "मजदूर", "मज़दूर", "बेलदार", "हेल्पर"] },
  { kind: "trade", canonical: "bar bender", aliases: ["bar bender", "bar benders", "barbender", "steel fixer", "sariya wala", "sariyawala", "loha mistri", "fitter steel", "लोहा मिस्त्री", "सरिया वाला"] },
  { kind: "trade", canonical: "carpenter", aliases: ["carpenter", "carpenters", "badhai", "barhai", "badhaee", "shuttering carpenter", "बढ़ई", "कारपेंटर"] },
  { kind: "trade", canonical: "plasterer", aliases: ["plasterer", "plaster mistri", "palastar mistri", "plastering mason", "प्लास्टर मिस्त्री"] },
  { kind: "trade", canonical: "plumber", aliases: ["plumber", "plumbers", "nal mistri", "plumbing", "पलंबर", "प्लंबर"] },
  { kind: "trade", canonical: "electrician", aliases: ["electrician", "electricians", "bijli mistri", "wireman", "बिजली मिस्त्री", "इलेक्ट्रीशियन"] },
  { kind: "trade", canonical: "painter", aliases: ["painter", "painters", "rangai wala", "rangai mistri", "putai wala", "पेंटर", "रंगाई"] },
  { kind: "trade", canonical: "welder", aliases: ["welder", "welders", "jhalai wala", "jhalaiwala", "वेल्डर", "झलाई"] },
  { kind: "trade", canonical: "tile mason", aliases: ["tile mason", "tiles mistri", "tile mistri", "marble mistri", "flooring mason", "टाइल मिस्त्री"] },
  { kind: "trade", canonical: "operator", aliases: ["operator", "operators", "machine operator", "crane operator", "jcb operator", "driver", "ऑपरेटर"] },
  { kind: "trade", canonical: "supervisor", aliases: ["supervisor", "supervisors", "site engineer", "mukadam", "mukkadam", "jamadar", "foreman", "सुपरवाइजर", "मुकादम"] },
  { kind: "trade", canonical: "rigger", aliases: ["rigger", "riggers", "scaffolder", "scaffolding gang"] },
  { kind: "trade", canonical: "security", aliases: ["security", "guard", "chowkidar", "चौकीदार"] },

  // ---- materials ----------------------------------------------------------
  { kind: "material", canonical: "cement", aliases: ["cement", "simenti", "siment", "cemento", "opc", "ppc", "opc 43", "opc 53", "ppc cement", "सीमेंट"] },
  { kind: "material", canonical: "tmt steel", aliases: ["tmt", "tmt steel", "tmt bar", "sariya", "saria", "sarya", "loha", "steel", "rebar", "reinforcement steel", "सरिया", "लोहा", "स्टील"] },
  { kind: "material", canonical: "sand", aliases: ["sand", "reta", "retta", "baalu", "balu", "badarpur", "bajri sand", "river sand", "m sand", "रेत", "बालू"] },
  { kind: "material", canonical: "aggregate", aliases: ["aggregate", "gitti", "gitty", "kapchi", "kapchee", "bajri", "metal", "crush", "crusher", "stone chips", "20mm", "40mm", "गिट्टी", "कपची", "बजरी"] },
  { kind: "material", canonical: "brick", aliases: ["brick", "bricks", "ita", "eent", "int", "eentein", "red brick", "ईंट", "ईंटें", "इट"] },
  { kind: "material", canonical: "aac block", aliases: ["aac block", "aac blocks", "block", "blocks", "fly ash block", "siporex", "एएसी ब्लॉक", "ब्लॉक"] },
  { kind: "material", canonical: "ready mix concrete", aliases: ["rmc", "ready mix", "ready mix concrete", "transit mix", "transit mixer concrete", "concrete", "आरएमसी", "कंक्रीट"] },
  { kind: "material", canonical: "binding wire", aliases: ["binding wire", "binding tar", "bandhne ka tar", "tar", "binding", "बाइंडिंग तार"] },
  { kind: "material", canonical: "shuttering ply", aliases: ["shuttering ply", "ply", "plywood", "shuttering plate", "centring plate", "form ply", "प्लाई", "शटरिंग प्लाई"] },
  { kind: "material", canonical: "water", aliases: ["water", "pani", "paani", "पानी"] },
  { kind: "material", canonical: "paint", aliases: ["paint", "emulsion", "primer", "putty", "distemper", "पेंट", "पुट्टी"] },
  { kind: "material", canonical: "tiles", aliases: ["tiles", "tile", "vitrified tiles", "marble", "granite", "टाइल", "मार्बल"] },
  { kind: "material", canonical: "pipe", aliases: ["pipe", "pipes", "pvc pipe", "cpvc pipe", "cpvc", "upvc", "gi pipe", "conduit pipe", "पाइप"] },
  { kind: "material", canonical: "electrical cable", aliases: ["cable", "wire", "wiring", "electrical wire", "conduit", "केबल", "तार"] },
  { kind: "material", canonical: "admixture", aliases: ["admixture", "plasticizer", "plasticiser", "superplasticizer", "chemical"] },
  { kind: "material", canonical: "waterproofing compound", aliases: ["waterproofing", "waterproofing chemical", "membrane", "वाटरप्रूफिंग"] },

  // ---- activities ---------------------------------------------------------
  { kind: "activity", canonical: "concreting", aliases: ["concreting", "concrete", "concrete pour", "casting", "dhalai", "dalai", "pouring", "poured", "pour", "cast", "ढलाई", "कास्टिंग", "कंक्रीट"] },
  { kind: "activity", canonical: "slab work", aliases: ["slab", "chhat", "chhad", "chat", "roof slab", "chhat dhalai", "deck", "छत", "स्लैब"] },
  { kind: "activity", canonical: "column work", aliases: ["column", "columns", "pillar", "khamba", "कॉलम", "खंभा"] },
  { kind: "activity", canonical: "beam work", aliases: ["beam", "beams", "बीम"] },
  { kind: "activity", canonical: "foundation work", aliases: ["foundation", "footing", "footings", "neev", "neenv", "nींv", "raft", "pile cap", "नींव"] },
  { kind: "activity", canonical: "plastering", aliases: ["plaster", "plastering", "palastar", "palster", "punning", "putty", "प्लास्टर"] },
  { kind: "activity", canonical: "masonry", aliases: ["masonry", "brickwork", "brick work", "block work", "blockwork", "chinai", "chunai", "चिनाई"] },
  { kind: "activity", canonical: "shuttering", aliases: ["shuttering", "shutter", "centring", "centering", "staging", "formwork", "shuttering fixing", "शटरिंग"] },
  { kind: "activity", canonical: "deshuttering", aliases: ["deshuttering", "de shuttering", "shuttering removal", "shuttering kholna", "stripping"] },
  { kind: "activity", canonical: "reinforcement", aliases: ["reinforcement", "bar bending", "binding", "jaali", "sariya bandhna", "steel fixing", "cutting bending", "सरिया बांधना"] },
  { kind: "activity", canonical: "curing", aliases: ["curing", "cured", "tarai", "watering", "paani dena", "water curing", "तराई", "क्यूरिंग"] },
  { kind: "activity", canonical: "excavation", aliases: ["excavation", "digging", "dug", "khudai", "earthwork", "cutting earth", "cutting", "खुदाई"] },
  { kind: "activity", canonical: "backfilling", aliases: ["backfilling", "back filling", "filling", "bharai", "back fill", "भराई"] },
  { kind: "activity", canonical: "pcc", aliases: ["pcc", "plain cement concrete", "lean concrete", "soling", "पीसीसी"] },
  { kind: "activity", canonical: "rcc", aliases: ["rcc", "reinforced concrete", "आरसीसी"] },
  { kind: "activity", canonical: "waterproofing", aliases: ["waterproofing", "water proofing", "membrane", "membrane laying"] },
  { kind: "activity", canonical: "painting", aliases: ["painting", "paint work", "primer coat", "paint coat", "rangai", "putai", "पुताई", "रंगाई"] },
  { kind: "activity", canonical: "flooring", aliases: ["flooring", "tiling", "tile laying", "tiles laid", "farsh", "फर्श", "फ्लोरिंग"] },
  { kind: "activity", canonical: "mep works", aliases: ["mep", "plumbing", "plumbing work", "sanitary", "pipe laying", "electrical", "electrical work", "wiring", "hvac", "fire fighting", "conduiting", "conduit"] },

  // ---- equipment ----------------------------------------------------------
  { kind: "equipment", canonical: "tower crane", aliases: ["tower crane", "crane", "hydra", "क्रेन"] },
  { kind: "equipment", canonical: "excavator", aliases: ["excavator", "jcb", "poclain", "poklain", "backhoe", "जेसीबी"] },
  { kind: "equipment", canonical: "concrete mixer", aliases: ["mixer", "mixture machine", "mixer machine", "concrete mixer", "मिक्सर"] },
  // Kept apart from the site mixer: a transit mixer arriving is an RMC DELIVERY, while the
  // site mixer running is site batching. Merging them would mis-state where concrete came from.
  // "tm" is the near-universal site shorthand for a transit mixer. Safe as a two-letter
  // alias because matching is whole-word and kind-scoped: it only fires on the standalone
  // token "tm" when equipment is being resolved, and equipment links to no billed record.
  { kind: "equipment", canonical: "transit mixer", aliases: ["transit mixer", "rmc truck", "tm"] },
  { kind: "equipment", canonical: "concrete pump", aliases: ["concrete pump", "boom placer", "pump", "पंप"] },
  { kind: "equipment", canonical: "vibrator", aliases: ["vibrator", "needle vibrator", "vibrating needle", "वाइब्रेटर"] },
  { kind: "equipment", canonical: "dumper", aliases: ["dumper", "tipper", "truck", "trolley", "tractor trolley", "डंपर"] },
  { kind: "equipment", canonical: "hoist", aliases: ["hoist", "material hoist", "material lift", "lift machine", "lift", "winch"] },
  { kind: "equipment", canonical: "roller", aliases: ["roller", "compactor", "plate compactor", "रोलर"] },
  { kind: "equipment", canonical: "bar bending machine", aliases: ["bar bending machine", "bending machine", "cutting machine"] },
  { kind: "equipment", canonical: "generator", aliases: ["generator", "dg", "dg set", "genset", "जनरेटर"] },
  { kind: "equipment", canonical: "welding machine", aliases: ["welding machine", "welding set", "वेल्डिंग मशीन"] },
];

/**
 * Words that flip the meaning of a statement. Extraction that ignores these turns
 * "cement nahi aaya" (cement did NOT arrive) into a received-materials entry — the single
 * most damaging class of error in a daily report, because it feeds stock and cost.
 */
export const NEGATION_MARKERS = [
  "not", "no", "never", "none", "nothing", "without", "nahi", "nahin", "nahí", "nai",
  "naahi", "na", "bina", "band", "khatam", "khatm", "nil", "cancelled", "cancel", "stopped",
  "unavailable", "unable", "missing", "short", "shortage", "pending", "delayed", "delay",
  "deri",
  // Contracted English negation. `hasNegation` folds punctuation to spaces before matching,
  // so "didn't" and "didn t" are the same marker and both are caught.
  "didn't", "did not", "hasn't", "has not", "haven't", "have not", "isn't", "wasn't",
  "couldn't", "could not", "failed to",
  "नहीं", "नही", "बिना", "बंद", "खत्म", "देरी", "रुका",
];

export const SHORTAGE_MARKERS = [
  "khatam", "khatm", "short", "shortage", "finished", "finished stock", "out of stock",
  "stock out", "stock over", "nahi hai", "nahi bacha", "खत्म", "कम पड़ा",
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
