// Tests des pages parentes et des libellés du fil d'Ariane : node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { pageParente, libellePage } from "../src/utils/navigation.js";

test("page parente de chaque écran", () => {
  const attendus = [
    ["/dashboard", null],
    ["/clients", "/dashboard"],
    ["/clients/nouveau", "/clients"],
    ["/clients/abc-123", "/clients"],
    ["/clients/abc-123/modifier", "/clients/abc-123"],
    ["/opportunites", "/dashboard"],
    ["/opportunites/nouvelle", "/opportunites"],
    ["/opportunites/o-9/modifier", "/opportunites"],
    ["/factures", "/dashboard"],
    ["/factures/nouvelle", "/factures"],
    ["/factures/f-7", "/factures"],
    ["/factures/f-7/modifier", "/factures/f-7"],
    ["/page-inconnue", "/dashboard"],
  ];
  for (const [chemin, parent] of attendus) assert.equal(pageParente(chemin), parent, chemin);
});

test("libellés du fil d'Ariane", () => {
  assert.equal(libellePage("/clients/nouveau"), "Nouveau client");   // pas « Fiche client »
  assert.equal(libellePage("/clients/abc"), "Fiche client");
  assert.equal(libellePage("/factures/nouvelle"), "Nouvelle facture");
  assert.equal(libellePage("/factures/f-7/modifier"), "Modifier la facture");
  assert.equal(libellePage("/inconnue"), "Tableau de bord");
});
