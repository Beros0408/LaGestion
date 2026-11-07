import React from "react";
import { CheckCircle2, CircleDashed, Clock, CalendarClock, AlertCircle, FileEdit, Ban, FileMinus } from "lucide-react";
import { couleurEtat } from "../theme";
import { LIBELLE_STATUT, LIBELLE_ECHEANCE } from "../data/factures";

// Couleurs : jetons d'état (theme.js, CLAUDE.md « Couleurs d'état ») ; fond opaque, texte et icône ≥ 4,5:1.
// Le statut vient de statutCalcule, ou de etatEcheance (Impayés, factures liées) ; un avoir est toujours neutre.
const ICONES = {
  payee: CheckCircle2,
  partiellement_payee: CircleDashed,
  finalisee: Clock,
  envoyee: Clock,
  en_retard: AlertCircle,
  brouillon: FileEdit,
  annulee: Ban,
  a_echoir: Clock,
  echeance_aujourdhui: CalendarClock,
};

const BadgeStatutFacture = React.memo(function BadgeStatutFacture({ statut, type }) {
  const e = couleurEtat(statut, type);
  const libelle = LIBELLE_STATUT[statut] ?? LIBELLE_ECHEANCE[statut] ?? LIBELLE_STATUT.brouillon;
  const Icon = type === "avoir" ? FileMinus : ICONES[statut] ?? FileEdit;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ color: e.texte, background: e.badge }}
    >
      <Icon size={13} aria-hidden="true" style={{ color: e.trait }} />
      {libelle}
    </span>
  );
});

export default BadgeStatutFacture;
