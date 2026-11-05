import React from "react";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { C, TUILES, OMBRE, alpha } from "../../theme";

// variation : nombre (en %) → pastille ; null → pas de base de comparaison ; undefined → aucune pastille.
function Pastille({ variation }) {
  if (variation === undefined) return null;
  if (variation === null) {
    return <span className="text-xs" style={{ color: C.onPrimary }}>Pas de comparaison possible</span>;
  }
  const Icone = variation > 0 ? ArrowUp : variation < 0 ? ArrowDown : Minus;
  const texte = `${variation > 0 ? "+" : ""}${variation.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: C.onPrimary }}>
      <span
        className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-semibold tabular-nums"
        style={{ backgroundColor: alpha(C.textPrimary, 0.28) }}
      >
        <Icone size={12} aria-hidden="true" />
        {texte}
      </span>
      <span>vs période précédente</span>
    </span>
  );
}

function TuileKpi({ titre, valeur, detail, variation, teinte, index = 0 }) {
  const [debut, fin] = TUILES[teinte];
  return (
    <div
      className="lg-card-enter rounded-2xl p-5"
      style={{
        background: `linear-gradient(135deg, ${debut}, ${fin})`,
        boxShadow: OMBRE.sm,
        animationDelay: `${index * 60}ms`,
        color: C.onPrimary,
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-wider">{titre}</p>
      <p className="mt-2 tabular-nums" style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.15 }}>{valeur}</p>
      <div className="mt-2 flex min-h-[20px] flex-wrap items-center gap-x-2 gap-y-1">
        <Pastille variation={variation} />
        {detail && <span className="text-xs">{detail}</span>}
      </div>
    </div>
  );
}

export default React.memo(TuileKpi);
