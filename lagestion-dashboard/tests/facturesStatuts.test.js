// Règles d'interface du cycle de vie des factures, alignées sur verifier_facture (migration 008) : node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STATUTS, STATUTS_IMPAYES, factureModifiable, libelleNumero, paiementPossible, statutsSuivantsFacture,
} from "../src/data/factures.js";

test("un brouillon ne change de statut que par la finalisation", () => {
  assert.deepEqual(statutsSuivantsFacture("brouillon"), []);
});

test("aucun statut proposé ne mène à brouillon, finalisée ou annulée", () => {
  for (const s of STATUTS) {
    for (const interdit of ["brouillon", "finalisee", "annulee"]) {
      assert.ok(!statutsSuivantsFacture(s).includes(interdit), `${s} → ${interdit}`);
    }
  }
  assert.deepEqual(statutsSuivantsFacture("annulee"), []);
});

test("en_attente est retiré ; finalisée compte dans les impayés", () => {
  assert.ok(!STATUTS.includes("en_attente"));
  assert.ok(!STATUTS_IMPAYES.includes("en_attente"));
  assert.ok(STATUTS_IMPAYES.includes("finalisee"));
});

test("seul un brouillon est modifiable", () => {
  for (const s of STATUTS) assert.equal(factureModifiable(s), s === "brouillon", s);
});

test("paiement refusé sur un brouillon ou une facture annulée", () => {
  for (const s of STATUTS) assert.equal(paiementPossible(s), s !== "brouillon" && s !== "annulee", s);
});

test("numéro affiché", () => {
  assert.equal(libelleNumero({ numero: null }), "Brouillon");
  assert.equal(libelleNumero({ numero: "FAC-2026-0001" }), "FAC-2026-0001");
});
