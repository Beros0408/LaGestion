import React from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { C, euro } from "../../theme";
import TooltipShell from "./TooltipShell";

function PipelineTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <TooltipShell>
      <p className="mb-0.5 font-semibold" style={{ color: C.textPrimary }}>{label}</p>
      <p style={{ color: C.textSecondary }}>
        Montant pondéré : <span className="font-semibold tabular-nums" style={{ color: C.textPrimary }}>{euro(payload[0].value)}</span>
      </p>
    </TooltipShell>
  );
}

function PipelineChart({ data }) {
  return (
    <ResponsiveContainer>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: C.textSecondary }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v / 1000}k`} />
        <YAxis type="category" dataKey="etape" tick={{ fontSize: 12, fill: C.textPrimary }} axisLine={false} tickLine={false} width={92} />
        <Tooltip content={<PipelineTooltip />} cursor={{ fill: "rgba(45,91,127,0.05)" }} />
        <Bar dataKey="montant" radius={[0, 6, 6, 0]} barSize={26}>
          {data.map((_, i) => (
            <Cell key={i} fill={[C.primary, C.secondary, C.accent, C.info][i]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default React.memo(PipelineChart);
