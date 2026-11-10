import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertCircle, Lock } from "lucide-react";
import { BORDURE_CARTE, C, alpha } from "../theme";
import { useDevis } from "../context/DevisContext.jsx";
import { useClients } from "../context/ClientsContext.jsx";
import { aujourdhui, dansJours, devisModifiable, LIBELLE_STATUT_DEVIS } from "../data/devis";
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
import LignesDocument from "../components/document/LignesDocument.jsx";
import RecapitulatifDocument from "../components/document/RecapitulatifDocument.jsx";

function formulaireVide() {
  const emission = aujourdhui();
  return {
    client_id: "",
    date_emission: emission,
    date_validite: dansJours(emission, 30),
    remise: "0",
    notes_internes: "",
    message_client: "",
    lignes: [{ ...LIGNE_VIDE }],
  };
}

function normaliser(existant) {
  return {
    client_id: existant.client_id ?? "",
    date_emission: existant.date_emission ?? "",
    date_validite: existant.date_validite ?? "",
    remise: existant.remise != null ? String(existant.remise) : "0",
    notes_internes: existant.notes_internes ?? "",
    message_client: existant.message_client ?? "",
    lignes: (existant.lignes ?? []).map(ligneVersFormulaire),
  };
}

export default function DevisForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { devis, addDevis, updateDevis, chargement } = useDevis();
  const { clients, chargement: chargementClients } = useClients();

  const modeEdition = Boolean(id);
  const existant = useMemo(() => (modeEdition ? devis.find((d) => d.id === id) : null), [modeEdition, devis, id]);

  const [vide] = useState(formulaireVide);
  const [form, setForm] = useState(() => (existant ? normaliser(existant) : vide));
  const [errors, setErrors] = useState({});
  const [erreurSoumission, setErreurSoumission] = useState(null);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const quitter = useQuitter();
  const etatInitial = useMemo(() => (existant ? normaliser(existant) : vide), [existant, vide]);
  useGardeModifications(JSON.stringify(form) !== JSON.stringify(etatInitial));

  useEffect(() => {
    if (modeEdition && existant) setForm(normaliser(existant));
  }, [modeEdition, existant]);

  // Client supprimé : affiché tel quel dans la liste, à remplacer avant d'enregistrer.
  const clientSupprime =
    Boolean(form.client_id) && !chargementClients && !clients.some((c) => c.id === form.client_id);

  const clientOptions = useMemo(
    () => [
      { value: "", label: "— Sélectionner un client —" },
      ...(clientSupprime ? [{ value: form.client_id, label: "Client supprimé — à remplacer" }] : []),
      ...clients
        .slice()
        .sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }))
        .map((c) => ({ value: c.id, label: c.nom })),
    ],
    [clients, clientSupprime, form.client_id]
  );

  const recap = useMemo(() => calculerRecap(form.remise, form.lignes), [form.lignes, form.remise]);
  const erreurRemise = recap.plafonnee
    ? MESSAGE_REMISE_PLAFOND
    : errors.remise !== MESSAGE_REMISE_PLAFOND ? errors.remise : undefined;

  const retour = modeEdition ? `/devis/${id}` : "/devis";

  if (modeEdition && !chargement && !existant) {
    return (
      <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: C.fondCarte, border: BORDURE_CARTE }}>
        <p className="text-sm" style={{ color: C.textSecondary }}>Devis introuvable.</p>
        <button
          type="button"
          onClick={() => navigate("/devis")}
          className="mt-4 rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
          style={{ color: C.primary, backgroundColor: alpha(C.primary, 0.08) }}
        >
          Retour à la liste
        </button>
      </div>
    );
  }

  // Lien direct vers le formulaire d'un devis verrouillé : la base refuserait de toute façon l'écriture.
  if (existant && !devisModifiable(existant.statut)) {
    return (
      <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: C.fondCarte, border: BORDURE_CARTE }}>
        <Lock size={24} aria-hidden="true" className="mx-auto" style={{ color: C.textSecondary }} />
        <p className="mt-3 text-sm" style={{ color: C.textPrimary }}>
          {`Le devis ${existant.numero} est ${LIBELLE_STATUT_DEVIS[existant.statut].toLowerCase()} : il ne peut plus être modifié.`}
        </p>
        <Link
          to={`/devis/${existant.id}`}
          className="mt-4 inline-block rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
          style={{ color: C.primary, backgroundColor: alpha(C.primary, 0.08) }}
        >
          Retour à la fiche
        </Link>
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
    else if (clientSupprime) errs.client_id = "Ce client a été supprimé. Choisissez-en un autre.";
    if (!data.date_emission) errs.date_emission = "La date d'émission est requise.";
    if (!data.date_validite) errs.date_validite = "La date de validité est requise.";
    else if (data.date_emission && data.date_validite < data.date_emission) {
      errs.date_validite = "La date de validité ne peut pas précéder la date d'émission.";
    }
    Object.assign(errs, validerLignes(data.lignes));
    const remise = Number(data.remise);
    if (data.remise !== "" && (Number.isNaN(remise) || remise < 0)) {
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
      client_id: form.client_id,
      date_emission: form.date_emission,
      date_validite: form.date_validite,
      remise: Number(form.remise) || 0,
      notes_internes: form.notes_internes,
      message_client: form.message_client,
      lignes: form.lignes.map(ligneDepuisFormulaire),
    };

    setErreurSoumission(null);
    setEnvoiEnCours(true);
    try {
      if (modeEdition) {
        await updateDevis(id, payload);
        navigate(`/devis/${id}`, { replace: true });
      } else {
        const cree = await addDevis(payload);
        navigate(`/devis/${cree.id}`, { replace: true });
      }
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
          {modeEdition ? "Modifier le devis" : "Nouveau devis"}
        </h2>
        <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>
          {modeEdition
            ? `Devis ${existant?.numero ?? ""} — mettez à jour son contenu.`
            : "Le numéro sera attribué automatiquement à l'enregistrement."}
        </p>
      </div>

      {erreurSoumission && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-xl p-3 text-sm"
          style={{ backgroundColor: alpha(C.error, 0.06), color: C.errorText, border: `1px solid ${C.error}` }}
        >
          <AlertCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span><strong className="font-semibold">{"Enregistrement impossible :"}</strong> {erreurSoumission}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="rounded-2xl p-5" style={{ backgroundColor: C.fondCarte, border: BORDURE_CARTE }}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Select
              label="Client"
              required
              value={form.client_id}
              onChange={(e) => definir("client_id")(e.target.value)}
              options={clientOptions}
              error={errors.client_id}
            />
            <Input
              label="Date d'émission"
              type="date"
              required
              value={form.date_emission}
              onChange={(e) => definir("date_emission")(e.target.value)}
              error={errors.date_emission}
            />
            <Input
              label="Valable jusqu'au"
              type="date"
              required
              value={form.date_validite}
              onChange={(e) => definir("date_validite")(e.target.value)}
              error={errors.date_validite}
            />
          </div>
        </div>

        <LignesDocument lignes={form.lignes} errors={errors} setForm={setForm} setErrors={setErrors} />

        <RecapitulatifDocument remise={form.remise} onRemise={definir("remise")} erreurRemise={erreurRemise} recap={recap} />

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
              label="Apparaît sur le devis (PDF)"
              value={form.message_client}
              onChange={(e) => definir("message_client")(e.target.value)}
              rows={4}
              placeholder="Conditions particulières, délai de réalisation…"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => quitter(() => navigate(retour))}
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
            {envoiEnCours ? "Enregistrement…" : modeEdition ? "Enregistrer les modifications" : "Créer le devis"}
          </button>
        </div>
      </form>
    </>
  );
}
