// Import des articles du catalogue : champs reconnus, conversion ligne par ligne, doublons.
// Doublons : même référence (certain, 100), sinon même nom normalisé (probable, 90) quand les deux références
// ne se contredisent pas (deux références renseignées et différentes = deux articles distincts).
import { estLigneTotal, estVide, nettoyer, normaliser as normaliserTexte, parserMontant, regrouper } from "./import.js";
import { normaliser } from "./doublons.js";
import { TAUX_TVA } from "../data/factures.js";
import { LIBELLE_TYPE_ARTICLE } from "../data/catalogue.js";

export const CHAMPS_ARTICLES = [
  { cle: "reference", libelle: "Référence", synonymes: ["Référence", "Réf", "Ref", "Réf.", "Code", "Code article", "Référence article", "SKU"] },
  { cle: "nom", libelle: "Nom", requis: true,
    synonymes: ["Nom", "Article", "Désignation", "Libellé", "Intitulé", "Produit", "Prestation", "Nom de l'article", "Nom article"] },
  { cle: "description", libelle: "Description", synonymes: ["Description", "Détail", "Détails", "Commentaire"] },
  { cle: "type", libelle: "Type", synonymes: ["Type", "Type d'article", "Nature"] },
  { cle: "unite", libelle: "Unité", synonymes: ["Unité", "Unite", "U", "Unité de vente", "UV"] },
  { cle: "prix_unitaire_ht", libelle: "Prix unitaire HT", requis: true,
    synonymes: ["Prix unitaire HT", "Prix HT", "PU HT", "Prix", "Tarif", "Tarif HT", "Prix de vente HT", "PV HT", "Montant HT", "P.U. HT"] },
  { cle: "taux_tva", libelle: "Taux de TVA", synonymes: ["TVA", "Taux de TVA", "Taux TVA", "TVA %", "Taux"] },
  { cle: "actif", libelle: "Actif", synonymes: ["Actif", "Statut", "État", "Disponible", "Actif ?"] },
];

const LIBELLE = Object.fromEntries(CHAMPS_ARTICLES.map((c) => [c.cle, c.libelle]));

const TYPES = {
  produit: ["produit", "produits", "marchandise", "fourniture", "materiel", "bien", "p"],
  service: ["service", "services", "prestation", "main d oeuvre", "main d'oeuvre", "mo", "s"],
};
const ACTIF = {
  oui: ["oui", "actif", "active", "1", "vrai", "true", "x", "disponible"],
  non: ["non", "inactif", "inactive", "0", "faux", "false", "archive", "indisponible"],
};

const fr = (n) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tauxFr = (t) => `${String(t).replace(".", ",")} %`;
const LISTE_TAUX = TAUX_TVA.map((t) => String(t).replace(".", ",")).join(", ").replace(/, ([^,]*)$/, " ou $1");

// Taux de TVA : « 5,5 % », « 5.5 », 5.5, 0,055 ou 0.055 → 5.5 ; null si illisible.
// Une valeur strictement entre 0 et 1 est une fraction (cellule Excel en pourcentage, « 0,2 » → 20 %).
export function parserTaux(v) {
  let n;
  if (typeof v === "number") n = v;
  else {
    const s = nettoyer(v).replace(/\s|%/g, "").replace(",", ".");
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    n = Number(s);
  }
  if (!Number.isFinite(n) || n < 0) return null;
  if (n > 0 && n < 1) n *= 100;
  return Math.round(n * 100) / 100;
}

function trouverCle(table, v) {
  const n = normaliserTexte(v);
  return Object.keys(table).find((k) => table[k].includes(n)) ?? null;
}

// Valeurs regroupées par champ → données de l'article (seuls les champs présents), erreurs, avertissements.
export function convertirArticle(brut) {
  const d = {};
  const erreurs = [];
  const avertissements = [];
  const texte = (cle) => nettoyer(brut[cle]);

  if (estVide(brut.nom)) erreurs.push("Nom manquant");
  else d.nom = texte("nom");
  if (!estVide(brut.reference)) d.reference = texte("reference");
  if (!estVide(brut.description)) d.description = texte("description");
  if (!estVide(brut.unite)) d.unite = texte("unite");

  if (!estVide(brut.type)) {
    const t = trouverCle(TYPES, brut.type);
    if (t) d.type = t;
    else erreurs.push(`Type inconnu « ${texte("type")} » : Produit ou Service attendu`);
  }

  if (estVide(brut.prix_unitaire_ht)) erreurs.push("Prix HT manquant");
  else {
    const p = parserMontant(brut.prix_unitaire_ht);
    if (p === null || p < 0) erreurs.push(`Prix HT invalide « ${texte("prix_unitaire_ht")} » : montant positif attendu (ex. 1 234,50 €)`);
    else {
      const arrondi = Math.round(p * 100) / 100;
      if (arrondi !== p) avertissements.push(`Prix HT arrondi au centime : ${fr(arrondi)} €`);
      d.prix_unitaire_ht = arrondi;
    }
  }

  if (!estVide(brut.taux_tva)) {
    const t = parserTaux(brut.taux_tva);
    if (t === null) erreurs.push(`Taux de TVA illisible « ${texte("taux_tva")} » : ${LISTE_TAUX} % attendu`);
    else if (!TAUX_TVA.includes(t)) erreurs.push(`Taux de TVA hors liste « ${tauxFr(t)} » : ${LISTE_TAUX} % attendu`);
    else d.taux_tva = t;
  }

  if (!estVide(brut.actif)) {
    const a = trouverCle(ACTIF, brut.actif);
    if (a) d.actif = a === "oui";
    else erreurs.push(`Valeur « Actif » inconnue « ${texte("actif")} » : Oui ou Non attendu`);
  }
  return { donnees: d, erreurs, avertissements };
}

// ---------- Doublons ----------

const cleRef = (r) => normaliser(r);

function creerIndex() {
  return { ref: new Map(), nom: new Map() };
}

function indexer(index, a) {
  if (a.reference && !index.ref.has(cleRef(a.reference))) index.ref.set(cleRef(a.reference), a);
  const n = normaliser(a.nom);
  if (n) {
    if (!index.nom.has(n)) index.nom.set(n, []);
    index.nom.get(n).push(a);
  }
}

// Meilleur doublon d'une saisie dans un index : référence (100), sinon nom normalisé (90) sans références contradictoires.
export function meilleurDoublonArticle(index, s) {
  if (s.reference) {
    const a = index.ref.get(cleRef(s.reference));
    if (a) return { article: a, confiance: 100, motif: "Même référence" };
  }
  const candidats = index.nom.get(normaliser(s.nom)) ?? [];
  const a = candidats.find((c) => !s.reference || !c.reference || cleRef(c.reference) === cleRef(s.reference));
  return a ? { article: a, confiance: 90, motif: "Même nom" } : null;
}

// Actions : 100 → Ignorer (Créer impossible) ; 90 → Ignorer par défaut, Créer possible.
export function actionsDoublonArticle(source, confiance) {
  if (source === "base") return confiance >= 100 ? ["ignorer", "mettre_a_jour"] : ["ignorer", "mettre_a_jour", "creer"];
  return confiance >= 100 ? ["ignorer"] : ["ignorer", "creer"];
}

function affichage(cle, v) {
  if (v === null || v === undefined || v === "") return "";
  if (cle === "prix_unitaire_ht") return `${fr(Number(v))} €`;
  if (cle === "taux_tva") return tauxFr(Number(v));
  if (cle === "actif") return v ? "Oui" : "Non";
  if (cle === "type") return LIBELLE_TYPE_ARTICLE[v] ?? v;
  return nettoyer(v);
}

// Champs du fichier comparés à l'article existant : aucune case vide n'écrase une valeur (les champs vides
// sont absents des données), nombres comparés numériquement.
export function differencesArticle(existant, donnees) {
  const differences = [];
  const patch = {};
  for (const [cle, nouvelle] of Object.entries(donnees)) {
    const ancienne = existant[cle];
    const egal = cle === "prix_unitaire_ht" || cle === "taux_tva"
      ? ancienne !== null && ancienne !== undefined && Number(ancienne) === Number(nouvelle)
      : cle === "actif" ? (ancienne ?? true) === nouvelle
        : nettoyer(ancienne ?? "") === nettoyer(nouvelle);
    if (!egal) {
      patch[cle] = nouvelle;
      differences.push({ cle, libelle: LIBELLE[cle], ancienne: affichage(cle, ancienne), nouvelle: affichage(cle, nouvelle) });
    }
  }
  return { differences, patch };
}

// Analyse de toutes les lignes : catégorie (vide, total, erreur, nouvelle, doublon), données, doublon, actions.
// Le doublon cible est rangé sous doublon.produit (clé de planifier et de motifDoublon).
export function analyserArticles(tableau, correspondance, existants) {
  const indexBase = creerIndex();
  (existants ?? []).forEach((a) => indexer(indexBase, a));
  const indexFichier = creerIndex();

  return tableau.lignes.map((ligne) => {
    const base = { numero: ligne.numero, valeurs: ligne.valeurs, erreurs: [], avertissements: [], doublon: null, actions: [], action: null };
    if (ligne.vide) return { ...base, categorie: "vide" };
    const { brut, avertissements: avRegroupement } = regrouper(ligne, correspondance, CHAMPS_ARTICLES, tableau.entetes);
    if (estLigneTotal(ligne, brut, "nom")) return { ...base, categorie: "total" };
    const { donnees, erreurs, avertissements } = convertirArticle(brut);
    const av = [...avRegroupement, ...avertissements];
    if (erreurs.length > 0) return { ...base, categorie: "erreur", donnees, erreurs, avertissements: av };

    const dBase = meilleurDoublonArticle(indexBase, donnees);
    const dFichier = meilleurDoublonArticle(indexFichier, donnees);
    indexer(indexFichier, { ...donnees, numero: ligne.numero });

    let doublon = null;
    if (dBase && (!dFichier || dBase.confiance >= dFichier.confiance)) {
      doublon = { source: "base", confiance: dBase.confiance, motif: dBase.motif, produit: dBase.article };
    } else if (dFichier) {
      doublon = { source: "fichier", confiance: dFichier.confiance, motif: dFichier.motif, ligne: dFichier.article.numero };
    }
    if (!doublon) {
      if (donnees.taux_tva === undefined) av.push("Taux de TVA non renseigné : 20 % appliqués");
      return { ...base, categorie: "nouvelle", donnees, avertissements: av, actions: ["creer"], action: "creer" };
    }

    const actions = actionsDoublonArticle(doublon.source, doublon.confiance);
    const { differences, patch } = doublon.source === "base" ? differencesArticle(doublon.produit, donnees) : { differences: [], patch: {} };
    return { ...base, categorie: "doublon", donnees, avertissements: av, doublon, actions, action: actions[0], differences, patch };
  });
}
