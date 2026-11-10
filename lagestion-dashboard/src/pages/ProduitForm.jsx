import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { BORDURE_CARTE, C, alpha } from "../theme";
import { useProduits } from "../context/ProduitsContext.jsx";
import { TAUX_TVA } from "../data/factures";
import { TYPES_ARTICLE, LIBELLE_TYPE_ARTICLE } from "../data/catalogue";
import Input from "../components/form/Input.jsx";
import Select from "../components/form/Select.jsx";
import Textarea from "../components/form/Textarea.jsx";
import { useGardeModifications, useQuitter } from "../context/GardeModificationsContext.jsx";

const MESSAGE_REFERENCE_PRISE = "Cette référence est déjà utilisée par un autre article.";

const VIDE = {
  type: "service",
  reference: "",
  nom: "",
  description: "",
  unite: "",
  prix_unitaire_ht: "",
  taux_tva: "20",
  actif: true,
};

const TYPE_OPTIONS = TYPES_ARTICLE.map((t) => ({ value: t, label: LIBELLE_TYPE_ARTICLE[t] }));
// Même liste que le formulaire de facture : aucun article ne propose un taux inconnu de la facture.
const TAUX_OPTIONS = TAUX_TVA.map((t) => ({ value: String(t), label: `${String(t).replace(".", ",")} %` }));

function normaliser(existant) {
  return {
    type: existant.type ?? "service",
    reference: existant.reference ?? "",
    nom: existant.nom ?? "",
    description: existant.description ?? "",
    unite: existant.unite ?? "",
    prix_unitaire_ht: existant.prix_unitaire_ht != null ? String(existant.prix_unitaire_ht) : "",
    taux_tva: existant.taux_tva != null ? String(existant.taux_tva) : "20",
    actif: existant.actif ?? true,
  };
}

export default function ProduitForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { produits, addProduit, updateProduit, chargement } = useProduits();

  const modeEdition = Boolean(id);
  const existant = useMemo(() => (modeEdition ? produits.find((p) => p.id === id) : null), [modeEdition, produits, id]);

  const [form, setForm] = useState(() => (existant ? normaliser(existant) : VIDE));
  const [errors, setErrors] = useState({});
  const [erreurSoumission, setErreurSoumission] = useState(null);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const quitter = useQuitter();
  const etatInitial = useMemo(() => (existant ? normaliser(existant) : VIDE), [existant]);
  useGardeModifications(JSON.stringify(form) !== JSON.stringify(etatInitial));

  useEffect(() => {
    if (modeEdition && existant) setForm(normaliser(existant));
  }, [modeEdition, existant]);

  if (modeEdition && !chargement && !existant) {
    return (
      <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: C.fondCarte, border: BORDURE_CARTE }}>
        <p className="text-sm" style={{ color: C.textSecondary }}>Article introuvable.</p>
        <button
          type="button"
          onClick={() => navigate("/catalogue")}
          className="mt-4 rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
          style={{ color: C.primary, backgroundColor: alpha(C.primary, 0.08) }}
        >
          Retour au catalogue
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
    if (!data.nom.trim()) errs.nom = "Le nom est requis.";
    const prix = Number(data.prix_unitaire_ht);
    if (data.prix_unitaire_ht === "" || Number.isNaN(prix) || prix < 0) {
      errs.prix_unitaire_ht = "Le prix HT doit être un nombre positif ou nul.";
    }
    const ref = data.reference.trim();
    if (ref && produits.some((p) => p.id !== id && p.reference === ref)) errs.reference = MESSAGE_REFERENCE_PRISE;
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = valider(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const payload = {
      type: form.type,
      reference: form.reference,
      nom: form.nom,
      description: form.description,
      unite: form.unite,
      prix_unitaire_ht: Number(form.prix_unitaire_ht),
      taux_tva: Number(form.taux_tva),
      actif: form.actif,
    };

    setErreurSoumission(null);
    setEnvoiEnCours(true);
    try {
      if (modeEdition) await updateProduit(id, payload);
      else await addProduit(payload);
      navigate("/catalogue", { replace: true });
    } catch (err) {
      if (err?.code === "23505") setErrors((prev) => ({ ...prev, reference: MESSAGE_REFERENCE_PRISE }));
      else setErreurSoumission(err?.message ?? "Une erreur est survenue.");
    } finally {
      setEnvoiEnCours(false);
    }
  };

  return (
    <>
      <div className="mb-5">
        <h2 className="text-[28px] font-semibold leading-tight" style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}>
          {modeEdition ? "Modifier l'article" : "Nouvel article"}
        </h2>
        <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>
          {modeEdition
            ? "Les factures déjà créées ne changent pas ; seules les prochaines lignes reprendront ces valeurs."
            : "Produit ou prestation réutilisable dans les lignes de facture."}
        </p>
      </div>

      {erreurSoumission && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-xl p-3 text-sm"
          style={{ backgroundColor: alpha(C.error, 0.06), color: C.errorText, border: `1px solid ${C.error}` }}
        >
          <AlertCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span><strong className="font-semibold">Enregistrement impossible :</strong> {erreurSoumission}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <div className="rounded-2xl p-5" style={{ backgroundColor: C.fondCarte, border: BORDURE_CARTE }}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="Nom de l'article"
              required
              value={form.nom}
              onChange={(e) => definir("nom")(e.target.value)}
              error={errors.nom}
              className="md:col-span-2"
              placeholder="Ex : Pose de parquet"
            />
            <Select
              label="Type"
              required
              value={form.type}
              onChange={(e) => definir("type")(e.target.value)}
              options={TYPE_OPTIONS}
            />
            <Input
              label="Référence"
              value={form.reference}
              onChange={(e) => definir("reference")(e.target.value)}
              error={errors.reference}
              hint="Facultative ; unique si elle est renseignée."
              placeholder="Ex : PAR-M2"
            />
            <Input
              label="Prix unitaire HT (€)"
              required
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={form.prix_unitaire_ht}
              onChange={(e) => definir("prix_unitaire_ht")(e.target.value)}
              error={errors.prix_unitaire_ht}
            />
            <Select
              label="TVA"
              required
              value={form.taux_tva}
              onChange={(e) => definir("taux_tva")(e.target.value)}
              options={TAUX_OPTIONS}
            />
            <Input
              label="Unité"
              value={form.unite}
              onChange={(e) => definir("unite")(e.target.value)}
              placeholder="h, j, m², u, forfait…"
            />
            <div className="flex items-end pb-2">
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm" style={{ color: C.textPrimary }}>
                <input
                  type="checkbox"
                  checked={form.actif}
                  onChange={(e) => definir("actif")(e.target.checked)}
                  className="h-4 w-4 cursor-pointer rounded focus-visible:ring-2"
                  style={{ accentColor: C.primary }}
                />
                Article actif (proposé dans les factures)
              </label>
            </div>
            <Textarea
              label="Description"
              value={form.description}
              onChange={(e) => definir("description")(e.target.value)}
              className="md:col-span-2"
              rows={3}
              placeholder="Détail de la prestation ou caractéristiques du produit"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => quitter(() => navigate("/catalogue"))}
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
            {envoiEnCours ? "Enregistrement…" : modeEdition ? "Enregistrer les modifications" : "Créer l'article"}
          </button>
        </div>
      </form>
    </>
  );
}
