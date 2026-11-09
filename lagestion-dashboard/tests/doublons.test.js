// Règle « Nom proche » (confiance 40) : mots vides et formes juridiques ignorés.
// Deux usages : le formulaire client (detecterDoublons) et l'import (analyserClients).
import { test } from "node:test";
import assert from "node:assert/strict";
import { detecterDoublons, motsSignificatifs } from "../src/utils/doublons.js";
import { CHAMPS_CLIENTS, analyserClients } from "../src/utils/importClients.js";
import { detecterEntete, lireCsv, preparerTableau, proposerCorrespondance } from "../src/utils/import.js";

const EXISTANTS = [
  { id: "a", type: "entreprise", nom: "SARL Les Jardins du Midi", email: null, telephone: null, tags: [] },
  { id: "b", type: "entreprise", nom: "Boulangerie des Halles", email: null, telephone: null, tags: [] },
  { id: "c", type: "entreprise", nom: "S.A.R.L. Garage de la Gare", email: null, telephone: null, tags: [] },
];

test("mots significatifs : articles, prépositions et formes juridiques retirés, ponctuation ignorée", () => {
  assert.deepEqual(motsSignificatifs("SARL Les Jardins du Midi"), ["jardins", "midi"]);
  assert.deepEqual(motsSignificatifs("S.A.R.L. Garage de la Gare"), ["garage", "gare"]);
  assert.deepEqual(motsSignificatifs("SAS des Artisans et aux Bâtisseurs"), ["artisans", "batisseurs"]);
  assert.deepEqual(motsSignificatifs("L'Atelier EURL"), ["atelier"]);
  assert.deepEqual(motsSignificatifs("SCI les des aux"), []);
});

const nomProche = (saisie, existants = EXISTANTS) =>
  detecterDoublons({ type: "entreprise", ...saisie }, existants).filter((d) => d.motif === "Nom proche").map((d) => d.client.id);

test("formulaire client : plus de « Nom proche » sur un mot vide ou une forme juridique seule", () => {
  assert.deepEqual(nomProche({ nom: "SARL Plomberie des Alpes" }), []);
  assert.deepEqual(nomProche({ nom: "Les Délices de la Mer" }), []);
  assert.deepEqual(nomProche({ nom: "SAS Martin" }), []);
});

test("formulaire client : un vrai mot commun reste signalé (40)", () => {
  assert.deepEqual(nomProche({ nom: "Jardins de Provence" }), ["a"]);
  assert.deepEqual(nomProche({ nom: "EURL Garage Moderne" }), ["c"]);
  const [d] = detecterDoublons({ type: "entreprise", nom: "Halles Gourmandes" }, EXISTANTS);
  assert.deepEqual([d.client.id, d.confiance], ["b", 40]);
});

test("formulaire client : la raison sociale identique reste à 70, forme juridique comprise", () => {
  const [d] = detecterDoublons({ type: "entreprise", nom: "sarl les jardins du midi" }, EXISTANTS);
  assert.deepEqual([d.client.id, d.confiance], ["a", 70]);
});

// Même chaîne que l'écran d'import : CSV lu, en-tête, correspondance, analyse.
function analyser(noms) {
  const brut = lireCsv(new TextEncoder().encode(["Nom;Type", ...noms.map((n) => `${n};Entreprise`)].join("\n")));
  const tableau = preparerTableau(brut, detecterEntete(brut.lignes, CHAMPS_CLIENTS).index);
  return analyserClients(tableau, proposerCorrespondance(tableau.entetes, CHAMPS_CLIENTS), EXISTANTS);
}

test("import : mêmes règles, aucun doublon sur « SARL … des … », doublon possible sur un vrai mot commun", () => {
  const lignes = analyser(["SARL Plomberie des Alpes", "Les Délices de la Mer", "Jardins de Provence", "SAS Plomberie Durand"]);
  assert.deepEqual(lignes.map((l) => l.categorie), ["nouvelle", "nouvelle", "doublon", "doublon"]);
  assert.deepEqual([lignes[2].doublon.source, lignes[2].doublon.confiance, lignes[2].doublon.client.id], ["base", 40, "a"]);
  // « Plomberie » partagé avec la ligne 2 du fichier : doublon possible dans le fichier, pas à cause de « SAS ».
  assert.deepEqual([lignes[3].doublon.source, lignes[3].doublon.ligne], ["fichier", 2]);
});
