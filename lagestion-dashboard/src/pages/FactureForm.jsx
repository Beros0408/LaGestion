import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, Trash2, AlertCircle } from "lucide-react";
import { C, euro } from "../theme";
import { useFactures } from "../context/FacturesContext.jsx";
import { useClients } from "../context/ClientsContext.jsx";
import { STATUTS, LIBELLE_STATUT, TAUX_TVA } from "../data/factures";
import {
  ligneHT,
  ligneTTC,
  totalHT,
  tvaParTaux,
  totalTVA,
  totalTTC,
} from "../utils/facture";
import Input from "../components/form/Input.jsx";
import Select from "../components/form/Select.jsx";
import Textarea from "../components/form/Textarea.jsx";

const LIGNE_VIDE = {
  description: "",
  reference: "",
  unite: "",
  quantite: "1",
  prix_unitaire: "",
  taux_tva: "20",
  remise: "0",
};

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

const TAUX_OPTIONS = TAUX_TVA.map((t) => ({
  value: String(t),
  label: `${String(t).replace(".", ",")} %`,
}));

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
    lignes: (existant.lignes ?? []).map((l) => ({
      description: l.description ?? "",
      reference: l.reference ?? "",
      unite: l.unite ?? "",
      quantite: l.quantite != null ? String(l.quantite) : "",
      prix_unitaire: l.prix_unitaire != null ? String(l.prix_unitaire) : "",
      taux_tva: l.taux_tva != null ? String(l.taux_tva) : "20",
      remise: l.remise != null ? String(l.remise) : "0",
    })),
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

  const factureCalc = useMemo(
    () => ({
      remise: Number(form.remise) || 0,
      lignes: form.lignes.map((l) => ({
        quantite: Number(l.quantite) || 0,
        prix_unitaire: Number(l.prix_unitaire) || 0,
        taux_tva: Number(l.taux_tva) || 0,
        remise: Number(l.remise) || 0,
      })),
    }),
    [form.lignes, form.remise]
  );

  const recap = useMemo(
    () => ({
      ht: totalHT(factureCalc),
      tvaDetail: tvaParTaux(factureCalc),
      tva: totalTVA(factureCalc),
      remise: Number(form.remise) || 0,
      ttc: totalTTC(factureCalc),
    }),
    [factureCalc, form.remise]
  );

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

  const majLigne = (i, cle, valeur) => {
    setForm((prev) => ({
      ...prev,
      lignes: prev.lignes.map((l, idx) => (idx === i ? { ...l, [cle]: valeur } : l)),
    }));
    setErrors((prev) => {
      if (!prev.ligneItems?.[i]?.[cle] && !prev.lignes) return prev;
      const next = { ...prev };
      if (next.lignes) delete next.lignes;
      if (next.ligneItems?.[i]?.[cle]) {
        next.ligneItems = next.ligneItems.map((e, idx) => {
          if (idx !== i) return e;
          const { [cle]: _omit, ...reste } = e;
          return reste;
        });
      }
      return next;
    });
  };

  const ajouterLigne = () => {
    setForm((prev) => ({ ...prev, lignes: [...prev.lignes, { ...LIGNE_VIDE }] }));
  };

  const supprimerLigne = (i) => {
    setForm((prev) => ({ ...prev, lignes: prev.lignes.filter((_, idx) => idx !== i) }));
  };

  const valider = (data) => {
    const errs = {};
    if (!data.client_id) errs.client_id = "Le client est requis.";
    if (data.lignes.length === 0) {
      errs.lignes = "Ajoutez au moins une ligne.";
    } else {
      const ligneItems = data.lignes.map((l) => {
        const e = {};
        const q = Number(l.quantite);
        const p = Number(l.prix_unitaire);
        const r = Number(l.remise);
        if (l.quantite === "" || Number.isNaN(q) || q <= 0) e.quantite = "Quantité positive.";
        if (l.prix_unitaire === "" || Number.isNaN(p) || p <= 0) e.prix_unitaire = "Prix positif.";
        if (l.remise !== "" && (Number.isNaN(r) || r < 0)) e.remise = "Remise ≥ 0.";
        return e;
      });
      if (ligneItems.some((e) => Object.keys(e).length > 0)) errs.ligneItems = ligneItems;
    }
    const remiseGlobale = Number(data.remise);
    if (data.remise !== "" && (Number.isNaN(remiseGlobale) || remiseGlobale < 0)) {
      errs.remise = "La remise doit être ≥ 0.";
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
      lignes: form.lignes.map((l) => ({
        description: l.description.trim(),
        reference: l.reference,
        unite: l.unite,
        quantite: Number(l.quantite),
        prix_unitaire: Number(l.prix_unitaire),
        taux_tva: Number(l.taux_tva),
        remise: Number(l.remise) || 0,
      })),
    };

    setErreurSoumission(null);
    setEnvoiEnCours(true);
    try {
      if (modeEdition) {
        await updateFacture(id, payload);
      } else {
        await addFacture(payload);
      }
      navigate("/factures");
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

        <div className="mt-4 rounded-2xl p-5" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
          <div className="mb-3 flex items-center justify-between">
            <h3 style={{ color: C.textPrimary, fontSize: 18, fontWeight: 600 }}>Lignes d'articles</h3>
            <button
              type="button"
              onClick={ajouterLigne}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2"
              style={{ color: C.primary, backgroundColor: "rgba(45,91,127,0.08)" }}
            >
              <Plus size={14} aria-hidden="true" />
              Ajouter une ligne
            </button>
          </div>

          {errors.lignes && (
            <p role="alert" className="mb-3 text-xs font-medium" style={{ color: C.error }}>
              {errors.lignes}
            </p>
          )}

          <div className="space-y-3">
            {form.lignes.map((l, i) => {
              const erreursLigne = errors.ligneItems?.[i] ?? {};
              const ligneCalc = {
                quantite: Number(l.quantite) || 0,
                prix_unitaire: Number(l.prix_unitaire) || 0,
                taux_tva: Number(l.taux_tva) || 0,
                remise: Number(l.remise) || 0,
              };
              const ht = ligneHT(ligneCalc);
              const ttc = ligneTTC(ligneCalc);
              return (
                <div
                  key={i}
                  className="grid grid-cols-12 gap-2 rounded-xl p-3"
                  style={{ backgroundColor: C.bgMain, border: `1px solid ${C.border}` }}
                >
                  <div className="col-span-12 md:col-span-8">
                    <Input
                      label={`Description ligne ${i + 1}`}
                      value={l.description}
                      onChange={(e) => majLigne(i, "description", e.target.value)}
                      placeholder="Prestation, produit…"
                    />
                  </div>
                  <div className="col-span-6 md:col-span-2">
                    <Input
                      label="Référence"
                      value={l.reference}
                      onChange={(e) => majLigne(i, "reference", e.target.value)}
                      placeholder="SKU"
                    />
                  </div>
                  <div className="col-span-6 md:col-span-2">
                    <Input
                      label="Unité"
                      value={l.unite}
                      onChange={(e) => majLigne(i, "unite", e.target.value)}
                      placeholder="h, j, kg…"
                    />
                  </div>

                  <div className="col-span-4 md:col-span-2">
                    <Input
                      label="Quantité"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={l.quantite}
                      onChange={(e) => majLigne(i, "quantite", e.target.value)}
                      error={erreursLigne.quantite}
                    />
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    <Input
                      label="Prix U. HT (€)"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={l.prix_unitaire}
                      onChange={(e) => majLigne(i, "prix_unitaire", e.target.value)}
                      error={erreursLigne.prix_unitaire}
                    />
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    <Input
                      label="Remise (€)"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={l.remise}
                      onChange={(e) => majLigne(i, "remise", e.target.value)}
                      error={erreursLigne.remise}
                    />
                  </div>
                  <div className="col-span-6 md:col-span-2">
                    <Select
                      label="TVA"
                      value={l.taux_tva}
                      onChange={(e) => majLigne(i, "taux_tva", e.target.value)}
                      options={TAUX_OPTIONS}
                    />
                  </div>
                  <div className="col-span-6 md:col-span-3 flex flex-col justify-end pb-1">
                    <p className="text-[11px]" style={{ color: C.textSecondary }}>Total ligne</p>
                    <p className="text-sm font-semibold tabular-nums" style={{ color: C.textPrimary }}>
                      {euro(ht)}<span className="text-xs font-normal" style={{ color: C.textSecondary }}> HT</span>
                    </p>
                    <p className="text-xs tabular-nums" style={{ color: C.textSecondary }}>
                      {euro(ttc)} TTC
                    </p>
                  </div>
                  <div className="col-span-12 md:col-span-1 flex items-end justify-end">
                    <button
                      type="button"
                      onClick={() => supprimerLigne(i)}
                      aria-label={`Supprimer la ligne ${i + 1}`}
                      title="Supprimer la ligne"
                      disabled={form.lignes.length === 1}
                      className="rounded-lg p-1.5 transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40"
                      style={{ color: C.error }}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-4 rounded-2xl p-5" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
          <h3 className="mb-3" style={{ color: C.textPrimary, fontSize: 18, fontWeight: 600 }}>Récapitulatif</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Input
                label="Remise globale (€)"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={form.remise}
                onChange={(e) => definir("remise")(e.target.value)}
                error={errors.remise}
                hint="Appliquée sur le total TTC"
              />
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt style={{ color: C.textSecondary }}>Total HT</dt>
                <dd className="font-semibold tabular-nums" style={{ color: C.textPrimary }}>{euro(recap.ht)}</dd>
              </div>
              {recap.tvaDetail.length === 0 ? (
                <div className="flex items-center justify-between">
                  <dt style={{ color: C.textSecondary }}>TVA</dt>
                  <dd className="tabular-nums" style={{ color: C.textSecondary }}>{euro(0)}</dd>
                </div>
              ) : (
                recap.tvaDetail.map((d) => (
                  <div key={d.taux} className="flex items-center justify-between">
                    <dt style={{ color: C.textSecondary }}>
                      TVA {String(d.taux).replace(".", ",")} % <span style={{ color: C.textSecondary }}>(base {euro(d.base)})</span>
                    </dt>
                    <dd className="tabular-nums" style={{ color: C.textPrimary }}>{euro(d.tva)}</dd>
                  </div>
                ))
              )}
              {recap.remise > 0 && (
                <div className="flex items-center justify-between">
                  <dt style={{ color: C.textSecondary }}>Remise globale</dt>
                  <dd className="tabular-nums" style={{ color: C.textPrimary }}>− {euro(recap.remise)}</dd>
                </div>
              )}
              <div
                className="flex items-center justify-between pt-2"
                style={{ borderTop: `1px solid ${C.border}` }}
              >
                <dt className="font-semibold" style={{ color: C.textPrimary }}>Total TTC</dt>
                <dd className="text-lg font-bold tabular-nums" style={{ color: C.textPrimary }}>{euro(recap.ttc)}</dd>
              </div>
            </dl>
          </div>
        </div>

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
            onClick={() => navigate("/factures")}
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
