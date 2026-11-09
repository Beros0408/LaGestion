// Import CSV/XLSX des clients (FR-003, AC-02) : lecture, en-tête, conversions, doublons, rapport, 1 000 lignes,
// neutralisation des formules dans le fichier d'erreurs et dans les exports de utils/excel.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";
import {
  LIMITE_LIGNES, TAILLE_LOT, compterRapport, decoderTexte, detecterEntete, detecterSeparateur, executerImport,
  issuesFinales, lignesFichierErreurs, lireCsv, neutraliserFormule, parserCsv, parserDate, parserMontant, planifier,
  preparerTableau, proposerCorrespondance,
} from "../src/utils/import.js";
import { CHAMPS_CLIENTS, actionsDoublon, analyserClients, convertirClient, differencesClient } from "../src/utils/importClients.js";
import { ErreurLecture, lireFichier } from "../src/utils/lectureFichier.js";
import { detecterDoublons } from "../src/utils/doublons.js";
import { exporterClientsExcel, exporterErreursImport, exporterFacturesExcel } from "../src/utils/excel.js";
import { milleClients } from "../scripts/genererExemplesImport.mjs";

XLSX.set_fs(fs);
const EXEMPLES = path.join(import.meta.dirname, "..", "docs", "exemples-import");
const lire = (nom) => { const b = fs.readFileSync(path.join(EXEMPLES, nom)); return lireFichier(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), nom); };

// Les 15 clients de la démo, lus dans supabase/seed.sql : les fichiers d'exemple sont testés contre eux.
const SEED = fs.readFileSync(path.join(import.meta.dirname, "..", "supabase", "seed.sql"), "utf8");
const sql = (s) => (s === "null" ? null : s.slice(1, -1).replace(/''/g, "'"));
const DEMO = [...SEED.matchAll(/\('(entreprise|particulier)',\s*('(?:[^']|'')*'),\s*(null|'[^']*'),\s*('[^']*'),\s*('[^']*'),\s*('(?:[^']|'')*'),\s*('[^']*')/g)]
  .map((m, i) => ({ id: `d${i + 1}`, type: m[1], nom: sql(m[2]), secteur: sql(m[3]), email: sql(m[4]), telephone: sql(m[5]), adresse: sql(m[6]),
    statut: sql(m[7]), tags: ["démo"], notes: null }));

test("démo : 15 clients lus dans seed.sql", () => {
  assert.equal(DEMO.length, 15);
  assert.equal(DEMO[0].nom, "Bâtiments Rénov'Est");
});

function analyser(brut, existants = DEMO) {
  const e = detecterEntete(brut.lignes, CHAMPS_CLIENTS);
  const tableau = preparerTableau(brut, e.index);
  const correspondance = proposerCorrespondance(tableau.entetes, CHAMPS_CLIENTS);
  return { e, tableau, correspondance, lignes: analyserClients(tableau, correspondance, existants) };
}

// Base simulée : insertion par lots, unicité de l'e-mail comme l'index uniq_clients_email.
function baseSimulee(existants = []) {
  const clients = [...existants];
  const lots = [];
  return {
    clients, lots,
    acces: {
      inserer: async (lignes) => {
        lots.push(lignes.length);
        const emails = new Set(clients.map((c) => c.email?.toLowerCase()));
        if (lignes.some((l) => l.email && emails.has(l.email.toLowerCase()))) return { error: "Cet élément existe déjà (même e-mail, SIREN ou numéro)." };
        lignes.forEach((l, i) => clients.push({ ...l, id: `n${clients.length + i}` }));
        return { error: null };
      },
      mettreAJour: async (id, patch) => {
        const c = clients.find((x) => x.id === id);
        if (!c) return { error: null, n: 0 };
        Object.assign(c, patch);
        return { error: null, n: 1 };
      },
    },
  };
}

async function importer(lignes, base) {
  const plan = planifier(lignes);
  const resultats = await executerImport(plan, base.acces);
  const issues = issuesFinales(lignes, plan, resultats);
  return { issues, rapport: compterRapport(issues) };
}

// ---------- Lecture ----------

test("CSV : guillemets, guillemets doublés, séparateur et retour à la ligne dans un champ", () => {
  const l = parserCsv('Nom;Note\r\n"Dupont; fils";"Il dit ""oui""\npuis part"\r\nMartin;\r\n', ";");
  assert.deepEqual(l, [["Nom", "Note"], ["Dupont; fils", 'Il dit "oui"\npuis part'], ["Martin", ""]]);
});

test("CSV : séparateur détecté hors guillemets, « ; » par défaut", () => {
  assert.equal(detecterSeparateur("a;b;c\n1;2;3"), ";");
  assert.equal(detecterSeparateur('a,b,c\n"1;2",3,4'), ",");
  assert.equal(detecterSeparateur("a\tb\n1\t2"), "\t");
  assert.equal(detecterSeparateur("seul"), ";");
});

test("CSV : UTF-8 (BOM retiré), sinon Windows-1252", () => {
  const utf8 = decoderTexte(new Uint8Array([0xef, 0xbb, 0xbf, ...Buffer.from("Société", "utf8")]));
  assert.deepEqual(utf8, { texte: "Société", encodage: "UTF-8" });
  const ansi = decoderTexte(new Uint8Array(Buffer.from("Société", "latin1")));
  assert.deepEqual(ansi, { texte: "Société", encodage: "Windows-1252" });
});

test("dates jj/mm/aaaa et montants français", () => {
  assert.equal(parserDate("03/09/1979"), "1979-09-03");
  assert.equal(parserDate("3-9-1979"), "1979-09-03");
  assert.equal(parserDate("1979-09-03"), "1979-09-03");
  assert.equal(parserDate("31/02/2020"), null);
  assert.equal(parserDate("09/1979"), null);
  assert.equal(parserMontant("1 234,56 €"), 1234.56);
  assert.equal(parserMontant("1 234,5"), 1234.5);
  assert.equal(parserMontant("1,234.56"), 1234.56);
  assert.equal(parserMontant(12.5), 12.5);
  assert.equal(parserMontant("douze"), null);
});

test("limites : plus de 5 000 lignes refusées avec un message clair ; format inconnu refusé", () => {
  const lignes = ["Nom", ...Array.from({ length: LIMITE_LIGNES + 1 }, (_, i) => `Client ${i}`)].join("\n");
  const octets = new TextEncoder().encode(lignes).buffer;
  assert.throws(() => lireFichier(octets, "gros.csv"), (e) => e instanceof ErreurLecture && /au plus 5\s000 lignes/.test(e.message));
  const juste = new TextEncoder().encode(["Nom", ...Array.from({ length: LIMITE_LIGNES }, (_, i) => `C${i}`)].join("\n")).buffer;
  assert.equal(lireFichier(juste, "juste.csv").lignes.length, LIMITE_LIGNES + 1);
  assert.throws(() => lireFichier(octets, "fichier.pdf"), /Format non pris en charge/);
});

// ---------- Fichiers d'exemple ----------

test("clients_sale.xlsx : en-tête décalé, fusions, vides, total, erreurs et doublons classés", () => {
  const brut = lire("clients_sale.xlsx");
  assert.equal(brut.feuille, "Clients");
  assert.deepEqual(brut.feuilles, ["Clients", "Notes"]);
  const { e, tableau, correspondance, lignes } = analyser(brut);
  assert.deepEqual(e, { index: 4, certaine: true });
  assert.deepEqual(correspondance, ["nom", "type", "siren", "email", "telephone", "adresse", "adresse", "adresse", "secteur", "statut", "notes"]);
  assert.equal(tableau.lignes[0].numero, 6);
  assert.equal(lignes.length, 14);
  const par = Object.fromEntries(lignes.map((l) => [l.numero, l]));

  // Ligne 6 : téléphone et code postal lus comme des nombres, secteur hors liste gardé, « Client » → actif.
  assert.equal(par[6].categorie, "nouvelle");
  assert.equal(par[6].donnees.telephone, "0388123456");
  assert.equal(par[6].donnees.adresse, "4 rue des Artisans, 67000 Strasbourg");
  assert.equal(par[6].donnees.secteur, "Plomberie");
  assert.equal(par[6].donnees.statut, "actif");
  assert.ok(par[6].avertissements.some((a) => a.startsWith("Secteur hors liste")));
  assert.equal(par[7].donnees.type, "entreprise");
  assert.equal(par[8].categorie, "vide");
  assert.match(par[9].erreurs[0], /SIREN invalide « 12345678 »/);
  // Secteur fusionné sur les lignes 9 à 11 : recopié et signalé.
  assert.equal(par[10].donnees.secteur, "Conseil");
  assert.ok(par[10].avertissements.includes("Secteur : valeur reprise d'une cellule fusionnée"));
  assert.equal(par[11].donnees.adresse, "11 avenue Jean-Médecin, 06000 Nice");
  assert.match(par[12].erreurs[0], /E-mail invalide/);
  // Doublons : e-mail de la démo (100), nom proche (40), même e-mail plus haut dans le fichier (100), téléphone (95).
  assert.deepEqual([par[13].doublon.source, par[13].doublon.confiance, par[13].action, par[13].actions], ["base", 100, "ignorer", ["ignorer", "mettre_a_jour"]]);
  assert.deepEqual([par[14].doublon.confiance, par[14].action], [40, "creer"]);
  assert.ok(par[14].avertissements.some((a) => a.startsWith("Doublon possible de « Hôtel des Remparts »")));
  assert.deepEqual([par[15].doublon.source, par[15].doublon.ligne, par[15].actions], ["fichier", 6, ["ignorer"]]);
  assert.deepEqual([par[16].doublon.confiance, par[16].doublon.motif, par[16].action], [95, "Même téléphone", "ignorer"]);
  assert.match(par[17].erreurs[0], /Statut inconnu « VIP »/);
  assert.equal(par[18].categorie, "vide");
  assert.equal(par[19].categorie, "total");
});

test("clients_sale.xlsx : somme des compteurs du rapport = lignes lues ; fichier d'erreurs fidèle au fichier importé", async () => {
  const brut = lire("clients_sale.xlsx");
  const { tableau, lignes } = analyser(brut);
  const { issues, rapport } = await importer(lignes, baseSimulee(DEMO));
  assert.deepEqual(rapport, { lues: 14, importees: 5, misesAJour: 0, ignoreesDoublon: 3, dejaAJour: 0, vides: 2, totaux: 1, erreurs: 3, ignorees: 6 });
  assert.equal(rapport.importees + rapport.misesAJour + rapport.ignorees + rapport.erreurs, rapport.lues);

  const fichier = lignesFichierErreurs(tableau.entetes, issues);
  assert.deepEqual(fichier[0], ["Ligne", "Raison sociale", "Type", "N° SIREN", "E-mail", "Tél.", "Adresse", "Code postal", "Ville", "Secteur d'activité", "Statut", "Remarques", "Motif"]);
  assert.deepEqual(fichier.slice(1).map((l) => l[0]), [9, 12, 17]);
  const fantome = fichier.find((l) => l[0] === 17);
  assert.equal(fantome[11], "=1+1");
  assert.match(fantome[12], /Statut inconnu/);
});

test("mise à jour : ancienne et nouvelle valeur par champ, aucune case vide n'écrase, tags ajoutés", async () => {
  const { lignes } = analyser(lire("clients_sale.xlsx"));
  const renov = lignes.find((l) => l.numero === 13);
  assert.deepEqual(renov.differences.map((d) => [d.libelle, d.ancienne, d.nouvelle]), [
    ["Téléphone", "03 88 41 27 65", "03 88 41 27 99"],
    ["Informations internes", "", "Nouveau contact : M. Weber"],
  ]);
  const base = baseSimulee(DEMO.map((c) => ({ ...c })));
  const choisies = lignes.map((l) => (l.numero === 13 ? { ...l, action: "mettre_a_jour" } : l));
  const { rapport } = await importer(choisies, base);
  assert.equal(rapport.misesAJour, 1);
  const apres = base.clients.find((c) => c.id === "d1");
  assert.equal(apres.telephone, "03 88 41 27 99");
  assert.equal(apres.adresse, "12 rue du Faubourg, 67000 Strasbourg");

  const { patch } = differencesClient({ nom: "A", email: "a@x.example", tags: ["démo", "vip"], siret: "123" }, { nom: "A", email: "A@X.example", tags: ["vip", "import"] });
  assert.deepEqual(patch, { tags: ["démo", "vip", "import"] });
  const vide = differencesClient({ nom: "A", tags: [] }, { nom: "A" });
  assert.deepEqual(vide.differences, []);
});

test("actions des doublons : 100 et 90-99 → Ignorer ; 70 et 40 → Créer ; Créer impossible à 100", () => {
  assert.deepEqual(actionsDoublon("base", 100), ["ignorer", "mettre_a_jour"]);
  assert.deepEqual(actionsDoublon("base", 95), ["ignorer", "mettre_a_jour", "creer"]);
  assert.deepEqual(actionsDoublon("base", 90), ["ignorer", "mettre_a_jour", "creer"]);
  assert.deepEqual(actionsDoublon("base", 70), ["creer", "mettre_a_jour", "ignorer"]);
  assert.deepEqual(actionsDoublon("base", 40), ["creer", "mettre_a_jour", "ignorer"]);
  assert.deepEqual(actionsDoublon("fichier", 100), ["ignorer"]);
  assert.deepEqual(actionsDoublon("fichier", 70), ["creer", "ignorer"]);
});

test("clients_windows1252.csv : encodage, séparateur « , », guillemets et accents", () => {
  const brut = lire("clients_windows1252.csv");
  assert.deepEqual([brut.encodage, brut.separateur], ["Windows-1252", ","]);
  const { lignes } = analyser(brut, []);
  assert.equal(lignes.length, 5);
  assert.ok(lignes.every((l) => l.categorie === "nouvelle"));
  assert.equal(lignes[0].donnees.adresse, "12, rue Esquermoise, 59000 Lille");
  assert.equal(lignes[1].donnees.nom, "Crèche Petits Écureuils");
  assert.equal(lignes[2].donnees.adresse, "Lieu-dit « La Côte », 87000 Limoges");
});

test("clients_propre.csv : 20 clients à créer, dates de naissance converties, aucune erreur", () => {
  const brut = lire("clients_propre.csv");
  assert.equal(brut.encodage, "UTF-8");
  const { lignes } = analyser(brut);
  assert.equal(lignes.length, 20);
  assert.ok(lignes.every((l) => l.categorie === "nouvelle" && l.avertissements.length === 0), JSON.stringify(lignes.filter((l) => l.categorie !== "nouvelle")));
  const amelie = lignes.find((l) => l.donnees.nom === "Amélie Faure");
  assert.deepEqual([amelie.donnees.type, amelie.donnees.date_naissance], ["particulier", "1986-02-14"]);
  assert.equal(lignes[0].donnees.siren, "443061841");
  assert.deepEqual(lignes[0].donnees.tags, ["artisan", "fidèle"]);
});

test("conversion : type, statut, SIRET, TVA et date refusés avec un motif", () => {
  const r = convertirClient({ nom: "X", type: "Coopérative", statut: "Peut-être", siret: "123", tva_intra: "12", date_naissance: "32/01/2000" });
  assert.equal(r.erreurs.length, 5);
  assert.deepEqual(convertirClient({}).erreurs, ["Nom manquant"]);
});

// ---------- Exécution ----------

test("1 000 lignes : insertion par lots de 200, puis réimport sans aucune création en double", async () => {
  const debut = performance.now();
  const brut = lireCsv(new TextEncoder().encode(milleClients()));
  const { lignes } = analyser(brut, []);
  const base = baseSimulee();
  const premier = await importer(lignes, base);
  const duree = performance.now() - debut;
  assert.equal(premier.rapport.importees, 1000);
  assert.deepEqual(base.lots, Array(1000 / TAILLE_LOT).fill(TAILLE_LOT));
  assert.equal(base.clients.length, 1000);
  assert.ok(duree < 5000, `analyse et import simulé en ${Math.round(duree)} ms`);

  const second = analyser(lireCsv(new TextEncoder().encode(milleClients())), base.clients);
  const reimport = await importer(second.lignes, base);
  assert.deepEqual([reimport.rapport.importees, reimport.rapport.ignoreesDoublon, reimport.rapport.lues], [0, 1000, 1000]);
  assert.equal(base.clients.length, 1000);
});

test("doublons indexés : même confiance que detecterDoublons sur toute la démo", () => {
  const { lignes } = analyser(lire("clients_sale.xlsx"));
  for (const l of lignes.filter((x) => x.categorie === "nouvelle" || x.categorie === "doublon")) {
    const complet = detecterDoublons(l.donnees, DEMO)[0]?.confiance ?? null;
    const indexe = l.doublon?.source === "base" ? l.doublon.confiance : null;
    if (l.doublon?.source !== "fichier") assert.equal(indexe, complet, `ligne ${l.numero}`);
  }
});

test("5 000 lignes : analyse en moins de 3 secondes (aucun coût quadratique)", () => {
  const texte = milleClients(LIMITE_LIGNES);
  const debut = performance.now();
  const { lignes } = analyser(lireCsv(new TextEncoder().encode(texte)), DEMO);
  const duree = performance.now() - debut;
  assert.equal(lignes.length, LIMITE_LIGNES);
  assert.ok(duree < 3000, `${Math.round(duree)} ms`);
});

test("lot refusé : rejoué ligne par ligne, seule la ligne fautive est en erreur", async () => {
  const base = baseSimulee([{ id: "x", nom: "Existant", email: "pris@x.example" }]);
  const creations = [1, 2, 3].map((n) => ({ numero: n, donnees: { nom: `C${n}`, email: n === 2 ? "pris@x.example" : `c${n}@x.example` } }));
  const r = await executerImport({ creations, majs: [] }, base.acces);
  assert.deepEqual(r.map((x) => x.issue), ["importee", "erreur", "importee"]);
  assert.match(r[1].motif, /existe déjà/);
});

test("connexion coupée : chaque ligne reçoit une issue, aucune perte silencieuse", async () => {
  const acces = { inserer: async () => { throw new Error("réseau"); }, mettreAJour: async () => { throw new Error("réseau"); } };
  const r = await executerImport({ creations: [{ numero: 1, donnees: {} }], majs: [{ numero: 2, id: "a", patch: { nom: "B" } }] }, acces);
  assert.deepEqual(r.map((x) => [x.numero, x.issue]), [[1, "erreur"], [2, "erreur"]]);
});

// ---------- Injection de formules ----------

test("neutralisation : =, +, -, @, tabulation, retour chariot ; nombres et texte ordinaire intacts", () => {
  for (const v of ["=1+1", "+33 6 12", "-2", "@SOMME(A1)", "\tx", "\rx"]) assert.equal(neutraliserFormule(v), `'${v}`);
  for (const v of ["Dupont", "", " =espace devant", -2, 12.5, null]) assert.equal(neutraliserFormule(v), v);
});

test("exports Excel (clients, factures, erreurs) : textes en cellules texte, aucune formule, sans apostrophe ; nombres et dates inchangés", () => {
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), "lg-export-"));
  const ici = process.cwd();
  process.chdir(dossier);
  try {
    exporterClientsExcel([{ nom: "=HYPERLINK(\"http://x.example\")", type: "entreprise", email: "@evil", telephone: "+33 6 12 34 56 78",
      adresse: "-1", statut: "actif", tags: ["=cmd"], score: 40 }]);
    exporterFacturesExcel(
      [{ numero: "FAC-2026-0001", type: "facture", client_id: "c", statut: "finalisee", date_emission: "2026-10-01", date_echeance: "2099-10-31",
         lignes: [{ quantite: 1, prix_unitaire: 100, taux_tva: 20 }], paiements: [], avoirs: [] }],
      [{ id: "c", nom: "+Client" }]);
    exporterErreursImport([["Ligne", "Nom", "Motif"], [3, "=1+1", "Nom manquant"]], "erreurs.xlsx");

    const feuille = (f) => { const wb = XLSX.readFile(f, { cellDates: true, cellFormula: true }); return wb.Sheets[wb.SheetNames[0]]; };
    // Aucune cellule ne porte de formule ; tout texte est de type « s ».
    const sansFormule = (ws) => {
      for (const [ref, cell] of Object.entries(ws)) {
        if (ref[0] === "!") continue;
        assert.equal(cell.f, undefined, `formule en ${ref}`);
        if (typeof cell.v === "string") assert.equal(cell.t, "s", `type de ${ref}`);
      }
    };
    const c = feuille("clients.xlsx");
    sansFormule(c);
    assert.deepEqual(["A2", "C2", "D2", "E2", "G2"].map((r) => c[r].v), ["=HYPERLINK(\"http://x.example\")", "@evil", "+33 6 12 34 56 78", "-1", "=cmd"]);
    assert.equal(c.H2.t, "n");
    const f = feuille("factures.xlsx");
    sansFormule(f);
    assert.equal(f.D2.v, "+Client");
    assert.equal(f.J2.v, 120);
    assert.ok(f.E2.v instanceof Date);
    const e = feuille("erreurs.xlsx");
    sansFormule(e);
    assert.equal(e.B2.v, "=1+1");
    assert.equal(e.A2.v, 3);
  } finally {
    process.chdir(ici);
    fs.rmSync(dossier, { recursive: true, force: true });
  }
});
