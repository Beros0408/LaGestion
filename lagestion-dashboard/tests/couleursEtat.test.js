// Couleurs d'état du paiement (CLAUDE.md, « Couleurs d'état ») et résumé des règlements d'un client : node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { C, COULEURS_ETAT, ETAT_SITUATION, couleurEtat, etatDuStatut, melange } from "../src/theme.js";
import { STATUTS, LIBELLE_SITUATION } from "../src/data/factures.js";
import { situationClient } from "../src/utils/facture.js";

// Contraste WCAG 2.x entre deux couleurs #RRGGBB.
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

test("chaque statut correspond à son état", () => {
  const attendu = {
    payee: "succes", partiellement_payee: "avertissement", finalisee: "info", envoyee: "info",
    en_retard: "erreur", brouillon: "neutre", annulee: "neutre",
  };
  for (const s of STATUTS) assert.equal(etatDuStatut(s), attendu[s], s);
  for (const s of STATUTS) assert.equal(couleurEtat(s), COULEURS_ETAT[attendu[s]], s);
});

test("un avoir est neutre quel que soit son statut ; un statut inconnu aussi", () => {
  for (const s of STATUTS) assert.equal(etatDuStatut(s, "avoir"), "neutre", s);
  assert.equal(etatDuStatut("inconnu"), "neutre");
  assert.equal(etatDuStatut(undefined), "neutre");
});

test("jetons : trait et texte …Text, fond à 6 %, badge à 12 % (10 % pour l'erreur)", () => {
  assert.deepEqual(COULEURS_ETAT.succes, { trait: C.successText, texte: C.successText, fond: melange(C.success, 0.06), badge: melange(C.success, 0.12) });
  assert.deepEqual(COULEURS_ETAT.erreur, { trait: C.errorText, texte: C.errorText, fond: melange(C.error, 0.06), badge: melange(C.error, 0.1) });
  assert.equal(melange("#000000", 0.5, "#FFFFFF"), "#808080");
  assert.equal(melange(C.error, 0.1), "#ECDFE0");
});

test("contrastes : texte ≥ 4,5:1, trait (liseré, icône, barre) ≥ 3:1", () => {
  for (const [nom, e] of Object.entries(COULEURS_ETAT)) {
    assert.ok(contraste(e.texte, e.fond) >= 4.5, `${nom} texte / fond`);
    assert.ok(contraste(e.texte, e.badge) >= 4.5, `${nom} texte / badge`);
    assert.ok(contraste(C.textSecondary, e.fond) >= 4.5, `${nom} texte secondaire / fond`);
    assert.ok(contraste(C.textPrimary, e.fond) >= 4.5, `${nom} texte principal / fond`);
    assert.ok(contraste(C.primary, e.fond) >= 4.5, `${nom} lien / fond`);
    assert.ok(contraste(e.trait, e.fond) >= 3, `${nom} trait / fond`);
    assert.ok(contraste(e.trait, e.badge) >= 3, `${nom} icône / badge`);
    assert.ok(contraste(e.trait, melange(C.textSecondary, 0.12, e.fond)) >= 3, `${nom} barre / piste`);
  }
  // Le liseré « En retard » de la liste des factures reste lisible sur une ligne survolée.
  assert.ok(contraste(C.errorText, C.bgHover) >= 3);
});

test("chaque situation client a un état et un libellé", () => {
  for (const s of ["a_jour", "partiellement_regle", "en_retard"]) {
    assert.ok(COULEURS_ETAT[ETAT_SITUATION[s]], s);
    assert.ok(LIBELLE_SITUATION[s], s);
  }
  assert.equal(ETAT_SITUATION.en_retard, "erreur");
  assert.equal(ETAT_SITUATION.partiellement_regle, "avertissement");
  assert.equal(ETAT_SITUATION.a_jour, "succes");
});

// Factures émises aux totaux figés : seuls total_ttc, l'échéance et les paiements comptent ici.
const JOUR = "2026-11-07";
const fac = (statut, ttc, echeance, paye = 0, extra = {}) => ({
  type: "facture", statut, total_ttc: ttc, date_echeance: echeance,
  paiements: paye ? [{ montant: paye }] : [], avoirs: [], ...extra,
});
const payee = fac("envoyee", 100, "2026-10-01", 100);
const partielle = fac("envoyee", 100, "2026-12-01", 40);
const aEchoir = fac("finalisee", 100, "2026-12-01");
const enRetard = fac("envoyee", 100, "2026-10-01", 40);

test("résumé client : « — » (null) sans document émis", () => {
  assert.equal(situationClient([], JOUR), null);
  assert.equal(situationClient([{ type: "facture", statut: "brouillon", lignes: [], paiements: [] }], JOUR), null);
});

test("résumé client : en retard dès qu'une facture l'est", () => {
  assert.equal(situationClient([payee, partielle, enRetard], JOUR), "en_retard");
  assert.equal(situationClient([fac("envoyee", 100, "2026-11-06")], JOUR), "en_retard");
});

test("résumé client : partiellement réglé sans retard", () => {
  assert.equal(situationClient([payee, partielle, aEchoir], JOUR), "partiellement_regle");
});

test("résumé client : à jour, y compris avec une facture à échoir sans paiement, annulée ou un avoir", () => {
  assert.equal(situationClient([payee], JOUR), "a_jour");
  assert.equal(situationClient([payee, aEchoir], JOUR), "a_jour");
  assert.equal(situationClient([fac("annulee", 100, "2026-10-01")], JOUR), "a_jour");
  assert.equal(situationClient([payee, fac("finalisee", -50, null, 0, { type: "avoir" })], JOUR), "a_jour");
  // Échéance le jour même : pas encore en retard.
  assert.equal(situationClient([fac("envoyee", 100, JOUR)], JOUR), "a_jour");
});
