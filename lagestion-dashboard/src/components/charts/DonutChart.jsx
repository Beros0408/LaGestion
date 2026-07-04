import React from "react";
import { PieChart, Pie, Cell, Sector, Tooltip, ResponsiveContainer } from "recharts";
import { C } from "../../theme";
import TooltipShell from "./TooltipShell";

function DonutTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  const item = payload[0];
  return (
    <TooltipShell>
      <p className="mb-0.5 font-semibold" style={{ color: C.textPrimary }}>{item.name}</p>
      <p className="tabular-nums" style={{ color: C.textSecondary }}>{item.value} %</p>
    </TooltipShell>
  );
}

function renderActiveShape(props) {
  const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props;
  return (
    <Sector
      cx={cx}
      cy={cy}
      innerRadius={innerRadius}
      outerRadius={outerRadius + 4}
      startAngle={startAngle}
      endAngle={endAngle}
      fill={fill}
    />
  );
}

function DonutChart({ data, activeIndex, setActiveIndex, dominantIndex }) {
  const active = data[activeIndex];
  return (
    <div className="relative" style={{ width: "100%", height: 180 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="valeur"
            nameKey="nom"
            cx="50%"
            cy="50%"
            innerRadius={48}
            outerRadius={75}
            paddingAngle={3}
            stroke="none"
            activeIndex={activeIndex}
            activeShape={renderActiveShape}
            onMouseEnter={(_, i) => setActiveIndex(i)}
            onMouseLeave={() => setActiveIndex(dominantIndex)}
          >
            {data.map((e, i) => <Cell key={i} fill={e.couleur} />)}
          </Pie>
          <Tooltip content={<DonutTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      <div
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
        aria-hidden="true"
      >
        <span
          className="tabular-nums"
          style={{ color: C.textPrimary, fontSize: 22, fontWeight: 700, lineHeight: 1 }}
        >
          {active.valeur} %
        </span>
        <span style={{ color: C.textSecondary, fontSize: 12, marginTop: 4 }}>
          {active.nom}
        </span>
      </div>
    </div>
  );
}

export default React.memo(DonutChart);
