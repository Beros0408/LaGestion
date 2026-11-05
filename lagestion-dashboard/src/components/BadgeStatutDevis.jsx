import React from "react";
import { CheckCircle2, CalendarX2, FileCheck2, FileEdit, Send, Ban } from "lucide-react";
import { C, alpha } from "../theme";
import { LIBELLE_STATUT_DEVIS } from "../data/devis";

// color : texte (token ≥ 4,5:1 sur le fond du badge) ; icone : couleur fonctionnelle d'origine.
const META = {
  brouillon: { color: C.textSecondary, icone: C.textSecondary, bg: alpha(C.textSecondary, 0.12), Icon: FileEdit },
  envoye:    { color: C.primary,       icone: C.primary,       bg: alpha(C.primary, 0.10),       Icon: Send },
  accepte:   { color: C.successText,   icone: C.success,       bg: alpha(C.success, 0.12),       Icon: CheckCircle2 },
  // Fond opaque (teinte 10 % posée sur la carte) : comme le badge « En retard » des factures.
  refuse:    { color: C.errorText,     icone: C.error,         bg: `linear-gradient(${alpha(C.error, 0.1)}, ${alpha(C.error, 0.1)}), ${C.bgCard}`, Icon: Ban },
  expire:    { color: C.warningText,   icone: C.warning,       bg: alpha(C.warning, 0.12),       Icon: CalendarX2 },
  converti:  { color: C.infoText,      icone: C.info,          bg: alpha(C.info, 0.12),          Icon: FileCheck2 },
};

const BadgeStatutDevis = React.memo(function BadgeStatutDevis({ statut }) {
  const m = META[statut] || META.brouillon;
  const libelle = LIBELLE_STATUT_DEVIS[statut] ?? LIBELLE_STATUT_DEVIS.brouillon;
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

export default BadgeStatutDevis;
