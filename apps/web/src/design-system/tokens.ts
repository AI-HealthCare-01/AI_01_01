export const colorTokens = {
  bg: {
    base: "#FAFBFF",
    soft: "#F6F3FB"
  },
  surface: {
    base: "#FFFFFF",
    alt: "#F8F7FC",
    muted: "#F3F5FA"
  },
  border: {
    soft: "#E9E7F2",
    muted: "#D8DCE8"
  },
  text: {
    primary: "#1F2430",
    secondary: "#687085",
    tertiary: "#98A1B3",
    inverse: "#FFFFFF"
  },
  brand: {
    primary: "#7C6CF6",
    primaryHover: "#6D5CE8",
    primarySoft: "#EEEAFE"
  },
  accent: {
    pink: "#F5B8D0",
    sky: "#BEE7F3",
    mint: "#CDEEE5",
    peach: "#F6D8C8",
    lavender: "#D9CCF7"
  },
  status: {
    success: "#5CC89B",
    warning: "#F3B764",
    danger: "#EB7282",
    info: "#7EAEF7"
  },
  chart: {
    depression: "#7C6CF6",
    anxiety: "#F39AC1",
    insomnia: "#6EC7C1",
    grid: "#E9ECF4",
    axis: "#8E97AB"
  }
} as const;

export const spacingTokens = {
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  5: "20px",
  6: "24px",
  7: "32px",
  8: "40px",
  9: "48px",
  10: "64px"
} as const;

export const radiusTokens = {
  sm: "10px",
  md: "14px",
  lg: "18px",
  xl: "24px",
  pill: "999px"
} as const;

export const shadowTokens = {
  card: "0 8px 24px rgba(29, 42, 80, 0.06)",
  cardHover: "0 12px 28px rgba(29, 42, 80, 0.10)",
  modal: "0 20px 48px rgba(21, 27, 38, 0.16)",
  soft: "0 4px 12px rgba(29, 42, 80, 0.05)"
} as const;

export const gradientTokens = {
  heroPrimary: "linear-gradient(135deg, #E8F3FF 0%, #F8E8F5 100%)",
  heroAlt: "linear-gradient(135deg, #F5E9FF 0%, #E8FBF8 100%)",
  cardSoft: "linear-gradient(135deg, #FFF7FB 0%, #F4F7FF 100%)",
  glassStreak:
    "linear-gradient(140deg, color-mix(in oklab, white 82%, #E8F3FF) 0%, color-mix(in oklab, white 76%, #F8E8F5) 100%)"
} as const;

export const sizeTokens = {
  controlHeightSm: "36px",
  controlHeightMd: "44px",
  controlHeightLg: "50px",
  controlHeightXs: "32px",
  controlHeightTab: "38px",
  controlPillHeight: "24px",
  contentMaxSm: "640px",
  contentMaxMd: "880px",
  contentMaxLg: "1240px",
  contentFeedMax: "760px",
  contentCenteredFormMax: "520px",
  layoutModalMax: "520px",
  layoutSheetMax: "680px",
  layoutToastMax: "460px",
  chartMinHeight: "220px",
  tokenSwatchHeight: "52px"
} as const;

export const typographyTokens = {
  pageTitle: { fontSize: "32px", lineHeight: "40px", fontWeight: 700 },
  sectionTitle: { fontSize: "22px", lineHeight: "30px", fontWeight: 700 },
  cardTitle: { fontSize: "16px", lineHeight: "24px", fontWeight: 600 },
  bodyLg: { fontSize: "16px", lineHeight: "26px", fontWeight: 400 },
  bodyMd: { fontSize: "14px", lineHeight: "22px", fontWeight: 400 },
  bodySm: { fontSize: "13px", lineHeight: "20px", fontWeight: 400 },
  caption: { fontSize: "12px", lineHeight: "18px", fontWeight: 400 },
  statNumber: { fontSize: "28px", lineHeight: "34px", fontWeight: 700 }
} as const;

export const effectTokens = {
  blurHeader: "8px",
  focusRingWidth: "2px",
  focusRingOffset: "2px",
  overlayBackdrop: "rgba(20, 26, 41, 0.44)",
  glassSurface: "color-mix(in oklab, white 86%, #F5E9FF)",
  glassSurfaceStrong: "color-mix(in oklab, white 78%, #E8F3FF)"
} as const;

export const semanticColorTokens = {
  pageBg: colorTokens.bg.base,
  sectionBg: colorTokens.surface.alt,
  surfaceBg: colorTokens.surface.base,
  surfaceBase: colorTokens.surface.base,
  surfaceAlt: colorTokens.surface.alt,
  borderDefault: colorTokens.border.soft,
  borderStrong: colorTokens.border.muted,
  textPrimary: colorTokens.text.primary,
  textSecondary: colorTokens.text.secondary,
  textMuted: colorTokens.text.tertiary,
  actionPrimaryBg: colorTokens.brand.primaryHover,
  actionPrimaryBgHover: `color-mix(in oklab, ${colorTokens.brand.primaryHover} 90%, black)`,
  actionPrimaryText: colorTokens.text.inverse,
  actionSecondaryBg: colorTokens.brand.primarySoft,
  actionSecondaryText: colorTokens.brand.primary,
  surfaceGlass: effectTokens.glassSurface,
  surfaceGlassStrong: effectTokens.glassSurfaceStrong,
  successBg: `color-mix(in oklab, ${colorTokens.status.success} 16%, white)`,
  warningBg: `color-mix(in oklab, ${colorTokens.status.warning} 18%, white)`,
  dangerBg: `color-mix(in oklab, ${colorTokens.status.danger} 16%, white)`,
  infoBg: `color-mix(in oklab, ${colorTokens.status.info} 14%, white)`
} as const;

export const mindsightTokens = {
  colors: colorTokens,
  semanticColors: semanticColorTokens,
  spacing: spacingTokens,
  radius: radiusTokens,
  shadow: shadowTokens,
  gradients: gradientTokens,
  effects: effectTokens,
  sizes: sizeTokens,
  typography: typographyTokens
} as const;

export type MindsightTokens = typeof mindsightTokens;
