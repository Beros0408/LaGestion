import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ANCIENNE_CLE, cleMemorisation, entrepriseInitiale, cheminLogoAutorise, messageImportEnCours,
} from "../src/utils/entrepriseCourante.js";
import { libellePage, pageParente } from "../src/utils/navigation.js";

const A = "a0160000-0000-4000-8000-0000000000e1";
const B = "a0160000-0000-4000-8000-0000000000e2";
const LISTE = [{ entrepriseId: A, nom: "Alpha" }, { entrepriseId: B, nom: "Bêta" }];

test("clé de mémorisation : une par utilisateur, distincte de l'ancienne clé commune", () => {
  const u = cleMemorisation("u1");
  const v = cleMemorisation("u2");
  assert.notEqual(u, v);
  assert.notEqual(u, ANCIENNE_CLE);
  assert.ok(u.includes("u1"));
});

test("entreprise initiale : mémorisée si toujours membre, sinon la première, null sans appartenance", () => {
  assert.equal(entrepriseInitiale(LISTE, B), B);
  assert.equal(entrepriseInitiale(LISTE, "inconnue"), A); // retiré de l'entreprise mémorisée
  assert.equal(entrepriseInitiale(LISTE, null), A);
  assert.equal(entrepriseInitiale([], A), null);
});

test("chemin de logo : seul le dossier de l'entreprise courante, au format versionné", () => {
  assert.equal(cheminLogoAutorise(`${A}/logo-1731250000000.png`, A), true);
  assert.equal(cheminLogoAutorise(`${A}/logo-1.jpg`, A), true);
  assert.equal(cheminLogoAutorise(`${B}/logo-1.png`, A), false); // autre entreprise
  assert.equal(cheminLogoAutorise(`${A}/../${B}/logo-1.png`, A), false);
  assert.equal(cheminLogoAutorise(`${A}/logo-1.png/../../${B}/logo-1.png`, A), false);
  assert.equal(cheminLogoAutorise(`/${A}/logo-1.png`, A), false);
  assert.equal(cheminLogoAutorise(`${A}/logo-1.gif`, A), false);
  assert.equal(cheminLogoAutorise(`${A}/logo-abc.png`, A), false);
  assert.equal(cheminLogoAutorise("https://exemple.invalid/logo.png", A), false);
  assert.equal(cheminLogoAutorise(`${A}/logo-1.png`, null), false);
  assert.equal(cheminLogoAutorise(null, A), false);
});

test("import en cours : message avec le nom de l'entreprise", () => {
  assert.equal(
    messageImportEnCours("Rénov Démo"),
    "Un import est en cours dans Rénov Démo. Attendez la fin avant de changer d'entreprise."
  );
});

test("navigation : page de création d'une entreprise", () => {
  assert.equal(libellePage("/entreprises/nouvelle"), "Nouvelle entreprise");
  assert.equal(pageParente("/entreprises/nouvelle"), "/dashboard");
});
