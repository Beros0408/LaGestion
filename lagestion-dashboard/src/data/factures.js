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

// Mêmes règles que verifier_facture (migration 008). Un brouillon passe par la finalisation ;
// l'annulation d'une facture finalisée attend l'étape des avoirs.
const STATUTS_SUIVANTS = {
  finalisee: ["envoyee", "partiellement_payee", "payee", "en_retard"],
  envoyee: ["partiellement_payee", "payee", "en_retard"],
  partiellement_payee: ["payee", "en_retard", "envoyee"],
  payee: ["partiellement_payee", "envoyee"],
  en_retard: ["partiellement_payee", "payee", "envoyee"],
};

export const statutsSuivantsFacture = (statut) => STATUTS_SUIVANTS[statut] ?? [];

export const factureModifiable = (statut) => statut === "brouillon";

export const paiementPossible = (statut) => statut !== "brouillon" && statut !== "annulee";

// Numéro affiché : un brouillon n'en a pas avant sa finalisation.
export const libelleNumero = (facture) => facture?.numero ?? "Brouillon";
