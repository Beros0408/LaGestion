import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { factures as initial, STATUTS } from "../data/factures";

const FacturesContext = createContext(null);

function prochainNumero(existants) {
  const annee = new Date().getFullYear();
  const prefix = `FAC-${annee}-`;
  const max = existants
    .filter((f) => typeof f.numero === "string" && f.numero.startsWith(prefix))
    .reduce((m, f) => {
      const n = parseInt(f.numero.slice(prefix.length), 10);
      return Number.isNaN(n) ? m : Math.max(m, n);
    }, 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export function FacturesProvider({ children }) {
  const [factures, setFactures] = useState(initial);

  const addFacture = useCallback((data) => {
    let created;
    setFactures((prev) => {
      const nextId = prev.reduce((m, f) => Math.max(m, f.id), 0) + 1;
      const numero = data.numero || prochainNumero(prev);
      created = { id: nextId, numero, ...data };
      return [...prev, created];
    });
    return created;
  }, []);

  const updateFacture = useCallback((id, patch) => {
    setFactures((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }, []);

  const deleteFacture = useCallback((id) => {
    setFactures((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const changerStatut = useCallback((id, nouveauStatut) => {
    if (!STATUTS.includes(nouveauStatut)) return;
    setFactures((prev) => prev.map((f) => (f.id === id ? { ...f, statut: nouveauStatut } : f)));
  }, []);

  const value = useMemo(
    () => ({ factures, addFacture, updateFacture, deleteFacture, changerStatut }),
    [factures, addFacture, updateFacture, deleteFacture, changerStatut]
  );

  return <FacturesContext.Provider value={value}>{children}</FacturesContext.Provider>;
}

export function useFactures() {
  const ctx = useContext(FacturesContext);
  if (!ctx) throw new Error("useFactures doit être utilisé à l'intérieur de <FacturesProvider>");
  return ctx;
}
