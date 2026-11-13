// Équipe (migration 017) : lien, adresse, expiration, réassignation, dernier admin : node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  autresAdminsActifs, emailValide, erreurNomProfil, invitationExpiree, lienInvitation, nomMembre, normaliserEmail, perdAdmin,
  reassignationProposee, repreneursPossibles,
} from "../src/utils/equipe.js";

const membre = (user_id, role, extra = {}) => ({ user_id, role, statut: "actif", taches_a_faire: 0, nom: user_id, ...extra });

test("lien d'invitation : origine sans barre finale, jeton en fin de chemin", () => {
  assert.equal(lienInvitation("http://localhost:5173", "abc"), "http://localhost:5173/invitation/abc");
  assert.equal(lienInvitation("https://app.exemple.fr/", "abc"), "https://app.exemple.fr/invitation/abc");
});

test("adresse e-mail : même forme que la base, normalisée en minuscules sans espaces", () => {
  assert.equal(emailValide(" Marie@Exemple.fr "), true);
  for (const v of ["", "marie", "marie@", "marie@exemple", "ma rie@exemple.fr", "a@b@c.fr", null]) assert.equal(emailValide(v), false, v);
  assert.equal(normaliserEmail("  Marie@Exemple.FR "), "marie@exemple.fr");
});

test("expiration : échue à l'instant exact de expires_at", () => {
  const t = new Date("2026-11-12T10:00:00Z");
  assert.equal(invitationExpiree({ expires_at: "2026-11-12T10:00:00Z" }, t), true);
  assert.equal(invitationExpiree({ expires_at: "2026-11-12T10:00:01Z" }, t), false);
});

test("repreneurs : actifs, rôle qui écrit, jamais le membre lui-même", () => {
  const membres = [
    membre("a", "admin"), membre("c", "commercial"), membre("l", "lecture"),
    membre("s", "manager", { statut: "suspendu" }), membre("x", "comptable"),
  ];
  assert.deepEqual(repreneursPossibles(membres, "c").map((m) => m.user_id), ["a", "x"]);
});

test("réassignation proposée : retrait, suspension, passage en lecture, avec des tâches à faire", () => {
  const avec = membre("c", "commercial", { taches_a_faire: 2 });
  assert.equal(reassignationProposee("retirer", avec), true);
  assert.equal(reassignationProposee("suspendre", avec), true);
  assert.equal(reassignationProposee("role", avec, "lecture"), true);
  assert.equal(reassignationProposee("role", avec, "manager"), false);
  assert.equal(reassignationProposee("reactiver", avec), false);
  assert.equal(reassignationProposee("retirer", membre("c", "commercial")), false);
  assert.equal(reassignationProposee("role", membre("l", "lecture", { taches_a_faire: 1 }), "lecture"), false);
});

test("dernier admin : annoncé avant l'action, comme la garde de la base", () => {
  const membres = [membre("a", "admin"), membre("b", "admin", { statut: "suspendu" }), membre("c", "commercial")];
  assert.equal(autresAdminsActifs(membres, "a"), 0);
  assert.equal(autresAdminsActifs(membres, "c"), 1);
  assert.equal(perdAdmin("suspendre", membres[0]), true);
  assert.equal(perdAdmin("retirer", membres[0]), true);
  assert.equal(perdAdmin("role", membres[0], "manager"), true);
  assert.equal(perdAdmin("role", membres[0], "admin"), false);
  assert.equal(perdAdmin("suspendre", membres[1]), false);
  assert.equal(perdAdmin("retirer", membres[2]), false);
});

test("nom affiché : profil, sinon début de l'e-mail, sinon libellé neutre", () => {
  assert.equal(nomMembre({ nom: " Marie " }), "Marie");
  assert.equal(nomMembre({ nom: "", email: "paul@exemple.fr" }), "paul");
  assert.equal(nomMembre({ nom: null, email: null }), "Membre sans nom");
});

test("nom du profil demandé à la connexion : 2 à 80 caractères, pas une adresse e-mail", () => {
  assert.equal(erreurNomProfil("Marie Dupont"), null);
  assert.equal(erreurNomProfil("  Al  "), null);
  assert.match(erreurNomProfil(""), /2 caractères au moins/);
  assert.match(erreurNomProfil("   "), /2 caractères au moins/);
  assert.match(erreurNomProfil(null), /2 caractères au moins/);
  assert.match(erreurNomProfil("M"), /2 caractères au moins/);
  assert.equal(erreurNomProfil("a".repeat(80)), null);
  assert.match(erreurNomProfil("a".repeat(81)), /80 caractères au plus/);
  assert.match(erreurNomProfil(" marie@exemple.fr "), /pas une adresse e-mail/);
});
