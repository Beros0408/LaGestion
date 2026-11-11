// Nom du PDF d'un brouillon : node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { nomFichierBrouillon } from "../src/utils/nomFichierPdf.js";

const JOUR = new Date(2026, 10, 11, 23, 30); // 11 novembre 2026, 23 h 30, heure locale

test("type, client et date du jour", () => {
  assert.equal(nomFichierBrouillon("facture", "Client B", JOUR), "BROUILLON-FACTURE-Client-B-2026-11-11.pdf");
  assert.equal(nomFichierBrouillon("acompte", "Client B", JOUR), "BROUILLON-ACOMPTE-Client-B-2026-11-11.pdf");
  assert.equal(nomFichierBrouillon("solde", "Client B", JOUR), "BROUILLON-SOLDE-Client-B-2026-11-11.pdf");
  assert.equal(nomFichierBrouillon("avoir", "Client B", JOUR), "BROUILLON-AVOIR-Client-B-2026-11-11.pdf");
  assert.equal(nomFichierBrouillon(undefined, "Client B", JOUR), "BROUILLON-FACTURE-Client-B-2026-11-11.pdf");
});

test("accents retirés, caractères interdits sous Windows remplacés", () => {
  assert.equal(nomFichierBrouillon("facture", "Rénovation Démo & Fils SARL", JOUR), "BROUILLON-FACTURE-Renovation-Demo-Fils-SARL-2026-11-11.pdf");
  assert.equal(nomFichierBrouillon("facture", ' A<b>c:d"e/f\\g|h?i*j\u0007 ', JOUR), "BROUILLON-FACTURE-A-b-c-d-e-f-g-h-i-j-2026-11-11.pdf");
  assert.equal(nomFichierBrouillon("facture", "L'Œuf · Ça", JOUR), "BROUILLON-FACTURE-L-uf-Ca-2026-11-11.pdf");
});

test("client limité à 40 caractères, sans tiret final ; client absent", () => {
  const nom = nomFichierBrouillon("facture", "Société coopérative des artisans du bâtiment de l'Ouest", JOUR);
  assert.equal(nom, "BROUILLON-FACTURE-Societe-cooperative-des-artisans-du-bati-2026-11-11.pdf"); // 40 caractères
  assert.equal(nomFichierBrouillon("facture", "Agence immobilière du centre-ville", JOUR).includes("--"), false);
  assert.equal(nomFichierBrouillon("facture", null, JOUR), "BROUILLON-FACTURE-2026-11-11.pdf");
  assert.equal(nomFichierBrouillon("facture", "***", JOUR), "BROUILLON-FACTURE-2026-11-11.pdf");
});

test("aucun caractère interdit sous Windows", () => {
  for (const n of ["Client B", 'x<>:"/\\|?*y', "  ", "Ça & Là — Été"]) {
    assert.match(nomFichierBrouillon("facture", n, JOUR), /^[A-Za-z0-9-]+\.pdf$/);
  }
});
