import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { C } from "../theme";
import { useClients } from "../context/ClientsContext.jsx";
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

function normaliser(existant) {
  return {
    type: existant.type ?? "particulier",
    nom: existant.nom ?? "",
    email: existant.email ?? "",
    telephone: existant.telephone ?? "",
    adresse: existant.adresse ?? "",
    statut: existant.statut ?? "prospect",
    tags: Array.isArray(existant.tags) ? [...existant.tags] : [],
    notes: existant.notes ?? "",
  };
}

export default function ClientForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { clients, addClient, updateClient } = useClients();

  const modeEdition = Boolean(id);
  const idNumerique = id ? Number(id) : null;

  const existant = useMemo(
    () => (modeEdition ? clients.find((c) => c.id === idNumerique) : null),
    [modeEdition, clients, idNumerique]
  );

  const [form, setForm] = useState(() => (existant ? normaliser(existant) : VIDE));
  const [errors, setErrors] = useState({});

  if (modeEdition && !existant) {
    return (
      <div
        className="rounded-2xl p-8 text-center"
        style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}
      >
        <p className="text-sm" style={{ color: C.textSecondary }}>
          Client introuvable.
        </p>
        <button
          type="button"
          onClick={() => navigate("/clients")}
          className="mt-4 rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
          style={{ color: C.primary, backgroundColor: "rgba(45,91,127,0.08)" }}
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
    if (!data.nom.trim()) {
      errs.nom = "Le nom est requis.";
    }
    if (data.email.trim() && !EMAIL_RE.test(data.email.trim())) {
      errs.email = "Adresse e-mail invalide.";
    }
    return errs;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = valider(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const payload = {
      type: form.type,
      nom: form.nom.trim(),
      email: form.email.trim(),
      telephone: form.telephone.trim(),
      adresse: form.adresse.trim(),
      statut: form.statut,
      tags: form.tags,
      notes: form.notes.trim(),
    };

    if (modeEdition) {
      updateClient(idNumerique, payload);
    } else {
      addClient({ ...payload, score: 50 });
    }
    navigate("/clients");
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
            className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2"
            style={{ backgroundColor: C.primary }}
          >
            {modeEdition ? "Enregistrer les modifications" : "Créer le client"}
          </button>
        </div>
      </form>
    </>
  );
}
