import React from "react";
import { C, COULEURS_ETAT, ETAT_REGLEMENT, PISTE_JAUGE, CONTOUR_JAUGE, euroCentimes } from "../theme";
import { etatReglement, reglementAffichable, totalPaye, totalTTC, totalAvoirs } from "../utils/facture";

// « X € réglés sur Y € » : encaissé net (totalPaye) sur TTC net des avoirs (totalTTC − totalAvoirs), de 0 % à 100 %.
// Rien pour un brouillon, un avoir, une facture annulée ou des paiements non chargés (reglementAffichable).
// Couleur selon le règlement : partielle (avertissement), soldée (succès), non réglée (jauge vide).
// Pleine largeur du parent : l'écran fixe la largeur. Aucune animation.
const BarreReglement = React.memo(function BarreReglement({ facture }) {
  if (!reglementAffichable(facture)) return null;
  const du = (Math.round(totalTTC(facture) * 100) - Math.round(totalAvoirs(facture) * 100)) / 100;
  const regle = totalPaye(facture);
  const etat = ETAT_REGLEMENT[etatReglement(facture)];
  const part = Math.min(100, Math.max(0, (regle / du) * 100));
  const texte = `${euroCentimes(regle)} réglés sur ${euroCentimes(du)}`;
  return (
    <div className="w-full whitespace-normal">
      <div
        role="progressbar"
        aria-label="Règlement de la facture"
        aria-valuemin={0}
        aria-valuemax={du}
        aria-valuenow={Math.min(du, Math.max(0, regle))}
        aria-valuetext={texte}
        className="h-2 overflow-hidden rounded-full"
        style={{ background: PISTE_JAUGE, border: `1px solid ${CONTOUR_JAUGE}` }}
      >
        {etat && part > 0 && (
          <div className="h-full rounded-full" style={{ width: `${part}%`, background: COULEURS_ETAT[etat].trait }} />
        )}
      </div>
      <p className="mt-1 text-xs font-normal tabular-nums" style={{ color: C.textSecondary }}>{texte}</p>
    </div>
  );
});

export default BarreReglement;
