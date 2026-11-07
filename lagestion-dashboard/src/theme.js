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
  errorText: "#B03A2E", // texte d'alerte sur carte (5,21:1 sur #ECEFF2, 4,61:1 sur #DDE2E7)
  info: "#3498DB",
  // Textes fonctionnels : ≥ 4,6:1 sur carte, survol, fond de page et teinte de badge (12 %, 15 % pour l'accent) posée dessus
  successText: "#186A3A",
  warningText: "#855407",
  infoText: "#1A6191",
  accentText: "#96480A",
  // Graphiques : contraste ≥ 3:1 sur bgCard (#ECEFF2)
  chart1: "#2D5B7F",
  chart2: "#3E8479",
  chart3: "#C2651F",
  chart4: "#5283A6",
  chart5: "#1E8A4C",
  chart6: "#7A5BA8",
  chart7: "#A5571F",
  chart8: "#717D89",
};

// Fonds d'avatar (initiales blanches) : ratio du blanc ≥ 5,2:1 sur chaque teinte.
export const AVATARS = {
  bleu: "#244A68", // primaire 700 — 9,32:1
  vertEau: "#336C63", // secondaire 700 — 6,06:1
  orange: "#A5571F", // accent 800 — 5,27:1
  vert: "#1B6E3E", // 6,28:1
  violet: "#7A5BA8", // 5,40:1
};

// Tuiles KPI du tableau de bord (dégradé début → fin), texte blanc ≥ 4,5:1 sur les deux teintes.
export const TUILES = {
  bleu: ["#244A68", "#2D5B7F"],
  vert: ["#1B6E3E", "#1E7A45"],
  orange: ["#974F1C", "#A5571F"],
  vertEau: ["#27534C", "#336C63"],
  violet: ["#4E3F7A", "#5B4B8A"],
  bleuNuit: ["#1C3950", "#244A68"],
};

// Bandes de l'entonnoir (dégradé gauche → droite), de Qualification à Conclusion ; texte blanc ≥ 4,5:1,
// y compris au survol (voile blanc de 5 %).
export const ENTONNOIR = [
  ["#244A68", "#2D5B7F"],
  ["#3B6688", "#45729A"],
  ["#2F665D", "#37766C"],
  ["#1B6E3E", "#1E7A45"],
];

// Couleur hexadécimale (#RRGGBB) avec opacité : fonds teintés des badges, encadrés, survols.
export const alpha = (hex, opacite) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${opacite})`;
};

// Couleur opaque (#RRGGBB) : la couleur à cette opacité, posée sur un fond (la carte par défaut).
export const melange = (hex, opacite, fond = C.bgCard) => {
  const c = (h, i) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  return "#" + [0, 1, 2]
    .map((i) => Math.round(c(hex, i) * opacite + c(fond, i) * (1 - opacite)).toString(16).padStart(2, "0"))
    .join("").toUpperCase();
};

// Couleurs d'état du paiement : sémantiques, distinctes de la palette de marque (voir CLAUDE.md, « Couleurs d'état »).
// trait : liseré, icône, jauge (jeton …Text, la couleur brute n'atteint pas 3:1) ; texte : jeton …Text ;
// badge : couleur brute à 12 % (10 % pour l'erreur : 4,50:1 à 12 %, 4,64:1 à 10 %), opaque, posée sur la carte.
const etat = (brute, texte, badge = 0.12) => ({ trait: texte, texte, badge: melange(brute, badge) });
export const COULEURS_ETAT = {
  succes: etat(C.success, C.successText),
  avertissement: etat(C.warning, C.warningText),
  info: etat(C.info, C.infoText),
  erreur: etat(C.error, C.errorText, 0.1),
  neutre: etat(C.textSecondary, C.textSecondary),
};

// Statut issu de statutCalcule ou de etatEcheance (utils/facture.js) → état. Un avoir est toujours neutre.
// Le badge d'échéance n'utilise que l'information et l'erreur ; la jauge, que l'avertissement et le succès.
const ETAT_PAR_STATUT = {
  payee: "succes",
  partiellement_payee: "avertissement",
  finalisee: "info",
  envoyee: "info",
  en_retard: "erreur",
  brouillon: "neutre",
  annulee: "neutre",
  a_echoir: "info",
  echeance_aujourdhui: "info",
};

// Règlement issu de etatReglement → état de la jauge ; non réglée : jauge vide.
export const ETAT_REGLEMENT = { partielle: "avertissement", soldee: "succes" };

// Piste de la jauge : textSecondary à 12 %, posée sur la carte.
export const PISTE_JAUGE = melange(C.textSecondary, 0.12);
export const etatDuStatut = (statut, type) => (type === "avoir" ? "neutre" : ETAT_PAR_STATUT[statut] ?? "neutre");
export const couleurEtat = (statut, type) => COULEURS_ETAT[etatDuStatut(statut, type)];

// Règlements d'un client (situationClient, utils/facture.js) → état.
export const ETAT_SITUATION = { a_jour: "succes", partiellement_regle: "avertissement", en_retard: "erreur" };

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

export const euroCentimes = (n) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(n);
