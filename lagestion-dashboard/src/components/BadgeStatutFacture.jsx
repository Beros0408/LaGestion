import React from "react";
import { CheckCircle2, Clock, AlertTriangle, FileEdit } from "lucide-react";
import { C } from "../theme";

const META = {
  "Payée":      { color: C.success,       bg: "rgba(39,174,96,0.12)",  Icon: CheckCircle2 },
  "En attente": { color: C.info,          bg: "rgba(52,152,219,0.12)", Icon: Clock },
  "En retard":  { color: C.error,         bg: "rgba(231,76,60,0.12)",  Icon: AlertTriangle },
  "Brouillon":  { color: C.textSecondary, bg: "rgba(99,110,114,0.12)", Icon: FileEdit },
};

const BadgeStatutFacture = React.memo(function BadgeStatutFacture({ statut }) {
  const m = META[statut] || META.Brouillon;
  const Icon = m.Icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ color: m.color, backgroundColor: m.bg }}
    >
      <Icon size={13} aria-hidden="true" />
      {statut}
    </span>
  );
});

export default BadgeStatutFacture;
