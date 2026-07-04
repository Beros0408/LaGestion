import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { opportunites as initial, ETAPES } from "../data/opportunites";

const OpportunitesContext = createContext(null);

export function OpportunitesProvider({ children }) {
  const [opportunites, setOpportunites] = useState(initial);

  const addOpportunite = useCallback((data) => {
    let created;
    setOpportunites((prev) => {
      const nextId = prev.reduce((m, o) => Math.max(m, o.id), 0) + 1;
      created = { id: nextId, ...data };
      return [...prev, created];
    });
    return created;
  }, []);

  const updateOpportunite = useCallback((id, patch) => {
    setOpportunites((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }, []);

  const deleteOpportunite = useCallback((id) => {
    setOpportunites((prev) => prev.filter((o) => o.id !== id));
  }, []);

  const moveOpportunite = useCallback((id, nouvelleEtape) => {
    if (!ETAPES.includes(nouvelleEtape)) return;
    setOpportunites((prev) =>
      prev.map((o) => (o.id === id ? { ...o, etape: nouvelleEtape } : o))
    );
  }, []);

  const value = useMemo(
    () => ({ opportunites, addOpportunite, updateOpportunite, deleteOpportunite, moveOpportunite }),
    [opportunites, addOpportunite, updateOpportunite, deleteOpportunite, moveOpportunite]
  );

  return (
    <OpportunitesContext.Provider value={value}>{children}</OpportunitesContext.Provider>
  );
}

export function useOpportunites() {
  const ctx = useContext(OpportunitesContext);
  if (!ctx) throw new Error("useOpportunites doit être utilisé à l'intérieur de <OpportunitesProvider>");
  return ctx;
}
