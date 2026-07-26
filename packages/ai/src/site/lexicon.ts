/**
 * The DPR REPORT-LABEL projection of the site vocabulary.
 *
 * WHY THIS ADAPTER EXISTS: `@buildflow/domain/resolve/vocabulary` owns the aliases — every
 * spoken form below is also in the domain alias dictionary, and `lexicon.test.ts` fails if one
 * drifts out of it. What this file owns is a different question with a different answer: not
 * "which canonical term did the engineer mean?" but "which label goes on the DPR row?".
 *
 * The two taxonomies are deliberately not the same shape. Resolution splits concreting from
 * rcc, pcc, slab work, column work and beam work so a phrase can be matched to a specific BOQ
 * or project record; a daily report writes one coarse activity per row. Order matters here
 * too: the first matching entry wins, "rmc" is listed before bare "concrete" so a delivery is
 * not read as site batching, and bare material nouns are absent from ACTIVITIES so a steel
 * challan never becomes a work item. Folding these into the resolution taxonomy would change
 * what every extracted row says, which is a product decision, not a refactor.
 *
 * Nothing here infers a fact. A term match only tells the caller "this clause is about
 * concrete work"; the value still has to be present in the words the engineer said.
 */

import type { LexiconEntry } from "@buildflow/domain/resolve/terms";

export {
  containsAnyTerm, containsTerm, findAllEntries, findEntry, termPattern,
} from "@buildflow/domain/resolve/terms";

export type Entry = LexiconEntry;

/** Work activities. `canonical` is the activity label written onto a work item. */
export const ACTIVITIES: readonly Entry[] = [
  { canonical: "RCC", terms: ["rcc", "dhalai", "casting", "cast", "concreting", "concrete pour", "pour", "poured", "pouring", "ढलाई", "कंक्रीट"] },
  { canonical: "PCC", terms: ["pcc", "plain cement concrete", "lean concrete", "soling"] },
  // Bare material nouns ("sariya", "rebar") are deliberately absent: a steel DELIVERY is
  // not steel WORK, and treating the noun as an activity invents a work item out of a challan.
  { canonical: "Reinforcement", terms: ["reinforcement", "bar bending", "binding", "cutting bending", "steel fixing", "jaali"] },
  { canonical: "Shuttering", terms: ["shuttering", "formwork", "centering", "staging", "deshuttering", "shutter", "शटरिंग"] },
  { canonical: "Curing", terms: ["curing", "tarai", "watering", "cured", "तराई", "क्यूरिंग"] },
  { canonical: "Brickwork", terms: ["brickwork", "chinai", "masonry", "block work", "blockwork", "brick work", "चिनाई"] },
  { canonical: "Plaster", terms: ["plaster", "plastering", "putty", "punning", "प्लास्टर"] },
  { canonical: "Excavation", terms: ["excavation", "khudai", "digging", "dug", "cutting earth", "earthwork", "खुदाई"] },
  { canonical: "Backfilling", terms: ["backfilling", "back filling", "filling", "bharai"] },
  { canonical: "Waterproofing", terms: ["waterproofing", "water proofing", "membrane"] },
  { canonical: "Tiling", terms: ["tiling", "tile laying", "tiles laid", "flooring"] },
  { canonical: "Painting", terms: ["painting", "primer coat", "paint coat"] },
  { canonical: "Slab", terms: ["slab", "chhat", "chhad", "roof slab", "deck", "छत", "स्लैब"] },
  { canonical: "Plumbing", terms: ["plumbing", "sanitary", "pipe laying"] },
  { canonical: "Electrical", terms: ["conduiting", "conduit", "wiring", "electrical"] },
];

/** Labour trades. `canonical` is the trade written onto a labour row. */
export const TRADES: readonly Entry[] = [
  { canonical: "mason", terms: ["mason", "masons", "mistri", "mistry", "mestri", "raj mistri", "मिस्त्री"] },
  { canonical: "helper", terms: ["helper", "helpers", "beldar", "beldars", "khalasi", "बेलदार"] },
  { canonical: "labourer", terms: ["labour", "labourer", "labourers", "laborer", "laborers", "mazdoor", "majdoor", "mazdoors", "workers", "worker", "मजदूर", "मज़दूर"] },
  { canonical: "carpenter", terms: ["carpenter", "carpenters", "badhai", "shuttering carpenter"] },
  { canonical: "bar bender", terms: ["bar bender", "bar benders", "barbender", "steel fixer", "loha mistri"] },
  { canonical: "plumber", terms: ["plumber", "plumbers"] },
  { canonical: "electrician", terms: ["electrician", "electricians", "bijli mistri"] },
  { canonical: "painter", terms: ["painter", "painters", "rangai mistri"] },
  { canonical: "welder", terms: ["welder", "welders"] },
  { canonical: "operator", terms: ["operator", "operators"] },
  { canonical: "supervisor", terms: ["supervisor", "supervisors", "site engineer"] },
];

/** Materials. `canonical` is the material name written onto a material row. */
export const MATERIALS: readonly Entry[] = [
  { canonical: "cement", terms: ["cement", "siment", "opc", "ppc", "सीमेंट"] },
  { canonical: "steel", terms: ["steel", "sariya", "saria", "tmt", "rebar", "loha", "सरिया", "लोहा"] },
  { canonical: "sand", terms: ["sand", "reta", "baalu", "balu", "badarpur", "रेत", "बालू"] },
  { canonical: "aggregate", terms: ["aggregate", "gitti", "kapchi", "bajri", "metal", "stone chips", "गिट्टी", "बजरी"] },
  { canonical: "bricks", terms: ["brick", "bricks", "ita", "eent", "int", "ईंट", "ईंटें"] },
  { canonical: "blocks", terms: ["aac block", "aac blocks", "block", "blocks"] },
  { canonical: "ready-mix concrete", terms: ["rmc", "ready mix", "ready-mix", "transit mixer concrete"] },
  // Listed after RMC so "rmc" resolves to the ready-mix entry first.
  { canonical: "concrete", terms: ["concrete", "कंक्रीट"] },
  { canonical: "water", terms: ["water", "pani", "पानी"] },
  { canonical: "admixture", terms: ["admixture", "plasticiser", "plasticizer"] },
  { canonical: "shuttering ply", terms: ["shuttering ply", "ply", "plywood", "shuttering plate"] },
  { canonical: "binding wire", terms: ["binding wire", "tar", "bandhne ka tar"] },
  { canonical: "tiles", terms: ["tile", "tiles", "vitrified tiles"] },
  { canonical: "paint", terms: ["paint", "emulsion", "primer"] },
  { canonical: "pipes", terms: ["pipe", "pipes", "cpvc", "upvc"] },
];

/** Plant and equipment. */
export const EQUIPMENT: readonly Entry[] = [
  { canonical: "concrete mixer", terms: ["mixer", "mixer machine", "concrete mixer", "मिक्सर"] },
  { canonical: "transit mixer", terms: ["transit mixer", "tm", "rmc truck"] },
  { canonical: "concrete pump", terms: ["concrete pump", "boom placer", "pump"] },
  { canonical: "needle vibrator", terms: ["vibrator", "needle vibrator", "vibrating needle"] },
  { canonical: "excavator", terms: ["jcb", "excavator", "poclain", "backhoe", "जेसीबी"] },
  { canonical: "crane", terms: ["crane", "tower crane", "hydra"] },
  { canonical: "hoist", terms: ["hoist", "lift machine", "material hoist"] },
  { canonical: "dumper", terms: ["dumper", "tipper", "tractor trolley"] },
  { canonical: "roller", terms: ["roller", "compactor", "plate compactor"] },
  { canonical: "bar bending machine", terms: ["bar bending machine", "cutting machine", "bending machine"] },
  { canonical: "generator", terms: ["generator", "dg set", "genset"] },
];

/**
 * Status and signal keywords. These stay flat lists rather than lexicon entries because they
 * have no canonical label to write anywhere — they answer a yes/no question about a clause.
 */

/** Material/equipment status keywords. Order matters: the first matching group wins. */
export const RECEIVED_TERMS: readonly string[] = [
  "received", "delivered", "unloaded", "arrived", "aaya", "aayi", "aaye", "aa gaya",
  "pahuncha", "pahucha", "mila", "mil gaya", "aa gayi", "stock aaya",
  "आया", "आयी", "आए", "आ गया", "मिला", "पहुंचा",
];
export const USED_TERMS: readonly string[] = [
  "used", "use", "use hua", "consumed", "placed", "poured", "laga", "lagaya", "lagayi",
  "lag gaya", "khapat", "consumption", "lagaye", "istemal", "istemaal",
  "लगा", "लगाया", "इस्तेमाल",
];
export const DELAYED_TERMS: readonly string[] = [
  "delayed", "delay", "late", "pending", "der", "deri", "short", "shortage", "khatam",
  "finished stock", "out of stock", "stock over", "देरी", "देर", "खत्म",
];
export const REQUIRED_TERMS: readonly string[] = [
  "required", "require", "need", "needed", "chahiye", "mangwana", "mangana", "order karna",
  "arrange karna", "indent", "चाहिए", "मंगवाना",
];

/**
 * Negation markers. Hindi negation is the single highest-risk extraction failure.
 *
 * Narrower than the domain's `NEGATION_MARKERS` on purpose. That list answers "is this clause
 * negative in any way" and so includes shortage and delay words; this one answers "is the
 * statement grammatically negated", which is what decides whether "cement aaya" becomes
 * `received` or `delayed`. Sharing one list would restatus every delayed material as negated.
 */
export const NEGATION_TERMS: readonly string[] = [
  "nahi", "nahin", "nai", "नहीं", "नही", "not", "no", "never", "none", "nothing", "without",
  "didn't", "did not", "hasn't", "has not", "haven't", "have not", "isn't", "wasn't",
  "couldn't", "could not", "unable", "failed to", "band", "बंद", "cancel", "cancelled",
  "koi nahi", "kuch nahi", "kuchh nahi", "कुछ नहीं", "कोई नहीं",
];

/** Words that mean work stopped or is blocked. */
export const BLOCKER_TERMS: readonly string[] = [
  "delayed", "delay", "blocked", "blocker", "stopped", "stoppage", "ruka", "ruk gaya",
  "band", "shortage", "short", "breakdown", "kharab", "not working", "no power", "bijli nahi",
  "pani nahi", "waiting", "hold", "on hold", "pending approval", "idle", "khatam",
  "flooded", "waterlogged", "water logging", "बंद", "रुका", "देरी", "खराब", "बिजली नहीं",
  "पानी नहीं",
];

/**
 * Things a site EXPECTS to have. Negated next to one of these ("koi delivery nahi hui",
 * "power was not available"), the clause is describing a shortfall — that is a blocker,
 * even when no keyword from BLOCKER_TERMS is present. Deliberately narrow: negation alone
 * is not a blocker, or "one worker without a helmet" would become a work stoppage.
 */
export const EXPECTATION_TERMS: readonly string[] = [
  "delivery", "supply", "stock", "material", "labour", "mazdoor", "majdoor", "power",
  "bijli", "electricity", "pani", "water", "machine", "approval", "drawing", "payment",
  "permission", "डिलीवरी", "बिजली", "पानी", "सामान",
];

/** Safety and quality signals. */
export const SAFETY_QUALITY_TERMS: readonly string[] = [
  "safety", "helmet", "ppe", "harness", "accident", "injury", "injured", "near miss",
  "toolbox talk", "safety briefing", "barricading", "guard rail", "quality", "cube test",
  "slump test", "slump", "inspection", "snag", "defect", "honeycomb", "crack", "rework",
  "test report", "chetavni", "सुरक्षा", "हेलमेट", "दुर्घटना", "जांच",
];

/** Weather and site condition signals. */
export const WEATHER_TERMS: readonly string[] = [
  "rain", "raining", "rainfall", "barish", "baarish", "storm", "andhi", "aandhi", "hot",
  "heat", "humid", "humidity", "fog", "dhund", "dust", "dhool", "wind", "cloudy", "clear",
  "waterlogged", "water logging", "slush", "muddy", "keechad",
  "बारिश", "गर्मी", "धूप", "कोहरा", "धूल", "आंधी",
];

/** Future markers that make an ambiguous "kal" mean tomorrow rather than yesterday. */
export const FUTURE_TERMS: readonly string[] = [
  "will", "plan", "planning", "planned", "tomorrow", "next day", "agle din", "karenge",
  "karna hai", "hoga", "hogi", "honge", "shuru karenge", "target", "expected",
  "करेंगे", "होगा", "शुरू", "प्लान",
];

/** Explicit "tomorrow" markers. `kal` is intentionally NOT here — see FUTURE_TERMS. */
export const TOMORROW_TERMS: readonly string[] = [
  "tomorrow", "next day", "agle din", "kal ka plan", "kal se",
];
