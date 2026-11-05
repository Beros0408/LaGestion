// Statuts d'un devis et règles d'interface ; les mêmes règles sont appliquées en base (migration 007).
export const STATUTS_DEVIS = ["brouillon", "envoye", "accepte", "refuse", "expire", "converti"];

export const LIBELLE_STATUT_DEVIS = {
  brouillon: "Brouillon",
  envoye: "Envoyé",
  accepte: "Accepté",
  refuse: "Refusé",
  expire: "Expiré",
  converti: "Converti",
};

// « converti » n'est jamais proposé : seule la transformation en facture l'attribue.
const TRANSITIONS = {
  brouillon: ["envoye"],
  envoye: ["accepte", "refuse", "expire", "brouillon"],
  accepte: ["envoye", "refuse"],
  refuse: ["brouillon"],
  expire: ["brouillon", "envoye"],
  converti: [],
};

// direction : admin ou manager, seuls autorisés à faire sortir un devis du statut accepté.
export function statutsSuivants(statut, direction) {
  if (statut === "accepte" && !direction) return [];
  return TRANSITIONS[statut] ?? [];
}

export const devisModifiable = (statut) => statut !== "accepte" && statut !== "converti";

// Date du jour au format AAAA-MM-JJ (fuseau de l'utilisateur).
export function aujourdhui(date = new Date()) {
  const mois = String(date.getMonth() + 1).padStart(2, "0");
  const jour = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mois}-${jour}`;
}

export function dansJours(iso, jours) {
  const [a, m, j] = iso.split("-").map(Number);
  return aujourdhui(new Date(a, m - 1, j + jours));
}

// Pas d'expiration automatique : un devis envoyé au-delà de sa validité est seulement signalé.
export const validiteDepassee = (devis, jour = aujourdhui()) =>
  devis.statut === "envoye" && Boolean(devis.date_validite) && devis.date_validite < jour;
