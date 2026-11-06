// Avoirs : mêmes valeurs que supabase/tests/009_avoirs.sql (facture de 1 000 € HT à 20 % + 500 € HT à 10 %) : node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calculerTotaux, estComptabilisee, lierAvoirs, resteAPayer, resteCreditable, soldeClient, totalAvoirs, totalPaye, totalTTC, tropPercu,
} from "../src/utils/facture.js";
import {
  libelleNumero, paiementPossible, peutCreerAvoir, statutsSuivantsFacture,
} from "../src/data/factures.js";

const ligne = (ht, taux) => ({ quantite: 1, prix_unitaire: ht, taux_tva: taux, remise: 0 });
const FIGEE = {
  total_ht_brut: 1500, remise_appliquee: 0, total_ht: 1500, total_tva: 250, total_ttc: 1750,
  tva_detail: [{ taux: 20, base: 1000, tva: 200 }, { taux: 10, base: 500, tva: 50 }],
};
const facture = (extra = {}) => ({ id: "f", type: "facture", statut: "finalisee", lignes: [ligne(1000, 20), ligne(500, 10)], paiements: [], ...FIGEE, ...extra });
const avoirFige = (ht20, ht10, statut = "finalisee") => ({
  id: `a${ht20}-${ht10}`, type: "avoir", statut, facture_origine_id: "f", numero: "AV-2026-0001", date_emission: "2026-11-06",
  total_ht_brut: -(ht20 + ht10), remise_appliquee: 0, total_ht: -(ht20 + ht10), total_tva: -(ht20 * 0.2 + ht10 * 0.1), total_ttc: -(ht20 * 1.2 + ht10 * 1.1),
  tva_detail: [{ taux: 20, base: -ht20, tva: -ht20 * 0.2 }, { taux: 10, base: -ht10, tva: -ht10 * 0.1 }].filter((d) => d.base !== 0),
  lignes: [], paiements: [],
});
const avec = (f, ...avoirs) => lierAvoirs([f, ...avoirs])[0];

test("brouillon d'avoir partiel sur deux taux : −175,00 €, calculé depuis les lignes", () => {
  const t = calculerTotaux({ type: "avoir", remise: 0, lignes: [ligne(100, 20), ligne(50, 10)] });
  assert.deepEqual(t, {
    htBrutC: -15000, remiseC: 0, htC: -15000, tvaC: -2500, ttcC: -17500,
    tva: [{ taux: 20, baseC: -10000, tvaC: -2000 }, { taux: 10, baseC: -5000, tvaC: -500 }],
  });
  assert.equal(totalTTC({ type: "avoir", remise: 0, lignes: [ligne(100, 20), ligne(50, 10)] }), -175);
});

test("avoir total : −1 750,00 €, la remise reste symétrique", () => {
  assert.equal(totalTTC({ type: "avoir", remise: 0, lignes: [ligne(1000, 20), ligne(500, 10)] }), -1750);
  const t = calculerTotaux({ type: "avoir", remise: 10, lignes: [ligne(100, 20), ligne(50, 10)] });
  assert.deepEqual([t.htBrutC, t.remiseC, t.htC, t.tvaC, t.ttcC], [-15000, -1000, -14000, -2334, -16334]);
});

test("un avoir sans montant ne donne pas de zéro négatif", () => {
  assert.ok(Object.is(calculerTotaux({ type: "avoir", remise: 0, lignes: [] }).ttcC, 0));
});

test("avoir finalisé : les totaux figés négatifs priment", () => {
  assert.equal(totalTTC(avoirFige(100, 50)), -175);
});

test("reste à payer et trop-perçu, en centimes", () => {
  const sans = facture();
  assert.equal(resteAPayer(sans), 1750);
  // Avoir partiel, rien de payé
  const f1 = avec(facture(), avoirFige(100, 50));
  assert.equal(totalAvoirs(f1), 175);
  assert.equal(resteAPayer(f1), 1575);
  assert.equal(tropPercu(f1), 0);
  // Facture payée puis avoir partiel : trop-perçu, puis remboursement
  const payee = facture({ paiements: [{ montant: 1750 }] });
  const f2 = avec(payee, avoirFige(100, 50));
  assert.equal(resteAPayer(f2), 0);
  assert.equal(tropPercu(f2), 175);
  const f3 = avec({ ...payee, paiements: [{ montant: 1750 }, { montant: 75, sens: "remboursement" }] }, avoirFige(100, 50));
  assert.equal(totalPaye(f3), 1675);
  assert.equal(tropPercu(f3), 100);
  // Paiement partiel puis avoir : reste réduit
  const f4 = avec(facture({ paiements: [{ montant: 1000 }] }), avoirFige(100, 0));
  assert.equal(resteAPayer(f4), 630);
  assert.equal(tropPercu(f4), 0);
  // Un avoir n'a ni reste ni trop-perçu
  assert.equal(resteAPayer(avoirFige(100, 50)), 0);
  assert.equal(tropPercu(avoirFige(100, 50)), 0);
});

test("pas d'erreur d'arrondi sur des sommes de centimes", () => {
  const f = facture({ total_ttc: 0.3, paiements: [{ montant: 0.1 }, { montant: 0.2 }] });
  assert.equal(resteAPayer(f), 0);
  assert.equal(tropPercu(f), 0);
});

test("un brouillon d'avoir ne compte pas", () => {
  const f = avec(facture(), avoirFige(100, 50, "brouillon"));
  assert.equal(f.avoirs.length, 0);
  assert.equal(resteAPayer(f), 1750);
});

test("lierAvoirs : numéro et date de la facture d'origine sur l'avoir", () => {
  const [, a] = lierAvoirs([facture({ numero: "FAC-2026-0001", date_emission: "2026-11-01" }), avoirFige(100, 0)]);
  assert.equal(a.origine_numero, "FAC-2026-0001");
  assert.equal(a.origine_date, "2026-11-01");
});

test("reste à créditer par taux", () => {
  assert.deepEqual(resteCreditable(avec(facture(), avoirFige(100, 50))), [
    { taux: 20, base: 900, tva: 180 },
    { taux: 10, base: 450, tva: 45 },
  ]);
  assert.deepEqual(resteCreditable(avec(facture(), avoirFige(1000, 0))), [{ taux: 10, base: 500, tva: 50 }]);
  assert.deepEqual(resteCreditable(avec(facture(), avoirFige(1000, 500))), []);
});

test("facture comptabilisée : annulée par avoir oui, ancienne annulée sans avoir non", () => {
  assert.equal(estComptabilisee(facture({ statut: "brouillon" })), false);
  assert.equal(estComptabilisee(facture({ statut: "annulee", avoirs: [] })), false);
  assert.equal(estComptabilisee(facture({ statut: "annulee", avoirs: [avoirFige(1000, 500)] })), true);
  assert.equal(estComptabilisee(avoirFige(100, 0)), true);
  assert.equal(estComptabilisee(avoirFige(100, 0, "brouillon")), false);
});

test("solde d'un client", () => {
  const liste = lierAvoirs([facture({ paiements: [{ montant: 1000 }] }), avoirFige(100, 0), facture({ id: "b", statut: "brouillon", total_ttc: null })]);
  assert.deepEqual(soldeClient(liste), { facture: 1630, encaisse: 1000, reste: 630, tropPercu: 0 });
  const annulee = lierAvoirs([facture({ statut: "annulee", paiements: [{ montant: 1750 }] }), avoirFige(1000, 500)]);
  assert.deepEqual(soldeClient(annulee), { facture: 0, encaisse: 1750, reste: 0, tropPercu: 1750 });
});

test("règles d'interface d'un avoir", () => {
  assert.deepEqual(statutsSuivantsFacture("finalisee", "avoir"), ["envoyee"]);
  assert.deepEqual(statutsSuivantsFacture("envoyee", "avoir"), []);
  assert.equal(paiementPossible("finalisee", "avoir"), false);
  assert.equal(paiementPossible("finalisee"), true);
  assert.equal(peutCreerAvoir(facture()), true);
  assert.equal(peutCreerAvoir(facture({ statut: "brouillon" })), false);
  assert.equal(peutCreerAvoir(facture({ statut: "annulee" })), false);
  assert.equal(peutCreerAvoir(avoirFige(1, 0)), false);
  assert.equal(libelleNumero({ type: "avoir", numero: null }), "Brouillon d'avoir");
});
