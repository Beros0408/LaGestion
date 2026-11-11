import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { C } from "../../theme";
import { messageErreur } from "../../utils/erreurs";
import { phraseActivite, quandRelatif } from "../../utils/dashboard";

const COULEURS = { clients: C.chart2, devis: C.chart4, factures: C.chart1, opportunites: C.chart6, paiements: C.chart5 };
const LIMITE = 12;

// Lecture de audit_events : la RLS (002) la réserve aux administrateurs.
function ActivitesRecentes({ entrepriseId, estAdmin, factures, clients }) {
  const [evenements, setEvenements] = useState(null);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    if (!estAdmin || !entrepriseId) return undefined;
    let annule = false;
    supabase
      .from("audit_events")
      .select("id, action, table_name, old_data, new_data, created_at")
      .eq("entreprise_id", entrepriseId)
      .neq("table_name", "lignes_devis") // tracées, mais trop nombreuses pour ce fil : le devis suffit
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(LIMITE)
      .then(({ data, error }) => {
        if (annule) return;
        if (error) setErreur(messageErreur(error));
        else setEvenements(data ?? []);
      });
    return () => { annule = true; };
  }, [estAdmin, entrepriseId]);

  const facturesParId = useMemo(() => new Map(factures.map((f) => [f.id, f])), [factures]);
  const clientsParId = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  if (!estAdmin) return <p className="text-sm" style={{ color: C.textSecondary }}>Réservé aux administrateurs.</p>;
  if (erreur) return <p role="alert" className="text-sm" style={{ color: C.errorText }}>{erreur}</p>;
  if (evenements === null) return <div role="status" aria-label="Chargement" style={{ height: 160, backgroundColor: C.bgHover, borderRadius: 12 }} />;
  if (evenements.length === 0) return <p className="text-sm" style={{ color: C.textSecondary }}>Aucune activité enregistrée.</p>;

  const maintenant = new Date();
  return (
    <ul className="space-y-3">
      {evenements.map((e) => (
        <li key={e.id} className="flex gap-3">
          <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: COULEURS[e.table_name] ?? C.chart8 }} aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-sm leading-snug" style={{ color: C.textPrimary }}>{phraseActivite(e, facturesParId, clientsParId)}</p>
            <p className="text-xs" style={{ color: C.textSecondary }}>{quandRelatif(e.created_at, maintenant)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default React.memo(ActivitesRecentes);
