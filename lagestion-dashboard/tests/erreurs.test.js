// Messages d'erreur affichés : jamais de texte technique en anglais : node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { erreurFrancaise, messageErreur, MESSAGE_REFUS, MESSAGE_TECHNIQUE } from "../src/utils/erreurs.js";

test("message technique demandé, avec espace insécable avant le point-virgule", () => {
  assert.equal(
    MESSAGE_TECHNIQUE,
    "Une erreur technique est survenue. Réessayez dans un instant ; si le problème persiste, contactez le support."
  );
});

test("erreurs techniques en anglais remplacées par le message générique", () => {
  const erreurs = [
    { code: "PGRST205", message: "Could not find the table 'public.devis' in the schema cache" },
    { code: "PGRST202", message: "Could not find the function public.convertir_devis(p_devis_id) in the schema cache" },
    { code: "42P01", message: 'relation "public.devis" does not exist' },
    { code: "42703", message: 'column devis.statut does not exist' },
    { code: "22P02", message: 'invalid input syntax for type uuid: "x"' },
    { code: "23514", message: 'new row for relation "devis" violates check constraint' },
    { code: "", message: "TypeError: Failed to fetch" },
    { message: "JWT expired" },
    new TypeError("Failed to fetch"),
    null,
  ];
  for (const e of erreurs) assert.equal(messageErreur(e), MESSAGE_TECHNIQUE, e?.message);
});

test("messages français des triggers et des fonctions conservés", () => {
  const m = "Un devis accepté ne peut plus être modifié. Un administrateur ou un manager doit d'abord le repasser en envoyé.";
  assert.equal(messageErreur({ code: "P0001", message: m }), m);
  const r = "Seul un administrateur ou un manager peut modifier le statut d'un devis accepté.";
  assert.equal(messageErreur({ code: "42501", message: r }), r);
  assert.equal(
    messageErreur({ code: "P0001", message: "devis.client_id ne référence pas une ligne de la même entreprise." }),
    "Opération refusée : l'élément lié appartient à une autre entreprise."
  );
});

test("refus de droits et cas connus traduits", () => {
  assert.equal(
    messageErreur({ code: "42501", message: 'new row violates row-level security policy for table "devis"' }),
    "Action refusée : votre rôle ne permet pas cette opération dans cette entreprise."
  );
  assert.equal(messageErreur({ code: "PGRST116", message: "JSON object requested" }), MESSAGE_REFUS);
  assert.equal(messageErreur({ code: "23505", message: "duplicate key" }), "Cet élément existe déjà (même e-mail, SIREN ou numéro).");
});

test("erreurFrancaise conserve le code et les détails", () => {
  const e = erreurFrancaise({ code: "23505", message: "duplicate key", details: "Key (siren)=(1) already exists." });
  assert.equal(e.code, "23505");
  assert.equal(e.details, "Key (siren)=(1) already exists.");
});
