import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { C, alpha, euroCentimes } from "../../theme";
import TooltipShell from "./TooltipShell";

function Infobulle({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <TooltipShell>
      <p className="mb-0.5 font-semibold" style={{ color: C.textPrimary }}>{label}</p>
      <p className="tabular-nums" style={{ color: C.textSecondary }}>
        {euroCentimes(d.montant)}{d.nombre !== undefined ? ` · ${d.nombre} facture${d.nombre > 1 ? "s" : ""}` : ""}
      </p>
    </TooltipShell>
  );
}

const milliers = (v) => (v >= 1000 ? `${Math.round(v / 1000)} k` : `${v}`);

// Barres horizontales : top clients (une couleur) ou âge des créances (une couleur par tranche).
function BarresHorizontales({ data, cleLibelle, couleurs, largeurLibelle = 140 }) {
  return (
    <ResponsiveContainer>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: C.textSecondary }} axisLine={false} tickLine={false} tickFormatter={milliers} />
        <YAxis type="category" dataKey={cleLibelle} width={largeurLibelle} tick={{ fontSize: 12, fill: C.textPrimary }} axisLine={false} tickLine={false} />
        <Tooltip content={<Infobulle />} cursor={{ fill: alpha(C.primary, 0.06) }} />
        <Bar dataKey="montant" radius={[0, 6, 6, 0]} barSize={20}>
          {data.map((_, i) => <Cell key={i} fill={couleurs[i % couleurs.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default React.memo(BarresHorizontales);
