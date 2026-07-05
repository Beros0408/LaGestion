import React, { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, AlertCircle, ExternalLink } from "lucide-react";
import { C } from "../theme";
import { useClients } from "../context/ClientsContext.jsx";
import { detecterDoublons } from "../utils/doublons";
import Input from "../components/form/Input.jsx";
import Select from "../components/form/Select.jsx";
import Textarea from "../components/form/Textarea.jsx";
import TagInput from "../components/form/TagInput.jsx";

const VIDE = {
  type: "particulier",
  nom: "",
  email: "",
  telephone: "",
  adresse: "",
  statut: "prospect",
  tags: [],
  notes: "",
  siren: "",
  siret: "",
  tva_intra: "",
  site_web: "",
  date_naissance: "",
};

const TYPE_OPTIONS = [
  { value: "particulier", label: "Particulier" },
  { value: "entreprise", label: "Entreprise" },
];

const STATUT_OPTIONS = [
  { value: "actif", label: "Actif" },
  { value: "prospect", label: "Prospect" },
  { value: "inactif", label: "Inactif" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normaliserExistant(existant) {
  return {
    type: existant.type ?? "particulier",
    nom: existant.nom ?? "",
    email: existant.email ?? "",
    telephone: existant.telephone ?? "",
    adresse: existant.adresse ?? "",
    statut: existant.statut ?? "prospect",
    tags: Array.isArray(existant.tags) ? [...existant.tags] : [],
    notes: existant.notes ?? "",
    siren: existant.siren ?? "",
    siret: existant.siret ?? "",
    tva_intra: existant.tva_intra ?? "",
    site_web: existant.site_web ?? "",
    date_naissance: existant.date_naissance ?? "",
  };
}

function traduireErreurBase(err) {
  const code = err?.code;
  const raw = (err?.details || err?.message || "").toLowerCase();
  if (code === "23505") {
    if (raw.includes("email")) return "Un client avec cette adresse e-mail existe déjà.";
    if (raw.includes("siren")) return "Un client avec ce numéro SIREN existe déjà.";
    return "Un client avec ces informations existe déjà (contrainte d'unicité).";
  }
  return err?.message || "Une erreur est survenue lors de l'enregistrement.";
}

function BoiteMessage({ enfants, action }) {
  return (
    <div
      className="rounded-2xl p-8 text-center"
      style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}
    >
      <p className="text-sm" style={{ color: C.textSecondary }}>{enfants}</p>
      {action}
    </div>
  );
}

export default function ClientForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { clients, chargement } = useClients();

  const modeEdition = Boolean(id);
  const idNumerique = id ? Number(id) : null;

  const existant = useMemo(
    () => (modeEdition ? clients.find((c) => c.id === idNumerique) : null),
    [modeEdition, clients, idNumerique]
  );

  if (modeEdition && !existant) {
    if (chargement) {
      return <BoiteMessage enfants="Chargement du client…" />;
    }
    return (
      <BoiteMessage
        enfants="Client introuvable."
        action={
          <button
            type="button"
            onClick={() => navigate("/clients")}
            className="mt-4 rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
            style={{ color: C.primary, backgroundColor: "rgba(45,91,127,0.08)" }}
          >
            Retour à la liste
          </button>
        }
      />
    );
  }

  return (
    <FormulaireClient
      modeEdition={modeEdition}
      idNumerique={idNumerique}
      existant={existant}
    />
  );
}

function FormulaireClient({ modeEdition, idNumerique, existant }) {
  const navigate = useNavigate();
  const { clients, addClient, updateClient } = useClients();

  const [form, setForm] = useState(() => (existant ? normaliserExistant(existant) : VIDE));
  const [errors, setErrors] = useState({});
  const [dbError, setDbError] = useState("");
  const [soumission, setSoumission] = useState(false);

  const doublons = useMemo(
    () => detecterDoublons(form, clients, idNumerique),
    [form, clients, idNumerique]
  );
  const certains = useMemo(() => doublons.filter((d) => d.confiance >= 100), [doublons]);
  const potentiels = useMemo(
    () => doublons.filter((d) => d.confiance >= 40 && d.confiance < 100),
    [doublons]
  );

  const definir = (cle) => (valeur) => {
    setForm((prev) => ({ ...prev, [cle]: valeur }));
    setErrors((prev) => {
      if (!prev[cle]) return prev;
      const next = { ...prev };
      delete next[cle];
      return next;
    });
    if (dbError) setDbError("");
  };

  const valider = (data) => {
    const errs = {};
    if (!data.nom.trim()) errs.nom = "Le nom est requis.";
    if (data.email.trim() && !EMAIL_RE.test(data.email.trim())) errs.email = "Adresse e-mail invalide.";
    return errs;
  };

  const construirePayload = () => {
    const commun = {
      type: form.type,
      nom: form.nom,
      email: form.email,
      telephone: form.telephone,
      adresse: form.adresse,
      statut: form.statut,
      tags: form.tags,
      notes: form.notes,
    };
    if (form.type === "entreprise") {
      return {
        ...commun,
        siren: form.siren,
        siret: form.siret,
        tva_intra: form.tva_intra,
        site_web: form.site_web,
        date_naissance: null,
      };
    }
    return {
      ...commun,
      siren: null,
      siret: null,
      tva_intra: null,
      site_web: null,
      date_naissance: form.date_naissance,
    };
  };

  const enregistrer = async () => {
    const errs = valider(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    const payload = construirePayload();
    setSoumission(true);
    setDbError("");
    try {
      if (modeEdition) {
        await updateClient(idNumerique, payload);
      } else {
        await addClient({ ...payload, score: 50 });
      }
      navigate("/clients");
    } catch (err) {
      setDbError(traduireErreurBase(err));
    } finally {
      setSoumission(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = valider(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    if (certains.length > 0) return;
    enregistrer();
  };

  return (
    <>
      <div className="mb-5">
        <h2
          className="text-[28px] font-semibold leading-tight"
          style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}
        >
          {modeEdition ? "Modifier le client" : "Nouveau client"}
        </h2>
        <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>
          {modeEdition
            ? "Mettez à jour les informations du client."
            : "Renseignez les informations du nouveau client."}
        </p>
      </div>

      {dbError && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-xl p-3 text-sm"
          style={{
            backgroundColor: "rgba(231,76,60,0.08)",
            color: C.error,
            border: `1px solid ${C.error}`,
          }}
        >
          <AlertCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>{dbError}</span>
        </div>
      )}

      {certains.length > 0 && (
        <EncartCertains
          matches={certains}
          modeEdition={modeEdition}
          soumission={soumission}
          onCreerQuandMeme={enregistrer}
        />
      )}

      {certains.length === 0 && potentiels.length > 0 && (
        <EncartPotentiels matches={potentiels} />
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div
          className="rounded-2xl p-5"
          style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Select
              label="Type"
              required
              value={form.type}
              onChange={(e) => definir("type")(e.target.value)}
              options={TYPE_OPTIONS}
            />
            <Input
              label={form.type === "entreprise" ? "Raison sociale" : "Nom complet"}
              required
              value={form.nom}
              onChange={(e) => definir("nom")(e.target.value)}
              error={errors.nom}
              autoComplete="name"
            />
            <Input
              label="E-mail"
              type="email"
              value={form.email}
              onChange={(e) => definir("email")(e.target.value)}
              error={errors.email}
              autoComplete="email"
              placeholder="nom@exemple.fr"
            />
            <Input
              label="Téléphone"
              type="tel"
              value={form.telephone}
              onChange={(e) => definir("telephone")(e.target.value)}
              autoComplete="tel"
              placeholder="06 12 34 56 78"
            />

            {form.type === "entreprise" && (
              <>
                <Input
                  label="SIREN"
                  value={form.siren}
                  onChange={(e) => definir("siren")(e.target.value)}
                  inputMode="numeric"
                  placeholder="9 chiffres"
                  autoComplete="off"
                />
                <Input
                  label="SIRET"
                  value={form.siret}
                  onChange={(e) => definir("siret")(e.target.value)}
                  inputMode="numeric"
                  placeholder="14 chiffres"
                  autoComplete="off"
                />
                <Input
                  label="TVA intracommunautaire"
                  value={form.tva_intra}
                  onChange={(e) => definir("tva_intra")(e.target.value)}
                  placeholder="FR..."
                  autoComplete="off"
                />
                <Input
                  label="Site web"
                  type="url"
                  value={form.site_web}
                  onChange={(e) => definir("site_web")(e.target.value)}
                  placeholder="https://"
                  autoComplete="url"
                />
              </>
            )}

            {form.type === "particulier" && (
              <Input
                label="Date de naissance"
                type="date"
                value={form.date_naissance}
                onChange={(e) => definir("date_naissance")(e.target.value)}
                autoComplete="bday"
                hint="Facultatif"
              />
            )}

            <Input
              label="Adresse"
              value={form.adresse}
              onChange={(e) => definir("adresse")(e.target.value)}
              autoComplete="street-address"
              className="md:col-span-2"
            />
            <Select
              label="Statut"
              required
              value={form.statut}
              onChange={(e) => definir("statut")(e.target.value)}
              options={STATUT_OPTIONS}
            />
            <TagInput
              label="Tags"
              value={form.tags}
              onChange={definir("tags")}
              hint="Appuyez sur Entrée pour ajouter un tag."
            />
            <Textarea
              label="Notes"
              value={form.notes}
              onChange={(e) => definir("notes")(e.target.value)}
              rows={4}
              className="md:col-span-2"
              placeholder="Informations complémentaires, préférences, historique commercial…"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => navigate("/clients")}
            className="rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
            style={{
              color: C.textSecondary,
              backgroundColor: "transparent",
              border: `1px solid ${C.border}`,
            }}
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={soumission || certains.length > 0}
            className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
            style={{ backgroundColor: C.primary }}
          >
            {soumission
              ? "Enregistrement…"
              : modeEdition
                ? "Enregistrer les modifications"
                : "Créer le client"}
          </button>
        </div>
      </form>
    </>
  );
}

function LigneFiche({ client, resume }) {
  return (
    <li
      className="flex items-start justify-between gap-3 rounded-xl p-3"
      style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold" style={{ color: C.textPrimary }}>
          {client.nom}
        </p>
        <p className="mt-0.5 truncate text-xs" style={{ color: C.textSecondary }}>
          {resume}
        </p>
      </div>
      <Link
        to={`/clients/${client.id}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold focus:outline-none focus-visible:ring-2"
        style={{ color: C.primary, backgroundColor: "rgba(45,91,127,0.08)" }}
        aria-label={`Ouvrir la fiche de ${client.nom} dans un nouvel onglet`}
      >
        <ExternalLink size={12} aria-hidden="true" /> Ouvrir la fiche
      </Link>
    </li>
  );
}

function resumerCertain({ motif, client }) {
  const parts = [motif];
  if (client.email) parts.push(client.email);
  if (client.statut) parts.push(client.statut);
  return parts.join(" · ");
}

function resumerPotentiel({ motif, confiance, client }) {
  const parts = [`${motif} · ${confiance} %`];
  if (client.email) parts.push(client.email);
  return parts.join(" · ");
}

function EncartCertains({ matches, modeEdition, soumission, onCreerQuandMeme }) {
  return (
    <div
      role="alert"
      className="mb-4 rounded-2xl p-4"
      style={{ backgroundColor: "rgba(231,76,60,0.06)", border: `1px solid ${C.error}` }}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          size={20}
          aria-hidden="true"
          className="mt-0.5 shrink-0"
          style={{ color: C.error }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold" style={{ color: C.error }}>
            Doublon quasi certain détecté
          </p>
          <p className="mt-1 text-xs" style={{ color: C.textSecondary }}>
            {matches.length > 1
              ? `${matches.length} fiches existantes correspondent aux informations saisies.`
              : "Une fiche existante correspond aux informations saisies."}
          </p>
          <ul className="mt-3 space-y-2">
            {matches.map((m) => (
              <LigneFiche key={m.client.id} client={m.client} resume={resumerCertain(m)} />
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              to={`/clients/${matches[0].client.id}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
              style={{ color: C.primary, backgroundColor: "rgba(45,91,127,0.08)" }}
            >
              <ExternalLink size={14} aria-hidden="true" />
              Voir la fiche existante
            </Link>
            <button
              type="button"
              onClick={onCreerQuandMeme}
              disabled={soumission}
              className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-70"
              style={{ backgroundColor: C.error }}
            >
              {modeEdition ? "Enregistrer quand même" : "Créer quand même"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EncartPotentiels({ matches }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-4 rounded-2xl p-4"
      style={{ backgroundColor: "rgba(243,156,18,0.06)", border: `1px solid ${C.warning}` }}
    >
      <div className="flex items-start gap-3">
        <AlertCircle
          size={20}
          aria-hidden="true"
          className="mt-0.5 shrink-0"
          style={{ color: C.warning }}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold" style={{ color: C.warning }}>
            Doublon potentiel
          </p>
          <p className="mt-1 text-xs" style={{ color: C.textSecondary }}>
            {matches.length > 1
              ? `${matches.length} fiches ressemblent aux informations saisies.`
              : "Une fiche ressemble aux informations saisies."}
            {" "}L'enregistrement reste possible.
          </p>
          <ul className="mt-3 space-y-2">
            {matches.map((m) => (
              <LigneFiche key={m.client.id} client={m.client} resume={resumerPotentiel(m)} />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
