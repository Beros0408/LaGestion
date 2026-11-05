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
