import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, AlertTriangle, FileEdit, Clock, ListPlus, Check } from "lucide-react";
import { C, alpha } from "../../theme";
import { tacheDeSuggestion } from "../../utils/taches";

const ICONES = { relances: AlertTriangle, brouillons: FileEdit, inactives: Clock };
const COULEURS = { relances: C.chart7, brouillons: C.chart4, inactives: C.chart6 };

const jours = (n) => {
  if (n === null || n === undefined) return "";
  return n === 0 ? " · aujourd'hui" : ` · ${n} jour${n > 1 ? "s" : ""}`;
};

// peutCreer : rôle qui écrit ; une seule tâche à faire par suggestion (sinon lien « Tâche créée »).
function ActionsSuggerees({ groupes, taches = [], peutCreer = false, enCours = null, onCreerTache }) {
  if (groupes.every((g) => g.total === 0)) {
    return <p className="text-sm" style={{ color: C.textSecondary }}>Aucune action en attente : tout est à jour.</p>;
  }
  return (
    <div className="space-y-4">
      {groupes.filter((g) => g.total > 0).map((g) => {
        const Icone = ICONES[g.cle];
        return (
          <section key={g.cle} aria-labelledby={`actions-${g.cle}`}>
            <h4 id={`actions-${g.cle}`} className="mb-2 flex items-center gap-2 text-sm font-semibold" style={{ color: C.textPrimary }}>
              <span className="flex h-6 w-6 items-center justify-center rounded-lg" style={{ backgroundColor: alpha(COULEURS[g.cle], 0.14), color: COULEURS[g.cle] }}>
                <Icone size={14} aria-hidden="true" />
              </span>
              {g.libelle}
              <span className="tabular-nums" style={{ color: C.textSecondary }}>({g.total})</span>
            </h4>
            <ul className="space-y-1.5">
              {g.elements.map((a) => (
                <li key={a.id} className="flex flex-col gap-1.5 rounded-xl px-3 py-2" style={{ backgroundColor: C.bgMain }}>
                  <div className="min-w-0">
                    <p className="line-clamp-2 text-sm font-medium" style={{ color: C.textPrimary }} title={a.titre}>{a.titre}</p>
                    <p className="truncate text-xs" style={{ color: C.textSecondary }}>{a.detail}{jours(a.jours)}</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    <Link
                      to={a.lien}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus-visible:ring-2"
                      style={{ color: C.primary, backgroundColor: alpha(C.primary, 0.08) }}
                      aria-label={`Ouvrir : ${a.titre}`}
                    >
                      Ouvrir <ArrowRight size={12} aria-hidden="true" />
                    </Link>
                    {tacheDeSuggestion(taches, g.cle, a) ? (
                      <Link
                        to="/taches"
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus-visible:ring-2"
                        style={{ color: C.successText }}
                        aria-label={`Tâche créée, voir mes tâches : ${a.titre}`}
                      >
                        <Check size={12} aria-hidden="true" /> Tâche créée
                      </Link>
                    ) : peutCreer && (
                      <button
                        type="button"
                        onClick={() => onCreerTache(g.cle, a)}
                        disabled={enCours === a.id}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold focus:outline-none focus-visible:ring-2 disabled:cursor-wait disabled:opacity-60"
                        style={{ color: C.primary, backgroundColor: alpha(C.primary, 0.08) }}
                        aria-label={`Créer une tâche : ${a.titre}`}
                      >
                        <ListPlus size={12} aria-hidden="true" /> Tâche
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {g.total > g.elements.length && (
              <p className="mt-1.5 text-xs" style={{ color: C.textSecondary }}>et {g.total - g.elements.length} autre{g.total - g.elements.length > 1 ? "s" : ""}</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

export default React.memo(ActionsSuggerees);
