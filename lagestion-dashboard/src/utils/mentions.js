// Mentions légales imprimées sur les documents (migration 014) : un seul endroit pour leur texte exact,
// repris dans docs/Mentions_legales_a_valider.md. À faire valider par un expert-comptable.
// Document émis : uniquement ce que contient son emetteur_fige (un document antérieur à 014 n'imprime aucune
// nouvelle mention). Brouillon et devis : paramètres actuels de l'entreprise.

const N = " "; // espace insécable

export const CATEGORIES_OPERATION = [
  { value: "services", label: "Prestation de services" },
  { value: "biens", label: "Livraison de biens" },
  { value: "mixte", label: "Opération mixte (biens et services)" },
];
const LIBELLE_CATEGORIE = Object.fromEntries(CATEGORIES_OPERATION.map((c) => [c.value, c.label]));

const LIBELLE_MODE = { virement: "Virement", carte: "Carte", cheque: "Chèque", especes: "Espèces", autre: "Autre" };

// Sociétés dont le capital est une mention obligatoire (même règle que mentions_manquantes en SQL).
export const SOCIETES_A_CAPITAL = ["EURL", "SARL", "SAS", "SASU", "SA", "SELARL"];

const vide = (v) => v == null || String(v).trim() === "";

function montant(n) {
  const [ent, dec] = Number(n).toFixed(2).split(".");
  return `${ent.replace(/\B(?=(\d{3})+(?!\d))/g, N)},${dec}${N}€`;
}

function dateLongue(iso) {
  if (!iso) return "";
  const d = new Date(`${String(iso).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

const groupes = (s, n) => String(s).replace(new RegExp(`(.{${n}})(?=.)`, "g"), `$1${N}`);

// Émetteur d'un document : figé s'il est émis, sinon paramètres actuels (logo_url → logo, comme instantane_emetteur).
export function emetteurDocument(document, entreprise) {
  if (document?.statut && document.statut !== "brouillon" && document.emetteur_fige) return document.emetteur_fige;
  if (!entreprise) return null;
  const { logo_url: logo, ...reste } = entreprise;
  return { ...reste, logo: logo ?? null };
}

// Taux des pénalités de retard, tel qu'il est cité (PDF et relances) ; null si l'émetteur n'en porte pas.
export function texteTauxPenalites(e) {
  switch (e?.penalites_mode) {
    case "bce_10":
      return `taux appliqué par la Banque centrale européenne à son opération de refinancement la plus récente, majoré de 10${N}points de pourcentage`;
    case "trois_interet_legal":
      return "trois fois le taux d'intérêt légal";
    case "taux_fixe":
      return vide(e.penalites_taux) ? null : `taux annuel de ${String(Number(e.penalites_taux)).replace(".", ",")}${N}%`;
    default:
      return null;
  }
}

// Lignes d'identité sous le nom de l'émetteur (en-tête du PDF), dans l'ordre d'impression.
export function lignesIdentite(e) {
  if (!e) return [];
  const lignes = [];
  const forme = vide(e.forme_juridique) ? null : String(e.forme_juridique).trim();
  if (forme === "EI") lignes.push("Entrepreneur individuel (EI)");
  else if (forme && !vide(e.capital_social)) lignes.push(`${forme} au capital de ${montant(e.capital_social)}`);
  else if (forme) lignes.push(forme);
  if (!vide(e.siret)) lignes.push(`SIRET ${String(e.siret).trim()}`);
  const siren = vide(e.siret) ? "" : String(e.siret).replace(/\s/g, "").slice(0, 9);
  const sirenAffiche = siren.length === 9 ? ` ${groupes(siren, 3)}` : "";
  if (e.immatriculation_type === "rcs" && !vide(e.immatriculation_lieu)) lignes.push(`RCS ${e.immatriculation_lieu.trim()}${sirenAffiche}`);
  if (e.immatriculation_type === "rm" && !vide(e.immatriculation_lieu)) lignes.push(`RM ${e.immatriculation_lieu.trim()}${sirenAffiche}`);
  if (e.immatriculation_type === "dispense") lignes.push("Dispensé d'immatriculation au RCS et au RM");
  if (!vide(e.tva_intra)) lignes.push(`N° TVA intracommunautaire ${String(e.tva_intra).trim()}`);
  return lignes;
}

// Bloc « Mentions » du document. type : facture, acompte, solde, avoir ou devis.
export function lignesMentions({ type, document, emetteur: e, client }) {
  // Document émis avant la migration 014 (figement sans « mentions ») : aucun bloc, comme lors de son émission.
  if (document?.statut && document.statut !== "brouillon" && document.emetteur_fige && !document.emetteur_fige.mentions) return [];
  const m = [];
  const ajouter = (condition, texte) => condition && m.push(texte);
  const facturable = type === "facture" || type === "acompte" || type === "solde";

  if (facturable) {
    ajouter(document?.date_prestation, `Date de la prestation ou de la livraison${N}: ${dateLongue(document?.date_prestation)}`);
    ajouter(!vide(document?.adresse_livraison), `Adresse de livraison${N}: ${String(document?.adresse_livraison ?? "").trim()}`);
    ajouter(LIBELLE_CATEGORIE[document?.categorie_operation], `Catégorie de l'opération${N}: ${LIBELLE_CATEGORIE[document?.categorie_operation]}`);
  }
  ajouter(e?.franchise_tva === true, `TVA non applicable, art.${N}293${N}B du CGI.`);
  if (facturable) {
    ajouter(e?.option_debits === true, "Option pour le paiement de la taxe d'après les débits.");
    ajouter(!vide(document?.conditions_paiement), `Conditions de paiement${N}: ${String(document?.conditions_paiement ?? "").trim()}`);
    ajouter(LIBELLE_MODE[document?.mode_paiement], `Mode de paiement${N}: ${LIBELLE_MODE[document?.mode_paiement]}`);
    ajouter(!vide(e?.escompte), `Escompte${N}: ${String(e?.escompte ?? "").trim()}`);
    const taux = texteTauxPenalites(e);
    ajouter(taux, `Pénalités de retard${N}: ${taux}, exigibles dès le lendemain de la date d'échéance.`);
    // Indemnité : clients professionnels uniquement ; seulement si l'émetteur porte les nouvelles mentions.
    ajouter(taux && client?.type !== "particulier",
      `Indemnité forfaitaire pour frais de recouvrement en cas de retard de paiement${N}: 40${N}€ (art.${N}L.${N}441-10 et D.${N}441-5 du Code de commerce).`);
    ajouter(!vide(e?.iban), `IBAN${N}: ${groupes(String(e?.iban ?? "").replace(/\s/g, ""), 4)}`);
  }
  ajouter(!vide(e?.assurance_pro) && type !== "avoir", `Assurance professionnelle${N}: ${String(e?.assurance_pro ?? "").trim()}`);
  return m;
}

// Même règle que mentions_manquantes (migration 014) : annoncée avant la finalisation.
export function mentionsManquantes(e) {
  if (!e) return [];
  const manque = [];
  if (vide(e.siret)) manque.push("SIRET");
  if (vide(e.adresse)) manque.push("adresse du siège");
  if (vide(e.forme_juridique)) manque.push("forme juridique");
  if (SOCIETES_A_CAPITAL.includes(e.forme_juridique) && vide(e.capital_social)) manque.push("capital social");
  if (vide(e.immatriculation_type) || (["rcs", "rm"].includes(e.immatriculation_type) && vide(e.immatriculation_lieu))) {
    manque.push("immatriculation (RCS ou RM et son lieu)");
  }
  if (!e.franchise_tva && vide(e.tva_intra)) manque.push("n° de TVA intracommunautaire (ou franchise de TVA)");
  return manque;
}

// SIREN d'un client professionnel : avertissement sans blocage (mention de la réforme, date d'application à confirmer).
export function avertissementSirenClient(client) {
  if (client?.type !== "entreprise" || !vide(client?.siren)) return null;
  return `Le SIREN de ce client professionnel n'est pas renseigné. Il deviendra une mention obligatoire avec la facturation électronique${N}; la finalisation reste possible.`;
}
