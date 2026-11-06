// Acomptes et solde : mêmes valeurs que supabase/tests/010_acomptes.sql : node --test tests/
// Devis de 1 000 € HT à 20 % + 500 € HT à 10 %, TTC 1 750 € ; acompte de 30 % = 525 € ; solde = 1 225 €.
import { test } from "node:test";
import assert from "node:assert/strict";
import { calculerTotaux, lierAvoirs, resteAPayer, totalTTC, totalAcomptesDeduits } from "../src/utils/facture.js";
import { factureSupprimable, libelleNumero, peutCreerAvoir } from "../src/data/factures.js";
import { aAcompteActif, acomptesDuDevis, factureDuDevis } from "../src/data/devis.js";

const ligne = (ht, taux) => ({ quantite: 1, prix_unitaire: ht, taux_tva: taux, remise: 0 });
const DEDUIT = {
  facture_id: "a1", numero: "FAC-2026-0001", date: "2026-11-06", total_ht: 450, total_tva: 75, total_ttc: 525,
  detail: [{ taux: 20, base: 300, tva: 60 }, { taux: 10, base: 150, tva: 15 }],
};
const solde = (extra = {}) => ({
  id: "s", type: "solde", statut: "brouillon", devis_id: "d", remise: 0,
  lignes: [ligne(1000, 20), ligne(500, 10)], acomptes_deduits: [DEDUIT], paiements: [], ...extra,
});

test("brouillon de solde : 1 225,00 €, déduction taux par taux", () => {
  const t = calculerTotaux(solde());
  assert.deepEqual([t.htBrutC, t.htC, t.tvaC, t.ttcC, t.acomptesC], [150000, 105000, 17500, 122500, 52500]);
  assert.deepEqual(t.tva, [{ taux: 20, baseC: 70000, tvaC: 14000 }, { taux: 10, baseC: 35000, tvaC: 3500 }]);
  assert.equal(totalTTC(solde()), 1225);
  assert.equal(resteAPayer(solde()), 1225);
  assert.equal(totalAcomptesDeduits(solde()), 525);
});

test("contrôle : acompte + solde = devis, au centime", () => {
  assert.equal(525 + totalTTC(solde()), 1750);
  // Remise de 10 € sur 100 € à 20 % + 50 € à 10 % : TTC 163,34 € ; acompte de 50 % : 81,67 €
  const f = solde({
    remise: 10, lignes: [ligne(100, 20), ligne(50, 10)],
    acomptes_deduits: [{ total_ht: 70.01, total_tva: 11.66, total_ttc: 81.67, detail: [{ taux: 20, base: 46.67, tva: 9.33 }, { taux: 10, base: 23.34, tva: 2.33 }] }],
  });
  const t = calculerTotaux(f);
  assert.equal(t.ttcC, 8167);
  assert.deepEqual(t.tva, [{ taux: 20, baseC: 4666, tvaC: 934 }, { taux: 10, baseC: 2333, tvaC: 234 }]);
  assert.equal(8167 + t.ttcC, 16334);
});

test("solde figé : les valeurs figées priment, déductions conservées", () => {
  const f = solde({
    statut: "finalisee", total_ht_brut: 1500, remise_appliquee: 0, total_ht: 1050, total_tva: 175, total_ttc: 1225,
    tva_detail: [{ taux: 20, base: 700, tva: 140 }, { taux: 10, base: 350, tva: 35 }],
    lignes: [ligne(999999, 20)],
  });
  const t = calculerTotaux(f);
  assert.equal(t.ttcC, 122500);
  assert.equal(t.acomptesC, 52500);
});

test("un acompte se calcule comme une facture", () => {
  assert.equal(totalTTC({ type: "acompte", remise: 0, lignes: [ligne(300, 20), ligne(150, 10)] }), 525);
});

test("lierAvoirs : l'acompte connaît la conversion de son devis", () => {
  const liste = lierAvoirs([
    { id: "a1", type: "acompte", devis_id: "d", statut: "finalisee" },
    { id: "a2", type: "acompte", devis_id: "autre", statut: "finalisee" },
    solde(),
  ]);
  assert.equal(liste[0].solde_id, "s");
  assert.equal(liste[1].solde_id, null);
  assert.equal(peutCreerAvoir(liste[0]), false);
  assert.equal(peutCreerAvoir(liste[1]), true);
});

test("règles d'interface", () => {
  assert.equal(factureSupprimable(solde()), false);
  assert.equal(factureSupprimable({ type: "acompte", statut: "brouillon" }), true);
  assert.equal(factureSupprimable({ type: "facture", statut: "brouillon" }), true);
  assert.equal(factureSupprimable({ type: "facture", statut: "finalisee" }), false);
  assert.equal(libelleNumero({ type: "acompte", numero: null }), "Brouillon d'acompte");
  assert.equal(libelleNumero({ type: "solde", numero: null }), "Brouillon de solde");
});

test("devis : la facture issue de la conversion n'est jamais un acompte", () => {
  const factures = [
    { id: "a", type: "acompte", devis_id: "d", statut: "annulee" },
    { id: "b", type: "acompte", devis_id: "d", statut: "finalisee" },
    { id: "s", type: "solde", devis_id: "d", statut: "brouillon" },
    { id: "x", type: "acompte", devis_id: "autre", statut: "annulee" },
  ];
  assert.equal(factureDuDevis(factures, "d").id, "s");
  assert.equal(factureDuDevis(factures.slice(0, 2), "d"), null);
  assert.equal(acomptesDuDevis(factures, "d").length, 2);
  assert.equal(aAcompteActif(factures, "d"), true);
  assert.equal(aAcompteActif(factures, "autre"), false);
});
