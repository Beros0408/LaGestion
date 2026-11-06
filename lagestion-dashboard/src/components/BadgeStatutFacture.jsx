import React from "react";
import { CheckCircle2, Lock, AlertTriangle, FileEdit, Send, CircleDollarSign, Ban } from "lucide-react";
import { C, alpha } from "../theme";
import { LIBELLE_STATUT } from "../data/factures";

// color : texte (token ≥ 4,5:1 sur le fond du badge) ; icone : couleur fonctionnelle d'origine.
const META = {
  brouillon:           { color: C.textSecondary, icone: C.textSecondary, bg: alpha(C.textSecondary, 0.12),  Icon: FileEdit },
  finalisee:           { color: C.infoText,      icone: C.info,      bg: alpha(C.info, 0.12),  Icon: Lock },
  envoyee:             { color: C.primary,       icone: C.primary,   bg: alpha(C.primary, 0.10),   Icon: Send },
  payee:               { color: C.successText,   icone: C.success,   bg: alpha(C.success, 0.12),   Icon: CheckCircle2 },
  partiellement_payee: { color: C.warningText,   icone: C.warning,   bg: alpha(C.warning, 0.12),  Icon: CircleDollarSign },
  // Fond opaque (teinte 10 % posée sur la carte) : texte errorText à 4,64:1 quel que soit le support.
  en_retard:           { color: C.errorText,     icone: C.error,     bg: `linear-gradient(${alpha(C.error, 0.1)}, ${alpha(C.error, 0.1)}), ${C.bgCard}`, Icon: AlertTriangle },
  annulee:             { color: C.textSecondary, icone: C.textSecondary, bg: alpha(C.textSecondary, 0.12),  Icon: Ban },
};

const BadgeStatutFacture = React.memo(function BadgeStatutFacture({ statut }) {
  const m = META[statut] || META.brouillon;
  const libelle = LIBELLE_STATUT[statut] ?? LIBELLE_STATUT.brouillon;
  const Icon = m.Icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ color: m.color, background: m.bg }}
    >
      <Icon size={13} aria-hidden="true" style={{ color: m.icone }} />
      {libelle}
    </span>
  );
});

export default BadgeStatutFacture;
