// Import des articles du catalogue (FR-003, AC-02) : conversions (prix, TVA), doublons (référence, nom),
// fichiers d'exemple, rapport, 1 000 lignes et réimport.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  TAILLE_LOT, compterRapport, detecterEntete, executerImport, issuesFinales, lignesFichierErreurs, lireCsv, planifier,
  preparerTableau, proposerCorrespondance,
} from "../src/utils/import.js";
import {
  CHAMPS_ARTICLES, actionsDoublonArticle, analyserArticles, convertirArticle, differencesArticle, parserTaux,
} from "../src/utils/importArticles.js";
import { lireFichier } from "../src/utils/lectureFichier.js";
import { milleArticles } from "../scripts/genererExemplesImport.mjs";

const EXEMPLES = path.join(import.meta.dirname, "..", "docs", "exemples-import");
const lire = (nom) => { const b = fs.readFileSync(path.join(EXEMPLES, nom)); return lireFichier(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), nom); };

// Les 10 articles de la démo, lus dans supabase/seed.sql.
const SEED = fs.readFileSync(path.join(import.meta.dirname, "..", "supabase", "seed.sql"), "utf8");
const sql = (s) => s.replace(/''/g, "'");
const DEMO = [...SEED.matchAll(/\('(service|produit)', '(DEMO-ART-\d+)',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)',\s*'([^']*)',\s*([\d.]+),\s*([\d.]+),\s*(true|false)\)/g)]
  .map((m, i) => ({ id: `a${i + 1}`, type: m[1], reference: m[2], nom: sql(m[3]), description: sql(m[4]), unite: m[5],
    prix_unitaire_ht: Number(m[6]), taux_tva: Number(m[7]), actif: m[8] === "true" }));

test("démo : 10 articles lus dans seed.sql", () => {
  assert.equal(DEMO.length, 10);
  assert.deepEqual([DEMO[1].reference, DEMO[1].nom, DEMO[1].prix_unitaire_ht], ["DEMO-ART-02", "Rayonnages métalliques", 189]);
});

function analyser(brut, existants = DEMO) {
  const e = detecterEntete(brut.lignes, CHAMPS_ARTICLES);
  const tableau = preparerTableau(brut, e.index);
  const correspondance = proposerCorrespondance(tableau.entetes, CHAMPS_ARTICLES);
  return { e, tableau, correspondance, lignes: analyserArticles(tableau, correspondance, existants) };
}

// Base simulée : insertion par lots, unicité de la référence comme l'index uniq_produits_reference.
function baseSimulee(existants = []) {
  const produits = [...existants];
  const lots = [];
  return {
    produits, lots,
    acces: {
      inserer: async (lignes) => {
        lots.push(lignes.length);
        const refs = new Set(produits.map((p) => p.reference).filter(Boolean));
        if (lignes.some((l) => l.reference && refs.has(l.reference))) return { error: "Référence déjà utilisée par un autre article." };
        lignes.forEach((l, i) => produits.push({ ...l, id: `n${produits.length + i}` }));
        return { error: null };
      },
      mettreAJour: async (id, patch) => {
        const p = produits.find((x) => x.id === id);
        if (!p) return { error: null, n: 0 };
        Object.assign(p, patch);
        return { error: null, n: 1 };
      },
    },
  };
}

async function importer(lignes, base) {
  const plan = planifier(lignes, "produit");
  const resultats = await executerImport(plan, base.acces);
  const issues = issuesFinales(lignes, plan, resultats);
  return { issues, rapport: compterRapport(issues) };
}

// ---------- Conversions ----------

test("TVA : « 5,5 % », 5.5, « 0,055 », 0.055, 0,2 → taux en pourcentage", () => {
  for (const v of ["5,5 %", "5,5 %", "5.5", 5.5, "0,055", 0.055, "5,5%"]) assert.equal(parserTaux(v), 5.5, String(v));
  assert.equal(parserTaux("20 %"), 20);
  assert.equal(parserTaux(0.2), 20);
  assert.equal(parserTaux("0,1"), 10);
  assert.equal(parserTaux("0"), 0);
  assert.equal(parserTaux("vingt"), null);
  assert.equal(parserTaux("-5"), null);
});

test("conversion : prix « 1 234,50 € », TVA hors liste en erreur, prix manquant ou illisible en erreur", () => {
  const ok = convertirArticle({ nom: "Tableau", prix_unitaire_ht: "1 234,50 €", taux_tva: "5,5 %", type: "Prestation", actif: "Non" });
  assert.deepEqual(ok.erreurs, []);
  assert.deepEqual(ok.donnees, { nom: "Tableau", prix_unitaire_ht: 1234.5, taux_tva: 5.5, type: "service", actif: false });
  assert.match(convertirArticle({ nom: "X", prix_unitaire_ht: "10", taux_tva: "7 %" }).erreurs[0], /Taux de TVA hors liste « 7 % » : 20, 10, 5,5 ou 0 % attendu/);
  assert.match(convertirArticle({ nom: "X", prix_unitaire_ht: "10", taux_tva: "2,1 %" }).erreurs[0], /hors liste/);
  assert.deepEqual(convertirArticle({ nom: "X" }).erreurs, ["Prix HT manquant"]);
  assert.match(convertirArticle({ nom: "X", prix_unitaire_ht: "douze" }).erreurs[0], /Prix HT invalide/);
  assert.match(convertirArticle({ nom: "X", prix_unitaire_ht: "-3" }).erreurs[0], /Prix HT invalide/);
  assert.match(convertirArticle({ nom: "X", prix_unitaire_ht: "1", type: "Location" }).erreurs[0], /Type inconnu/);
  assert.match(convertirArticle({ nom: "X", prix_unitaire_ht: "1", actif: "peut-être" }).erreurs[0], /Actif/);
  const arrondi = convertirArticle({ nom: "X", prix_unitaire_ht: "12,345" });
  assert.equal(arrondi.donnees.prix_unitaire_ht, 12.35);
  assert.match(arrondi.avertissements[0], /arrondi au centime/);
});

test("doublons : référence = certain (100), nom normalisé = probable (90), références contradictoires = distincts", () => {
  const { lignes } = analyser(lireCsv(new TextEncoder().encode([
    "Référence;Désignation;Prix HT",
    "demo-art-02;Autre nom;10",        // référence, casse ignorée
    "ZZ-1;Éclairage LED;10",           // même nom, références différentes : pas un doublon
    ";ECLAIRAGE  led;10",              // nom sans accent ni casse, sans référence
    "DEMO-ART-08;Éclairage LED;10",    // même référence et même nom : 100
  ].join("\n"))));
  assert.deepEqual(lignes.map((l) => [l.doublon?.confiance ?? null, l.doublon?.motif ?? null, l.doublon?.produit?.reference ?? null]), [
    [100, "Même référence", "DEMO-ART-02"],
    [null, null, null],
    [90, "Même nom", "DEMO-ART-08"],
    [100, "Même référence", "DEMO-ART-08"],
  ]);
  assert.deepEqual(actionsDoublonArticle("base", 100), ["ignorer", "mettre_a_jour"]);
  assert.deepEqual(actionsDoublonArticle("base", 90), ["ignorer", "mettre_a_jour", "creer"]);
  assert.deepEqual(actionsDoublonArticle("fichier", 100), ["ignorer"]);
  assert.deepEqual(actionsDoublonArticle("fichier", 90), ["ignorer", "creer"]);
});

test("mise à jour : prix et TVA comparés en nombres, aucune case vide n'écrase, valeurs affichées en français", () => {
  const existant = DEMO[1];
  const { differences, patch } = differencesArticle(existant, { reference: "DEMO-ART-02", nom: "Rayonnages métalliques", prix_unitaire_ht: 195, taux_tva: 20 });
  assert.deepEqual(patch, { prix_unitaire_ht: 195 });
  assert.deepEqual(differences.map((d) => [d.libelle, d.ancienne, d.nouvelle]), [["Prix unitaire HT", "189,00 €", "195,00 €"]]);
  assert.deepEqual(differencesArticle(existant, { nom: "Rayonnages métalliques" }).differences, []);
});

// ---------- Fichiers d'exemple ----------

test("articles_propre.csv : 15 articles à créer, prix et taux convertis, aucune erreur", () => {
  const brut = lire("articles_propre.csv");
  const { lignes } = analyser(brut);
  assert.equal(lignes.length, 15);
  assert.ok(lignes.every((l) => l.categorie === "nouvelle" && l.avertissements.length === 0), JSON.stringify(lignes.filter((l) => l.categorie !== "nouvelle" || l.avertissements.length)));
  const tableau = lignes.find((l) => l.donnees.reference === "EL-030").donnees;
  assert.deepEqual([tableau.prix_unitaire_ht, tableau.taux_tva, tableau.type, tableau.actif], [1234.5, 20, "produit", true]);
  assert.equal(lignes.find((l) => l.donnees.reference === "IS-020").donnees.taux_tva, 5.5);
  assert.equal(lignes.find((l) => l.donnees.reference === "MA-060").donnees.actif, false);
});

test("articles_sale.xlsx : en-tête décalé, fusion, TVA texte / décimal / pourcentage, erreurs et doublons classés", () => {
  const brut = lire("articles_sale.xlsx");
  const { e, correspondance, lignes } = analyser(brut);
  assert.deepEqual(e, { index: 3, certaine: true });
  assert.deepEqual(correspondance, ["reference", "nom", "type", "unite", "prix_unitaire_ht", "taux_tva", "actif", ""]);
  assert.equal(lignes.length, 13);
  const par = Object.fromEntries(lignes.map((l) => [l.numero, l]));
  assert.deepEqual([par[5].donnees.prix_unitaire_ht, par[5].donnees.taux_tva], [1234.5, 5.5]);
  assert.deepEqual([par[6].donnees.unite, par[6].donnees.taux_tva, par[6].donnees.type], ["ml", 10, "service"]);
  assert.ok(par[6].avertissements.includes("Unité : valeur reprise d'une cellule fusionnée"));
  assert.equal(par[7].categorie, "vide");
  assert.equal(par[8].donnees.taux_tva, 5.5);
  assert.match(par[9].erreurs[0], /Taux de TVA hors liste « 7 % »/);
  assert.match(par[10].erreurs[0], /Prix HT invalide « douze »/);
  assert.deepEqual([par[11].doublon.source, par[11].doublon.confiance, par[11].action], ["base", 100, "ignorer"]);
  assert.deepEqual(par[11].differences.map((d) => d.cle), ["prix_unitaire_ht"]);
  assert.deepEqual([par[12].doublon.confiance, par[12].doublon.produit.reference, par[12].action], [90, "DEMO-ART-08", "ignorer"]);
  assert.deepEqual([par[13].doublon.source, par[13].doublon.ligne, par[13].actions], ["fichier", 5, ["ignorer"]]);
  assert.equal(par[14].categorie, "nouvelle");
  assert.match(par[15].erreurs[0], /Type inconnu « Location »/);
  assert.equal(par[16].categorie, "vide");
  assert.equal(par[17].categorie, "total");
});

test("articles_sale.xlsx : somme des compteurs = lignes lues ; fichier d'erreurs avec les valeurs d'origine", async () => {
  const { tableau, lignes } = analyser(lire("articles_sale.xlsx"));
  const { issues, rapport } = await importer(lignes, baseSimulee(DEMO));
  assert.deepEqual(rapport, { lues: 13, importees: 4, misesAJour: 0, ignoreesDoublon: 3, dejaAJour: 0, vides: 2, totaux: 1, erreurs: 3, ignorees: 6 });
  assert.equal(rapport.importees + rapport.misesAJour + rapport.ignorees + rapport.erreurs, rapport.lues);
  const fichier = lignesFichierErreurs(tableau.entetes, issues);
  assert.deepEqual(fichier.slice(1).map((l) => l[0]), [9, 10, 15]);
  assert.equal(fichier.find((l) => l[0] === 15)[8], "=1+1");
});

test("mise à jour de DEMO-ART-02 : seul le prix change", async () => {
  const { lignes } = analyser(lire("articles_sale.xlsx"));
  const base = baseSimulee(DEMO.map((a) => ({ ...a })));
  const choisies = lignes.map((l) => (l.numero === 11 ? { ...l, action: "mettre_a_jour" } : l));
  const { rapport } = await importer(choisies, base);
  assert.equal(rapport.misesAJour, 1);
  const apres = base.produits.find((p) => p.reference === "DEMO-ART-02");
  assert.deepEqual([apres.prix_unitaire_ht, apres.taux_tva, apres.description], [195, 20, DEMO[1].description]);
});

// ---------- 1 000 lignes ----------

test("1 000 articles : lots de 200, puis réimport sans aucune création en double", async () => {
  const debut = performance.now();
  const { lignes } = analyser(lireCsv(new TextEncoder().encode(milleArticles())));
  const base = baseSimulee(DEMO.map((a) => ({ ...a })));
  const premier = await importer(lignes, base);
  assert.ok(performance.now() - debut < 5000);
  assert.equal(premier.rapport.importees, 1000);
  assert.deepEqual(base.lots, Array(1000 / TAILLE_LOT).fill(TAILLE_LOT));
  const second = analyser(lireCsv(new TextEncoder().encode(milleArticles())), base.produits);
  const reimport = await importer(second.lignes, base);
  assert.deepEqual([reimport.rapport.importees, reimport.rapport.ignoreesDoublon, reimport.rapport.lues], [0, 1000, 1000]);
  assert.equal(base.produits.length, 1010);
});
