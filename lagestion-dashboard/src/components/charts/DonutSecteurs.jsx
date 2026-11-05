import React, { useState } from "react";
import { PieChart, Pie, Cell, Sector, Tooltip, ResponsiveContainer } from "recharts";
import { C, euroCentimes } from "../../theme";
import { couleurSecteur } from "../dashboard/couleurs";
import TooltipShell from "./TooltipShell";

function Infobulle({ active, payload }) {
  if (!active || !payload?.length) return null;
  const s = payload[0].payload;
  return (
    <TooltipShell>
      <p className="mb-0.5 font-semibold" style={{ color: C.textPrimary }}>{s.nom}</p>
      <p className="tabular-nums" style={{ color: C.textSecondary }}>{euroCentimes(s.montant)} · {s.part.toLocaleString("fr-FR")} %</p>
    </TooltipShell>
  );
}

const formeActive = (p) => <Sector {...p} outerRadius={p.outerRadius + 4} />;

function DonutSecteurs({ data }) {
  const [actif, setActif] = useState(0);
  const s = data[actif] ?? data[0];
  return (
    <div className="relative" style={{ width: "100%", height: 200 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="montant"
            nameKey="nom"
            innerRadius={56}
            outerRadius={84}
            paddingAngle={2}
            stroke="none"
            activeIndex={actif}
            activeShape={formeActive}
            onMouseEnter={(_, i) => setActif(i)}
          >
            {data.map((e, i) => <Cell key={e.nom} fill={couleurSecteur(e.nom, i)} />)}
          </Pie>
          <Tooltip content={<Infobulle />} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
        <span className="tabular-nums" style={{ color: C.textPrimary, fontSize: 22, fontWeight: 700, lineHeight: 1 }}>
          {s.part.toLocaleString("fr-FR")} %
        </span>
        <span className="max-w-[96px] truncate text-center" style={{ color: C.textSecondary, fontSize: 12, marginTop: 4 }}>{s.nom}</span>
      </div>
    </div>
  );
}

export default React.memo(DonutSecteurs);
