import React from "react";
import { CheckCircle2, Clock, AlertTriangle, FileEdit, Send, CircleDollarSign, Ban } from "lucide-react";
import { C } from "../theme";
import { LIBELLE_STATUT } from "../data/factures";

const META = {
  brouillon:           { color: C.textSecondary, bg: "rgba(99,110,114,0.12)",  Icon: FileEdit },
  en_attente:          { color: C.info,          bg: "rgba(52,152,219,0.12)",  Icon: Clock },
  envoyee:             { color: C.primary,       bg: "rgba(45,91,127,0.10)",   Icon: Send },
  payee:               { color: C.success,       bg: "rgba(39,174,96,0.12)",   Icon: CheckCircle2 },
  partiellement_payee: { color: C.warning,       bg: "rgba(243,156,18,0.12)",  Icon: CircleDollarSign },
  en_retard:           { color: C.error,         bg: "rgba(231,76,60,0.12)",   Icon: AlertTriangle },
  annulee:             { color: C.textSecondary, bg: "rgba(99,110,114,0.12)",  Icon: Ban },
};

const BadgeStatutFacture = React.memo(function BadgeStatutFacture({ statut }) {
  const m = META[statut] || META.brouillon;
  const libelle = LIBELLE_STATUT[statut] ?? LIBELLE_STATUT.brouillon;
  const Icon = m.Icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ color: m.color, backgroundColor: m.bg }}
    >
      <Icon size={13} aria-hidden="true" />
      {libelle}
    </span>
  );
});

export default BadgeStatutFacture;
