import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { C, euro } from "../../theme";
import { ETAPES } from "../../data/opportunites";
import { COULEURS_ETAPES } from "./couleurs";

// Carte large : tableau à 6 colonnes ; carte étroite : liste à deux lignes (même contenu).
// Bascule par requête de conteneur CSS (index.css : .lg-prioritaires).

const dateFr = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR") : "—");
const lienDe = (o) => `/opportunites/${o.id}/modifier`;

function Etape({ etape }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" style={{ color: C.textPrimary }}>
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: COULEURS_ETAPES[ETAPES.indexOf(etape)] ?? C.chart8 }} aria-hidden="true" />
      {etape}
    </span>
  );
}

// Date de clôture ; dépassée : rouge, icône et texte (jamais la couleur seule).
function Cloture({ o }) {
  if (!o.depassee) return <span style={{ color: C.textSecondary }}>{dateFr(o.dateCloture)}</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1 font-medium" style={{ color: C.errorText }}>
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <AlertTriangle size={13} aria-hidden="true" />
        {dateFr(o.dateCloture)}
      </span>
      <span className="whitespace-nowrap">· dépassée</span>
    </span>
  );
}

function NomLien({ o }) {
  return (
    <Link to={lienDe(o)} onClick={(e) => e.stopPropagation()} title={o.nom}
      className="block truncate font-medium focus:outline-none focus-visible:ring-2" style={{ color: C.primary }}>
      {o.nom}
    </Link>
  );
}

function OpportunitesPrioritaires({ opportunites }) {
  const navigate = useNavigate();
  if (opportunites.length === 0) {
    return <p className="py-8 text-center text-sm" style={{ color: C.textSecondary }}>Aucune opportunité ouverte.</p>;
  }
  return (
    <div className="lg-prioritaires">
      {/* Tableau (carte large) */}
      <table className="lg-prioritaires-table w-full table-fixed text-sm">
        <colgroup>
          <col style={{ width: "27%" }} /><col style={{ width: "21%" }} /><col style={{ width: "15%" }} />
          <col style={{ width: "11%" }} /><col style={{ width: "8%" }} /><col style={{ width: "18%" }} />
        </colgroup>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            {["Opportunité", "Client", "Étape", "Montant", "Proba.", "Clôture prévue"].map((h, i) => (
              <th key={h} scope="col" className={`px-2 py-2.5 text-xs font-semibold uppercase tracking-wider ${i === 3 || i === 4 ? "text-right" : "text-left"}`} style={{ color: C.textSecondary }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {opportunites.map((o) => (
            <tr key={o.id} onClick={() => navigate(lienDe(o))} className="cursor-pointer transition-colors hover:bg-lg-hover" style={{ borderBottom: `1px solid ${C.border}` }}>
              <td className="px-2 py-3"><NomLien o={o} /></td>
              <td className="truncate px-2 py-3" style={{ color: C.textSecondary }} title={o.client}>{o.client}</td>
              <td className="px-2 py-3"><Etape etape={o.etape} /></td>
              <td className="whitespace-nowrap px-2 py-3 text-right font-semibold tabular-nums" style={{ color: C.textPrimary }}>{euro(o.montant)}</td>
              <td className="whitespace-nowrap px-2 py-3 text-right tabular-nums" style={{ color: C.textSecondary }}>{o.probabilite} %</td>
              <td className="px-2 py-3 tabular-nums"><Cloture o={o} /></td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Liste (carte étroite) */}
      <ul className="lg-prioritaires-liste">
        {opportunites.map((o) => (
          <li key={o.id} onClick={() => navigate(lienDe(o))} className="cursor-pointer rounded-lg px-2 py-2.5 text-sm transition-colors hover:bg-lg-hover" style={{ borderBottom: `1px solid ${C.border}` }}>
            <div className="flex items-baseline justify-between gap-3">
              <div className="min-w-0"><NomLien o={o} /></div>
              <span className="shrink-0 font-semibold tabular-nums" style={{ color: C.textPrimary }}>{euro(o.montant)}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="max-w-full truncate" style={{ color: C.textSecondary }}>{o.client}</span>
              <Etape etape={o.etape} />
              <span className="tabular-nums" style={{ color: C.textSecondary }}>{o.probabilite} %</span>
              <span className="tabular-nums"><Cloture o={o} /></span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default React.memo(OpportunitesPrioritaires);
