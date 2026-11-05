import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { C, alpha } from "../theme";
import { useFactures } from "../context/FacturesContext.jsx";
import { useClients } from "../context/ClientsContext.jsx";
import { STATUTS, LIBELLE_STATUT } from "../data/factures";
import {
  LIGNE_VIDE,
  MESSAGE_REMISE_PLAFOND,
  calculerRecap,
  ligneDepuisFormulaire,
  ligneVersFormulaire,
  validerLignes,
} from "../utils/lignesDocument";
import Input from "../components/form/Input.jsx";
import Select from "../components/form/Select.jsx";
import Textarea from "../components/form/Textarea.jsx";
import { useGardeModifications, useQuitter } from "../context/GardeModificationsContext.jsx";
import LignesDocument from "../components/document/LignesDocument.jsx";
import RecapitulatifDocument from "../components/document/RecapitulatifDocument.jsx";

const VIDE = {
  client_id: "",
  date_emission: new Date().toISOString().slice(0, 10),
  date_echeance: "",
  statut: "brouillon",
  remise: "0",
  mode_paiement: "",
  conditions_paiement: "",
  notes_internes: "",
  message_client: "",
  lignes: [{ ...LIGNE_VIDE }],
};

const STATUT_OPTIONS = STATUTS.map((s) => ({ value: s, label: LIBELLE_STATUT[s] }));

const MODE_PAIEMENT_OPTIONS = [
  { value: "", label: "— Non précisé —" },
  { value: "virement", label: "Virement" },
  { value: "carte", label: "Carte" },
  { value: "cheque", label: "Chèque" },
  { value: "especes", label: "Espèces" },
  { value: "autre", label: "Autre" },
];

function normaliser(existant) {
  return {
    client_id: existant.client_id != null ? String(existant.client_id) : "",
    date_emission: existant.date_emission ?? "",
    date_echeance: existant.date_echeance ?? "",
    statut: existant.statut ?? "brouillon",
    remise: existant.remise != null ? String(existant.remise) : "0",
    mode_paiement: existant.mode_paiement ?? "",
    conditions_paiement: existant.conditions_paiement ?? "",
    notes_internes: existant.notes_internes ?? "",
    message_client: existant.message_client ?? "",
    lignes: (existant.lignes ?? []).map(ligneVersFormulaire),
  };
}

export default function FactureForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { factures, addFacture, updateFacture, chargement } = useFactures();
  const { clients } = useClients();

  const modeEdition = Boolean(id);

  const existant = useMemo(
    () => (modeEdition ? factures.find((f) => f.id === id) : null),
    [modeEdition, factures, id]
  );

  const [form, setForm] = useState(() => (existant ? normaliser(existant) : VIDE));
  const [errors, setErrors] = useState({});
  const [erreurSoumission, setErreurSoumission] = useState(null);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const quitter = useQuitter();
  const etatInitial = useMemo(() => (existant ? normaliser(existant) : VIDE), [existant]);
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
        style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}
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
    if (Object.keys(errs).length > 0) return;

    const payload = {
      client_id: form.client_id,
      date_emission: form.date_emission || null,
      date_echeance: form.date_echeance || null,
      statut: form.statut,
      remise: Number(form.remise) || 0,
      mode_paiement: form.mode_paiement || null,
      conditions_paiement: form.conditions_paiement,
      notes_internes: form.notes_internes,
      message_client: form.message_client,
      lignes: form.lignes.map(ligneDepuisFormulaire),
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
          {modeEdition ? "Modifier la facture" : "Nouvelle facture"}
        </h2>
        <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>
          {modeEdition
            ? `Facture ${existant?.numero ?? ""} — mettez à jour son contenu.`
            : "Le numéro sera généré automatiquement à l'enregistrement."}
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
        <div className="rounded-2xl p-5" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Select
              label="Client"
              required
              value={form.client_id}
              onChange={(e) => definir("client_id")(e.target.value)}
              options={clientOptions}
              error={errors.client_id}
            />
            <Select
              label="Statut"
              required
              value={form.statut}
              onChange={(e) => definir("statut")(e.target.value)}
              options={STATUT_OPTIONS}
            />
            <Input
              label="Date d'émission"
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
              options={MODE_PAIEMENT_OPTIONS}
            />
            <Input
              label="Conditions de paiement"
              value={form.conditions_paiement}
              onChange={(e) => definir("conditions_paiement")(e.target.value)}
              placeholder="Ex : 30 jours net"
            />
          </div>
        </div>

        <LignesDocument lignes={form.lignes} errors={errors} setForm={setForm} setErrors={setErrors} />

        <RecapitulatifDocument remise={form.remise} onRemise={definir("remise")} erreurRemise={erreurRemise} recap={recap} />

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-2xl p-5" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
            <h3 className="mb-3" style={{ color: C.textPrimary, fontSize: 18, fontWeight: 600 }}>Notes internes</h3>
            <Textarea
              label="Non transmises au client"
              value={form.notes_internes}
              onChange={(e) => definir("notes_internes")(e.target.value)}
              rows={4}
              placeholder="Informations pour l'équipe : historique, points d'attention…"
            />
          </div>
          <div className="rounded-2xl p-5" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
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
                : "Créer la facture"}
          </button>
        </div>
      </form>
    </>
  );
}
