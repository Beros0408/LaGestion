export const STATUTS = [
  "brouillon",
  "finalisee",
  "envoyee",
  "payee",
  "partiellement_payee",
  "en_retard",
  "annulee",
];

// Statuts affichés. Payée, partiellement payée et en retard sont calculés (statutCalcule), jamais stockés.
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

// Règlements d'un client (situationClient, utils/facture.js).
export const LIBELLE_SITUATION = {
  a_jour: "À jour",
  partiellement_regle: "Partiellement réglé",
  en_retard: "En retard",
};

export const TAUX_TVA = [20, 10, 5.5, 0];

export const LIBELLE_TYPE = {
  facture: "Facture",
  acompte: "Facture d'acompte",
  solde: "Facture de solde",
  avoir: "Avoir",
};

// Seul choix encore manuel, purement informatif et sans retour (verifier_facture, migration 011).
export const statutsSuivantsFacture = (statut) => (statut === "finalisee" ? ["envoyee"] : []);

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
