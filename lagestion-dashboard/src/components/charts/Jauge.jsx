import React from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { C } from "../../theme";

// Jauge semi-circulaire ; taux en % (0-100), plafonné pour le tracé.
function Jauge({ taux, couleur, libelle }) {
  const v = Math.max(0, Math.min(100, taux));
  const data = [{ v }, { v: 100 - v }];
  return (
    <div className="relative" style={{ width: "100%", height: 150 }} role="img" aria-label={`${libelle} : ${taux.toLocaleString("fr-FR")} %`}>
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="v" startAngle={180} endAngle={0} cy="92%" innerRadius={78} outerRadius={108} stroke="none">
            <Cell fill={couleur} />
            <Cell fill={C.bgHover} />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex flex-col items-center" aria-hidden="true">
        <span className="tabular-nums" style={{ color: C.textPrimary, fontSize: 26, fontWeight: 700, lineHeight: 1 }}>
          {taux.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %
        </span>
      </div>
    </div>
  );
}

export default React.memo(Jauge);
