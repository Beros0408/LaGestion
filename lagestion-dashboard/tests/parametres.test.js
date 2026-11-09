import { test } from "node:test";
import assert from "node:assert/strict";
import {
  siretValide, cleTvaFrancaise, erreurTva, ibanValide, validerParametres, ajouterJours, defautsPaiement,
  normaliserIban, normaliserTva,
} from "../src/utils/parametres.js";

const VALIDE = {
  nom: "Rénov Démo", forme_juridique: "SAS", forme_autre: "", capital_social: "10000", siret: "73282932000074",
  immatriculation_type: "rcs", immatriculation_lieu: "Paris", tva_intra: "FR44732829320",
  delai_paiement_jours: "30", penalites_mode: "bce_10", penalites_taux: "", iban: "FR76 3000 6000 0112 3456 7890 189",
};

test("SIRET : clé de Luhn, espaces tolérés, exception de La Poste", () => {
  assert.equal(siretValide("73282932000074"), true);
  assert.equal(siretValide("732 829 320 00074"), true);
  assert.equal(siretValide("73282932000075"), false);
  assert.equal(siretValide("7328293200007"), false);
  assert.equal(siretValide("12345678900012"), false);
  assert.equal(siretValide("35600000000001"), true); // somme des chiffres 15
  assert.equal(siretValide("35600000000002"), false);
});

test("TVA : clé française, SIREN cohérent avec le SIRET, numéros étrangers acceptés sur le format", () => {
  assert.equal(cleTvaFrancaise("404833048"), "83");
  assert.equal(cleTvaFrancaise("732829320"), "44");
  assert.equal(erreurTva("", "73282932000074"), null);
  assert.equal(erreurTva("fr 44 732 829 320", "73282932000074"), null);
  assert.match(erreurTva("FR45732829320", ""), /clé/);
  assert.match(erreurTva("FR83404833048", "73282932000074"), /SIREN/);
  assert.match(erreurTva("FR4473282932", ""), /9 chiffres/);
  assert.equal(erreurTva("DE123456789", "73282932000074"), null);
  assert.match(erreurTva("123", ""), /Format/);
  assert.equal(normaliserTva(" fr44-732.829.320 "), "FR44732829320");
});

test("IBAN : modulo 97, espaces et minuscules tolérés", () => {
  assert.equal(ibanValide("FR76 3000 6000 0112 3456 7890 189"), true);
  assert.equal(ibanValide("fr7630006000011234567890189"), true);
  assert.equal(ibanValide("FR7630006000011234567890188"), false);
  assert.equal(ibanValide("FR76"), false);
  assert.equal(normaliserIban("fr76 3000 6000"), "FR7630006000");
});

test("Formulaire Entreprise : valeurs valides acceptées, chaque contrôle signalé", () => {
  assert.deepEqual(validerParametres(VALIDE), {});
  const cas = [
    [{ nom: " " }, "nom"],
    [{ forme_juridique: "autre", forme_autre: "" }, "forme_autre"],
    [{ capital_social: "-5" }, "capital_social"],
    [{ siret: "12345678900012", tva_intra: "" }, "siret"],
    [{ immatriculation_lieu: "" }, "immatriculation_lieu"],
    [{ immatriculation_type: "rm", immatriculation_lieu: " " }, "immatriculation_lieu"],
    [{ tva_intra: "FR00732829320" }, "tva_intra"],
    [{ delai_paiement_jours: "61" }, "delai_paiement_jours"],
    [{ delai_paiement_jours: "12.5" }, "delai_paiement_jours"],
    [{ delai_paiement_jours: "" }, "delai_paiement_jours"],
    [{ penalites_mode: "taux_fixe", penalites_taux: "" }, "penalites_taux"],
    [{ penalites_mode: "taux_fixe", penalites_taux: "0" }, "penalites_taux"],
    [{ iban: "FR7630006000011234567890188" }, "iban"],
  ];
  for (const [modif, champ] of cas) {
    assert.deepEqual(Object.keys(validerParametres({ ...VALIDE, ...modif })), [champ], JSON.stringify(modif));
  }
  // Champs facultatifs vides : aucune erreur ; dispense sans lieu ; délai de 0 et de 60 jours
  assert.deepEqual(validerParametres({ ...VALIDE, siret: "", tva_intra: "", iban: "", capital_social: "", immatriculation_type: "dispense", immatriculation_lieu: "" }), {});
  assert.deepEqual(validerParametres({ ...VALIDE, delai_paiement_jours: "0" }), {});
  assert.deepEqual(validerParametres({ ...VALIDE, delai_paiement_jours: "60", penalites_mode: "taux_fixe", penalites_taux: "12.5" }), {});
});

test("Nouvelle facture : échéance au délai de l'entreprise, mode et conditions repris", () => {
  assert.equal(ajouterJours("2026-01-31", 30), "2026-03-02");
  assert.equal(ajouterJours("2026-12-15", 45), "2027-01-29");
  assert.equal(ajouterJours("2026-03-28", 0), "2026-03-28");
  assert.equal(ajouterJours("", 30), "");
  assert.deepEqual(defautsPaiement({ delai_paiement_jours: 45, mode_paiement: "virement", conditions_paiement: "45 jours net" }, "2026-11-09"),
    { date_echeance: "2026-12-24", mode_paiement: "virement", conditions_paiement: "45 jours net" });
  // Entreprise non chargée ou non paramétrée : 30 jours, rien d'autre
  assert.deepEqual(defautsPaiement(null, "2026-11-09"), { date_echeance: "2026-12-09", mode_paiement: "", conditions_paiement: "" });
  assert.deepEqual(defautsPaiement({ delai_paiement_jours: 30, mode_paiement: null, conditions_paiement: null }, "2026-11-09"),
    { date_echeance: "2026-12-09", mode_paiement: "", conditions_paiement: "" });
});
