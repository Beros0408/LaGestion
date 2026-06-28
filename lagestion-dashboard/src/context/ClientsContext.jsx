import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { clients as initial } from "../data/clients";

const ClientsContext = createContext(null);

export function ClientsProvider({ children }) {
  const [clients, setClients] = useState(initial);

  const addClient = useCallback((data) => {
    let created;
    setClients((prev) => {
      const nextId = prev.reduce((m, c) => Math.max(m, c.id), 0) + 1;
      created = { id: nextId, ...data };
      return [...prev, created];
    });
    return created;
  }, []);

  const updateClient = useCallback((id, patch) => {
    setClients((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const deleteClient = useCallback((id) => {
    setClients((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const value = useMemo(
    () => ({ clients, addClient, updateClient, deleteClient }),
    [clients, addClient, updateClient, deleteClient]
  );

  return (
    <ClientsContext.Provider value={value}>{children}</ClientsContext.Provider>
  );
}

export function useClients() {
  const ctx = useContext(ClientsContext);
  if (!ctx) throw new Error("useClients doit être utilisé à l'intérieur de <ClientsProvider>");
  return ctx;
}
