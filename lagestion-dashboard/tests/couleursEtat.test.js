// Couleurs d'état du paiement (CLAUDE.md, « Couleurs d'état »), échéance, règlement et résumé client : node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { C, COULEURS_ETAT, ETAT_REGLEMENT, ETAT_SITUATION, PISTE_JAUGE, CONTOUR_JAUGE, couleurEtat, etatDuStatut, melange } from "../src/theme.js";
import { STATUTS, LIBELLE_ECHEANCE, LIBELLE_SITUATION } from "../src/data/factures.js";
import { etatEcheance, etatReglement, reglementAffichable, situationClient } from "../src/utils/facture.js";

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

test("chaque statut et chaque état d'échéance correspond à son état", () => {
  const attendu = {
    payee: "succes", partiellement_payee: "avertissement", finalisee: "info", envoyee: "info",
    en_retard: "erreur", brouillon: "neutre", annulee: "neutre",
  };
  for (const s of STATUTS) assert.equal(etatDuStatut(s), attendu[s], s);
  for (const s of STATUTS) assert.equal(couleurEtat(s), COULEURS_ETAT[attendu[s]], s);
  assert.equal(etatDuStatut("a_echoir"), "info");
  assert.equal(etatDuStatut("echeance_aujourdhui"), "info");
});

test("un avoir est neutre quel que soit son statut ; un statut inconnu aussi", () => {
  for (const s of STATUTS) assert.equal(etatDuStatut(s, "avoir"), "neutre", s);
  assert.equal(etatDuStatut("inconnu"), "neutre");
  assert.equal(etatDuStatut(undefined), "neutre");
});

test("jetons : trait et texte …Text, badge opaque à 12 % (10 % pour l'erreur), plus de fond de ligne", () => {
  assert.deepEqual(COULEURS_ETAT.succes, { trait: C.successText, texte: C.successText, badge: melange(C.success, 0.12) });
  assert.deepEqual(COULEURS_ETAT.erreur, { trait: C.errorText, texte: C.errorText, badge: melange(C.error, 0.1) });
  for (const e of Object.values(COULEURS_ETAT)) assert.ok(!("fond" in e));
  assert.equal(melange("#000000", 0.5, "#FFFFFF"), "#808080");
  assert.equal(melange(C.error, 0.1), "#ECDFE0");
  assert.equal(PISTE_JAUGE, melange(C.textSecondary, 0.12));
});

test("contrastes : texte ≥ 4,5:1, liseré, icône et jauge ≥ 3:1", () => {
  for (const [nom, e] of Object.entries(COULEURS_ETAT)) {
    assert.ok(contraste(e.texte, e.badge) >= 4.5, `${nom} texte / badge`);
    assert.ok(contraste(e.trait, e.badge) >= 3, `${nom} icône / badge`);
    assert.ok(contraste(e.trait, C.bgCard) >= 3, `${nom} liseré / carte`);
  }
  for (const etat of Object.values(ETAT_REGLEMENT)) {
    assert.ok(contraste(COULEURS_ETAT[etat].trait, PISTE_JAUGE) >= 3, `${etat} partie remplie / piste`);
  }
  // Contour de la piste : jauge vide visible sur la carte.
  assert.equal(CONTOUR_JAUGE, melange(C.textSecondary, 0.7));
  assert.ok(contraste(CONTOUR_JAUGE, C.bgCard) >= 3, "contour / carte");
  // Texte de la jauge, « Aujourd'hui » (textPrimary) et liseré sur une ligne survolée de la liste des factures.
  assert.ok(contraste(C.textSecondary, C.bgCard) >= 4.5);
  assert.ok(contraste(C.textPrimary, C.bgCard) >= 4.5);
  assert.ok(contraste(C.errorText, C.bgHover) >= 3);
});

test("le badge d'échéance et la jauge ne partagent aucune couleur", () => {
  const couleurs = (etats) => new Set(etats.flatMap((e) => Object.values(COULEURS_ETAT[e])));
  const badge = couleurs(Object.keys(LIBELLE_ECHEANCE).map((s) => etatDuStatut(s)));
  const jauge = couleurs(Object.values(ETAT_REGLEMENT));
  assert.deepEqual([...new Set(Object.keys(LIBELLE_ECHEANCE).map((s) => etatDuStatut(s)))].sort(), ["erreur", "info"]);
  assert.deepEqual(Object.values(ETAT_REGLEMENT).sort(), ["avertissement", "succes"]);
  for (const c of jauge) assert.ok(!badge.has(c), c);
});

test("échéance : en retard le lendemain, pas le jour même (règle de statut_paiement)", () => {
  const jour = "2026-11-07";
  assert.equal(etatEcheance({ date_echeance: "2026-11-06" }, jour), "en_retard");
  assert.equal(etatEcheance({ date_echeance: "2026-11-07" }, jour), "echeance_aujourdhui");
  assert.equal(etatEcheance({ date_echeance: "2026-11-08" }, jour), "a_echoir");
  assert.equal(etatEcheance({ date_echeance: null }, jour), "a_echoir");
  assert.equal(LIBELLE_ECHEANCE.echeance_aujourdhui, "Échéance aujourd'hui");
});

// Factures émises aux totaux figés : seuls total_ttc, l'échéance, les paiements et les avoirs comptent ici.
const JOUR = "2026-11-07";
const fac = (statut, ttc, echeance, paye = 0, extra = {}) => ({
  type: "facture", statut, total_ttc: ttc, date_echeance: echeance,
  paiements: paye ? [{ montant: paye }] : [], avoirs: [], ...extra,
});

test("règlement : non réglée, partielle, soldée (avoirs et remboursements déduits)", () => {
  assert.equal(etatReglement(fac("envoyee", 100, JOUR)), "non_reglee");
  assert.equal(etatReglement(fac("envoyee", 100, JOUR, 40)), "partielle");
  assert.equal(etatReglement(fac("envoyee", 100, JOUR, 100)), "soldee");
  assert.equal(etatReglement(fac("envoyee", 100, JOUR, 60, { avoirs: [{ type: "avoir", total_ttc: -40 }] })), "soldee");
  assert.equal(etatReglement(fac("envoyee", 100, JOUR, 0, { paiements: [{ montant: 100 }, { montant: 30, sens: "remboursement" }] })), "partielle");
});

test("jauge : toute facture émise de TTC net positif, jamais sur brouillon, avoir, annulée ou paiements absents", () => {
  assert.equal(reglementAffichable(fac("envoyee", 100, JOUR)), true);
  assert.equal(reglementAffichable(fac("envoyee", 100, JOUR, 100)), true);
  assert.equal(reglementAffichable(fac("brouillon", 100, JOUR)), false);
  assert.equal(reglementAffichable(fac("finalisee", -50, null, 0, { type: "avoir" })), false);
  assert.equal(reglementAffichable(fac("annulee", 100, JOUR)), false);
  assert.equal(reglementAffichable(fac("envoyee", 100, JOUR, 0, { paiements: undefined })), false);
  assert.equal(reglementAffichable(fac("envoyee", 100, JOUR, 0, { avoirs: [{ type: "avoir", total_ttc: -100 }] })), false);
});

test("chaque situation client a un état et un libellé ; « Partiel »", () => {
  for (const s of ["a_jour", "partiellement_regle", "en_retard"]) {
    assert.ok(COULEURS_ETAT[ETAT_SITUATION[s]], s);
    assert.ok(LIBELLE_SITUATION[s], s);
  }
  assert.equal(LIBELLE_SITUATION.partiellement_regle, "Partiel");
  assert.equal(ETAT_SITUATION.en_retard, "erreur");
  assert.equal(ETAT_SITUATION.partiellement_regle, "avertissement");
  assert.equal(ETAT_SITUATION.a_jour, "succes");
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
  assert.equal(situationClient([fac("envoyee", 100, JOUR)], JOUR), "a_jour");
});

test("liseré « En retard » : 4 px de errorText, détaché de 2 px de la bordure de carte", async () => {
  const { LISERE_RETARD, LISERE_EN_RETARD, ECART_LISERE } = await import("../src/theme.js");
  assert.equal(LISERE_EN_RETARD, 4);
  assert.ok(ECART_LISERE >= 2);
  assert.equal(LISERE_RETARD.backgroundRepeat, "no-repeat");
  assert.equal(LISERE_RETARD.backgroundImage,
    `linear-gradient(to right, transparent 2px, ${C.errorText} 2px, ${C.errorText} 6px, transparent 6px)`);
  // Collé à la bordure, le liseré s'y confondait (2,43:1) ; l'écart de fond de carte le sépare des deux côtés.
  assert.ok(contraste(C.errorText, C.bordureCarte) < 3);
  assert.ok(contraste(C.fondCarte, C.bordureCarte) >= 3 && contraste(C.fondCarte, C.errorText) >= 3);
});

test("fond hors application : couleur du bouton « Se connecter », texte blanc AA, carte détachée", async () => {
  const { FOND_HORS_APPLICATION, TUILES } = await import("../src/theme.js");
  assert.equal(FOND_HORS_APPLICATION, C.fondHorsApplication);
  assert.equal(C.fondHorsApplication, C.primary); // par référence au fond du bouton « Se connecter »
  assert.deepEqual(TUILES.vert, ["#1B6E3E", "#1E7A45"]); // la tuile Encaissements garde son vert
  const fond = C.fondHorsApplication;
  // Texte et roue posés directement dessus (chargement et erreur de ProtectedRoute) : blanc.
  assert.ok(contraste(C.onPrimary, fond) >= 4.5, "texte et roue blancs");
  // Carte et bouton « Réessayer » (fond de carte) détachés par leur fond ; la bordure sombre, elle, ne suffirait pas.
  assert.ok(contraste(C.fondCarte, fond) >= 3, "carte");
  assert.ok(contraste(C.bordureCarte, fond) < 3);
  // Les gris de texte de l'application n'y sont pas lisibles : jamais de texte gris posé sur ce fond.
  assert.ok(contraste(C.textPrimary, fond) < 4.5 && contraste(C.textSecondary, fond) < 4.5);
});
