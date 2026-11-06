import React, { useId, useMemo, useRef, useState } from "react";
import { AlertCircle, Copy } from "lucide-react";
import { C, OMBRE, VOILE, alpha } from "../theme";
import usePiegeFocus from "../hooks/usePiegeFocus";
import { useFactures } from "../context/FacturesContext.jsx";
import { LIBELLE_NIVEAU, genererRelance, niveauSuivant, niveauxPossibles } from "../data/relances";
import { jourParis } from "../utils/facture";
import Input from "./form/Input.jsx";
import Select from "./form/Select.jsx";
import Textarea from "./form/Textarea.jsx";

// Prépare un brouillon de relance : rien n'est tracé à l'ouverture, rien n'est envoyé.
// « Copier et enregistrer » trace la relance, puis copie le texte.
export default function FenetreRelance({ facture, client, entreprise, role, elementRetour, onFermer }) {
  const { preparerRelance } = useFactures();
  const jour = useMemo(() => jourParis(), []);
  const options = useMemo(() => niveauxPossibles(facture, role), [facture, role]);
  const proposeBrut = niveauSuivant(facture);
  const propose = options.includes(proposeBrut) ? proposeBrut : options[options.length - 1] ?? 1;

  const [niveau, setNiveau] = useState(propose);
  const [brouillon, setBrouillon] = useState(() => genererRelance(propose, facture, client, entreprise, jour));
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [copieManuelle, setCopieManuelle] = useState(null);
  const [termine, setTermine] = useState(false);

  const refFenetre = useRef(null);
  const refInitial = useRef(null);
  const id = useId();
  const auClavier = usePiegeFocus({ ouvert: true, refFenetre, refInitial, elementRetour, onEchap: onFermer });

  const changerNiveau = (n) => {
    setNiveau(n);
    setBrouillon(genererRelance(n, facture, client, entreprise, jour));
  };

  const texteComplet = `Objet : ${brouillon.objet}\n\n${brouillon.corps}`;

  const enregistrer = async () => {
    setErreur(null);
    setEnvoi(true);
    try {
      await preparerRelance(facture.id, niveau, brouillon.objet, brouillon.corps, brouillon.destinataire);
    } catch (err) {
      setErreur(err?.message ?? "Enregistrement impossible.");
      setEnvoi(false);
      return;
    }
    try {
      await navigator.clipboard.writeText(texteComplet);
      setTermine(true);
    } catch {
      setCopieManuelle(texteComplet);
    }
    setEnvoi(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onKeyDown={auClavier}>
      <div className="lg-dialog-voile absolute inset-0" style={{ backgroundColor: VOILE }} onClick={onFermer} aria-hidden="true" />
      <div
        ref={refFenetre}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titre`}
        className="lg-dialog relative max-h-full w-full max-w-2xl overflow-y-auto p-6"
        style={{ backgroundColor: C.bgCard, borderRadius: 20, border: `1px solid ${C.border}`, boxShadow: OMBRE.lg }}
      >
        <h2 id={`${id}-titre`} style={{ color: C.textPrimary, fontSize: 18, fontWeight: 600 }}>
          {`Relance de la facture ${facture.numero}`}
        </h2>
        <p className="mt-1 text-xs" style={{ color: C.textSecondary }}>
          Aucun envoi automatique : relisez, modifiez, puis copiez ce texte dans votre messagerie.
        </p>

        {erreur && (
          <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl p-3 text-sm" style={{ backgroundColor: alpha(C.error, 0.06), color: C.errorText, border: `1px solid ${C.error}` }}>
            <AlertCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>{erreur}</span>
          </div>
        )}

        {termine && (
          <p role="status" className="mt-3 rounded-xl p-3 text-sm" style={{ backgroundColor: alpha(C.success, 0.1), color: C.successText, border: `1px solid ${C.success}` }}>
            Relance enregistrée dans l'historique et texte copié. Collez-le dans votre messagerie.
          </p>
        )}

        {copieManuelle && (
          <div role="status" className="mt-3 rounded-xl p-3 text-sm" style={{ backgroundColor: alpha(C.warning, 0.1), color: C.warningText, border: `1px solid ${C.warning}` }}>
            Relance enregistrée, mais la copie automatique a échoué : sélectionnez le texte ci-dessous et copiez-le.
          </div>
        )}

        {copieManuelle ? (
          <Textarea className="mt-3" label="Texte à copier" rows={12} readOnly value={copieManuelle} />
        ) : !termine && (
          <div className="mt-4 space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Select
                label="Niveau"
                value={String(niveau)}
                onChange={(e) => changerNiveau(Number(e.target.value))}
                options={options.map((n) => ({ value: String(n), label: n === proposeBrut ? `${LIBELLE_NIVEAU[n]} (proposé)` : LIBELLE_NIVEAU[n] }))}
              />
              <Input
                label="Destinataire"
                type="email"
                value={brouillon.destinataire}
                onChange={(e) => setBrouillon((b) => ({ ...b, destinataire: e.target.value }))}
              />
            </div>
            {niveau === 3 && (
              <p role="status" className="rounded-xl p-3 text-xs" style={{ backgroundColor: alpha(C.warning, 0.1), color: C.warningText, border: `1px solid ${C.warning}` }}>
                Une mise en demeure s'envoie de préférence en recommandé avec accusé de réception. Faites valider ce modèle par votre conseil avant tout usage réel.
              </p>
            )}
            <Input label="Objet" value={brouillon.objet} onChange={(e) => setBrouillon((b) => ({ ...b, objet: e.target.value }))} />
            <Textarea label="Texte" rows={12} value={brouillon.corps} onChange={(e) => setBrouillon((b) => ({ ...b, corps: e.target.value }))} />
          </div>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={refInitial}
            type="button"
            onClick={onFermer}
            className="min-h-[40px] rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
            style={{ color: C.textSecondary, backgroundColor: "transparent", border: `1px solid ${C.border}` }}
          >
            {termine || copieManuelle ? "Fermer" : "Annuler"}
          </button>
          {!termine && !copieManuelle && (
            <button
              type="button"
              onClick={enregistrer}
              disabled={envoi || !brouillon.objet.trim() || !brouillon.corps.trim()}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
              style={{ color: C.onPrimary, backgroundColor: C.primary }}
            >
              <Copy size={16} aria-hidden="true" />
              {envoi ? "Enregistrement…" : "Copier et enregistrer"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
