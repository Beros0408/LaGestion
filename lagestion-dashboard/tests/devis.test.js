// Règles d'interface des devis et cohérence des cas de totaux avec le test SQL : node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { calculerTotaux } from "../src/utils/facture.js";
import {
  MESSAGE_DESCRIPTION, calculerRecap, descriptionVide, premierChampEnErreur, preparerLignes, validerLignes,
} from "../src/utils/lignesDocument.js";
import { messageErreur } from "../src/utils/erreurs.js";
import { aujourdhui, dansJours, devisModifiable, statutsSuivants, validiteDepassee } from "../src/data/devis.js";

test("statuts proposés : converti jamais, accepté réservé à la direction", () => {
  assert.deepEqual(statutsSuivants("brouillon", false), ["envoye"]);
  assert.deepEqual(statutsSuivants("envoye", false), ["accepte", "refuse", "expire", "brouillon"]);
  assert.deepEqual(statutsSuivants("accepte", false), []);
  assert.deepEqual(statutsSuivants("accepte", true), ["envoye", "refuse"]);
  assert.deepEqual(statutsSuivants("refuse", false), ["brouillon"]);
  assert.deepEqual(statutsSuivants("expire", false), ["brouillon", "envoye"]);
  assert.deepEqual(statutsSuivants("converti", true), []);
  for (const s of ["brouillon", "envoye", "accepte", "refuse", "expire"]) {
    assert.ok(!statutsSuivants(s, true).includes("converti"), s);
  }
});

test("seuls accepté et converti verrouillent le contenu", () => {
  for (const s of ["brouillon", "envoye", "refuse", "expire"]) assert.equal(devisModifiable(s), true, s);
  for (const s of ["accepte", "converti"]) assert.equal(devisModifiable(s), false, s);
});

test("validité dépassée : devis envoyé uniquement, date du jour encore valable", () => {
  const jour = "2026-11-05";
  assert.equal(validiteDepassee({ statut: "envoye", date_validite: "2026-11-04" }, jour), true);
  assert.equal(validiteDepassee({ statut: "envoye", date_validite: "2026-11-05" }, jour), false);
  assert.equal(validiteDepassee({ statut: "accepte", date_validite: "2026-11-04" }, jour), false);
  assert.equal(validiteDepassee({ statut: "brouillon", date_validite: "2026-11-04" }, jour), false);
});

test("dates locales : passage de mois et d'année", () => {
  assert.equal(aujourdhui(new Date(2026, 0, 3)), "2026-01-03");
  assert.equal(dansJours("2026-12-15", 30), "2027-01-14");
});

test("lignes préparées pour un devis : clé du parent et valeurs normalisées", () => {
  const [l] = preparerLignes(
    [{ description: "  Pose ", reference: " ", unite: "h", quantite: "2", prix_unitaire: "10.5", taux_tva: "5.5", remise: "", produit_id: "" }],
    "devis_id", "d1", "e1"
  );
  assert.deepEqual(l, {
    entreprise_id: "e1", devis_id: "d1", position: 0, description: "Pose", reference: null, unite: "h",
    quantite: 2, prix_unitaire: 10.5, taux_tva: 5.5, remise: 0, produit_id: null,
  });
});

test("validation des lignes", () => {
  assert.deepEqual(validerLignes([]), { lignes: "Ajoutez au moins une ligne." });
  assert.deepEqual(validerLignes([{ description: "Pose", quantite: "1", prix_unitaire: "10", remise: "0" }]), {});
  const { ligneItems } = validerLignes([{ description: "Pose", quantite: "0", prix_unitaire: "", remise: "-1" }]);
  assert.deepEqual(Object.keys(ligneItems[0]).sort(), ["prix_unitaire", "quantite", "remise"]);
});

test("description obligatoire : vide, espaces, tabulation, espaces insécables refusés", () => {
  const ligne = { quantite: "1", prix_unitaire: "10", remise: "0" };
  for (const d of ["", "   ", "\t", " ", "   ", undefined, null]) {
    assert.equal(descriptionVide(d), true, JSON.stringify(d));
    assert.deepEqual(validerLignes([{ ...ligne, description: d }]), { ligneItems: [{ description: MESSAGE_DESCRIPTION }] }, JSON.stringify(d));
  }
  assert.equal(MESSAGE_DESCRIPTION, "La description est obligatoire.");
  assert.equal(descriptionVide(" Pose "), false);
  // Ligne choisie dans le catalogue : la description reprise (nom de l'article) suffit
  assert.deepEqual(validerLignes([{ ...ligne, description: "Carrelage 30×30", produit_id: "p1" }]), {});
});

test("focus : premier champ en erreur de la première ligne en erreur", () => {
  const ligne = { description: "Pose", quantite: "1", prix_unitaire: "10", remise: "0" };
  const { ligneItems } = validerLignes([ligne, { ...ligne, description: " ", prix_unitaire: "" }, { ...ligne, description: "" }]);
  assert.equal(premierChampEnErreur(ligneItems), "ligne-1-description");
  assert.equal(premierChampEnErreur([{}, { prix_unitaire: "Prix positif." }]), "ligne-1-prix_unitaire");
  assert.equal(premierChampEnErreur([{}, { description: undefined }]), null);
  assert.equal(premierChampEnErreur(undefined), null);
});

test("erreur de la contrainte 015 traduite en français", () => {
  assert.equal(
    messageErreur({ code: "23514", message: 'new row for relation "lignes_facture" violates check constraint "lignes_facture_description_non_vide"' }),
    "La description de chaque ligne est obligatoire."
  );
  assert.match(messageErreur({ code: "23514", message: 'violates check constraint "autre"' }), /erreur technique/);
});

test("récapitulatif : remise supérieure au HT signalée et plafonnée", () => {
  const r = calculerRecap("500", [{ quantite: "1", prix_unitaire: "100", taux_tva: "20", remise: "0" }]);
  assert.equal(r.plafonnee, true);
  assert.equal(r.remise, 100);
  assert.equal(r.ttc, 0);
});

// supabase/tests/007_devis.sql ne peut pas appeler calculerTotaux : ses attendus doivent donc rester
// ceux que calculerTotaux produit sur les mêmes lignes. Ce test relie les deux.
test("les cas de totaux du test SQL 007 sont ceux de calculerTotaux", () => {
  const sql = readFileSync(new URL("../supabase/tests/007_devis.sql", import.meta.url), "utf8");
  const blocCas = sql.match(/insert into _cas values\s+([\s\S]*?);/)[1];
  const blocLignes = sql.match(/insert into _lignes values\s+([\s\S]*?);/)[1];
  const tuples = (bloc) => [...bloc.matchAll(/\(([^)]*)\)/g)].map((m) => m[1].split(",").map((v) => Number(v.trim())));

  const lignes = tuples(blocLignes);
  const cas = tuples(blocCas);
  assert.equal(cas.length, 10);
  for (const [n, remise, htBrut, remiseApp, ht, tva, ttc] of cas) {
    const t = calculerTotaux({
      remise,
      lignes: lignes.filter((l) => l[0] === n).map(([, quantite, prix_unitaire, taux_tva, r]) => ({ quantite, prix_unitaire, taux_tva, remise: r })),
    });
    assert.deepEqual([t.htBrutC, t.remiseC, t.htC, t.tvaC, t.ttcC], [htBrut, remiseApp, ht, tva, ttc], `cas ${n}`);
  }

  const reference = JSON.parse(readFileSync(new URL("./cas_totaux.json", import.meta.url), "utf8"));
  assert.equal(reference.length, cas.length);
});
