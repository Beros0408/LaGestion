import React from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { C, euro } from "../../theme";
import TooltipShell from "./TooltipShell";

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <TooltipShell>
      <p className="mb-1 font-semibold" style={{ color: C.textPrimary }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.fill }}>
          {p.name === "ca" ? "Chiffre d'affaires" : "Objectif"} : <span className="font-semibold tabular-nums">{euro(p.value)}</span>
        </p>
      ))}
    </TooltipShell>
  );
}

function CaChart({ data }) {
  return (
    <ResponsiveContainer>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <defs>
          <linearGradient id="gradCa" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.primary} stopOpacity={0.28} />
            <stop offset="100%" stopColor={C.primary} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
        <XAxis dataKey="mois" tick={{ fontSize: 11, fill: C.textSecondary }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: C.textSecondary }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v / 1000}k`} />
        <Tooltip content={<ChartTooltip />} />
        <Area type="monotone" dataKey="objectif" stroke={C.textSecondary} strokeDasharray="4 4" strokeWidth={1.5} fill="none" name="objectif" />
        <Area type="monotone" dataKey="ca" stroke={C.primary} strokeWidth={2.5} fill="url(#gradCa)" name="ca" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export default React.memo(CaChart);
