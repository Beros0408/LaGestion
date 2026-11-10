import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertCircle, Lock } from "lucide-react";
import { C, alpha, euroCentimes } from "../theme";
import { useFactures } from "../context/FacturesContext.jsx";
import { useGardeModifications, useQuitter } from "../context/GardeModificationsContext.jsx";
import { peutCreerAvoir } from "../data/factures";
import { resteCreditable, totalTTC, totalHT, totalTVA } from "../utils/facture";
import { MESSAGE_DESCRIPTION, calculerRecap, descriptionVide } from "../utils/lignesDocument";
import Input from "../components/form/Input.jsx";
import Textarea from "../components/form/Textarea.jsx";

// Création (edition absent) : :id est la facture d'origine. Modification (edition) : :id est le brouillon d'avoir.
export default function AvoirForm({ edition = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { factures, chargement, creerAvoir, updateFacture } = useFactures();
  const quitter = useQuitter();

  const avoir = useMemo(() => (edition ? factures.find((f) => f.id === id && f.type === "avoir") : null), [edition, factures, id]);
  const origine = useMemo(
    () => factures.find((f) => f.id === (edition ? avoir?.facture_origine_id : id)),
    [edition, avoir, factures, id]
  );
  const reste = useMemo(() => (origine ? resteCreditable(origine) : []), [origine]);
  const totalPossible = Boolean(origine) && (origine.avoirs ?? []).length === 0;

  const initial = useMemo(() => {
    const parTaux = {};
    reste.forEach((r) => {
      const ligne = avoir?.lignes?.find((l) => Number(l.taux_tva) === r.taux);
      parTaux[r.taux] = {
        description: ligne?.description ?? `Avoir sur ${origine?.numero ?? "la facture"} — TVA ${String(r.taux).replace(".", ",")} %`,
        ht: ligne && !avoir?.avoir_total ? String(ligne.prix_unitaire) : "",
      };
    });
    return {
      total: avoir ? Boolean(avoir.avoir_total) : totalPossible,
      motif: avoir?.motif ?? "",
      parTaux,
    };
  }, [avoir, origine, reste, totalPossible]);

  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState({});
  const [erreurEnvoi, setErreurEnvoi] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  useGardeModifications(JSON.stringify(form) !== JSON.stringify(initial));

  // Données chargées après l'ouverture de l'écran (lien direct).
  useEffect(() => { setForm(initial); }, [initial]);

  const lignes = useMemo(
    () => reste
      .filter((r) => Number(form.parTaux[r.taux]?.ht) > 0)
      .map((r, position) => ({
        description: (form.parTaux[r.taux].description || "").trim(),
        reference: null,
        unite: null,
        quantite: 1,
        prix_unitaire: Number(form.parTaux[r.taux].ht),
        taux_tva: r.taux,
        remise: 0,
        produit_id: null,
        position,
      })),
    [form.parTaux, reste]
  );
  const apercu = useMemo(() => {
    if (form.total && origine) return { ht: -totalHT(origine), tva: -totalTVA(origine), ttc: -totalTTC(origine) };
    const r = calculerRecap(0, lignes.map((l) => ({ ...l, quantite: "1", remise: "0" })));
    return { ht: -r.ht, tva: -r.tva, ttc: -r.ttc };
  }, [form.total, origine, lignes]);

  const carte = { backgroundColor: C.bgCard, border: `1px solid ${C.border}` };

  if (!chargement && (!origine || (edition && !avoir))) {
    return (
      <div className="rounded-2xl p-8 text-center" style={carte}>
        <p className="text-sm" style={{ color: C.textSecondary }}>Facture introuvable.</p>
        <Link to="/factures" className="mt-4 inline-block rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2" style={{ color: C.primary, backgroundColor: alpha(C.primary, 0.08) }}>
          Retour à la liste
        </Link>
      </div>
    );
  }
  if (!origine) return null;

  const impossible = edition
    ? avoir.statut !== "brouillon" && "Cet avoir est finalisé : il ne peut plus être modifié."
    : !peutCreerAvoir(origine) && "Un avoir ne peut porter que sur une facture finalisée et non annulée.";
  if (impossible) {
    return (
      <div className="rounded-2xl p-8 text-center" style={carte}>
        <Lock size={24} aria-hidden="true" className="mx-auto" style={{ color: C.textSecondary }} />
        <p className="mt-3 text-sm" style={{ color: C.textPrimary }}>{impossible}</p>
        <Link to={`/factures/${id}`} className="mt-4 inline-block rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2" style={{ color: C.primary, backgroundColor: alpha(C.primary, 0.08) }}>
          Retour à la fiche
        </Link>
      </div>
    );
  }

  const definirLigne = (taux, cle, valeur) => {
    setForm((prev) => ({ ...prev, parTaux: { ...prev.parTaux, [taux]: { ...prev.parTaux[taux], [cle]: valeur } } }));
    setErrors((prev) => ({ ...prev, [`${cle === "ht" ? "ht" : "desc"}${taux}`]: undefined, lignes: undefined }));
  };

  const valider = () => {
    const errs = {};
    if (!form.motif.trim()) errs.motif = "Le motif de l'avoir est obligatoire.";
    if (!form.total) {
      reste.forEach((r) => {
        const brut = form.parTaux[r.taux]?.ht ?? "";
        const ht = Number(brut);
        if (brut !== "" && (Number.isNaN(ht) || ht < 0)) errs[`ht${r.taux}`] = "Montant positif attendu.";
        else if (Math.round(ht * 100) > Math.round(r.base * 100)) errs[`ht${r.taux}`] = `Au plus ${euroCentimes(r.base)} HT.`;
        // Ligne créée seulement si le montant est positif : la description n'est exigée que dans ce cas.
        if (ht > 0 && descriptionVide(form.parTaux[r.taux]?.description)) errs[`desc${r.taux}`] = MESSAGE_DESCRIPTION;
      });
      if (lignes.length === 0) errs.lignes = "Indiquez au moins un montant à créditer.";
    }
    return errs;
  };

  const soumettre = async (e) => {
    e.preventDefault();
    const errs = valider();
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      const taux = reste.find((r) => errs[`desc${r.taux}`])?.taux;
      if (taux !== undefined) document.getElementById(`avoir-description-${taux}`)?.focus();
      return;
    }
    setErreurEnvoi(null);
    setEnvoi(true);
    try {
      if (edition) {
        await updateFacture(id, form.total ? { motif: form.motif } : { motif: form.motif, lignes });
        navigate(`/factures/${id}`, { replace: true });
      } else {
        const avoirId = await creerAvoir(origine.id, { motif: form.motif, total: form.total, lignes });
        navigate(`/factures/${avoirId}`, { replace: true });
      }
    } catch (err) {
      setErreurEnvoi(err?.message ?? "Une erreur est survenue.");
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <>
      <div className="mb-5">
        <h2 className="text-[28px] font-semibold leading-tight" style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}>
          {edition ? "Modifier le brouillon d'avoir" : "Créer un avoir"}
        </h2>
        <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>
          {`Sur la facture ${origine.numero}, TTC ${euroCentimes(totalTTC(origine))}. Le numéro et la date seront attribués à la finalisation.`}
        </p>
      </div>

      {erreurEnvoi && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl p-3 text-sm" style={{ backgroundColor: alpha(C.error, 0.06), color: C.errorText, border: `1px solid ${C.error}` }}>
          <AlertCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>{erreurEnvoi}</span>
        </div>
      )}

      <form onSubmit={soumettre} noValidate className="space-y-4">
        <div className="rounded-2xl p-5" style={carte}>
          {!edition && (
            <fieldset className="mb-4">
              <legend className="mb-2 text-xs font-medium" style={{ color: C.textSecondary }}>Type d'avoir</legend>
              <div className="flex flex-wrap gap-4 text-sm" style={{ color: C.textPrimary }}>
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name="type-avoir" checked={form.total} disabled={!totalPossible} onChange={() => setForm((p) => ({ ...p, total: true }))} />
                  Total (annule la facture)
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name="type-avoir" checked={!form.total} onChange={() => setForm((p) => ({ ...p, total: false }))} />
                  Partiel
                </label>
              </div>
              {!totalPossible && (
                <p className="mt-2 text-xs" style={{ color: C.textSecondary }}>
                  Un avoir a déjà été finalisé sur cette facture : seul un avoir partiel reste possible.
                </p>
              )}
            </fieldset>
          )}
          <Textarea
            label="Motif (figure sur l'avoir)"
            required
            rows={3}
            value={form.motif}
            onChange={(e) => { setForm((p) => ({ ...p, motif: e.target.value })); setErrors((p) => ({ ...p, motif: undefined })); }}
            error={errors.motif}
            placeholder="Ex : erreur de quantité, geste commercial, commande annulée…"
          />
        </div>

        {!form.total && (
          <div className="rounded-2xl p-5" style={carte}>
            <h3 className="mb-1" style={{ color: C.textPrimary, fontSize: 18, fontWeight: 600 }}>Montants à créditer</h3>
            <p className="mb-3 text-xs" style={{ color: C.textSecondary }}>Par taux de TVA, dans la limite de ce qui reste à créditer sur la facture.</p>
            <div className="space-y-4">
              {reste.map((r) => (
                <div key={r.taux} className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <Input
                    id={`avoir-description-${r.taux}`}
                    label={`Description (TVA ${String(r.taux).replace(".", ",")} %)`}
                    className="md:col-span-2"
                    value={form.parTaux[r.taux]?.description ?? ""}
                    onChange={(e) => definirLigne(r.taux, "description", e.target.value)}
                    error={errors[`desc${r.taux}`]}
                  />
                  <Input
                    label="Montant HT (€)"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    hint={`Reste à créditer : ${euroCentimes(r.base)} HT`}
                    value={form.parTaux[r.taux]?.ht ?? ""}
                    onChange={(e) => definirLigne(r.taux, "ht", e.target.value)}
                    error={errors[`ht${r.taux}`]}
                  />
                </div>
              ))}
            </div>
            {errors.lignes && <p role="alert" className="mt-3 text-sm" style={{ color: C.errorText }}>{errors.lignes}</p>}
          </div>
        )}

        <div className="rounded-2xl p-5" style={carte}>
          <h3 className="mb-3" style={{ color: C.textPrimary, fontSize: 18, fontWeight: 600 }}>Montant de l'avoir</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex items-center justify-between"><dt style={{ color: C.textSecondary }}>Total HT</dt><dd className="tabular-nums" style={{ color: C.textPrimary }}>{euroCentimes(apercu.ht || 0)}</dd></div>
            <div className="flex items-center justify-between"><dt style={{ color: C.textSecondary }}>TVA</dt><dd className="tabular-nums" style={{ color: C.textPrimary }}>{euroCentimes(apercu.tva || 0)}</dd></div>
            <div className="flex items-center justify-between pt-2" style={{ borderTop: `1px solid ${C.border}` }}><dt className="font-semibold" style={{ color: C.textPrimary }}>Total TTC</dt><dd className="text-lg font-bold tabular-nums" style={{ color: C.textPrimary }}>{euroCentimes(apercu.ttc || 0)}</dd></div>
          </dl>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => quitter(() => navigate(`/factures/${id}`))}
            className="rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
            style={{ color: C.textSecondary, backgroundColor: "transparent", border: `1px solid ${C.border}` }}
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={envoi}
            className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: C.primary }}
          >
            {envoi ? "Enregistrement…" : edition ? "Enregistrer les modifications" : "Créer le brouillon d'avoir"}
          </button>
        </div>
      </form>
    </>
  );
}
