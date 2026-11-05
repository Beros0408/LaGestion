import { useEffect } from "react";

const FOCUSABLES = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

// Fenêtre modale accessible : focus initial sur refInitial à l'ouverture, retour du focus à
// elementRetour à la fermeture. Renvoie le gestionnaire clavier à poser sur la fenêtre :
// Échap → onEchap ; Tab / Maj+Tab bouclent sur les éléments focalisables de refFenetre.
export default function usePiegeFocus({ ouvert, refFenetre, refInitial, elementRetour, onEchap }) {
  useEffect(() => {
    if (!ouvert) return undefined;
    refInitial.current?.focus();
    return () => {
      if (elementRetour && document.contains(elementRetour)) elementRetour.focus();
    };
  }, [ouvert, elementRetour, refInitial]);

  return (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onEchap();
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
}
