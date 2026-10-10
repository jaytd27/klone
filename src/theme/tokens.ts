/**
 * Kwoon — Graphite theme · typed tokens
 * Brand: mark = crescent with a K page · wordmark = "Kwoon" with violet "oo" · tagline = "A moonlit home for your documents"
 * Mirrors tokens/tokens.json. Import the mode you need, or `themes[mode]`.
 * Generated 2026-10-09 · v1.0.0
 */

export type ThemeMode = "dark" | "light";

export const palette = {
  graphite: {
    950: "#08090A", 900: "#0E0F11", 850: "#16181B", 800: "#1D2024", 700: "#2A2E33",
    600: "#3A4047", 500: "#5C636B", 400: "#8C939B", 300: "#A1A7AE", 200: "#C9CDD1",
    100: "#DFE1E5", 50: "#E9EAED", 25: "#F5F6F7", 0: "#FFFFFF", textLight: "#ECEDEE",
  },
  violet: {
    100: "#EDE9FE", 200: "#DDD6FE", 300: "#C4B5FD", 400: "#A78BFA", 500: "#8B6CF0",
    600: "#7C5CE6", 700: "#6B46E5", 800: "#5B3FCF", 900: "#17103A",
  },
  marker: { yellow: "#FFE873", green: "#AAD65A", blue: "#8ED0FF", pink: "#FFB3C7", orange: "#FFC27A" },
  ink: { black: "#1A1A1A", slate: "#475569", red: "#B42318", blue: "#1D4ED8", green: "#15803D" },
} as const;

export interface SemanticColors {
  bg: { app: string; panel: string; raised: string; canvas: string; field: string; hover: string; inverse: string; overlay: string };
  border: { default: string; strong: string; focus: string };
  text: { primary: string; secondary: string; disabled: string; inverse: string; onAccent: string; link: string };
  accent: { default: string; hover: string; active: string; subtle: string; selection: string; text: string };
  status: { info: string; success: string; warning: string; danger: string };
  float: { bg: string; fg: string };
  page: { surface: string; text: string; skeleton: string };
  logo: { moon: string; crater: string; page: string; fold: string; k: string; pole: string };
}

export const dark: SemanticColors = {
  bg: { app: "#0E0F11", panel: "#16181B", raised: "#1D2024", canvas: "#08090A", field: "#0E0F11", hover: "rgba(255,255,255,0.05)", inverse: "#ECEDEE", overlay: "rgba(8,9,10,0.60)" },
  border: { default: "#2A2E33", strong: "#3A4047", focus: "#A78BFA" },
  text: { primary: "#ECEDEE", secondary: "#A1A7AE", disabled: "#5C636B", inverse: "#0E0F11", onAccent: "#17103A", link: "#A78BFA" },
  accent: { default: "#A78BFA", hover: "#C4B5FD", active: "#8B6CF0", subtle: "rgba(167,139,250,0.10)", selection: "rgba(167,139,250,0.42)", text: "#A78BFA" },
  status: { info: "#38BDF8", success: "#4ADE80", warning: "#F5B82E", danger: "#FB7185" },
  float: { bg: "#1D2024", fg: "#ECEDEE" },
  page: { surface: "#FFFFFF", text: "#1A1A1A", skeleton: "#DCDDDF" },
  logo: { moon: "#A78BFA", crater: "#7C5CE6", page: "#7C5CE6", fold: "#C4B5FD", k: "#EDE9FE", pole: "#ECEDEE" },
};

export const light: SemanticColors = {
  bg: { app: "#F5F6F7", panel: "#FFFFFF", raised: "#FFFFFF", canvas: "#E9EAED", field: "#FFFFFF", hover: "rgba(0,0,0,0.04)", inverse: "#16181B", overlay: "rgba(22,24,27,0.40)" },
  border: { default: "#DFE1E5", strong: "#C9CDD1", focus: "#6B46E5" },
  text: { primary: "#16181B", secondary: "#5C636B", disabled: "#A1A7AE", inverse: "#FFFFFF", onAccent: "#FFFFFF", link: "#6B46E5" },
  accent: { default: "#6B46E5", hover: "#5B3FCF", active: "#5B3FCF", subtle: "rgba(107,70,229,0.08)", selection: "rgba(107,70,229,0.28)", text: "#6B46E5" },
  status: { info: "#0369A1", success: "#15803D", warning: "#B45309", danger: "#BE123C" },
  float: { bg: "#16181B", fg: "#ECEDEE" },
  page: { surface: "#FFFFFF", text: "#1A1A1A", skeleton: "#DCDDDF" },
  logo: { moon: "#A78BFA", crater: "#8B6CF0", page: "#6B46E5", fold: "#C4B5FD", k: "#FFFFFF", pole: "#16181B" },
};

export const themes: Record<ThemeMode, SemanticColors> = { dark, light };

export const font = {
  family: {
    display: '"Space Grotesk", ui-sans-serif, system-ui, sans-serif',
    body: '"IBM Plex Sans", ui-sans-serif, system-ui, sans-serif',
    mono: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  weight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
  size: { "2xs": 11, xs: 12, sm: 13, md: 14, lg: 16, xl: 20, "2xl": 24, "3xl": 32, "4xl": 44 },
  lineHeight: { tight: 1.1, snug: 1.25, normal: 1.5 },
  letterSpacing: { display: "-0.02em", label: "0.08em", eyebrow: "0.12em" },
} as const;

export const space = { 0: 0, 1: 2, 2: 4, 3: 6, 4: 8, 5: 12, 6: 16, 7: 20, 8: 24, 9: 32, 10: 40, 11: 48, 12: 64 } as const;

export const radius = { xs: 4, sm: 6, md: 8, lg: 12, xl: 16, pill: 999, page: 0 } as const;

export const shadow = {
  page: "0 1px 2px rgba(0,0,0,0.12), 0 8px 28px rgba(0,0,0,0.14)",
  float: "0 6px 18px rgba(0,0,0,0.22)",
  pin: "0 3px 8px rgba(0,0,0,0.25)",
  modal: "0 24px 64px rgba(0,0,0,0.35)",
} as const;

export const size = {
  control: { sm: 30, md: 36, lg: 40, touchMin: 44 },
  icon: { sm: 14, md: 16, lg: 18, xl: 20 },
  layout: { topbar: 52, toolrow: 48, statusbar: 28, thumbnails: 184, inspector: 296, filmstrip: 104 },
} as const;

export const borderWidth = { hairline: 1, selection: 1.5, focus: 2 } as const;

export const motion = {
  duration: { fast: 120, base: 180, slow: 240 },
  easing: {
    standard: "cubic-bezier(0.2, 0, 0, 1)",
    exit: "cubic-bezier(0.4, 0, 1, 1)",
    spring: "cubic-bezier(0.34, 1.3, 0.64, 1)",
  },
} as const;

export const brand = {
  name: "Kwoon",
  tagline: "A moonlit home for your documents",
  taglineShort: "Read by moonlight",
  themeNames: { dark: "Moonlit", light: "Daylight", system: "Follow system" },
} as const;

export const zIndex = { page: 0, annotation: 10, selection: 20, float: 100, popover: 200, modal: 300, toast: 400 } as const;

/** Apply a mode to the document: sets data-theme on <html>. */
export function applyTheme(mode: ThemeMode | "system"): void {
  if (typeof document === "undefined") return;
  if (mode === "system") document.documentElement.removeAttribute("data-theme");
  else document.documentElement.setAttribute("data-theme", mode);
}
