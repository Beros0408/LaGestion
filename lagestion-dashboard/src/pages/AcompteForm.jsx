import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertCircle, Lock } from "lucide-react";
import { C, alpha, euroCentimes } from "../theme";
import { useDevis } from "../context/DevisContext.jsx";
import { useGardeModifications, useQuitter } from "../context/GardeModificationsContext.jsx";
import { totalTTC } from "../utils/facture";
import Input from "../components/form/Input.jsx";

// Le montant vient de la base (apercu_acompte) : aucun calcul de TVA ici.
export default function AcompteForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { devis: tous, chargement, apercuAcompte, creerAcompte } = useDevis();
  const quitter = useQuitter();
  const devis = useMemo(() => tous.find((d) => d.id === id), [tous, id]);

  const [mode, setMode] = useState("pourcentage");
  const [valeur, setValeur] = useState("30");
  const [apercu, setApercu] = useState(null);
  const [erreurApercu, setErreurApercu] = useState(null);
  const [calcul, setCalcul] = useState(false);
  const [erreurEnvoi, setErreurEnvoi] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [modifie, setModifie] = useState(false);
  useGardeModifications(modifie && !envoi);

  const nombre = Number(valeur);
  const saisieValide = valeur !== "" && !Number.isNaN(nombre) && nombre > 0;
  const devisAccepte = devis?.statut === "accepte";

  useEffect(() => {
    if (!devisAccepte || !saisieValide) {
      setApercu(null);
      setErreurApercu(null);
      setCalcul(false);
      return undefined;
    }
    let annule = false;
    setCalcul(true);
    const minuterie = setTimeout(async () => {
      try {
        const resultat = await apercuAcompte(id, mode, nombre);
        if (!annule) { setApercu(resultat); setErreurApercu(null); }
      } catch (err) {
        if (!annule) { setApercu(null); setErreurApercu(err?.message ?? "Calcul impossible."); }
      } finally {
        if (!annule) setCalcul(false);
      }
    }, 300);
    return () => { annule = true; clearTimeout(minuterie); };
  }, [apercuAcompte, devisAccepte, id, mode, nombre, saisieValide]);

  const carte = { backgroundColor: C.bgCard, border: `1px solid ${C.border}` };

  if (!chargement && !devis) {
    return (
      <div className="rounded-2xl p-8 text-center" style={carte}>
        <p className="text-sm" style={{ color: C.textSecondary }}>Devis introuvable.</p>
        <Link to="/devis" className="mt-4 inline-block rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2" style={{ color: C.primary, backgroundColor: alpha(C.primary, 0.08) }}>
          Retour à la liste
        </Link>
      </div>
    );
  }
  if (!devis) return null;

  if (!devisAccepte) {
    return (
      <div className="rounded-2xl p-8 text-center" style={carte}>
        <Lock size={24} aria-hidden="true" className="mx-auto" style={{ color: C.textSecondary }} />
        <p className="mt-3 text-sm" style={{ color: C.textPrimary }}>Un acompte ne peut porter que sur un devis accepté.</p>
        <Link to={`/devis/${id}`} className="mt-4 inline-block rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2" style={{ color: C.primary, backgroundColor: alpha(C.primary, 0.08) }}>
          Retour à la fiche
        </Link>
      </div>
    );
  }

  const ecart = mode === "montant" && apercu && Math.round(Number(apercu.total_ttc) * 100) !== Math.round(nombre * 100);

  const soumettre = async (e) => {
    e.preventDefault();
    if (!apercu) return;
    setErreurEnvoi(null);
    setEnvoi(true);
    try {
      const acompteId = await creerAcompte(id, mode, nombre);
      navigate(`/factures/${acompteId}`, { replace: true });
    } catch (err) {
      setErreurEnvoi(err?.message ?? "Une erreur est survenue.");
      setEnvoi(false);
    }
  };

  return (
    <>
      <div className="mb-5">
        <h2 className="text-[28px] font-semibold leading-tight" style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}>
          Créer un acompte
        </h2>
        <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>
          {`Sur le devis ${devis.numero}, TTC ${euroCentimes(totalTTC(devis))}. Le numéro et la date seront attribués à la finalisation.`}
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
          <fieldset className="mb-4">
            <legend className="mb-2 text-xs font-medium" style={{ color: C.textSecondary }}>Calcul de l'acompte</legend>
            <div className="flex flex-wrap gap-4 text-sm" style={{ color: C.textPrimary }}>
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="mode-acompte" checked={mode === "pourcentage"} onChange={() => { setMode("pourcentage"); setModifie(true); }} />
                Pourcentage du devis
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="mode-acompte" checked={mode === "montant"} onChange={() => { setMode("montant"); setModifie(true); }} />
                Montant TTC
              </label>
            </div>
          </fieldset>
          <Input
            label={mode === "pourcentage" ? "Pourcentage (%)" : "Montant TTC (€)"}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            required
            className="max-w-xs"
            value={valeur}
            onChange={(e) => { setValeur(e.target.value); setModifie(true); }}
            error={valeur !== "" && !saisieValide ? "Valeur positive attendue." : undefined}
          />
        </div>

        <div className="rounded-2xl p-5" style={carte} aria-live="polite">
          <h3 className="mb-3" style={{ color: C.textPrimary, fontSize: 18, fontWeight: 600 }}>Montant réel de l'acompte</h3>
          {erreurApercu && <p role="alert" className="text-sm" style={{ color: C.errorText }}>{erreurApercu}</p>}
          {!erreurApercu && !apercu && (
            <p className="text-sm" style={{ color: C.textSecondary }}>{calcul ? "Calcul en cours…" : "Indiquez une valeur."}</p>
          )}
          {apercu && (
            <dl className="space-y-2 text-sm">
              {apercu.tva_detail.map((d) => (
                <div key={d.taux} className="flex items-center justify-between">
                  <dt style={{ color: C.textSecondary }}>{`TVA ${String(d.taux).replace(".", ",")} % (base ${euroCentimes(Number(d.base))})`}</dt>
                  <dd className="tabular-nums" style={{ color: C.textPrimary }}>{euroCentimes(Number(d.tva))}</dd>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <dt style={{ color: C.textSecondary }}>Total HT</dt>
                <dd className="tabular-nums" style={{ color: C.textPrimary }}>{euroCentimes(Number(apercu.total_ht))}</dd>
              </div>
              <div className="flex items-center justify-between pt-2" style={{ borderTop: `1px solid ${C.border}` }}>
                <dt className="font-semibold" style={{ color: C.textPrimary }}>Total TTC</dt>
                <dd className="text-lg font-bold tabular-nums" style={{ color: C.textPrimary }}>{euroCentimes(Number(apercu.total_ttc))}</dd>
              </div>
              {ecart && (
                <p role="status" className="text-xs" style={{ color: C.warningText }}>
                  {`Montant ajusté à ${euroCentimes(Number(apercu.total_ttc))} : avec une TVA arrondie, ${euroCentimes(nombre)} n'est pas atteignable au centime.`}
                </p>
              )}
              <div className="flex items-center justify-between">
                <dt style={{ color: C.textSecondary }}>Déjà facturé en acomptes</dt>
                <dd className="tabular-nums" style={{ color: C.textSecondary }}>{euroCentimes(Number(apercu.deja_ttc))}</dd>
              </div>
            </dl>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => quitter(() => navigate(`/devis/${id}`))}
            className="rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
            style={{ color: C.textSecondary, backgroundColor: "transparent", border: `1px solid ${C.border}` }}
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={envoi || !apercu || calcul}
            className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ backgroundColor: C.primary }}
          >
            {envoi ? "Enregistrement…" : "Créer le brouillon d'acompte"}
          </button>
        </div>
      </form>
    </>
  );
}
