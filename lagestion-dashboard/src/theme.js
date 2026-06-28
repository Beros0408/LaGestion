export const C = {
  primary: "#2D5B7F",
  secondary: "#4A9B8E",
  accent: "#F4A261",
  bgMain: "#F8F9FA",
  bgCard: "#FFFFFF",
  textPrimary: "#2D3436",
  textSecondary: "#636E72",
  border: "#DFE6E9",
  success: "#27AE60",
  warning: "#F39C12",
  error: "#E74C3C",
  info: "#3498DB",
};

export const euro = (n) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

export const num = (n) => new Intl.NumberFormat("fr-FR").format(n);
