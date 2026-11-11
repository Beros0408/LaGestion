import React, { useId, useRef } from "react";
import { AlertCircle } from "lucide-react";
import { C, OMBRE, VOILE, alpha } from "../theme";
import usePiegeFocus from "../hooks/usePiegeFocus";

// Fenêtre modale de saisie : titre, erreur, champs, Annuler / Enregistrer. Focus piégé, Échap ferme.
export default function FenetreFormulaire({ titre, erreur, envoi, libelleValider = "Enregistrer", valide = true, elementRetour, onFermer, onValider, children }) {
  const refFenetre = useRef(null);
  // Focus initial : premier champ de la fenêtre (les champs partagés ne transmettent pas de ref) ;
  // sans champ (simple confirmation), le premier bouton : « Annuler ».
  const refInitial = useRef({ focus: () => refFenetre.current?.querySelector("input, select, textarea, button")?.focus() });
  const id = useId();
  const auClavier = usePiegeFocus({ ouvert: true, refFenetre, refInitial, elementRetour, onEchap: onFermer });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onKeyDown={auClavier}>
      <div className="lg-dialog-voile absolute inset-0" style={{ backgroundColor: VOILE }} onClick={onFermer} aria-hidden="true" />
      <form
        ref={refFenetre}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titre`}
        className="lg-dialog relative max-h-full w-full max-w-lg overflow-y-auto p-6"
        style={{ backgroundColor: C.bgCard, borderRadius: 20, border: `1px solid ${C.border}`, boxShadow: OMBRE.lg }}
        onSubmit={(e) => { e.preventDefault(); if (valide && !envoi) onValider(); }}
      >
        <h2 id={`${id}-titre`} style={{ color: C.textPrimary, fontSize: 18, fontWeight: 600 }}>{titre}</h2>
        {erreur && (
          <div role="alert" className="mt-3 flex items-start gap-2 rounded-xl p-3 text-sm" style={{ backgroundColor: alpha(C.error, 0.06), color: C.errorText, border: `1px solid ${C.error}` }}>
            <AlertCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            <span>{erreur}</span>
          </div>
        )}
        <div className="mt-4 space-y-3">{children}</div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onFermer}
            className="min-h-[40px] rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
            style={{ color: C.textSecondary, backgroundColor: "transparent", border: `1px solid ${C.border}` }}
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={envoi || !valide}
            className="min-h-[40px] rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ color: C.onPrimary, backgroundColor: C.primary }}
          >
            {envoi ? "Enregistrement…" : libelleValider}
          </button>
        </div>
      </form>
    </div>
  );
}
