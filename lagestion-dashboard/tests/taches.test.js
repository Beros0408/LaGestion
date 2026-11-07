// Tâches et activités (migration 012) : état, compteur, tri, droits, suggestions, historique : node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { COULEURS_ETAT, ETAT_TACHE } from "../src/theme.js";
import {
  etatTache, historiqueClient, libelleEnRetard, nombreEnRetard, peutChangerStatut, peutModifierActivite, peutModifierTache,
  tacheDepuisSuggestion, tacheDeSuggestion, trierTaches, LIBELLE_ETAT_TACHE,
} from "../src/utils/taches.js";

const J = "2026-11-07";
const tache = (echeance, statut = "a_faire", extra = {}) => ({ id: `${echeance}-${statut}`, titre: "T", echeance, statut, responsable: "moi", auteur: "autre", ...extra });

test("état d'une tâche : même règle que les factures (pas en retard le jour même)", () => {
  assert.equal(etatTache(tache("2026-11-06"), J), "en_retard");
  assert.equal(etatTache(tache("2026-11-07"), J), "aujourdhui");
  assert.equal(etatTache(tache("2026-11-10"), J), "a_venir");
  assert.equal(etatTache(tache("2026-11-01", "faite"), J), "faite");
  assert.equal(LIBELLE_ETAT_TACHE.aujourdhui, "Aujourd'hui");
});

test("couleurs : à venir neutre, aujourd'hui information, en retard erreur, faite succès ; aucune couleur nouvelle", () => {
  assert.deepEqual(ETAT_TACHE, { a_venir: "neutre", aujourdhui: "info", en_retard: "erreur", faite: "succes" });
  for (const e of Object.values(ETAT_TACHE)) assert.ok(COULEURS_ETAT[e], e);
});

test("compteur de l'en-tête : tâches en retard dont je suis responsable, libellé au singulier et au pluriel", () => {
  const liste = [
    tache("2026-11-06"), tache("2026-11-05"), tache("2026-11-07"), tache("2026-11-01", "faite"),
    tache("2026-11-01", "a_faire", { responsable: "autre" }), tache("2026-11-01", "a_faire", { deleted_at: "2026-11-02" }),
  ];
  assert.equal(nombreEnRetard(liste, "moi", J), 2);
  assert.equal(nombreEnRetard(liste, "autre", J), 1);
  assert.equal(nombreEnRetard([], "moi", J), 0);
  assert.equal(libelleEnRetard(1), "1 tâche en retard");
  assert.equal(libelleEnRetard(3), "3 tâches en retard");
});

test("tri : à faire par échéance croissante, puis faites de la plus récente à la plus ancienne", () => {
  const triees = trierTaches([
    tache("2026-11-10"), tache("2026-11-01", "faite", { faite_le: "2026-11-02T10:00:00Z" }), tache("2026-11-05"),
    tache("2026-10-01", "faite", { faite_le: "2026-11-06T10:00:00Z" }),
  ]);
  assert.deepEqual(triees.map((t) => `${t.statut} ${t.echeance}`), ["a_faire 2026-11-05", "a_faire 2026-11-10", "faite 2026-10-01", "faite 2026-11-01"]);
});

test("droits affichés, comme en base : lecture rien ; statut pour tout rôle qui écrit ; reste réservé", () => {
  const t = tache(J, "a_faire", { auteur: "a", responsable: "r" });
  assert.equal(peutChangerStatut("lecture"), false);
  for (const r of ["admin", "manager", "commercial", "comptable"]) assert.equal(peutChangerStatut(r), true, r);
  assert.equal(peutModifierTache(t, "a", "commercial"), true);
  assert.equal(peutModifierTache(t, "r", "comptable"), true);
  assert.equal(peutModifierTache(t, "x", "commercial"), false);
  assert.equal(peutModifierTache(t, "x", "manager"), true);
  assert.equal(peutModifierTache(t, "a", "lecture"), false);
  const a = { auteur: "a" };
  assert.equal(peutModifierActivite(a, "a", "commercial"), true);
  assert.equal(peutModifierActivite(a, "x", "comptable"), false);
  assert.equal(peutModifierActivite(a, "x", "admin"), true);
  assert.equal(peutModifierActivite(a, "a", "lecture"), false);
});

test("suggestion du tableau de bord → tâche : origine, objet, responsable moi, échéance aujourd'hui ; doublon repéré", () => {
  const relance = { id: "f1", titre: "Relancer la facture F1 : 2e relance" };
  assert.deepEqual(tacheDepuisSuggestion("relances", relance, "moi", J),
    { titre: relance.titre, echeance: J, responsable: "moi", origine: "relance", facture_id: "f1" });
  assert.deepEqual(tacheDepuisSuggestion("inactives", { id: "o1", titre: "Relancer « A »" }, "moi", J),
    { titre: "Relancer « A »", echeance: J, responsable: "moi", origine: "opportunite_inactive", opportunite_id: "o1" });
  assert.equal(tacheDepuisSuggestion("inconnu", relance, "moi", J), null);
  const existantes = [{ id: "t1", statut: "a_faire", origine: "relance", facture_id: "f1" }, { id: "t2", statut: "faite", origine: "brouillon", facture_id: "f2" }];
  assert.equal(tacheDeSuggestion(existantes, "relances", relance)?.id, "t1");
  assert.equal(tacheDeSuggestion(existantes, "brouillons", relance), null);
  assert.equal(tacheDeSuggestion(existantes, "brouillons", { id: "f2" }), null);
});

test("historique d'un client : activités du client et de ses opportunités, relances, sans supprimées, plus récent d'abord", () => {
  const h = historiqueClient({
    clientId: "c1",
    activites: [
      { id: "a1", client_id: "c1", type: "appel", date_activite: "2026-11-05T10:00:00Z", commentaire: "Appel", auteur_nom: "Camille" },
      { id: "a2", client_id: null, opportunite_id: "o1", type: "rendez_vous", date_activite: "2026-11-06T10:00:00Z", commentaire: "Visite", auteur_nom: "Camille" },
      { id: "a3", client_id: "c2", type: "note", date_activite: "2026-11-07T10:00:00Z", commentaire: "Autre client", auteur_nom: "X" },
      { id: "a4", client_id: "c1", type: "note", date_activite: "2026-11-07T11:00:00Z", commentaire: "Supprimée", deleted_at: "2026-11-07T12:00:00Z" },
    ],
    opportunites: [{ id: "o1", client_id: "c1", nom: "Terrasse" }, { id: "o2", client_id: "c2", nom: "Autre" }],
    factures: [
      { id: "f1", client_id: "c1", relances: [{ id: "r1", niveau: 1, objet: "Rappel", created_at: "2026-11-04T09:00:00Z", auteur_nom: "Chris" }] },
      { id: "f2", client_id: "c2", relances: [{ id: "r2", niveau: 2, objet: "Autre", created_at: "2026-11-07T09:00:00Z" }] },
    ],
  });
  assert.deepEqual(h.map((e) => e.cle), ["a-a2", "a-a1", "r-r1"]);
  assert.equal(h[0].opportunite, "Terrasse");
  assert.equal(h[2].sorte, "relance");
  assert.equal(h[2].niveau, 1);
});
