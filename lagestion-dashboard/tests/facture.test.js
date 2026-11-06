// Tests des totaux de facture (règle B) : node --test tests/
// Les mêmes cas sont rejoués côté SQL dans supabase/tests/005_totaux.sql.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculerTotaux, totalTTC, remiseGlobale, ligneHT } from "../src/utils/facture.js";

const cas = JSON.parse(readFileSync(new URL("./cas_totaux.json", import.meta.url), "utf8"));

for (const c of cas) {
  test(c.nom, () => {
    assert.deepEqual(calculerTotaux(c.facture), c.attendu);
  });
}

test("la remise globale répartie fait exactement la remise", () => {
  for (const c of cas) {
    const t = calculerTotaux(c.facture);
    assert.equal(t.tva.reduce((s, d) => s + d.baseC, 0), t.htC, c.nom);
    assert.equal(t.htBrutC - t.htC, t.remiseC, c.nom);
  }
});

test("conversions en euros", () => {
  assert.equal(totalTTC(cas[5].facture), 3.24);
  assert.equal(remiseGlobale(cas[6].facture), 50);
  assert.equal(ligneHT({ quantite: 3, prix_unitaire: 33.33, remise: 0 }), 99.99);
});

test("facture émise : les totaux figés priment sur les lignes", () => {
  const f = {
    total_ht_brut: 150, remise_appliquee: 10, total_ht: 140, total_tva: 23.34, total_ttc: 163.34,
    tva_detail: [{ taux: 20, base: 93.33, tva: 18.67 }, { taux: 10, base: 46.67, tva: 4.67 }],
    remise: 999,
    lignes: [{ quantite: 1, prix_unitaire: 999999, taux_tva: 20, remise: 0 }],
  };
  assert.deepEqual(calculerTotaux(f), {
    htBrutC: 15000, remiseC: 1000, htC: 14000, tvaC: 2334, ttcC: 16334,
    tva: [{ taux: 20, baseC: 9333, tvaC: 1867 }, { taux: 10, baseC: 4667, tvaC: 467 }],
  });
  assert.equal(totalTTC(f), 163.34);
});

test("brouillon sans totaux figés : calcul depuis les lignes", () => {
  const f = { total_ttc: null, remise: 0, lignes: [{ quantite: 1, prix_unitaire: 100, taux_tva: 20, remise: 0 }] };
  assert.equal(totalTTC(f), 120);
});
