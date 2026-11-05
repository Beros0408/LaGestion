import React, { useEffect, useId, useRef } from "react";
import { C, OMBRE, VOILE } from "../theme";

const FOCUSABLES = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// Fenêtre de confirmation accessible : focus initial sur l'action prudente (annuler),
// focus piégé, Échap = annuler, retour du focus à l'élément d'origine à la fermeture.
export default function ConfirmDialog({
  ouvert,
  titre,
  message,
  libelleAnnuler = "Annuler",
  libelleConfirmer = "Confirmer",
  onAnnuler,
  onConfirmer,
  elementRetour,
}) {
  const refFenetre = useRef(null);
  const refAnnuler = useRef(null);
  const id = useId();

  useEffect(() => {
    if (!ouvert) return undefined;
    refAnnuler.current?.focus();
    return () => {
      if (elementRetour && document.contains(elementRetour)) elementRetour.focus();
    };
  }, [ouvert, elementRetour]);

  if (!ouvert) return null;

  const auClavier = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onAnnuler();
      return;
    }
    if (e.key !== "Tab") return;
    const elements = [...refFenetre.current.querySelectorAll(FOCUSABLES)];
    const premier = elements[0];
    const dernier = elements[elements.length - 1];
    if (e.shiftKey && document.activeElement === premier) {
      e.preventDefault();
      dernier.focus();
    } else if (!e.shiftKey && document.activeElement === dernier) {
      e.preventDefault();
      premier.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onKeyDown={auClavier}>
      <div className="lg-dialog-voile absolute inset-0" style={{ backgroundColor: VOILE }} onClick={onAnnuler} aria-hidden="true" />
      <div
        ref={refFenetre}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titre`}
        aria-describedby={`${id}-texte`}
        className="lg-dialog relative w-full max-w-md p-6"
        style={{ backgroundColor: C.bgCard, borderRadius: 20, border: `1px solid ${C.border}`, boxShadow: OMBRE.lg }}
      >
        <h2 id={`${id}-titre`} style={{ color: C.textPrimary, fontSize: 18, fontWeight: 600 }}>{titre}</h2>
        <p id={`${id}-texte`} className="mt-2 text-sm" style={{ color: C.textSecondary }}>{message}</p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onConfirmer}
            className="min-h-[40px] rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
            style={{ color: C.errorText, backgroundColor: "transparent", border: `1px solid ${C.errorText}` }}
          >
            {libelleConfirmer}
          </button>
          <button
            ref={refAnnuler}
            type="button"
            onClick={onAnnuler}
            className="min-h-[40px] rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
            style={{ color: C.onPrimary, backgroundColor: C.primary }}
          >
            {libelleAnnuler}
          </button>
        </div>
      </div>
    </div>
  );
}
