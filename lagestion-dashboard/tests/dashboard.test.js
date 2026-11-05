// Tests du tableau de bord : node --test tests/
// Attendus calculés à la main (voir commentaires), au centime.
import { test } from "node:test";
import assert from "node:assert/strict";
import { calculerTableauDeBord, bornesPeriode, phraseActivite, variation } from "../src/utils/dashboard.js";

const AUJOURDHUI = "2026-11-05";
const ligne = (quantite, prix_unitaire, taux_tva) => ({ quantite, prix_unitaire, taux_tva, remise: 0 });

const clients = [
  { id: "c1", nom: "Alpha BTP", secteur: "BTP", created_at: "2026-10-20T10:00:00Z" },   // nouveau (30 j)
  { id: "c2", nom: "Bêta", secteur: null, created_at: "2026-09-20T10:00:00Z" },         // période précédente
  { id: "c3", nom: "Gamma Santé", secteur: "Santé", created_at: "2025-01-01T10:00:00Z" },
];

const factures = [
  // HT 200,00 ; TTC 240,00 ; payée le 25/10
  { id: "f1", numero: "F1", client_id: "c1", statut: "payee", date_emission: "2026-10-15", date_echeance: "2026-11-14",
    remise: 0, lignes: [ligne(2, 100, 20)], paiements: [{ date: "2026-10-25", montant: 240 }] },
  // HT 1 000,00 ; TTC 1 100,00 ; 100,00 payés ; reste 1 000,00 ; échue depuis le 10/10
  { id: "f2", numero: "F2", client_id: "c2", statut: "en_retard", date_emission: "2026-09-10", date_echeance: "2026-10-10",
    remise: 0, lignes: [ligne(1, 1000, 10)], paiements: [{ date: "2026-09-30", montant: 100 }] },
  // brouillon : exclu du CA
  { id: "f3", numero: "F3", client_id: "c3", statut: "brouillon", date_emission: "2026-11-01", date_echeance: "2026-12-01",
    remise: 0, lignes: [ligne(1, 50, 20)], paiements: [] },
  // annulée : exclue du CA
  { id: "f4", numero: "F4", client_id: "c3", statut: "annulee", date_emission: "2026-10-01", date_echeance: "2026-10-31",
    remise: 0, lignes: [ligne(1, 999, 20)], paiements: [] },
  // HT 3 × 33,33 = 99,99 ; TTC 119,99 ; 60,00 payés ; reste 59,99
  { id: "f5", numero: "F5", client_id: "c3", statut: "partiellement_payee", date_emission: "2026-06-15", date_echeance: "2026-07-15",
    remise: 0, lignes: [ligne(3, 33.33, 20)], paiements: [{ date: "2026-07-01", montant: 60 }] },
];

const opportunites = [
  { id: "o1", nom: "Projet A", client_id: "c1", etape: "Qualification", montant: 10000, probabilite: 20, updated_at: "2026-11-01T09:00:00Z" },
  { id: "o2", nom: "Projet B", client_id: "c2", etape: "Négociation", montant: 5000, probabilite: 50, updated_at: "2026-09-01T09:00:00Z" },
  { id: "o3", nom: "Projet C", client_id: "c3", etape: "Conclusion", montant: 3000, probabilite: 90, updated_at: "2026-11-02T09:00:00Z" },
];

const tdb = (periode) => calculerTableauDeBord({ factures, clients, opportunites, periode, aujourdhui: AUJOURDHUI });

test("bornes des périodes", () => {
  assert.deepEqual(bornesPeriode("30j", AUJOURDHUI), {
    debut: "2026-10-07", fin: "2026-11-05", precedente: { debut: "2026-09-07", fin: "2026-10-06" },
  });
  assert.deepEqual(bornesPeriode("6m", AUJOURDHUI), {
    debut: "2026-06-01", fin: "2026-11-05", precedente: { debut: "2025-12-01", fin: "2026-05-31" },
  });
  assert.deepEqual(bornesPeriode("12m", AUJOURDHUI).debut, "2025-12-01");
});

test("KPI sur 30 jours avec variations", () => {
  const { kpi } = tdb("30j");
  assert.deepEqual(kpi.ca, { valeur: 200, precedent: 1000, variation: -80 });          // F1 contre F2
  assert.deepEqual(kpi.encaissements, { valeur: 240, precedent: 100, variation: 140 });
  assert.deepEqual(kpi.nouveauxClients, { valeur: 1, precedent: 1, variation: 0 });
  assert.deepEqual(kpi.impayes, { montant: 1059.99, nombre: 2 });                       // 1 000,00 + 59,99
  assert.equal(kpi.pipelinePondere, 4500);                                              // 10 000 × 20 % + 5 000 × 50 %
  assert.equal(kpi.opportunitesEnCours, 2);
});

test("12 mois : CA, somme mensuelle, secteurs, top clients", () => {
  const r = tdb("12m");
  assert.equal(r.kpi.ca.valeur, 1299.99);                                               // 200 + 1 000 + 99,99
  assert.equal(r.mensuel.length, 12);
  const somme = r.mensuel.reduce((s, m) => s + Math.round(m.facture * 100), 0) / 100;
  assert.equal(somme, r.kpi.ca.valeur);
  // Secteurs nommés par montant décroissant, « Non renseigné » en dernier
  assert.deepEqual(r.secteurs.map((s) => [s.nom, s.montant]), [["BTP", 200], ["Santé", 99.99], ["Non renseigné", 1000]]);
  assert.deepEqual(r.topClients.map((c) => c.nom), ["Bêta", "Alpha BTP", "Gamma Santé"]);
});

test("au-delà de 6 secteurs : regroupement dans « Autres secteurs »", () => {
  const noms = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const cl = noms.map((s, i) => ({ id: `k${i}`, nom: `Client ${s}`, secteur: s, created_at: "2025-01-01" }));
  const fa = noms.map((s, i) => ({
    id: `x${i}`, numero: `X${i}`, client_id: `k${i}`, statut: "payee", date_emission: "2026-10-01",
    remise: 0, lignes: [ligne(1, 800 - i * 100, 20)], paiements: [],
  }));
  const r = calculerTableauDeBord({ factures: fa, clients: cl, opportunites: [], periode: "12m", aujourdhui: AUJOURDHUI });
  assert.deepEqual(r.secteurs.map((s) => [s.nom, s.montant]),
    [["A", 800], ["B", 700], ["C", 600], ["D", 500], ["E", 400], ["F", 300], ["Autres secteurs", 300]]); // G 200 + H 100
  assert.equal(r.secteurs.reduce((s, x) => s + x.montant, 0), r.kpi.ca.valeur);
});

test("jauges, âge des créances, entonnoir", () => {
  const r = tdb("12m");
  assert.deepEqual(r.jauges.conclusion, { taux: 33.3, numerateur: 1, denominateur: 3 });
  assert.deepEqual(r.jauges.encaissement, { taux: 27.4, paye: 400, facture: 1459.99 }); // 400 / 1 459,99
  assert.deepEqual(r.ageCreances.map((t) => [t.cle, t.montant, t.nombre]),
    [["0-30", 0, 0], ["31-60", 1000, 1], ["61-90", 0, 0], ["90+", 59.99, 1]]);         // F2 : 56 j ; F5 : 143 j
  assert.deepEqual(r.entonnoir.map((e) => [e.etape, e.nombre, e.montant]),
    [["Qualification", 1, 10000], ["Proposition", 0, 0], ["Négociation", 1, 5000], ["Conclusion", 1, 3000]]);
});

test("actions suggérées", () => {
  const [relances, brouillons, inactives] = tdb("30j").actions;
  assert.deepEqual(relances.elements.map((a) => [a.titre, a.jours, a.lien]),
    [["Relancer la facture F5", 113, "/factures/f5"], ["Relancer la facture F2", 26, "/factures/f2"]]);
  assert.deepEqual(brouillons.elements.map((a) => a.lien), ["/factures/f3"]);
  assert.deepEqual(inactives.elements.map((a) => [a.titre, a.jours, a.lien]),
    [["Relancer « Projet B »", 65, "/opportunites/o2/modifier"]]);
});

test("base vide : aucun chiffre inventé", () => {
  const r = calculerTableauDeBord({ aujourdhui: AUJOURDHUI, periode: "6m" });
  assert.deepEqual(r.kpi.ca, { valeur: 0, precedent: 0, variation: null });
  assert.equal(r.kpi.impayes.nombre, 0);
  assert.equal(r.jauges.conclusion.taux, null);
  assert.equal(r.jauges.encaissement.taux, null);
  assert.deepEqual(r.secteurs, []);
  assert.deepEqual(r.topClients, []);
  assert.ok(r.actions.every((g) => g.total === 0));
  assert.deepEqual(r.vide, { factures: true, encaissements: true, opportunites: true, creances: true });
});

test("variation", () => {
  assert.equal(variation(0, 0), null);
  assert.equal(variation(150, 100), 50);
  assert.equal(variation(1, 3), -66.7);
});

test("phrases d'activité", () => {
  const facturesParId = new Map([["f9", { numero: "DEMO-0009" }]]);
  assert.equal(phraseActivite({ table_name: "factures", action: "update",
    old_data: { numero: "DEMO-0009", statut: "envoyee" }, new_data: { numero: "DEMO-0009", statut: "payee" } }),
    "Facture DEMO-0009 marquée payée");
  assert.equal(phraseActivite({ table_name: "clients", action: "insert", new_data: { nom: "Boulangerie Fournier" } }),
    "Client Boulangerie Fournier créé");
  assert.equal(phraseActivite({ table_name: "opportunites", action: "update",
    old_data: { nom: "Terrasse", etape: "Proposition" }, new_data: { nom: "Terrasse", etape: "Négociation" } }),
    "Opportunité « Terrasse » passée en Négociation");
  assert.equal(phraseActivite({ table_name: "paiements", action: "insert", new_data: { facture_id: "f9", montant: 1908 } }, facturesParId),
    "Paiement de 1 908,00 € enregistré sur la facture DEMO-0009");
  assert.equal(phraseActivite({ table_name: "factures", action: "update",
    old_data: { numero: "F1", deleted_at: null }, new_data: { numero: "F1", deleted_at: "2026-11-01" } }),
    "Facture F1 supprimée");
});
