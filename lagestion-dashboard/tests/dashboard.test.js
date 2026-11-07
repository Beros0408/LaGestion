// Tests du tableau de bord : node --test tests/
// Attendus calculés à la main (voir commentaires), au centime.
import { test } from "node:test";
import assert from "node:assert/strict";
import { calculerTableauDeBord, bornesPeriode, phraseActivite, variation, pourcentage } from "../src/utils/dashboard.js";

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
  { id: "o1", nom: "Projet A", client_id: "c1", etape: "Qualification", montant: 10000, probabilite: 20, updated_at: "2026-11-01T09:00:00Z", date_cloture: "2026-10-30" },
  { id: "o2", nom: "Projet B", client_id: "c2", etape: "Négociation", montant: 5000, probabilite: 50, updated_at: "2026-09-01T09:00:00Z", date_cloture: "2026-12-15" },
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

test("entonnoir : part de la 1re étape, passage depuis la précédente, valeur moyenne", () => {
  const r = tdb("12m");
  assert.deepEqual(r.entonnoir.map((e) => [e.rang, e.etape, e.partMontant, e.partNombre, e.passageMontant, e.passageNombre]), [
    [1, "Qualification", 100, 100, null, null],
    [2, "Proposition", 0, 0, 0, 0],        // étape vide
    [3, "Négociation", 50, 100, null, null], // étape précédente vide : pas de taux de passage
    [4, "Conclusion", 30, 100, 60, 100],    // 3 000 / 5 000
  ]);
  assert.deepEqual(r.pipeline, { valeurMoyenne: 6000 });                               // 18 000 / 3
  assert.equal(pourcentage(59800, 73000), 81.9);
  assert.equal(pourcentage(1, 0), null);
  // Moyenne au centime : (100,00 + 100,00 + 100,01) / 3 = 100,0033… → 100,00
  const opp = (m) => ({ id: m, nom: m, client_id: "c1", etape: "Qualification", montant: m, probabilite: 10 });
  const m = calculerTableauDeBord({ opportunites: [opp(100), opp(100), opp(100.01)], aujourdhui: AUJOURDHUI });
  assert.equal(m.pipeline.valeurMoyenne, 100);
  assert.equal(calculerTableauDeBord({ aujourdhui: AUJOURDHUI }).pipeline.valeurMoyenne, null);
});

test("opportunités prioritaires : 5 ouvertes au plus fort montant pondéré", () => {
  const r = tdb("12m");
  assert.deepEqual(r.prioritaires.map((o) => [o.nom, o.pondere, o.dateCloture, o.depassee]), [
    ["Projet B", 2500, "2026-12-15", false], // 5 000 × 50 %
    ["Projet A", 2000, "2026-10-30", true],  // 10 000 × 20 %, clôture dépassée
  ]);                                         // Projet C (Conclusion) exclu
  const o = (nom, montant, probabilite, etape = "Proposition") => ({ id: nom, nom, client_id: "c1", etape, montant, probabilite });
  const liste = [o("A", 1000, 10), o("B", 2000, 50), o("C", 4000, 25), o("D", 500, 100), o("E", 9000, 90, "Conclusion"),
    o("F", 300, 100), o("G", 100, 10)];
  const p = calculerTableauDeBord({ opportunites: liste, clients, aujourdhui: AUJOURDHUI }).prioritaires;
  // B et C à 1 000 (égalité : montant le plus fort d'abord), puis D 500, F 300, A 100 ; G et E exclus
  assert.deepEqual(p.map((x) => x.nom), ["C", "B", "D", "F", "A"]);
  assert.deepEqual(calculerTableauDeBord({ aujourdhui: AUJOURDHUI }).prioritaires, []);
});

test("actions suggérées", () => {
  const [relances, brouillons, inactives] = tdb("30j").actions;
  assert.deepEqual(relances.elements.map((a) => [a.titre, a.jours, a.lien]),
    [["Relancer la facture F5\u00a0: 1re relance", 113, "/factures/f5"], ["Relancer la facture F2\u00a0: 1re relance", 26, "/factures/f2"]]);
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
  assert.equal(phraseActivite({ table_name: "devis", action: "insert", new_data: { numero: "DEV-2026-0001" } }),
    "Devis DEV-2026-0001 créé");
  assert.equal(phraseActivite({ table_name: "devis", action: "update",
    old_data: { numero: "D1", statut: "accepte" }, new_data: { numero: "D1", statut: "envoye" } }),
    "Devis D1 marqué envoyé");
});

test("relances au tableau de bord : niveau proposé, délai de 15 jours", () => {
  const base = factures.find((f) => f.id === "f2");
  const avec = (r) => calculerTableauDeBord({ factures: [{ ...base, relances: r }], clients, opportunites: [], periode: "12m", aujourdhui: AUJOURDHUI }).actions[0].elements.map((a) => a.titre);
  assert.deepEqual(avec([{ niveau: 1, created_at: "2026-10-01T10:00:00Z" }]), ["Relancer la facture F2\u00a0: 2e relance"]);
  const jour = new Date(Date.parse(AUJOURDHUI) - 5 * 86400000).toISOString();
  assert.deepEqual(avec([{ niveau: 1, created_at: jour }]), []);
  assert.deepEqual(avec([{ niveau: 1, created_at: "2026-09-01T10:00:00Z" }, { niveau: 2, created_at: "2026-09-15T10:00:00Z" }, { niveau: 3, created_at: "2026-10-01T10:00:00Z" }]), []);
});

test("journal : relance préparée", () => {
  const facturesParId = new Map([["f9", { numero: "DEMO-0009" }]]);
  assert.equal(phraseActivite({ table_name: "relances", action: "insert", new_data: { niveau: 3, facture_id: "f9" } }, facturesParId), "Mise en demeure préparée sur la facture DEMO-0009");
});

test("journal : acompte et solde", () => {
  assert.equal(phraseActivite({ table_name: "factures", action: "insert", new_data: { numero: null, type: "acompte" } }), "Brouillon d'acompte créé");
  assert.equal(phraseActivite({ table_name: "factures", action: "insert", new_data: { numero: null, type: "solde" } }), "Brouillon de solde créé");
  assert.equal(phraseActivite({ table_name: "factures", action: "update",
    old_data: { numero: null, statut: "brouillon", type: "acompte" }, new_data: { numero: "FAC-2026-0001", statut: "finalisee", type: "acompte" } }), "Facture d'acompte FAC-2026-0001 finalisée");
  assert.equal(phraseActivite({ table_name: "factures", action: "update",
    old_data: { numero: null, statut: "brouillon", type: "solde" }, new_data: { numero: "FAC-2026-0002", statut: "finalisee", type: "solde" } }), "Facture de solde FAC-2026-0002 finalisée");
});

test("journal : avoir et remboursement", () => {
  assert.equal(phraseActivite({ table_name: "factures", action: "insert", new_data: { numero: null, type: "avoir" } }), "Brouillon d'avoir créé");
  assert.equal(phraseActivite({ table_name: "factures", action: "update",
    old_data: { numero: null, statut: "brouillon", type: "avoir" }, new_data: { numero: "AV-2026-0001", statut: "finalisee", type: "avoir" } }), "Avoir AV-2026-0001 finalisé");
  assert.equal(phraseActivite({ table_name: "factures", action: "update",
    old_data: { numero: "FAC-2026-0001", statut: "envoyee" }, new_data: { numero: "FAC-2026-0001", statut: "annulee" } }), "Facture FAC-2026-0001 annulée par avoir");
  assert.equal(phraseActivite({ table_name: "paiements", action: "insert", new_data: { montant: 240, sens: "remboursement" } }).startsWith("Remboursement de"), true);
});

test("tableau de bord : facture à sa date, avoir en négatif à la sienne ; encaissement net", () => {
  const fig = (id, numero, statut, date, ht, extra = {}) => ({
    id, numero, statut, client_id: "c1", date_emission: date, date_echeance: "2026-12-31", paiements: [], lignes: [],
    total_ht_brut: ht, remise_appliquee: 0, total_ht: ht, total_tva: 0, total_ttc: ht, tva_detail: [], ...extra,
  });
  const avoir = fig("a", "AV-2026-0001", "finalisee", "2026-10-10", -100, { type: "avoir", facture_origine_id: "f" });
  const fac = fig("f", "FAC-2026-0001", "annulee", "2026-08-10", 100, {
    type: "facture", avoirs: [avoir],
    paiements: [{ date: "2026-08-20", montant: 100 }, { date: "2026-10-20", montant: 100, sens: "remboursement" }],
  });
  const t = calculerTableauDeBord({ factures: [fac, avoir], clients: [], opportunites: [], periode: "12m", aujourdhui: "2026-11-05" });
  assert.equal(t.kpi.ca.valeur, 0);
  assert.equal(t.kpi.encaissements.valeur, 0);
  assert.equal(t.mensuel.find((m) => m.mois === "2026-08").facture, 100);
  assert.equal(t.mensuel.find((m) => m.mois === "2026-10").facture, -100);
  assert.equal(t.mensuel.find((m) => m.mois === "2026-10").encaisse, -100);
  assert.equal(t.kpi.impayes.nombre, 0);
});

test("journal : brouillon sans numéro et finalisation", () => {
  assert.equal(phraseActivite({ table_name: "factures", action: "insert", new_data: { numero: null } }), "Brouillon de facture créé");
  assert.equal(phraseActivite({ table_name: "factures", action: "update",
    old_data: { numero: null, statut: "brouillon" }, new_data: { numero: null, statut: "brouillon" } }), "Brouillon de facture modifié");
  assert.equal(phraseActivite({ table_name: "factures", action: "update",
    old_data: { numero: null, statut: "brouillon" }, new_data: { numero: "FAC-2026-0001", statut: "finalisee" } }), "Facture FAC-2026-0001 finalisée");
});

test("suggestion de relance : niveau de niveauPropose selon le rôle (mise en demeure jamais proposée au commercial)", () => {
  // F2 échue, déjà relancée aux niveaux 1 et 2 il y a plus de 15 jours : niveau suivant = mise en demeure
  const f2 = { ...factures[1], statut: "envoyee", relances: [{ niveau: 1, created_at: "2026-10-01T09:00:00Z" }, { niveau: 2, created_at: "2026-10-15T09:00:00Z" }] };
  const titre = (role) => calculerTableauDeBord({ factures: [f2], clients, aujourdhui: AUJOURDHUI, role })
    .actions.find((g) => g.cle === "relances").elements[0].titre;
  assert.match(titre(undefined), /Mise en demeure$/);
  assert.match(titre("admin"), /Mise en demeure$/);
  assert.match(titre("comptable"), /Mise en demeure$/);
  assert.match(titre("commercial"), /2e relance$/);
});
