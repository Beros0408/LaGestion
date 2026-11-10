import React, { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { AlertCircle, Lock } from "lucide-react";
import { BORDURE_CARTE, C, alpha, euroCentimes } from "../theme";
import { useFactures } from "../context/FacturesContext.jsx";
import { useClients } from "../context/ClientsContext.jsx";
import { factureModifiable } from "../data/factures";
import { totalAcomptesDeduits } from "../utils/facture";
import {
  LIGNE_VIDE,
  MESSAGE_REMISE_PLAFOND,
  calculerRecap,
  ligneDepuisFormulaire,
  ligneVersFormulaire,
  premierChampEnErreur,
  validerLignes,
} from "../utils/lignesDocument";
import Input from "../components/form/Input.jsx";
import Select from "../components/form/Select.jsx";
import Textarea from "../components/form/Textarea.jsx";
import { useGardeModifications, useQuitter } from "../context/GardeModificationsContext.jsx";
import { useEntreprise } from "../context/EntrepriseContext.jsx";
import { MODES_PAIEMENT, defautsPaiement } from "../utils/parametres";
import { CATEGORIES_OPERATION, avertissementSirenClient } from "../utils/mentions";
import LignesDocument from "../components/document/LignesDocument.jsx";
import RecapitulatifDocument from "../components/document/RecapitulatifDocument.jsx";

const VIDE = {
  client_id: "",
  date_emission: new Date().toISOString().slice(0, 10),
  date_echeance: "",
  remise: "0",
  mode_paiement: "",
  conditions_paiement: "",
  notes_internes: "",
  message_client: "",
  categorie_operation: "services",
  date_prestation: "",
  adresse_livraison: "",
  lignes: [{ ...LIGNE_VIDE }],
};

function normaliser(existant) {
  return {
    client_id: existant.client_id != null ? String(existant.client_id) : "",
    date_emission: existant.date_emission ?? "",
    date_echeance: existant.date_echeance ?? "",
    remise: existant.remise != null ? String(existant.remise) : "0",
    mode_paiement: existant.mode_paiement ?? "",
    conditions_paiement: existant.conditions_paiement ?? "",
    notes_internes: existant.notes_internes ?? "",
    message_client: existant.message_client ?? "",
    categorie_operation: existant.categorie_operation ?? "services",
    date_prestation: existant.date_prestation ?? "",
    adresse_livraison: existant.adresse_livraison ?? "",
    lignes: (existant.lignes ?? []).map(ligneVersFormulaire),
  };
}

export default function FactureForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { factures, addFacture, updateFacture, chargement } = useFactures();
  const { clients } = useClients();
  const { entreprise } = useEntreprise();

  const modeEdition = Boolean(id);

  const existant = useMemo(
    () => (modeEdition ? factures.find((f) => f.id === id) : null),
    [modeEdition, factures, id]
  );

  // Nouvelle facture : échéance, mode et conditions de paiement proposés depuis les paramètres de l'entreprise.
  const vide = useMemo(() => ({ ...VIDE, ...defautsPaiement(entreprise, VIDE.date_emission) }), [entreprise]);
  const [form, setForm] = useState(() => (existant ? normaliser(existant) : vide));
  const [errors, setErrors] = useState({});
  const [erreurSoumission, setErreurSoumission] = useState(null);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const quitter = useQuitter();
  const etatInitial = useMemo(() => (existant ? normaliser(existant) : vide), [existant, vide]);
  useGardeModifications(JSON.stringify(form) !== JSON.stringify(etatInitial));

  useEffect(() => {
    if (modeEdition && existant) {
      setForm(normaliser(existant));
    }
  }, [modeEdition, existant]);

  const clientOptions = useMemo(
    () => [
      { value: "", label: "— Sélectionner un client —" },
      ...clients
        .slice()
        .sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }))
        .map((c) => ({ value: c.id, label: c.nom })),
    ],
    [clients]
  );

  const recap = useMemo(() => calculerRecap(form.remise, form.lignes), [form.lignes, form.remise]);
  // Remise supérieure au HT des lignes : signalée dès la saisie (l'erreur de validation obsolète est ignorée).
  const erreurRemise = recap.plafonnee
    ? MESSAGE_REMISE_PLAFOND
    : errors.remise !== MESSAGE_REMISE_PLAFOND ? errors.remise : undefined;

  if (modeEdition && !chargement && !existant) {
    return (
      <div
        className="rounded-2xl p-8 text-center"
        style={{ backgroundColor: C.fondCarte, border: BORDURE_CARTE }}
      >
        <p className="text-sm" style={{ color: C.textSecondary }}>Facture introuvable.</p>
        <button
          type="button"
          onClick={() => navigate("/factures")}
          className="mt-4 rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
          style={{ color: C.primary, backgroundColor: alpha(C.primary, 0.08) }}
        >
          Retour à la liste
        </button>
      </div>
    );
  }

  // Un avoir a son propre formulaire.
  if (existant?.type === "avoir" && factureModifiable(existant.statut)) {
    return <Navigate to={`/factures/${existant.id}/avoir/modifier`} replace />;
  }

  // Lien direct vers le formulaire d'une facture finalisée : la base refuserait de toute façon l'écriture.
  if (existant && !factureModifiable(existant.statut)) {
    return (
      <div
        className="rounded-2xl p-8 text-center"
        style={{ backgroundColor: C.fondCarte, border: BORDURE_CARTE }}
      >
        <Lock size={24} aria-hidden="true" className="mx-auto" style={{ color: C.textSecondary }} />
        <p className="mt-3 text-sm" style={{ color: C.textPrimary }}>
          {existant.type === "avoir"
            ? `L'avoir ${existant.numero} est finalisé : il ne peut plus être modifié.`
            : `La facture ${existant.numero} est finalisée : elle ne peut plus être modifiée. Sa correction passe par un avoir.`}
        </p>
        <Link
          to={`/factures/${existant.id}`}
          className="mt-4 inline-block rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
          style={{ color: C.primary, backgroundColor: alpha(C.primary, 0.08) }}
        >
          Retour à la fiche
        </Link>
      </div>
    );
  }

  const estAcompte = existant?.type === "acompte";
  const estSolde = existant?.type === "solde";

  const definir = (cle) => (valeur) => {
    setForm((prev) => ({ ...prev, [cle]: valeur }));
    setErrors((prev) => {
      if (!prev[cle]) return prev;
      const next = { ...prev };
      delete next[cle];
      return next;
    });
  };

  const valider = (data) => {
    const errs = {};
    if (!data.client_id) errs.client_id = "Le client est requis.";
    Object.assign(errs, validerLignes(data.lignes));
    const remiseGlobale = Number(data.remise);
    if (data.remise !== "" && (Number.isNaN(remiseGlobale) || remiseGlobale < 0)) {
      errs.remise = "La remise doit être ≥ 0.";
    } else if (recap.plafonnee) {
      errs.remise = MESSAGE_REMISE_PLAFOND;
    }
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = valider(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      const champ = premierChampEnErreur(errs.ligneItems);
      if (champ) document.getElementById(champ)?.focus();
      return;
    }

    const payload = {
      ...(estAcompte || estSolde ? {} : { client_id: form.client_id }),
      date_emission: form.date_emission || null,
      date_echeance: form.date_echeance || null,
      ...(estAcompte ? {} : { remise: Number(form.remise) || 0 }),
      mode_paiement: form.mode_paiement || null,
      conditions_paiement: form.conditions_paiement,
      notes_internes: form.notes_internes,
      message_client: form.message_client,
      categorie_operation: form.categorie_operation || null,
      date_prestation: form.date_prestation || null,
      adresse_livraison: form.adresse_livraison,
      ...(estAcompte ? {} : { lignes: form.lignes.map(ligneDepuisFormulaire) }),
    };

    setErreurSoumission(null);
    setEnvoiEnCours(true);
    try {
      if (modeEdition) {
        await updateFacture(id, payload);
      } else {
        await addFacture(payload);
      }
      navigate("/factures", { replace: true });
    } catch (err) {
      setErreurSoumission(err?.message ?? "Une erreur est survenue.");
    } finally {
      setEnvoiEnCours(false);
    }
  };

  return (
    <>
      <div className="mb-5">
        <h2 className="text-[28px] font-semibold leading-tight" style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}>
          {!modeEdition ? "Nouvelle facture" : estAcompte ? "Modifier le brouillon d'acompte" : estSolde ? "Modifier le brouillon de solde" : "Modifier le brouillon"}
        </h2>
        <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>
          {estAcompte
            ? "Le montant de l'acompte est calculé depuis le devis : pour le changer, supprimez ce brouillon et recréez l'acompte."
            : "Brouillon modifiable. Le numéro définitif et la date d'émission seront attribués à la finalisation."}
        </p>
      </div>

      {erreurSoumission && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-xl p-3 text-sm"
          style={{
            backgroundColor: alpha(C.error, 0.06),
            color: C.errorText,
            border: `1px solid ${C.error}`,
          }}
        >
          <AlertCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span><strong className="font-semibold">Enregistrement impossible :</strong> {erreurSoumission}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="rounded-2xl p-5" style={{ backgroundColor: C.fondCarte, border: BORDURE_CARTE }}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Select
              label="Client"
              required
              disabled={estAcompte || estSolde}
              value={form.client_id}
              onChange={(e) => definir("client_id")(e.target.value)}
              options={clientOptions}
              error={errors.client_id}
              hint={avertissementSirenClient(clients.find((c) => c.id === form.client_id)) ?? undefined}
            />
            <Input
              label="Date d'émission prévue"
              type="date"
              value={form.date_emission}
              onChange={(e) => definir("date_emission")(e.target.value)}
            />
            <Input
              label="Date d'échéance"
              type="date"
              value={form.date_echeance}
              onChange={(e) => definir("date_echeance")(e.target.value)}
            />
            <Select
              label="Mode de paiement"
              value={form.mode_paiement}
              onChange={(e) => definir("mode_paiement")(e.target.value)}
              options={MODES_PAIEMENT}
            />
            <Input
              label="Conditions de paiement"
              value={form.conditions_paiement}
              onChange={(e) => definir("conditions_paiement")(e.target.value)}
              placeholder="Ex : 30 jours net"
            />
            <Select
              label="Catégorie de l'opération"
              value={form.categorie_operation}
              onChange={(e) => definir("categorie_operation")(e.target.value)}
              options={CATEGORIES_OPERATION}
            />
            <Input
              label="Date de la prestation ou de la livraison"
              type="date"
              value={form.date_prestation}
              onChange={(e) => definir("date_prestation")(e.target.value)}
              hint="Laissée vide : la date d'émission est retenue à la finalisation."
            />
            <Input
              label="Adresse de livraison ou du chantier"
              value={form.adresse_livraison}
              onChange={(e) => definir("adresse_livraison")(e.target.value)}
              hint="Seulement si elle diffère de l'adresse du client."
              className="md:col-span-2"
            />
          </div>
        </div>

        {!estAcompte && (
          <>
            <LignesDocument lignes={form.lignes} errors={errors} setForm={setForm} setErrors={setErrors} />
            <RecapitulatifDocument remise={form.remise} onRemise={definir("remise")} erreurRemise={erreurRemise} recap={recap} />
          </>
        )}
        {estSolde && (
          <p role="status" className="mt-4 rounded-2xl p-5 text-sm" style={{ backgroundColor: C.fondCarte, border: BORDURE_CARTE, color: C.textPrimary }}>
            {`Acomptes déduits : ${euroCentimes(totalAcomptesDeduits(existant))}. Net à payer après déduction : ${euroCentimes(Math.round((recap.ttc - totalAcomptesDeduits(existant)) * 100) / 100)}.`}
          </p>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-2xl p-5" style={{ backgroundColor: C.fondCarte, border: BORDURE_CARTE }}>
            <h3 className="mb-3" style={{ color: C.textPrimary, fontSize: 18, fontWeight: 600 }}>Notes internes</h3>
            <Textarea
              label="Non transmises au client"
              value={form.notes_internes}
              onChange={(e) => definir("notes_internes")(e.target.value)}
              rows={4}
              placeholder="Informations pour l'équipe : historique, points d'attention…"
            />
          </div>
          <div className="rounded-2xl p-5" style={{ backgroundColor: C.fondCarte, border: BORDURE_CARTE }}>
            <h3 className="mb-3" style={{ color: C.textPrimary, fontSize: 18, fontWeight: 600 }}>Message client</h3>
            <Textarea
              label="Apparaît sur la facture (PDF)"
              value={form.message_client}
              onChange={(e) => definir("message_client")(e.target.value)}
              rows={4}
              placeholder="Merci pour votre confiance. Conditions particulières…"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => quitter(() => navigate("/factures"))}
            className="rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
            style={{ color: C.textSecondary, backgroundColor: "transparent", border: `1px solid ${C.border}` }}
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={envoiEnCours}
            className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: C.primary }}
          >
            {envoiEnCours
              ? "Enregistrement…"
              : modeEdition
                ? "Enregistrer les modifications"
                : "Créer le brouillon"}
          </button>
        </div>
      </form>
    </>
  );
}
