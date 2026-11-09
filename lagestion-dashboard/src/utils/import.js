// Import CSV/XLSX (FR-003, AC-02) : fonctions pures, communes aux clients et aux articles.
// La lecture du classeur (xlsx) se fait dans un Web Worker (lectureFichier.worker.js) ; ici, aucune dépendance.

export const LIMITE_OCTETS = 10 * 1024 * 1024;
export const LIMITE_LIGNES = 5000;
export const DELAI_LECTURE_MS = 20000;
export const TAILLE_LOT = 200;
export const MAJ_SIMULTANEES = 5;
const LIGNES_EXAMINEES = 20;

const DIACRITIQUES = new RegExp("[\\u0300-\\u036f]", "g");

// Texte d'une cellule : espaces insécables et blancs multiples ramenés à une espace, bords retirés.
export function nettoyer(v) {
  if (v === null || v === undefined) return "";
  return String(v).replace(/[  \t\r\n]+/g, " ").replace(/ {2,}/g, " ").trim();
}

export function normaliser(v) {
  return nettoyer(v).toLowerCase().normalize("NFD").replace(DIACRITIQUES, "");
}

// En-tête comparable : sans accents, ponctuation ni préfixe « n° / numéro ».
export function normaliserEntete(v) {
  return normaliser(v)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(n|no|num|numero) /, "");
}

export function estVide(v) {
  return nettoyer(v) === "";
}

// ---------- Lecture du texte (CSV) ----------

// UTF-8 strict, sinon Windows-1252 ; BOM retiré.
export function decoderTexte(octets) {
  let texte;
  let encodage = "UTF-8";
  try {
    texte = new TextDecoder("utf-8", { fatal: true }).decode(octets);
  } catch {
    texte = new TextDecoder("windows-1252").decode(octets);
    encodage = "Windows-1252";
  }
  if (texte.charCodeAt(0) === 0xfeff) texte = texte.slice(1);
  return { texte, encodage };
}

// Séparateur le plus fréquent hors guillemets sur les premières lignes non vides : « ; », « , » ou tabulation.
export function detecterSeparateur(texte) {
  const lignes = texte.split(/\r?\n/).filter((l) => l.trim() !== "").slice(0, 10);
  const compte = { ";": 0, ",": 0, "\t": 0 };
  for (const l of lignes) {
    let dansGuillemets = false;
    for (const ch of l) {
      if (ch === '"') dansGuillemets = !dansGuillemets;
      else if (!dansGuillemets && ch in compte) compte[ch]++;
    }
  }
  if (compte[";"] === 0 && compte[","] === 0 && compte["\t"] === 0) return ";";
  return Object.entries(compte).sort((a, b) => b[1] - a[1])[0][0];
}

// CSV (RFC 4180) : champs entre guillemets, guillemets doublés, retours à la ligne dans un champ.
export function parserCsv(texte, separateur) {
  const lignes = [];
  let ligne = [];
  let champ = "";
  let guillemets = false;
  for (let i = 0; i < texte.length; i++) {
    const ch = texte[i];
    if (guillemets) {
      if (ch === '"') {
        if (texte[i + 1] === '"') { champ += '"'; i++; } else guillemets = false;
      } else champ += ch;
    } else if (ch === '"' && champ === "") guillemets = true;
    else if (ch === separateur) { ligne.push(champ); champ = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && texte[i + 1] === "\n") i++;
      ligne.push(champ); lignes.push(ligne); ligne = []; champ = "";
    } else champ += ch;
  }
  if (champ !== "" || ligne.length > 0) { ligne.push(champ); lignes.push(ligne); }
  return lignes;
}

// Résultat de lecture d'un CSV, même forme que celle d'un classeur (lectureFichier.js).
export function lireCsv(octets) {
  const { texte, encodage } = decoderTexte(octets);
  const separateur = detecterSeparateur(texte);
  return {
    format: "CSV",
    encodage,
    separateur,
    feuilles: [],
    feuille: null,
    lignes: parserCsv(texte, separateur),
    fusions: [],
    ligneDebut: 0,
    colonneDebut: 0,
  };
}

// ---------- Tableau : en-tête, fusions, lignes de données ----------

// Lettre de colonne Excel (0 → A, 27 → AB).
export function lettreColonne(index) {
  let s = "";
  let n = index + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Index de la ligne d'en-tête : celle qui reconnaît le plus de champs (au moins 2) parmi les 20 premières ;
// à défaut, la première ligne non vide (incertaine : l'utilisateur la corrige).
export function detecterEntete(lignes, champs) {
  const index = indexSynonymes(champs);
  let meilleure = { i: -1, score: 0 };
  const max = Math.min(lignes.length, LIGNES_EXAMINEES);
  for (let i = 0; i < max; i++) {
    const reconnus = new Set();
    for (const v of lignes[i] ?? []) {
      const cle = index.get(normaliserEntete(v));
      if (cle) reconnus.add(cle);
    }
    if (reconnus.size > meilleure.score) meilleure = { i, score: reconnus.size };
  }
  if (meilleure.score >= 2) return { index: meilleure.i, certaine: true };
  const premiere = lignes.findIndex((l) => (l ?? []).some((v) => !estVide(v)));
  return { index: Math.max(0, premiere), certaine: false };
}

function indexSynonymes(champs) {
  const m = new Map();
  for (const c of champs) for (const s of c.synonymes) m.set(normaliserEntete(s), c.cle);
  return m;
}

// Lignes de données sous l'en-tête. Fusions verticales ou horizontales dans les données : la valeur de la
// cellule en haut à gauche est recopiée, et la cellule est marquée. Lignes vides finales retirées.
export function preparerTableau(brut, indexEntete) {
  const lignes = brut.lignes.map((l) => [...(l ?? [])]);
  const fusionnees = new Map();
  for (const f of brut.fusions ?? []) {
    if (f.s.r <= indexEntete) continue;
    const valeur = lignes[f.s.r]?.[f.s.c];
    for (let r = f.s.r; r <= f.e.r; r++) {
      if (!lignes[r]) lignes[r] = [];
      for (let c = f.s.c; c <= f.e.c; c++) {
        if (r === f.s.r && c === f.s.c) continue;
        lignes[r][c] = valeur;
        if (!fusionnees.has(r)) fusionnees.set(r, new Set());
        fusionnees.get(r).add(c);
      }
    }
  }
  const enteteBrute = lignes[indexEntete] ?? [];
  const largeur = Math.max(0, ...lignes.slice(indexEntete).map((l) => l.length));
  const entetes = Array.from({ length: largeur }, (_, c) => {
    const libelle = nettoyer(enteteBrute[c]);
    return { index: c, libelle: libelle || `Colonne ${lettreColonne(c + (brut.colonneDebut ?? 0))}`, vide: !libelle };
  });
  let donnees = lignes.slice(indexEntete + 1).map((valeurs, k) => {
    const r = indexEntete + 1 + k;
    return {
      numero: r + 1 + (brut.ligneDebut ?? 0),
      valeurs: Array.from({ length: largeur }, (_, c) => valeurs?.[c] ?? null),
      fusionnees: fusionnees.get(r) ?? new Set(),
    };
  });
  while (donnees.length > 0 && donnees[donnees.length - 1].valeurs.every(estVide)) donnees.pop();
  donnees = donnees.map((l) => ({ ...l, vide: l.valeurs.every(estVide) }));
  return { entetes, lignes: donnees };
}

// Correspondance proposée : un champ par colonne (« » = ne pas importer). Un champ simple n'est pris qu'une fois ;
// un champ multiple (nom, adresse) peut recevoir plusieurs colonnes, réunies dans l'ordre du fichier.
export function proposerCorrespondance(entetes, champs) {
  const index = indexSynonymes(champs);
  const parCle = new Map(champs.map((c) => [c.cle, c]));
  const pris = new Set();
  return entetes.map((e) => {
    if (e.vide) return "";
    const cle = index.get(normaliserEntete(e.libelle));
    if (!cle) return "";
    if (pris.has(cle) && !parCle.get(cle).multiple) return "";
    pris.add(cle);
    return cle;
  });
}

// Valeurs brutes d'une ligne regroupées par champ (colonnes multiples réunies par le séparateur du champ).
export function regrouper(ligne, correspondance, champs, entetes) {
  const parCle = new Map(champs.map((c) => [c.cle, c]));
  const brut = {};
  const avertissements = [];
  correspondance.forEach((cle, c) => {
    if (!cle) return;
    let v = ligne.valeurs[c];
    if (estVide(v)) return;
    const champ = parCle.get(cle);
    // Code postal lu comme un nombre par Excel : zéro initial rétabli (6000 → 06000).
    if (typeof v === "number" && /^(cp|code postal)$/.test(normaliserEntete(entetes?.[c]?.libelle)) && v >= 1000 && v < 10000) {
      v = String(v).padStart(5, "0");
      avertissements.push(`Code postal : zéro initial rétabli (${v})`);
    }
    if (ligne.fusionnees.has(c)) avertissements.push(`${champ.libelle} : valeur reprise d'une cellule fusionnée`);
    if (brut[cle] === undefined) brut[cle] = v;
    else {
      // Après un code postal (5 chiffres), la ville suit avec une espace : « 67000 Strasbourg ».
      const avant = nettoyer(brut[cle]);
      const sep = /(^|, )\d{5}$/.test(avant) ? " " : champ.separateur ?? " ";
      brut[cle] = `${avant}${sep}${nettoyer(v)}`;
    }
  });
  return { brut, avertissements };
}

// Ligne de total : première cellule non vide « Total », « Sous-total », « Totaux », « Somme »…,
// ou ligne sans valeur dans le champ principal dont toutes les cellules remplies sont des nombres.
export function estLigneTotal(ligne, brut, champPrincipal) {
  const premiere = ligne.valeurs.find((v) => !estVide(v));
  if (premiere !== undefined && /^(sous )?(total|totaux|somme|montant total)\b/.test(normaliserEntete(premiere))) return true;
  if (!estVide(brut[champPrincipal])) return false;
  const remplies = ligne.valeurs.filter((v) => !estVide(v));
  return remplies.length > 0 && remplies.every((v) => typeof v === "number" || /^-?[\d\s.,]+(\s?€)?$/.test(nettoyer(v)));
}

// ---------- Conversions ----------

// Date française jj/mm/aaaa (aussi jj-mm-aaaa, jj.mm.aaaa) ou ISO aaaa-mm-jj → « aaaa-mm-jj » ; null si invalide.
export function parserDate(v) {
  const s = nettoyer(v);
  let j, m, a;
  let r = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (r) [, j, m, a] = r;
  else if ((r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/))) [, a, m, j] = r;
  else return null;
  const d = new Date(Date.UTC(+a, +m - 1, +j));
  if (d.getUTCFullYear() !== +a || d.getUTCMonth() !== +m - 1 || d.getUTCDate() !== +j) return null;
  return `${a}-${String(m).padStart(2, "0")}-${String(j).padStart(2, "0")}`;
}

// Montant français (« 1 234,56 € », « 1234.5 », 1234.56) → nombre ; null si illisible.
export function parserMontant(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = nettoyer(v).replace(/\s|€|eur$/gi, "");
  if (s === "") return null;
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else s = s.replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

// ---------- Neutralisation des formules (exports et fichier d'erreurs) ----------

// Texte qui commence par =, +, -, @, tabulation ou retour chariot : apostrophe en tête, pour qu'aucun tableur
// ne l'interprète comme une formule. Les nombres ne sont pas touchés.
export function neutraliserFormule(v) {
  return typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
}

// ---------- Exécution : insertion par lots, mises à jour, compte rendu ----------

// creations : [{ numero, donnees }] ; majs : [{ numero, id, patch }].
// acces.inserer(lignes) → { error } (un lot entier, atomique) ; acces.mettreAJour(id, patch) → { error, n }.
// Un lot refusé est rejoué ligne par ligne pour isoler la ligne fautive. Chaque ligne reçoit un résultat.
export async function executerImport({ creations, majs }, acces, surProgression = () => {}) {
  const resultats = [];
  const total = creations.length + majs.length;
  let faits = 0;
  const avancer = (n) => { faits += n; surProgression(faits, total); };
  // Une exception (réseau coupé) devient une erreur de la ligne ou du lot : aucune ligne sans résultat.
  const sur = async (appel) => {
    try { return await appel(); } catch { return { error: "Connexion interrompue : ligne non enregistrée." }; }
  };

  for (let i = 0; i < creations.length; i += TAILLE_LOT) {
    const lot = creations.slice(i, i + TAILLE_LOT);
    const { error } = await sur(() => acces.inserer(lot.map((l) => l.donnees)));
    if (!error) {
      lot.forEach((l) => resultats.push({ numero: l.numero, issue: "importee" }));
    } else {
      for (const l of lot) {
        const r = await sur(() => acces.inserer([l.donnees]));
        resultats.push(r.error ? { numero: l.numero, issue: "erreur", motif: r.error } : { numero: l.numero, issue: "importee" });
      }
    }
    avancer(lot.length);
  }

  for (let i = 0; i < majs.length; i += MAJ_SIMULTANEES) {
    const groupe = majs.slice(i, i + MAJ_SIMULTANEES);
    const sorties = await Promise.all(groupe.map((m) => sur(() => acces.mettreAJour(m.id, m.patch))));
    groupe.forEach((m, k) => {
      const { error, n } = sorties[k];
      if (error) resultats.push({ numero: m.numero, issue: "erreur", motif: error });
      else if (n === 0) resultats.push({ numero: m.numero, issue: "erreur", motif: "Modification refusée (droits insuffisants ou client supprimé)." });
      else resultats.push({ numero: m.numero, issue: "mise_a_jour" });
    });
    avancer(groupe.length);
  }
  return resultats;
}

// Lignes analysées + actions choisies → créations, mises à jour, et issue immédiate des autres lignes.
// La cible d'une mise à jour est donnée par ligne.doublon[cleCible].id (le client ou l'article existant).
export function planifier(lignes, cleCible = "client") {
  const creations = [];
  const majs = [];
  const issues = new Map();
  for (const l of lignes) {
    if (l.categorie === "vide") issues.set(l.numero, { issue: "vide", motifs: ["Ligne vide"] });
    else if (l.categorie === "total") issues.set(l.numero, { issue: "total", motifs: ["Ligne de total"] });
    else if (l.categorie === "erreur") issues.set(l.numero, { issue: "erreur", motifs: l.erreurs });
    else if (l.action === "ignorer") issues.set(l.numero, { issue: "ignoree_doublon", motifs: [motifDoublon(l.doublon, cleCible)] });
    else if (l.action === "mettre_a_jour") {
      if (Object.keys(l.patch ?? {}).length === 0) issues.set(l.numero, { issue: "deja_a_jour", motifs: ["Déjà à jour : aucune valeur nouvelle"] });
      else majs.push({ numero: l.numero, id: l.doublon[cleCible].id, patch: l.patch });
    } else creations.push({ numero: l.numero, donnees: l.donnees });
  }
  return { creations, majs, issues };
}

export function motifDoublon(doublon, cleCible = "client") {
  if (!doublon) return "";
  const cible = doublon.source === "base" ? `« ${doublon[cleCible]?.nom ?? ""} »` : `la ligne ${doublon.ligne}`;
  return `Doublon de ${cible} (${doublon.motif.toLowerCase()})`;
}

// Issue finale de chaque ligne : issue immédiate (planifier) ou résultat de l'exécution.
export function issuesFinales(lignes, plan, resultats) {
  const parNumero = new Map(resultats.map((r) => [r.numero, r]));
  return lignes.map((l) => {
    const immediate = plan.issues.get(l.numero);
    if (immediate) return { ...l, ...immediate };
    const r = parNumero.get(l.numero);
    if (!r) return { ...l, issue: "erreur", motifs: ["Ligne non traitée (import interrompu)"] };
    return { ...l, issue: r.issue, motifs: r.motif ? [r.motif] : [] };
  });
}

// Compteurs du rapport ; leur somme est égale au nombre de lignes lues.
export function compterRapport(lignes) {
  const c = { lues: lignes.length, importees: 0, misesAJour: 0, ignoreesDoublon: 0, dejaAJour: 0, vides: 0, totaux: 0, erreurs: 0 };
  for (const l of lignes) {
    if (l.issue === "importee") c.importees++;
    else if (l.issue === "mise_a_jour") c.misesAJour++;
    else if (l.issue === "ignoree_doublon") c.ignoreesDoublon++;
    else if (l.issue === "deja_a_jour") c.dejaAJour++;
    else if (l.issue === "vide") c.vides++;
    else if (l.issue === "total") c.totaux++;
    else c.erreurs++;
  }
  c.ignorees = c.ignoreesDoublon + c.dejaAJour + c.vides + c.totaux;
  return c;
}

// Lignes du fichier d'erreurs : numéro de ligne, valeurs d'origine, motif ; formules neutralisées.
export function lignesFichierErreurs(entetes, lignes) {
  const tete = ["Ligne", ...entetes.map((e) => e.libelle), "Motif"];
  const corps = lignes
    .filter((l) => l.issue === "erreur")
    .map((l) => [l.numero, ...l.valeurs.map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v)), l.motifs.join(" ; ")]);
  return [tete, ...corps].map((r) => r.map(neutraliserFormule));
}
