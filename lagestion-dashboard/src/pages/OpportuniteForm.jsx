import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { C } from "../theme";
import { useOpportunites } from "../context/OpportunitesContext.jsx";
import { useClients } from "../context/ClientsContext.jsx";
import { ETAPES } from "../data/opportunites";
import Input from "../components/form/Input.jsx";
import Select from "../components/form/Select.jsx";

const VIDE = {
  nom: "",
  client_id: "",
  montant: "",
  probabilite: "50",
  etape: "Qualification",
  date_cloture: "",
  responsable: "",
};

const ETAPE_OPTIONS = ETAPES.map((e) => ({ value: e, label: e }));

function normaliser(existant) {
  return {
    nom: existant.nom ?? "",
    client_id: existant.client_id != null ? String(existant.client_id) : "",
    montant: existant.montant != null ? String(existant.montant) : "",
    probabilite: existant.probabilite != null ? String(existant.probabilite) : "50",
    etape: existant.etape ?? "Qualification",
    date_cloture: existant.date_cloture ?? "",
    responsable: existant.responsable ?? "",
  };
}

export default function OpportuniteForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { opportunites, addOpportunite, updateOpportunite, chargement } = useOpportunites();
  const { clients } = useClients();

  const modeEdition = Boolean(id);

  const existant = useMemo(
    () => (modeEdition ? opportunites.find((o) => o.id === id) : null),
    [modeEdition, opportunites, id]
  );

  const [form, setForm] = useState(() => (existant ? normaliser(existant) : VIDE));
  const [errors, setErrors] = useState({});
  const [erreurSoumission, setErreurSoumission] = useState(null);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);

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

  if (modeEdition && !chargement && !existant) {
    return (
      <div
        className="rounded-2xl p-8 text-center"
        style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}
      >
        <p className="text-sm" style={{ color: C.textSecondary }}>
          Opportunité introuvable.
        </p>
        <button
          type="button"
          onClick={() => navigate("/opportunites")}
          className="mt-4 rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
          style={{ color: C.primary, backgroundColor: "rgba(45,91,127,0.08)" }}
        >
          Retour au pipeline
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
    if (!data.nom.trim()) {
      errs.nom = "Le nom est requis.";
    }
    if (!data.client_id) {
      errs.client_id = "Le client est requis.";
    }
    const montant = Number(data.montant);
    if (data.montant === "" || Number.isNaN(montant) || montant <= 0) {
      errs.montant = "Le montant doit être un nombre positif.";
    }
    const proba = Number(data.probabilite);
    if (data.probabilite === "" || Number.isNaN(proba) || proba < 0 || proba > 100) {
      errs.probabilite = "La probabilité doit être comprise entre 0 et 100.";
    }
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = valider(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const payload = {
      nom: form.nom.trim(),
      client_id: form.client_id,
      montant: Number(form.montant),
      probabilite: Number(form.probabilite),
      etape: form.etape,
      date_cloture: form.date_cloture || null,
      responsable: form.responsable.trim(),
    };

    setErreurSoumission(null);
    setEnvoiEnCours(true);
    try {
      if (modeEdition) {
        await updateOpportunite(id, payload);
      } else {
        await addOpportunite(payload);
      }
      navigate("/opportunites");
    } catch (err) {
      setErreurSoumission(err?.message ?? "Une erreur est survenue.");
    } finally {
      setEnvoiEnCours(false);
    }
  };

  return (
    <>
      <div className="mb-5">
        <h2
          className="text-[28px] font-semibold leading-tight"
          style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}
        >
          {modeEdition ? "Modifier l'opportunité" : "Nouvelle opportunité"}
        </h2>
        <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>
          {modeEdition
            ? "Mettez à jour les informations de l'opportunité."
            : "Renseignez les informations de la nouvelle opportunité."}
        </p>
      </div>

      {erreurSoumission && (
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
          <span><strong className="font-semibold">Enregistrement impossible :</strong> {erreurSoumission}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div
          className="rounded-2xl p-5"
          style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="Nom de l'opportunité"
              required
              value={form.nom}
              onChange={(e) => definir("nom")(e.target.value)}
              error={errors.nom}
              className="md:col-span-2"
              placeholder="Ex : Refonte du site vitrine"
            />
            <Select
              label="Client"
              required
              value={form.client_id}
              onChange={(e) => definir("client_id")(e.target.value)}
              options={clientOptions}
              error={errors.client_id}
            />
            <Input
              label="Responsable"
              value={form.responsable}
              onChange={(e) => definir("responsable")(e.target.value)}
              placeholder="Nom du commercial"
            />
            <Input
              label="Montant (€)"
              required
              type="number"
              inputMode="numeric"
              min="0"
              step="1"
              value={form.montant}
              onChange={(e) => definir("montant")(e.target.value)}
              error={errors.montant}
              placeholder="Ex : 12500"
            />
            <Input
              label="Probabilité (%)"
              required
              type="number"
              inputMode="numeric"
              min="0"
              max="100"
              step="1"
              value={form.probabilite}
              onChange={(e) => definir("probabilite")(e.target.value)}
              error={errors.probabilite}
            />
            <Select
              label="Étape"
              required
              value={form.etape}
              onChange={(e) => definir("etape")(e.target.value)}
              options={ETAPE_OPTIONS}
            />
            <Input
              label="Date de clôture prévisionnelle"
              type="date"
              value={form.date_cloture}
              onChange={(e) => definir("date_cloture")(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => navigate("/opportunites")}
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
            disabled={envoiEnCours}
            className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: C.primary }}
          >
            {envoiEnCours
              ? "Enregistrement…"
              : modeEdition
                ? "Enregistrer les modifications"
                : "Créer l'opportunité"}
          </button>
        </div>
      </form>
    </>
  );
}
