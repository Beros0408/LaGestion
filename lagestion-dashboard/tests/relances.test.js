// Statuts calculés et relances : mêmes cas que supabase/tests/011_reglements_relances.sql : node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { estImpayee, joursDeRetard, jourParis, lierAvoirs, resteAPayer, statutCalcule, tropPercu } from "../src/utils/facture.js";
import { DELAI_ENTRE_RELANCES, genererRelance, niveauSuivant, niveauxPossibles, peutRelancer, relanceAProposer } from "../src/data/relances.js";

const J = "2026-11-10";
const doc = (statut, type, echeance, ttc, avoirs, encaisse) => ({
  id: "f", statut, type, date_echeance: echeance, total_ttc: ttc, total_ht: ttc, total_tva: 0, total_ht_brut: ttc, remise_appliquee: 0, tva_detail: [],
  avoirs: avoirs ? [{ type: "avoir", statut: "finalisee", total_ttc: -avoirs, total_ht: -avoirs, total_tva: 0, total_ht_brut: -avoirs, remise_appliquee: 0, tva_detail: [] }] : [],
  paiements: encaisse ? [{ montant: encaisse }] : [],
});

test("table de vérité du statut : mêmes cas que le test SQL", () => {
  const cas = [
    ["brouillon", "facture", "2026-01-01", 100, 0, 0, "brouillon"],
    ["annulee", "facture", "2026-01-01", 100, 100, 0, "annulee"],
    ["finalisee", "avoir", "2026-01-01", -100, 0, 0, "finalisee"],
    ["finalisee", "facture", "2026-12-01", 100, 0, 0, "finalisee"],
    ["envoyee", "facture", "2026-12-01", 100, 0, 0, "envoyee"],
    ["envoyee", "acompte", "2026-12-01", 100, 0, 40, "partiellement_payee"],
    ["envoyee", "solde", "2026-12-01", 100, 0, 100, "payee"],
    ["envoyee", "facture", "2026-11-09", 100, 0, 0, "en_retard"],
    ["envoyee", "facture", "2026-11-09", 100, 0, 40, "en_retard"],
    ["envoyee", "facture", "2026-11-10", 100, 0, 0, "envoyee"],
    ["envoyee", "facture", "2026-11-09", 100, 0, 100, "payee"],
    ["envoyee", "facture", "2026-11-09", 100, 30, 70, "payee"],
    ["envoyee", "facture", "2026-11-09", 100, 30, 100, "payee"],
    ["envoyee", "facture", null, 100, 0, 0, "envoyee"],
    ["finalisee", "facture", null, 100, 0, 10, "partiellement_payee"],
    ["envoyee", "facture", "2026-12-01", 0, 0, 0, "payee"],
  ];
  for (const [statut, type, ech, ttc, av, enc, attendu] of cas) {
    assert.equal(statutCalcule(doc(statut, type, ech, ttc, av, enc), J), attendu, JSON.stringify([statut, type, ech, ttc, av, enc]));
  }
});

test("jour de Paris : minuit à Paris n'est pas minuit UTC", () => {
  assert.equal(jourParis(new Date("2026-12-31T23:30:00Z")), "2027-01-01");
  assert.equal(jourParis(new Date("2026-12-31T22:30:00Z")), "2026-12-31");
  assert.equal(jourParis(new Date("2026-07-31T22:30:00Z")), "2026-08-01");
});

test("impayé et retard", () => {
  assert.equal(estImpayee(doc("envoyee", "facture", "2026-11-01", 100, 0, 0)), true);
  assert.equal(estImpayee(doc("envoyee", "facture", "2026-11-01", 100, 0, 100)), false);
  assert.equal(estImpayee(doc("brouillon", "facture", "2026-11-01", 100, 0, 0)), false);
  assert.equal(estImpayee(doc("annulee", "facture", "2026-11-01", 100, 0, 0)), false);
  assert.equal(estImpayee(doc("finalisee", "avoir", "2026-11-01", -100, 0, 0)), false);
  assert.equal(joursDeRetard(doc("envoyee", "facture", "2026-11-01", 100, 0, 0), J), 9);
  assert.equal(joursDeRetard(doc("envoyee", "facture", "2026-11-10", 100, 0, 0), J), 0);
  assert.equal(joursDeRetard(doc("envoyee", "facture", "2026-11-01", 100, 0, 100), J), 0);
  assert.equal(joursDeRetard(doc("envoyee", "facture", null, 100, 0, 0), J), 0);
});

test("reste et trop-perçu cohérents avec le plafond", () => {
  const f = doc("envoyee", "facture", "2026-12-01", 120, 60, 60);
  assert.equal(resteAPayer(f), 0);
  assert.equal(tropPercu(f), 0);
  assert.equal(tropPercu(doc("envoyee", "facture", "2026-12-01", 120, 60, 120)), 60);
});

const avecRelances = (niveaux, ageJours = 20) => ({
  ...doc("envoyee", "facture", "2026-10-01", 100, 0, 0),
  relances: niveaux.map((niveau, i) => ({ niveau, created_at: new Date(Date.parse(J) - (ageJours + niveaux.length - 1 - i) * 86400000).toISOString() })),
});

test("niveau suivant : pas de saut, plafonné à la mise en demeure", () => {
  assert.equal(niveauSuivant(avecRelances([])), 1);
  assert.equal(niveauSuivant(avecRelances([1])), 2);
  assert.equal(niveauSuivant(avecRelances([1, 2])), 3);
  assert.equal(niveauSuivant(avecRelances([1, 2, 3])), 3);
  assert.equal(niveauSuivant(avecRelances([1, 2, 1])), 3);
});

test("mise en demeure réservée", () => {
  const f = avecRelances([1, 2]);
  assert.deepEqual(niveauxPossibles(f, "commercial"), [1, 2]);
  for (const role of ["admin", "manager", "comptable"]) assert.deepEqual(niveauxPossibles(f, role), [1, 2, 3], role);
  assert.deepEqual(niveauxPossibles(avecRelances([]), "admin"), [1]);
});

test("proposition au tableau de bord : 15 jours, jamais après une mise en demeure, jamais avant l'échéance", () => {
  assert.equal(DELAI_ENTRE_RELANCES, 15);
  assert.equal(relanceAProposer(avecRelances([]), J), true);
  assert.equal(relanceAProposer(avecRelances([1], 15), J), true);
  assert.equal(relanceAProposer(avecRelances([1], 14), J), false);
  assert.equal(relanceAProposer(avecRelances([1, 2, 3], 40), J), false);
  assert.equal(relanceAProposer(doc("envoyee", "facture", "2026-12-01", 100, 0, 0), J), false);
  assert.equal(peutRelancer(doc("envoyee", "facture", "2026-12-01", 100, 0, 0), J), false);
  // Toujours possible depuis Impayés, même dans le délai ou après une mise en demeure
  assert.equal(peutRelancer(avecRelances([1], 1), J), true);
  assert.equal(peutRelancer(avecRelances([1, 2, 3], 40), J), true);
});

const factureModele = {
  ...doc("envoyee", "facture", "2026-10-01", 1500, 0, 500), numero: "FAC-2026-0007", date_emission: "2026-09-01",
  client_fige: { nom: "Client Pro", type: "entreprise", email: "pro@client.example" }, emetteur_fige: { nom: "Émetteur SA" },
};

test("modèles : variables de la facture et du client", () => {
  for (const n of [1, 2, 3]) {
    const r = genererRelance(n, factureModele, null, null, J);
    assert.ok(r.corps.includes("FAC-2026-0007"), String(n));
    assert.ok(r.corps.includes("40\u00a0jours") || r.corps.includes("40"), String(n));
    assert.ok(r.corps.includes("1\u00a0000,00") || r.corps.includes("1\u202f000,00"), r.corps);
    assert.ok(r.corps.includes("Émetteur SA"), String(n));
    assert.equal(r.destinataire, "pro@client.example");
    assert.ok(r.objet.includes("FAC-2026-0007"));
  }
});

test("modèles : pénalités et 40 € pour un professionnel seulement", () => {
  const particulier = { ...factureModele, client_fige: { ...factureModele.client_fige, type: "particulier" } };
  assert.ok(!genererRelance(1, factureModele, null, null, J).corps.includes("pénalités"));
  assert.ok(genererRelance(2, factureModele, null, null, J).corps.includes("pénalités"));
  assert.ok(!genererRelance(2, particulier, null, null, J).corps.includes("pénalités"));
  const med = genererRelance(3, factureModele, null, null, J).corps;
  assert.ok(med.includes("MISE EN DEMEURE") && med.includes("L. 441-10") && med.includes("40\u00a0€"));
  const medP = genererRelance(3, particulier, null, null, J).corps;
  assert.ok(medP.includes("MISE EN DEMEURE") && !medP.includes("40\u00a0€") && !medP.includes("L. 441-10"));
  assert.ok(!/%/.test(med), "aucun taux de pénalités écrit");
});

test("lierAvoirs conserve les relances", () => {
  const [f] = lierAvoirs([{ id: "f", type: "facture", statut: "envoyee", relances: [{ niveau: 2 }] }]);
  assert.equal(niveauSuivant(f), 3);
});
