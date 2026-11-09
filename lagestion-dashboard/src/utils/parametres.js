// Paramètres de l'entreprise (migration 013) : listes, contrôles de saisie et valeurs par défaut des documents.
// Les contrôles de forme sont aussi posés en base (contraintes entreprises_*) ; ceux-ci vérifient en plus le fond
// (clé de contrôle du SIRET, de la TVA et de l'IBAN).

export const FORMES_JURIDIQUES = ["EI", "EURL", "SARL", "SAS", "SASU", "SA", "SNC", "SCI", "SCOP", "SELARL"];
export const FORME_AUTRE = "autre";

export const IMMATRICULATIONS = [
  { value: "", label: "— Non renseignée —" },
  { value: "rcs", label: "RCS (registre du commerce)" },
  { value: "rm", label: "RM (répertoire des métiers)" },
  { value: "dispense", label: "Dispensé d'immatriculation" },
];

export const PENALITES = [
  { value: "bce_10", label: "Taux BCE + 10 points (par défaut)",
    aide: "Taux appliqué si rien n'est stipulé (art. L. 441-10 du Code de commerce)." },
  { value: "trois_interet_legal", label: "3 × taux d'intérêt légal (minimum)",
    aide: "Minimum légal entre professionnels ; le taux d'intérêt légal est révisé chaque semestre." },
  { value: "taux_fixe", label: "Taux annuel fixe",
    aide: "Taux saisi ci-dessous, imprimé sur les factures et cité dans les relances." },
];

export const MODES_PAIEMENT = [
  { value: "", label: "— Non précisé —" },
  { value: "virement", label: "Virement" },
  { value: "carte", label: "Carte" },
  { value: "cheque", label: "Chèque" },
  { value: "especes", label: "Espèces" },
  { value: "autre", label: "Autre" },
];

export const DELAI_MAX_JOURS = 60;
export const TAILLE_MAX_LOGO = 1024 * 1024;
export const TYPES_LOGO = ["image/png", "image/jpeg"];

const sansEspaces = (s) => String(s ?? "").replace(/[\s.-]/g, "");

// Somme de Luhn (SIRET, SIREN).
function luhn(chiffres) {
  let somme = 0;
  for (let i = 0; i < chiffres.length; i++) {
    let n = Number(chiffres[chiffres.length - 1 - i]);
    if (i % 2 === 1) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    somme += n;
  }
  return somme;
}

// SIRET : 14 chiffres, clé de Luhn ; établissements de La Poste (SIREN 356000000) : somme des chiffres multiple de 5.
export function siretValide(siret) {
  const s = sansEspaces(siret);
  if (!/^\d{14}$/.test(s)) return false;
  if (s.startsWith("356000000")) return [...s].reduce((t, c) => t + Number(c), 0) % 5 === 0;
  return luhn(s) % 10 === 0;
}

// Clé de TVA française : (12 + 3 × (SIREN mod 97)) mod 97, sur deux chiffres.
export function cleTvaFrancaise(siren) {
  return String((12 + 3 * (Number(siren) % 97)) % 97).padStart(2, "0");
}

export const normaliserTva = (tva) => sansEspaces(tva).toUpperCase();
export const normaliserIban = (iban) => sansEspaces(iban).toUpperCase();

// N° de TVA : format européen ; pour la France, clé exacte et SIREN identique à celui du SIRET s'il est connu.
export function erreurTva(tva, siret) {
  const t = normaliserTva(tva);
  if (!t) return null;
  if (!/^[A-Z]{2}[0-9A-Z]{2,13}$/.test(t)) return "Format attendu : deux lettres du pays puis le numéro (ex. FR32123456789).";
  if (!t.startsWith("FR")) return null;
  const m = /^FR([0-9]{2})([0-9]{9})$/.exec(t);
  if (!m) return "Un numéro français comporte FR, une clé de 2 chiffres et le SIREN (9 chiffres).";
  if (cleTvaFrancaise(m[2]) !== m[1]) return "La clé de ce numéro de TVA ne correspond pas au SIREN.";
  const s = sansEspaces(siret);
  if (/^\d{14}$/.test(s) && s.slice(0, 9) !== m[2]) return "Le SIREN de ce numéro de TVA diffère de celui du SIRET.";
  return null;
}

// IBAN : format, puis contrôle modulo 97 (ISO 13616).
export function ibanValide(iban) {
  const i = normaliserIban(iban);
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(i)) return false;
  const reordonne = i.slice(4) + i.slice(0, 4);
  let reste = 0;
  for (const c of reordonne) {
    const v = c >= "A" ? String(c.charCodeAt(0) - 55) : c;
    for (const d of v) reste = (reste * 10 + Number(d)) % 97;
  }
  return reste === 1;
}

// Contrôles du formulaire Entreprise : formes et cohérences uniquement ; les mentions obligatoires
// pour finaliser une facture sont vérifiées à la finalisation (migration 014).
export function validerParametres(f) {
  const e = {};
  if (!String(f.nom ?? "").trim()) e.nom = "Le nom de l'entreprise est obligatoire.";
  if (f.forme_juridique === FORME_AUTRE && !String(f.forme_autre ?? "").trim()) e.forme_autre = "Précisez la forme juridique.";
  if (f.capital_social !== "" && f.capital_social != null) {
    const c = Number(f.capital_social);
    if (Number.isNaN(c) || c < 0) e.capital_social = "Le capital doit être un montant positif ou nul.";
  }
  if (sansEspaces(f.siret) && !siretValide(f.siret)) e.siret = "SIRET invalide : 14 chiffres avec une clé de contrôle exacte.";
  if ((f.immatriculation_type === "rcs" || f.immatriculation_type === "rm") && !String(f.immatriculation_lieu ?? "").trim()) {
    e.immatriculation_lieu = f.immatriculation_type === "rcs" ? "Indiquez la ville du greffe." : "Indiquez le département de la chambre de métiers.";
  }
  const tva = erreurTva(f.tva_intra, f.siret);
  if (tva) e.tva_intra = tva;
  const d = Number(f.delai_paiement_jours);
  if (f.delai_paiement_jours === "" || !Number.isInteger(d) || d < 0 || d > DELAI_MAX_JOURS) {
    e.delai_paiement_jours = `Délai entier de 0 à ${DELAI_MAX_JOURS} jours (plafond légal entre professionnels).`;
  }
  if (f.penalites_mode === "taux_fixe") {
    const t = Number(f.penalites_taux);
    if (f.penalites_taux === "" || Number.isNaN(t) || t <= 0 || t > 100) e.penalites_taux = "Taux annuel en %, supérieur à 0 et au plus 100.";
  }
  if (normaliserIban(f.iban) && !ibanValide(f.iban)) e.iban = "IBAN invalide : vérifiez sa saisie (clé de contrôle inexacte).";
  return e;
}

// Ajoute n jours à une date AAAA-MM-JJ (calcul en UTC : aucun décalage de fuseau).
export function ajouterJours(iso, n) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso ?? "")) return "";
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Valeurs proposées sur une nouvelle facture, depuis les paramètres de l'entreprise (modifiables ensuite).
export function defautsPaiement(entreprise, dateEmission) {
  return {
    date_echeance: ajouterJours(dateEmission, Number(entreprise?.delai_paiement_jours ?? 30)),
    mode_paiement: entreprise?.mode_paiement ?? "",
    conditions_paiement: entreprise?.conditions_paiement ?? "",
  };
}
