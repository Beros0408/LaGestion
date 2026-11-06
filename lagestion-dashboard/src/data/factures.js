export const STATUTS = [
  "brouillon",
  "finalisee",
  "envoyee",
  "payee",
  "partiellement_payee",
  "en_retard",
  "annulee",
];

// en_attente : statut retiré par la migration 008, conservé pour le libellé du journal d'activité.
export const LIBELLE_STATUT = {
  brouillon: "Brouillon",
  finalisee: "Finalisée",
  en_attente: "En attente",
  envoyee: "Envoyée",
  payee: "Payée",
  partiellement_payee: "Partiellement payée",
  en_retard: "En retard",
  annulee: "Annulée",
};

export const STATUTS_IMPAYES = ["finalisee", "envoyee", "partiellement_payee", "en_retard"];

export const TAUX_TVA = [20, 10, 5.5, 0];

export const LIBELLE_TYPE = {
  facture: "Facture",
  acompte: "Facture d'acompte",
  solde: "Facture de solde",
  avoir: "Avoir",
};

// Mêmes règles que verifier_facture (migration 008). Un brouillon passe par la finalisation ;
// l'annulation d'une facture finalisée attend l'étape des avoirs.
const STATUTS_SUIVANTS = {
  finalisee: ["envoyee", "partiellement_payee", "payee", "en_retard"],
  envoyee: ["partiellement_payee", "payee", "en_retard"],
  partiellement_payee: ["payee", "en_retard", "envoyee"],
  payee: ["partiellement_payee", "envoyee"],
  en_retard: ["partiellement_payee", "payee", "envoyee"],
};

// Un avoir finalisé ne peut que passer à « envoyé ».
export const statutsSuivantsFacture = (statut, type = "facture") =>
  type === "avoir" ? (statut === "finalisee" ? ["envoyee"] : []) : STATUTS_SUIVANTS[statut] ?? [];

export const factureModifiable = (statut) => statut === "brouillon";

export const paiementPossible = (statut, type = "facture") =>
  type !== "avoir" && statut !== "brouillon" && statut !== "annulee";

// Un acompte déduit d'un solde se corrige par le solde (solde_id : voir lierAvoirs).
export const peutCreerAvoir = (facture) =>
  facture?.type !== "avoir" && facture?.statut !== "brouillon" && facture?.statut !== "annulee" && !facture?.solde_id;

// Un brouillon de solde ne se supprime pas : ses acomptes ne seraient jamais déduits.
export const factureSupprimable = (facture) => facture?.statut === "brouillon" && facture?.type !== "solde";

const LIBELLE_BROUILLON = {
  facture: "Brouillon",
  acompte: "Brouillon d'acompte",
  solde: "Brouillon de solde",
  avoir: "Brouillon d'avoir",
};

// Mêmes rôles que verifier_facture (migration 009) : le commercial prépare, sans finaliser.
export const ROLES_FINALISATION_AVOIR = ["admin", "manager", "comptable"];

// Numéro affiché : un brouillon n'en a pas avant sa finalisation.
export const libelleNumero = (facture) =>
  facture?.numero ?? LIBELLE_BROUILLON[facture?.type] ?? "Brouillon";
