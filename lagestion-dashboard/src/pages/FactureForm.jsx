import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, Trash2 } from "lucide-react";
import { C, euro } from "../theme";
import { useFactures } from "../context/FacturesContext.jsx";
import { useClients } from "../context/ClientsContext.jsx";
import { STATUTS, TAUX_TVA } from "../data/factures";
import { ligneHT, totalHT, tvaParTaux, totalTTC } from "../utils/facture";
import Input from "../components/form/Input.jsx";
import Select from "../components/form/Select.jsx";

const LIGNE_VIDE = { description: "", quantite: "1", prixUnitaire: "", tauxTva: "20" };

const VIDE = {
  clientId: "",
  dateEmission: new Date().toISOString().slice(0, 10),
  dateEcheance: "",
  statut: "Brouillon",
  lignes: [{ ...LIGNE_VIDE }],
};

const STATUT_OPTIONS = STATUTS.map((s) => ({ value: s, label: s }));

const TAUX_OPTIONS = TAUX_TVA.map((t) => ({
  value: String(t),
  label: `${String(t).replace(".", ",")} %`,
}));

function normaliser(existant) {
  return {
    clientId: existant.clientId != null ? String(existant.clientId) : "",
    dateEmission: existant.dateEmission ?? "",
    dateEcheance: existant.dateEcheance ?? "",
    statut: existant.statut ?? "Brouillon",
    lignes: (existant.lignes ?? []).map((l) => ({
      description: l.description ?? "",
      quantite: l.quantite != null ? String(l.quantite) : "",
      prixUnitaire: l.prixUnitaire != null ? String(l.prixUnitaire) : "",
      tauxTva: l.tauxTva != null ? String(l.tauxTva) : "20",
    })),
  };
}

export default function FactureForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { factures, addFacture, updateFacture } = useFactures();
  const { clients } = useClients();

  const modeEdition = Boolean(id);
  const idNumerique = id ? Number(id) : null;

  const existant = useMemo(
    () => (modeEdition ? factures.find((f) => f.id === idNumerique) : null),
    [modeEdition, factures, idNumerique]
  );

  const [form, setForm] = useState(() => (existant ? normaliser(existant) : VIDE));
  const [errors, setErrors] = useState({});

  const clientOptions = useMemo(
    () => [
      { value: "", label: "— Sélectionner un client —" },
      ...clients
        .slice()
        .sort((a, b) => a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }))
        .map((c) => ({ value: String(c.id), label: c.nom })),
    ],
    [clients]
  );

  const factureCalc = useMemo(
    () => ({
      lignes: form.lignes.map((l) => ({
        quantite: Number(l.quantite) || 0,
        prixUnitaire: Number(l.prixUnitaire) || 0,
        tauxTva: Number(l.tauxTva) || 0,
      })),
    }),
    [form.lignes]
  );

  const recap = useMemo(
    () => ({
      ht: totalHT(factureCalc),
      tvaDetail: tvaParTaux(factureCalc),
      ttc: totalTTC(factureCalc),
    }),
    [factureCalc]
  );

  if (modeEdition && !existant) {
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
    if (!data.clientId) errs.clientId = "Le client est requis.";
    if (data.lignes.length === 0) {
      errs.lignes = "Ajoutez au moins une ligne.";
    } else {
      const ligneItems = data.lignes.map((l) => {
        const e = {};
        const q = Number(l.quantite);
        const p = Number(l.prixUnitaire);
        if (l.quantite === "" || Number.isNaN(q) || q <= 0) e.quantite = "Quantité positive.";
        if (l.prixUnitaire === "" || Number.isNaN(p) || p <= 0) e.prixUnitaire = "Prix positif.";
        return e;
      });
      if (ligneItems.some((e) => Object.keys(e).length > 0)) errs.ligneItems = ligneItems;
    }
    return errs;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const errs = valider(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const payload = {
      clientId: Number(form.clientId),
      dateEmission: form.dateEmission,
      dateEcheance: form.dateEcheance,
      statut: form.statut,
      lignes: form.lignes.map((l) => ({
        description: l.description.trim(),
        quantite: Number(l.quantite),
        prixUnitaire: Number(l.prixUnitaire),
        tauxTva: Number(l.tauxTva),
      })),
    };

    if (modeEdition) {
      updateFacture(idNumerique, payload);
    } else {
      addFacture(payload);
    }
    navigate("/factures");
  };

  return (
    <>
      <div className="mb-5">
        <h2 className="text-[28px] font-semibold leading-tight" style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}>
          {modeEdition ? "Modifier la facture" : "Nouvelle facture"}
        </h2>
        <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>
          {modeEdition
            ? `Facture ${existant.numero} — mettez à jour son contenu.`
            : "Le numéro sera généré automatiquement à l'enregistrement."}
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        <div className="rounded-2xl p-5" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Select
              label="Client"
              required
              value={form.clientId}
              onChange={(e) => definir("clientId")(e.target.value)}
              options={clientOptions}
              error={errors.clientId}
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
              value={form.dateEmission}
              onChange={(e) => definir("dateEmission")(e.target.value)}
            />
            <Input
              label="Date d'échéance"
              type="date"
              value={form.dateEcheance}
              onChange={(e) => definir("dateEcheance")(e.target.value)}
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
              const ht = ligneHT({ quantite: Number(l.quantite) || 0, prixUnitaire: Number(l.prixUnitaire) || 0 });
              return (
                <div
                  key={i}
                  className="grid grid-cols-12 gap-2 rounded-xl p-3"
                  style={{ backgroundColor: C.bgMain, border: `1px solid ${C.border}` }}
                >
                  <div className="col-span-12 md:col-span-5">
                    <Input
                      label={`Description ligne ${i + 1}`}
                      value={l.description}
                      onChange={(e) => majLigne(i, "description", e.target.value)}
                      placeholder="Prestation, produit…"
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
                      value={l.prixUnitaire}
                      onChange={(e) => majLigne(i, "prixUnitaire", e.target.value)}
                      error={erreursLigne.prixUnitaire}
                    />
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    <Select
                      label="TVA"
                      value={l.tauxTva}
                      onChange={(e) => majLigne(i, "tauxTva", e.target.value)}
                      options={TAUX_OPTIONS}
                    />
                  </div>
                  <div className="col-span-12 flex items-end justify-between gap-2 md:col-span-1 md:justify-end">
                    <span className="text-xs tabular-nums md:hidden" style={{ color: C.textSecondary }}>
                      Total HT&nbsp;: <span className="font-semibold" style={{ color: C.textPrimary }}>{euro(ht)}</span>
                    </span>
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
                  <div className="col-span-12 hidden text-right text-xs tabular-nums md:block" style={{ color: C.textSecondary }}>
                    Total HT ligne&nbsp;: <span className="font-semibold" style={{ color: C.textPrimary }}>{euro(ht)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-4 rounded-2xl p-5" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
          <h3 className="mb-3" style={{ color: C.textPrimary, fontSize: 18, fontWeight: 600 }}>Récapitulatif</h3>
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
            <div
              className="flex items-center justify-between pt-2"
              style={{ borderTop: `1px solid ${C.border}` }}
            >
              <dt className="font-semibold" style={{ color: C.textPrimary }}>Total TTC</dt>
              <dd className="text-lg font-bold tabular-nums" style={{ color: C.textPrimary }}>{euro(recap.ttc)}</dd>
            </div>
          </dl>
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
            className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2"
            style={{ backgroundColor: C.primary }}
          >
            {modeEdition ? "Enregistrer les modifications" : "Créer la facture"}
          </button>
        </div>
      </form>
    </>
  );
}
