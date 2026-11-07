import React from "react";
import { C, couleurEtat, melange, euroCentimes } from "../theme";
import { totalPaye, totalTTC, totalAvoirs } from "../utils/facture";

// « X € réglés sur Y € » : encaissé net (totalPaye) sur TTC net des avoirs (totalTTC − totalAvoirs).
// Affichée pour une facture partiellement payée, ou en retard avec un encaissement ; sinon rien.
// statut : résultat de statutCalcule, fourni par l'écran. Aucune animation.
const BarreReglement = React.memo(function BarreReglement({ facture, statut }) {
  const regle = totalPaye(facture);
  if (!(statut === "partiellement_payee" || (statut === "en_retard" && regle > 0))) return null;
  const du = (Math.round(totalTTC(facture) * 100) - Math.round(totalAvoirs(facture) * 100)) / 100;
  if (du <= 0) return null;
  const e = couleurEtat(statut);
  const part = Math.min(100, Math.max(0, (regle / du) * 100));
  const texte = `${euroCentimes(regle)} réglés sur ${euroCentimes(du)}`;
  return (
    <div className="mt-1.5 min-w-[6rem] whitespace-normal">
      <div
        role="progressbar"
        aria-label="Règlement de la facture"
        aria-valuemin={0}
        aria-valuemax={du}
        aria-valuenow={regle}
        aria-valuetext={texte}
        className="h-1.5 overflow-hidden rounded-full"
        style={{ background: melange(C.textSecondary, 0.12, e.fond) }}
      >
        <div className="h-full rounded-full" style={{ width: `${part}%`, background: e.trait }} />
      </div>
      <p className="mt-1 text-xs tabular-nums" style={{ color: C.textSecondary }}>{texte}</p>
    </div>
  );
});

export default BarreReglement;
