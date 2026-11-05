import React from "react";
import { FunnelChart, Funnel, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { C, euroCentimes } from "../../theme";
import { COULEURS_ETAPES } from "../dashboard/couleurs";
import TooltipShell from "./TooltipShell";

function Infobulle({ active, payload }) {
  if (!active || !payload?.length) return null;
  const e = payload[0].payload;
  return (
    <TooltipShell>
      <p className="mb-0.5 font-semibold" style={{ color: C.textPrimary }}>{e.etape}</p>
      <p className="tabular-nums" style={{ color: C.textSecondary }}>
        {e.nombre} opportunité{e.nombre > 1 ? "s" : ""} · {euroCentimes(e.montant)}
      </p>
    </TooltipShell>
  );
}

function EntonnoirPipeline({ data }) {
  return (
    <ResponsiveContainer>
      <FunnelChart margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
        <Tooltip content={<Infobulle />} />
        {/* Libellés dans la légende sous le graphique (lisibles, sans chevauchement) */}
        <Funnel data={data} dataKey="montant" nameKey="etape" stroke="none" lastShapeType="rectangle">
          {data.map((e, i) => <Cell key={e.etape} fill={COULEURS_ETAPES[i]} />)}
        </Funnel>
      </FunnelChart>
    </ResponsiveContainer>
  );
}

export default React.memo(EntonnoirPipeline);
