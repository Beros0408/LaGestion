// Relances : niveaux, règles de proposition et modèles. Aucun envoi : l'utilisateur relit, modifie et copie.
// Les contrôles définitifs sont en base (verifier_relance, migration 011).
import { joursDeRetard, resteAPayer, estImpayee } from "../utils/facture.js";

const N = " ";

export const LIBELLE_NIVEAU = { 1: "1re relance", 2: "2e relance", 3: "Mise en demeure" };

// Mêmes rôles que verifier_relance : le commercial prépare les niveaux 1 et 2.
export const ROLES_MISE_EN_DEMEURE = ["admin", "manager", "comptable"];

export const DELAI_ENTRE_RELANCES = 15;
const DELAI_MISE_EN_DEMEURE = 8;

export const derniereRelance = (facture) =>
  [...(facture?.relances ?? [])].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0] ?? null;

const niveauMax = (facture) => (facture?.relances ?? []).reduce((m, r) => Math.max(m, Number(r.niveau) || 0), 0);

// Niveau proposé : celui qui suit le plus haut niveau déjà préparé.
export const niveauSuivant = (facture) => Math.min(3, niveauMax(facture) + 1);

// Niveaux possibles : pas de saut, répétition permise, mise en demeure réservée.
export function niveauxPossibles(facture, role) {
  const max = niveauSuivant(facture);
  return [1, 2, 3].filter((n) => n <= max && (n < 3 || ROLES_MISE_EN_DEMEURE.includes(role)));
}

// Relançable : émise, non annulée, avec un reste à payer, échue. Toujours possible depuis Impayés.
export const peutRelancer = (facture, jour) => estImpayee(facture) && joursDeRetard(facture, jour) > 0;

const joursEntre = (de, a) => Math.round((Date.parse(a) - Date.parse(de)) / 86400000);

// À proposer au tableau de bord : relançable, 15 jours après la dernière relance, jamais après une mise en demeure.
export function relanceAProposer(facture, jour) {
  if (!peutRelancer(facture, jour)) return false;
  if (niveauMax(facture) >= 3) return false;
  const derniere = derniereRelance(facture);
  return !derniere || joursEntre(String(derniere.created_at).slice(0, 10), jour) >= DELAI_ENTRE_RELANCES;
}

const montant = (n) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(n);

const date = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }) : "—");

// Brouillon : objet, texte et destinataire, à partir de l'identité figée de la facture.
// Pénalités et indemnité citées pour un client professionnel, sans taux ni montant de pénalités (à valider).
export function genererRelance(niveau, facture, client, entreprise, jour) {
  const destinataire = client?.email ?? facture?.client_fige?.email ?? "";
  const nomClient = facture?.client_fige?.nom ?? client?.nom ?? "";
  const professionnel = (facture?.client_fige?.type ?? client?.type) !== "particulier";
  const emetteur = facture?.emetteur_fige?.nom ?? entreprise?.nom ?? "";
  const numero = facture?.numero ?? "";
  const reste = montant(resteAPayer(facture));
  const retard = joursDeRetard(facture, jour);
  const rappel = `Facture ${numero} du ${date(facture?.date_emission)}, échue le ${date(facture?.date_echeance)} (${retard}${N}jour${retard > 1 ? "s" : ""} de retard).\nReste à payer${N}: ${reste}.`;

  if (niveau === 1) {
    return {
      destinataire,
      objet: `Rappel de paiement${N}: facture ${numero}`,
      corps: `Bonjour,\n\nSauf erreur de notre part, le règlement de la facture ci-dessous ne nous est pas encore parvenu.\n\n${rappel}\n\nMerci de bien vouloir procéder au règlement, ou de nous indiquer la date prévue. Si votre paiement vient d'être effectué, nous vous prions de ne pas tenir compte de ce message.\n\nCordialement,\n${emetteur}`,
    };
  }
  if (niveau === 2) {
    const penalites = professionnel
      ? `\n\nNous vous rappelons qu'en cas de retard de paiement, des pénalités de retard et une indemnité forfaitaire pour frais de recouvrement sont dues de plein droit.`
      : "";
    return {
      destinataire,
      objet: `2e relance${N}: facture ${numero} impayée`,
      corps: `Bonjour,\n\nMalgré notre précédent rappel, la facture ci-dessous reste impayée.\n\n${rappel}${penalites}\n\nNous vous demandons de procéder au règlement dans les meilleurs délais, ou de nous contacter si une difficulté se présente.\n\nCordialement,\n${emetteur}`,
    };
  }
  const suite = professionnel
    ? `\n\nConformément aux articles L. 441-10 et D. 441-5 du Code de commerce, des pénalités de retard et une indemnité forfaitaire de 40${N}€ pour frais de recouvrement sont dues de plein droit, en sus du principal.`
    : "";
  return {
    destinataire,
    objet: `Mise en demeure de payer${N}: facture ${numero}`,
    corps: `MISE EN DEMEURE\n\nÀ l'attention de ${nomClient}\n\nMalgré nos précédentes relances, la facture ci-dessous reste impayée.\n\n${rappel}\n\nPar la présente, nous vous mettons en demeure de régler la somme de ${reste} dans un délai de ${DELAI_MISE_EN_DEMEURE}${N}jours à compter de la réception de ce courrier.${suite}\n\nÀ défaut de règlement dans ce délai, nous nous réservons le droit d'engager toute procédure de recouvrement.\n\n${emetteur}`,
  };
}
