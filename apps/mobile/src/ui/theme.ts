// Field-first mobile design tokens. The palette mirrors the web product while
// keeping contrast, sunlight readability and Android rendering in mind.

export const colors = {
  brand950: "#071D2D",
  brand900: "#0B2233",
  brand800: "#153B55",
  brand700: "#1F4E6D",
  brand100: "#DCEAF2",
  brand50: "#EFF6F9",
  accent700: "#943A0C",
  accent600: "#B64C15", // reserved for the primary capture action
  accent100: "#FCE8D5",
  success700: "#16794B",
  success100: "#DDF3E8",
  warning700: "#805A00",
  warning100: "#FFF2C6",
  danger700: "#B42318",
  danger100: "#FEE4E2",
  neutral950: "#111827",
  neutral800: "#1F2937",
  neutral700: "#374151",
  neutral600: "#4B5563",
  neutral500: "#64717B",
  neutral300: "#D1D5DB",
  neutral200: "#E5E7EB",
  neutral100: "#F1F3F4",
  neutral50: "#F7F8F6",
  paper: "#F5F1E9",
  surface: "#FFFFFF",
} as const;

/** Base spacing unit is 4px (design.md §12). */
export const spacing = (steps: number): number => steps * 4;

export const radius = {
  card: 20,
  control: 14,
  compact: 10,
  pill: 999,
} as const;

/** Minimum primary touch target (dp). */
export const TOUCH_TARGET = 52;

export const layout = {
  horizontal: spacing(5),
  sectionGap: spacing(6),
  maxContentWidth: 720,
} as const;

/**
 * Elevation system (rich-surface refresh, kept blur-free on purpose: runtime
 * backdrop blur is too expensive for low-end field Androids — depth comes from
 * brand-tinted shadows and translucent layering instead).
 */
export const elevation = {
  subtle: {
    shadowColor: colors.brand950,
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  raised: {
    shadowColor: colors.brand950,
    shadowOpacity: 0.09,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  floating: {
    shadowColor: colors.brand950,
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
} as const;

/** Translucent layering over the navy field-hero surfaces. */
export const glass = {
  onDark: "rgba(255,255,255,0.10)",
  onDarkStrong: "rgba(255,255,255,0.16)",
  border: "rgba(11,34,51,0.11)",
  borderOnDark: "rgba(255,255,255,0.18)",
} as const;

export const typography = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: "800" },
  pageTitle: { fontSize: 28, lineHeight: 34, fontWeight: "700" },
  sectionTitle: { fontSize: 21, lineHeight: 28, fontWeight: "700" },
  cardTitle: { fontSize: 18, lineHeight: 24, fontWeight: "700" },
  body: { fontSize: 16, lineHeight: 24, fontWeight: "400" },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: "600" },
  supporting: { fontSize: 14, lineHeight: 21, fontWeight: "400" },
  label: { fontSize: 13, lineHeight: 18, fontWeight: "700" },
  caption: { fontSize: 12, lineHeight: 17, fontWeight: "600" },
  overline: { fontSize: 11, lineHeight: 15, fontWeight: "800", letterSpacing: 1.2 },
} as const;
