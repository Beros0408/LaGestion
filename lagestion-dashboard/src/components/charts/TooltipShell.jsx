import React from "react";
import { C } from "../../theme";

export default function TooltipShell({ children }) {
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-lg"
      style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}
    >
      {children}
    </div>
  );
}
