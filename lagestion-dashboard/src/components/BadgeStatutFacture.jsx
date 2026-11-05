import React from "react";
import { CheckCircle2, Clock, AlertTriangle, FileEdit, Send, CircleDollarSign, Ban } from "lucide-react";
import { C, alpha } from "../theme";
import { LIBELLE_STATUT } from "../data/factures";

const META = {
  brouillon:           { color: C.textSecondary, bg: alpha(C.textSecondary, 0.12),  Icon: FileEdit },
  en_attente:          { color: C.info,          bg: alpha(C.info, 0.12),  Icon: Clock },
  envoyee:             { color: C.primary,       bg: alpha(C.primary, 0.10),   Icon: Send },
  payee:               { color: C.success,       bg: alpha(C.success, 0.12),   Icon: CheckCircle2 },
  partiellement_payee: { color: C.warning,       bg: alpha(C.warning, 0.12),  Icon: CircleDollarSign },
  en_retard:           { color: C.error,         bg: alpha(C.error, 0.12),   Icon: AlertTriangle },
  annulee:             { color: C.textSecondary, bg: alpha(C.textSecondary, 0.12),  Icon: Ban },
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
