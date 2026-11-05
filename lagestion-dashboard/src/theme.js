export const C = {
  primary: "#2D5B7F",
  primary200: "#A9C4DC",
  primary400: "#5283A6",
  primary700: "#244A68",
  secondary: "#4A9B8E",
  accent: "#F4A261",
  bgMain: "#E3E7EB",
  bgCard: "#ECEFF2",
  bgHover: "#DDE2E7",
  textPrimary: "#2D3436",
  textSecondary: "#4F5A5F",
  onPrimary: "#FFFFFF",
  border: "#C9D1D8",
  borderInput: "#717D89",
  // Barre latérale sombre
  sidebarBg: "#1B2A38",
  sidebarHover: "#223444",
  sidebarActiveBg: "#26394B",
  sidebarText: "#E4E8EC",
  sidebarTextMuted: "#9AA8B5",
  sidebarAccent: "#A9C4DC",
  sidebarBorder: "#2E4256",
  sidebarFocus: "#7DA5C9",
  success: "#27AE60",
  warning: "#F39C12",
  error: "#E74C3C",
  info: "#3498DB",
};

// Couleur hexadécimale (#RRGGBB) avec opacité : fonds teintés des badges, encadrés, survols.
export const alpha = (hex, opacite) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${opacite})`;
};

const OMBRE_BASE = "45,52,54";
export const OMBRE = {
  xs: `0 1px 2px rgba(${OMBRE_BASE},0.04)`,
  sm: `0 1px 3px rgba(${OMBRE_BASE},0.06)`,
  md: `0 4px 12px rgba(${OMBRE_BASE},0.08)`,
  lg: `0 12px 28px rgba(${OMBRE_BASE},0.10)`,
};

// Voile sombre derrière le tiroir de navigation mobile.
export const VOILE = alpha(C.textPrimary, 0.4);

export const euro = (n) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

export const num = (n) => new Intl.NumberFormat("fr-FR").format(n);
