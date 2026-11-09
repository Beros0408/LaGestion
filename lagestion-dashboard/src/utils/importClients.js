// Import des clients : champs reconnus, conversion ligne par ligne, doublons (règles de detecterDoublons).
import { estLigneTotal, estVide, nettoyer, normaliser as normaliserTexte, parserDate, regrouper } from "./import.js";
import { chiffresSeuls, detecterDoublons, motsSignificatifs, normaliser } from "./doublons.js";
import { SECTEURS } from "../data/secteurs.js";

export const CHAMPS_CLIENTS = [
  { cle: "nom", libelle: "Nom", requis: true, multiple: true, separateur: " ",
    synonymes: ["Nom", "Raison sociale", "Société", "Entreprise", "Client", "Nom du client", "Nom client", "Dénomination", "Nom de l'entreprise", "Prénom", "Nom complet"] },
  { cle: "type", libelle: "Type", synonymes: ["Type", "Type de client", "Type client"] },
  { cle: "email", libelle: "E-mail", synonymes: ["E-mail", "Email", "Mail", "Courriel", "Adresse e-mail", "Adresse mail", "Adresse email"] },
  { cle: "telephone", libelle: "Téléphone",
    synonymes: ["Téléphone", "Tél", "Tel", "Portable", "Mobile", "Fixe", "Téléphone fixe", "Téléphone portable", "Phone", "GSM"] },
  { cle: "adresse", libelle: "Adresse", multiple: true, separateur: ", ",
    synonymes: ["Adresse", "Rue", "Adresse 1", "Adresse 2", "Adresse ligne 1", "Adresse ligne 2", "Complément d'adresse", "Code postal", "CP", "Ville", "Commune", "Localité", "Pays"] },
  { cle: "secteur", libelle: "Secteur", synonymes: ["Secteur", "Secteur d'activité", "Activité", "Domaine", "Domaine d'activité", "Métier"] },
  { cle: "statut", libelle: "Statut", synonymes: ["Statut", "État", "Statut client"] },
  { cle: "tags", libelle: "Tags", synonymes: ["Tags", "Tag", "Étiquettes", "Mots-clés", "Mots clés"] },
  { cle: "notes", libelle: "Informations internes",
    synonymes: ["Notes", "Note", "Commentaire", "Commentaires", "Remarques", "Observations", "Informations internes", "Infos"] },
  { cle: "siren", libelle: "SIREN", synonymes: ["SIREN", "N° SIREN", "Numéro SIREN"] },
  { cle: "siret", libelle: "SIRET", synonymes: ["SIRET", "N° SIRET", "Numéro SIRET"] },
  { cle: "tva_intra", libelle: "N° de TVA",
    synonymes: ["TVA intracommunautaire", "N° TVA", "TVA intra", "Numéro de TVA", "N° TVA intracommunautaire", "N° de TVA", "Numéro TVA intracommunautaire"] },
  { cle: "site_web", libelle: "Site web", synonymes: ["Site web", "Site", "Site internet", "URL", "Web"] },
  { cle: "date_naissance", libelle: "Date de naissance", synonymes: ["Date de naissance", "Naissance", "Né le", "Née le"] },
];

const LIBELLE = Object.fromEntries(CHAMPS_CLIENTS.map((c) => [c.cle, c.libelle]));

const TYPES = {
  particulier: ["particulier", "part", "personne", "personne physique", "individuel", "p", "b2c"],
  entreprise: ["entreprise", "societe", "professionnel", "pro", "personne morale", "e", "b2b", "sarl", "sas", "sa", "eurl", "sasu", "ei", "association"],
};
const STATUTS = {
  actif: ["actif", "active", "client", "oui"],
  prospect: ["prospect", "lead", "piste", "a prospecter"],
  inactif: ["inactif", "inactive", "ancien client", "archive", "perdu"],
};

function trouverCle(table, v) {
  const n = normaliserTexte(v);
  return Object.keys(table).find((k) => table[k].includes(n)) ?? null;
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_TVA = /^[A-Z]{2}[0-9A-Z]{2,13}$/;

// Valeurs regroupées par champ → données du client (seuls les champs présents dans le fichier), erreurs, avertissements.
export function convertirClient(brut) {
  const d = {};
  const erreurs = [];
  const avertissements = [];
  const texte = (cle) => nettoyer(brut[cle]);

  if (estVide(brut.nom)) erreurs.push("Nom manquant");
  else d.nom = texte("nom");

  if (!estVide(brut.type)) {
    const t = trouverCle(TYPES, brut.type);
    if (t) d.type = t;
    else erreurs.push(`Type inconnu « ${texte("type")} » : Particulier ou Entreprise attendu`);
  }
  if (!estVide(brut.email)) {
    if (RE_EMAIL.test(texte("email"))) d.email = texte("email");
    else erreurs.push(`E-mail invalide « ${texte("email")} »`);
  }
  if (!estVide(brut.telephone)) {
    let tel = texte("telephone");
    // Numéro lu comme un nombre par Excel : zéro initial perdu (612345678 → 0612345678).
    if (typeof brut.telephone === "number" && /^[1-9]\d{8}$/.test(tel)) {
      tel = `0${tel}`;
      avertissements.push(`Téléphone : zéro initial rétabli (${tel})`);
    }
    d.telephone = tel;
  }
  if (!estVide(brut.adresse)) d.adresse = texte("adresse");
  if (!estVide(brut.secteur)) {
    const connu = SECTEURS.find((s) => normaliserTexte(s) === normaliserTexte(brut.secteur));
    d.secteur = connu ?? texte("secteur");
    if (!connu) avertissements.push(`Secteur hors liste « ${texte("secteur")} », conservé tel quel`);
  }
  if (!estVide(brut.statut)) {
    const s = trouverCle(STATUTS, brut.statut);
    if (s) d.statut = s;
    else erreurs.push(`Statut inconnu « ${texte("statut")} » : Actif, Prospect ou Inactif attendu`);
  }
  if (!estVide(brut.tags)) {
    d.tags = [...new Set(texte("tags").split(/[,;|]/).map((t) => t.trim()).filter(Boolean))];
  }
  if (!estVide(brut.notes)) d.notes = texte("notes");
  if (!estVide(brut.siren)) {
    const s = chiffresSeuls(brut.siren);
    if (/^\d{9}$/.test(s) && s.length === texte("siren").replace(/\s/g, "").length) d.siren = s;
    else erreurs.push(`SIREN invalide « ${texte("siren")} » : 9 chiffres attendus`);
  }
  if (!estVide(brut.siret)) {
    const s = chiffresSeuls(brut.siret);
    if (/^\d{14}$/.test(s) && s.length === texte("siret").replace(/\s/g, "").length) d.siret = s;
    else erreurs.push(`SIRET invalide « ${texte("siret")} » : 14 chiffres attendus`);
  }
  if (!estVide(brut.tva_intra)) {
    const t = texte("tva_intra").replace(/\s/g, "").toUpperCase();
    if (RE_TVA.test(t)) d.tva_intra = t;
    else erreurs.push(`N° de TVA invalide « ${texte("tva_intra")} »`);
  }
  if (!estVide(brut.site_web)) d.site_web = texte("site_web");
  if (!estVide(brut.date_naissance)) {
    const iso = parserDate(brut.date_naissance);
    if (iso) d.date_naissance = iso;
    else erreurs.push(`Date de naissance invalide « ${texte("date_naissance")} » : jj/mm/aaaa attendu`);
  }
  return { donnees: d, erreurs, avertissements };
}

// Type retenu à la création quand le fichier n'en donne pas : particulier s'il y a une date de naissance.
export function typeParDefaut(d) {
  return d.type ?? (d.date_naissance && !d.siren && !d.siret ? "particulier" : "entreprise");
}

// ---------- Doublons : index des candidats, puis règles exactes de detecterDoublons ----------

function creerIndex() {
  return { email: new Map(), siren: new Map(), tel: new Map(), nom: new Map(), mot: new Map() };
}

function pousser(m, cle, c) {
  if (!cle) return;
  if (!m.has(cle)) m.set(cle, []);
  m.get(cle).push(c);
}

function indexer(index, c) {
  pousser(index.email, normaliser(c.email), c);
  pousser(index.siren, chiffresSeuls(c.siren), c);
  pousser(index.tel, chiffresSeuls(c.telephone), c);
  pousser(index.nom, normaliser(c.nom), c);
  for (const m of new Set(motsSignificatifs(c.nom))) pousser(index.mot, m, c);
}

// Meilleur doublon : règles complètes de detecterDoublons sur les candidats forts (e-mail, SIREN, téléphone,
// nom identique) ; à défaut, un client qui partage seulement un mot du nom donne toujours « Nom proche » (40) :
// le premier suffit, sans comparer la ligne à des centaines de noms voisins.
function meilleurDoublon(index, s) {
  const forts = new Set();
  const ajouter = (liste) => liste?.forEach((c) => forts.add(c));
  ajouter(index.email.get(normaliser(s.email)));
  ajouter(index.siren.get(chiffresSeuls(s.siren)));
  ajouter(index.tel.get(chiffresSeuls(s.telephone)));
  ajouter(index.nom.get(normaliser(s.nom)));
  const trouve = detecterDoublons(s, [...forts])[0];
  if (trouve) return trouve;
  for (const m of motsSignificatifs(s.nom)) {
    const c = index.mot.get(m)?.[0];
    if (c) return { client: c, confiance: 40, motif: "Nom proche" };
  }
  return null;
}

// Actions possibles et action par défaut selon l'origine et la confiance du doublon :
// 100 et 90-99 → Ignorer ; 70 et 40 → Créer, avec un avertissement ; Créer impossible à 100.
export function actionsDoublon(source, confiance) {
  if (source === "base") {
    if (confiance >= 100) return ["ignorer", "mettre_a_jour"];
    if (confiance >= 90) return ["ignorer", "mettre_a_jour", "creer"];
    return ["creer", "mettre_a_jour", "ignorer"];
  }
  if (confiance >= 100) return ["ignorer"];
  if (confiance >= 90) return ["ignorer", "creer"];
  return ["creer", "ignorer"];
}

// Champs du fichier comparés au client existant : aucune case vide n'écrase une valeur, les tags s'ajoutent.
export function differencesClient(existant, donnees) {
  const differences = [];
  const patch = {};
  for (const [cle, nouvelle] of Object.entries(donnees)) {
    if (cle === "tags") {
      const avant = existant.tags ?? [];
      const union = [...avant, ...nouvelle.filter((t) => !avant.includes(t))];
      if (union.length > avant.length) {
        patch.tags = union;
        differences.push({ cle, libelle: LIBELLE.tags, ancienne: avant.join(", "), nouvelle: union.join(", ") });
      }
      continue;
    }
    const ancienne = existant[cle] ?? "";
    const egal = cle === "email"
      ? normaliser(ancienne) === normaliser(nouvelle)
      : nettoyer(ancienne) === nettoyer(nouvelle);
    if (!egal) {
      patch[cle] = nouvelle;
      differences.push({ cle, libelle: LIBELLE[cle], ancienne: nettoyer(ancienne), nouvelle: nettoyer(nouvelle) });
    }
  }
  return { differences, patch };
}

// Analyse de toutes les lignes : catégorie (vide, total, erreur, nouvelle, doublon), données, doublon, actions.
export function analyserClients(tableau, correspondance, existants) {
  const indexBase = creerIndex();
  (existants ?? []).forEach((c) => indexer(indexBase, c));
  const indexFichier = creerIndex();

  return tableau.lignes.map((ligne) => {
    const base = { numero: ligne.numero, valeurs: ligne.valeurs, erreurs: [], avertissements: [], doublon: null, actions: [], action: null };
    if (ligne.vide) return { ...base, categorie: "vide" };
    const { brut, avertissements: avRegroupement } = regrouper(ligne, correspondance, CHAMPS_CLIENTS, tableau.entetes);
    if (estLigneTotal(ligne, brut, "nom")) return { ...base, categorie: "total" };
    const { donnees, erreurs, avertissements } = convertirClient(brut);
    const av = [...avRegroupement, ...avertissements];
    if (erreurs.length > 0) return { ...base, categorie: "erreur", donnees, erreurs, avertissements: av };

    const saisie = { ...donnees, type: typeParDefaut(donnees) };
    const dBase = meilleurDoublon(indexBase, saisie);
    const dFichier = meilleurDoublon(indexFichier, saisie);
    indexer(indexFichier, { ...saisie, id: `ligne-${ligne.numero}`, numero: ligne.numero });

    const creation = { ...donnees, type: saisie.type };
    let doublon = null;
    if (dBase && (!dFichier || dBase.confiance >= dFichier.confiance)) {
      doublon = { source: "base", confiance: dBase.confiance, motif: dBase.motif, client: dBase.client };
    } else if (dFichier) {
      doublon = { source: "fichier", confiance: dFichier.confiance, motif: dFichier.motif, ligne: dFichier.client.numero };
    }
    if (!doublon) return { ...base, categorie: "nouvelle", donnees: creation, avertissements: av, actions: ["creer"], action: "creer" };

    const actions = actionsDoublon(doublon.source, doublon.confiance);
    const { differences, patch } = doublon.source === "base" ? differencesClient(doublon.client, donnees) : { differences: [], patch: {} };
    if (doublon.confiance < 90) {
      const cible = doublon.source === "base" ? `« ${doublon.client.nom} »` : `la ligne ${doublon.ligne}`;
      av.push(`Doublon possible de ${cible} (${doublon.motif.toLowerCase()}) : vérifiez avant de créer`);
    }
    return { ...base, categorie: "doublon", donnees: creation, avertissements: av, doublon, actions, action: actions[0], differences, patch };
  });
}
