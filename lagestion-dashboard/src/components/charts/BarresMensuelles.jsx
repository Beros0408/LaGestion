import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { C, alpha, euroCentimes } from "../../theme";
import TooltipShell from "./TooltipShell";

const SERIES = { facture: "Facturé HT", encaisse: "Encaissé" };

function Infobulle({ active, payload }) {
  if (!active || !payload?.length) return null;
  return (
    <TooltipShell>
      <p className="mb-1 font-semibold" style={{ color: C.textPrimary }}>{payload[0].payload.libelleLong}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: C.textSecondary }}>
          {SERIES[p.dataKey]} : <span className="font-semibold tabular-nums" style={{ color: C.textPrimary }}>{euroCentimes(p.value)}</span>
        </p>
      ))}
    </TooltipShell>
  );
}

const milliers = (v) => (v >= 1000 ? `${Math.round(v / 1000)} k` : `${v}`);

function BarresMensuelles({ data }) {
  return (
    <ResponsiveContainer>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barGap={4}>
        <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
        <XAxis dataKey="libelle" tick={{ fontSize: 11, fill: C.textSecondary }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: C.textSecondary }} axisLine={false} tickLine={false} tickFormatter={milliers} />
        <Tooltip content={<Infobulle />} cursor={{ fill: alpha(C.primary, 0.06) }} />
        <Legend formatter={(v) => <span style={{ color: C.textSecondary, fontSize: 12 }}>{SERIES[v]}</span>} />
        <Bar dataKey="facture" fill={C.chart1} radius={[6, 6, 0, 0]} maxBarSize={28} />
        <Bar dataKey="encaisse" fill={C.chart5} radius={[6, 6, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default React.memo(BarresMensuelles);
