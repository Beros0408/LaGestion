import React from "react";
import { AlertCircle, CalendarClock, Circle, CheckCircle2 } from "lucide-react";
import { COULEURS_ETAT, ETAT_TACHE } from "../theme";
import { LIBELLE_ETAT_TACHE } from "../utils/taches";

// État d'une tâche (etatTache) : à venir neutre, aujourd'hui information, en retard erreur, faite succès.
// Jetons d'état (CLAUDE.md « Couleurs d'état ») ; icône et libellé toujours présents.
const ICONES = { a_venir: Circle, aujourdhui: CalendarClock, en_retard: AlertCircle, faite: CheckCircle2 };

const BadgeTache = React.memo(function BadgeTache({ etat }) {
  const e = COULEURS_ETAT[ETAT_TACHE[etat] ?? "neutre"];
  const Icon = ICONES[etat] ?? Circle;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium" style={{ color: e.texte, background: e.badge }}>
      <Icon size={13} aria-hidden="true" style={{ color: e.trait }} />
      {LIBELLE_ETAT_TACHE[etat] ?? LIBELLE_ETAT_TACHE.a_venir}
    </span>
  );
});

export default BadgeTache;
