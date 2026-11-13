// Double authentification (migration 018) : code, facteurs, code requis, noms d'appareil, messages : node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clePresentee, codeRequis, codeValide, facteursInacheves, facteursVerifies, messageErreurMfa, nomNouvelAppareil, normaliserCode,
} from "../src/utils/mfa.js";

const f = (status, friendly_name = "Téléphone", factor_type = "totp") => ({ id: friendly_name, status, friendly_name, factor_type });

test("code : six chiffres, espaces ignorés", () => {
  assert.equal(normaliserCode(" 123 456 "), "123456");
  assert.ok(codeValide("123456"));
  assert.ok(codeValide("123 456"));
  assert.ok(!codeValide("12345"));
  assert.ok(!codeValide("1234567"));
  assert.ok(!codeValide("12a456"));
  assert.ok(!codeValide(""));
  assert.ok(!codeValide(null));
});

test("facteurs : vérifiés et inachevés, TOTP seulement", () => {
  const liste = [f("verified", "A"), f("unverified", "B"), f("verified", "C", "phone")];
  assert.deepEqual(facteursVerifies(liste).map((x) => x.id), ["A"]);
  assert.deepEqual(facteursInacheves(liste).map((x) => x.id), ["B"]);
  assert.deepEqual(facteursVerifies(undefined), []);
});

test("code requis : facteur vérifié et session aal1, comme aal_suffisant en base", () => {
  assert.ok(codeRequis("aal1", [f("verified")]));
  assert.ok(codeRequis(null, [f("verified")]));
  assert.ok(!codeRequis("aal2", [f("verified")]));
  assert.ok(!codeRequis("aal1", []));
  assert.ok(!codeRequis("aal1", [f("unverified")]));
  assert.ok(!codeRequis("aal1", [f("verified", "SMS", "phone")]));
});

test("nom du nouvel appareil : unique pour l'utilisateur", () => {
  assert.equal(nomNouvelAppareil([]), "Téléphone");
  assert.equal(nomNouvelAppareil([f("verified", "Téléphone")]), "Appareil de secours");
  assert.equal(nomNouvelAppareil([f("verified", "Téléphone"), f("verified", "Appareil de secours")]), "Appareil 3");
  assert.equal(nomNouvelAppareil([f("verified", "Appareil de secours")]), "Téléphone");
});

test("clé de saisie manuelle : groupes de quatre", () => {
  assert.equal(clePresentee("ABCDEFGHIJ"), "ABCD EFGH IJ");
  assert.equal(clePresentee("ABCD"), "ABCD");
  assert.equal(clePresentee(undefined), "");
});

test("messages d'erreur de Supabase Auth en français", () => {
  assert.match(messageErreurMfa({ message: "Invalid TOTP code entered" }, "x"), /^Code incorrect ou expiré/);
  assert.match(messageErreurMfa({ code: "mfa_verification_failed" }, "x"), /^Code incorrect/);
  assert.match(messageErreurMfa({ message: "Request rate limit reached" }, "x"), /^Trop de tentatives/);
  assert.match(messageErreurMfa({ code: "mfa_totp_enroll_not_enabled", message: "MFA enroll is disabled for TOTP" }, "x"), /pas encore activée/);
  assert.match(messageErreurMfa({ message: "AAL2 required to unenroll verified factor" }, "x"), /^Saisissez d'abord/);
  assert.equal(messageErreurMfa({ message: "Something else" }, "défaut"), "défaut");
  assert.equal(messageErreurMfa(null, "défaut"), "défaut");
});
