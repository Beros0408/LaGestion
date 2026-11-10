import { test } from "node:test";
import assert from "node:assert/strict";
import {
  avertissementSirenClient, emetteurDocument, formaterSiren, formaterSiret, lignesIdentite, lignesMentions, mentionsManquantes, texteTauxPenalites,
} from "../src/utils/mentions.js";

const N = " ";

// Émetteur figé par la migration 014 (instantane_emetteur), champs vides omis.
const EMETTEUR = {
  mentions: 2, nom: "Rénov Démo", siret: "12121212000012", adresse: "12 rue des Lilas, 75011 Paris",
  forme_juridique: "SAS", capital_social: 10000, immatriculation_type: "rcs", immatriculation_lieu: "Paris",
  tva_intra: "FR56121212120", franchise_tva: false, option_debits: true, penalites_mode: "bce_10",
  escompte: "Pas d'escompte pour paiement anticipé.", iban: "FR7630006000011234567890189", assurance_pro: "Assureur X, contrat 1, France",
  logo: "e/logo-1.png",
};
const FACTURE = {
  statut: "envoyee", type: "facture", date_prestation: "2026-10-15", adresse_livraison: "5 chantier des Lilas",
  categorie_operation: "mixte", conditions_paiement: "30 jours net", mode_paiement: "virement", emetteur_fige: EMETTEUR,
};
const PRO = { type: "entreprise", siren: "552100554" };
const PARTICULIER = { type: "particulier" };

test("identité de l'émetteur : forme et capital, SIRET, RCS avec SIREN, TVA", () => {
  assert.deepEqual(lignesIdentite(EMETTEUR), [
    `SAS au capital de 10${N}000,00${N}€`,
    `SIRET 121${N}212${N}120${N}00012`,
    `RCS Paris 121${N}212${N}120`,
    "N° TVA intracommunautaire FR56121212120",
  ]);
  assert.deepEqual(lignesIdentite({ forme_juridique: "EI", capital_social: 500, immatriculation_type: "rm", immatriculation_lieu: "75", siret: "" }),
    ["Entrepreneur individuel (EI)", "RM 75"]);
  assert.deepEqual(lignesIdentite({ forme_juridique: "SCI", immatriculation_type: "dispense" }), ["SCI", "Dispensé d'immatriculation au RCS et au RM"]);
  // Document antérieur à 014 : seul le SIRET figurait
  assert.deepEqual(lignesIdentite({ nom: "Ancien", siret: "11111111100011", adresse: "1 rue" }), [`SIRET 111${N}111${N}111${N}00011`]);
  assert.deepEqual(lignesIdentite(null), []);
});

test("formatage du SIRET (affichage seul) : 3-3-3-5 en espaces insécables", () => {
  assert.equal(formaterSiret("73282932000074"), `732${N}829${N}320${N}00074`);
  // Valeur vide
  assert.equal(formaterSiret(""), "");
  assert.equal(formaterSiret("   "), "");
  assert.equal(formaterSiret(null), "");
  assert.equal(formaterSiret(undefined), "");
  // Valeur déjà espacée (espaces normales, insécables ou mal groupées)
  assert.equal(formaterSiret("732 829 320 00074"), `732${N}829${N}320${N}00074`);
  assert.equal(formaterSiret(`732${N}829${N}320${N}00074`), `732${N}829${N}320${N}00074`);
  assert.equal(formaterSiret(" 7328 2932 0000 74 "), `732${N}829${N}320${N}00074`);
  // Valeur invalide laissée telle quelle (espaces de bord retirées)
  assert.equal(formaterSiret("123"), "123");
  assert.equal(formaterSiret("7328293200007A"), "7328293200007A");
  assert.equal(formaterSiret("732829320000745"), "732829320000745");
  assert.equal(formaterSiret(" 732-829-320 "), "732-829-320");
  // Nombre
  assert.equal(formaterSiret(73282932000074), `732${N}829${N}320${N}00074`);
});

test("formatage du SIREN (affichage seul) : 3-3-3 en espaces insécables", () => {
  assert.equal(formaterSiren("732829320"), `732${N}829${N}320`);
  assert.equal(formaterSiren("732 829 320"), `732${N}829${N}320`);
  assert.equal(formaterSiren(""), "");
  assert.equal(formaterSiren(null), "");
  assert.equal(formaterSiren("12345678"), "12345678");
});

test("mentions d'une facture pour un professionnel : texte exact et ordre", () => {
  assert.deepEqual(lignesMentions({ type: "facture", document: FACTURE, emetteur: EMETTEUR, client: PRO }), [
    `Date de la prestation ou de la livraison${N}: 15 octobre 2026`,
    `Adresse de livraison${N}: 5 chantier des Lilas`,
    `Catégorie de l'opération${N}: Opération mixte (biens et services)`,
    "Option pour le paiement de la taxe d'après les débits.",
    `Conditions de paiement${N}: 30 jours net`,
    `Mode de paiement${N}: Virement`,
    `Escompte${N}: Pas d'escompte pour paiement anticipé.`,
    `Pénalités de retard${N}: taux appliqué par la Banque centrale européenne à son opération de refinancement la plus récente, majoré de 10${N}points de pourcentage, exigibles dès le lendemain de la date d'échéance.`,
    `Indemnité forfaitaire pour frais de recouvrement en cas de retard de paiement${N}: 40${N}€ (art.${N}L.${N}441-10 et D.${N}441-5 du Code de commerce).`,
    `IBAN${N}: FR76${N}3000${N}6000${N}0112${N}3456${N}7890${N}189`,
    `Assurance professionnelle${N}: Assureur X, contrat 1, France`,
  ]);
});

test("particulier : pas d'indemnité de 40 € ; acompte et solde : mêmes mentions qu'une facture", () => {
  const p = lignesMentions({ type: "facture", document: FACTURE, emetteur: EMETTEUR, client: PARTICULIER });
  assert.ok(!p.some((l) => l.includes("40")) && p.some((l) => l.startsWith("Pénalités")));
  for (const type of ["acompte", "solde"]) {
    assert.deepEqual(lignesMentions({ type, document: FACTURE, emetteur: EMETTEUR, client: PRO }),
      lignesMentions({ type: "facture", document: FACTURE, emetteur: EMETTEUR, client: PRO }), type);
  }
});

test("avoir et devis : ni opération ni conditions de paiement ; franchise imprimée partout", () => {
  const franchise = { ...EMETTEUR, franchise_tva: true, tva_intra: undefined };
  assert.deepEqual(lignesMentions({ type: "avoir", document: FACTURE, emetteur: franchise, client: PRO }), [`TVA non applicable, art.${N}293${N}B du CGI.`]);
  assert.deepEqual(lignesMentions({ type: "devis", document: {}, emetteur: franchise, client: PRO }),
    [`TVA non applicable, art.${N}293${N}B du CGI.`, `Assurance professionnelle${N}: Assureur X, contrat 1, France`]);
  assert.ok(lignesMentions({ type: "facture", document: FACTURE, emetteur: franchise, client: PRO }).includes(`TVA non applicable, art.${N}293${N}B du CGI.`));
});

test("document émis avant la migration 014 : aucune nouvelle mention, ni pénalités ni 40 €", () => {
  const ancien = { statut: "envoyee", type: "facture", emetteur_fige: { nom: "Ancien", siret: "11111111100011", adresse: "1 rue" } };
  assert.deepEqual(lignesMentions({ type: "facture", document: ancien, emetteur: emetteurDocument(ancien, EMETTEUR), client: PRO }), []);
  // Même ses conditions de paiement ne s'ajoutent pas : le document reste tel qu'il a été émis
  assert.deepEqual(lignesMentions({ type: "facture", document: { ...ancien, conditions_paiement: "45 jours", mode_paiement: "virement" }, emetteur: ancien.emetteur_fige, client: PRO }), []);
  // Avoir ancien : rien non plus
  assert.deepEqual(lignesMentions({ type: "avoir", document: { ...ancien, type: "avoir" }, emetteur: ancien.emetteur_fige, client: PRO }), []);
});

test("émetteur : figé pour un document émis, paramètres actuels (logo_url → logo) pour un brouillon ou un devis", () => {
  const entreprise = { nom: "Actuelle", logo_url: "e/logo-2.png", forme_juridique: "SA" };
  assert.equal(emetteurDocument(FACTURE, entreprise), EMETTEUR);
  assert.deepEqual(emetteurDocument({ statut: "brouillon", emetteur_fige: null }, entreprise), { nom: "Actuelle", forme_juridique: "SA", logo: "e/logo-2.png" });
  assert.deepEqual(emetteurDocument(null, entreprise), { nom: "Actuelle", forme_juridique: "SA", logo: "e/logo-2.png" });
  assert.equal(emetteurDocument(null, null), null);
});

test("taux des pénalités", () => {
  assert.equal(texteTauxPenalites({ penalites_mode: "trois_interet_legal" }), "trois fois le taux d'intérêt légal");
  assert.equal(texteTauxPenalites({ penalites_mode: "taux_fixe", penalites_taux: 12.5 }), `taux annuel de 12,5${N}%`);
  assert.equal(texteTauxPenalites({ penalites_mode: "taux_fixe", penalites_taux: "10.00" }), `taux annuel de 10${N}%`);
  assert.equal(texteTauxPenalites({ penalites_mode: "taux_fixe" }), null);
  assert.equal(texteTauxPenalites({}), null);
  assert.equal(texteTauxPenalites(null), null);
});

test("mentions manquantes : mêmes règles et libellés que mentions_manquantes en SQL (test 014)", () => {
  const base = { siret: "12121212000012", adresse: "1 rue", franchise_tva: false };
  assert.deepEqual(mentionsManquantes(base),
    ["forme juridique", "immatriculation (RCS ou RM et son lieu)", "n° de TVA intracommunautaire (ou franchise de TVA)"]);
  assert.deepEqual(mentionsManquantes({ ...base, forme_juridique: "SAS", immatriculation_type: "rcs", tva_intra: "FR56121212120" }),
    ["capital social", "immatriculation (RCS ou RM et son lieu)"]);
  assert.deepEqual(mentionsManquantes({ ...base, forme_juridique: "EI", immatriculation_type: "dispense", tva_intra: "FR56121212120" }), []);
  assert.deepEqual(mentionsManquantes({ ...base, forme_juridique: "SNC", immatriculation_type: "rm", immatriculation_lieu: "75", franchise_tva: true }), []);
  assert.deepEqual(mentionsManquantes({ forme_juridique: "EI", immatriculation_type: "dispense", franchise_tva: true }), ["SIRET", "adresse du siège"]);
  assert.deepEqual(mentionsManquantes(null), []);
});

test("SIREN du client professionnel : avertissement sans blocage", () => {
  assert.match(avertissementSirenClient({ type: "entreprise", siren: "" }), /SIREN de ce client professionnel/);
  assert.equal(avertissementSirenClient({ type: "entreprise", siren: "552100554" }), null);
  assert.equal(avertissementSirenClient({ type: "particulier" }), null);
  assert.equal(avertissementSirenClient(null), null);
});
