import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext.jsx";

const ClientsContext = createContext(null);

const CHAMPS = [
  "type", "nom", "email", "telephone", "adresse", "statut", "tags", "notes", "score",
  "siren", "siret", "tva_intra", "site_web", "date_naissance",
];

function preparerPayload(data) {
  const payload = {};
  CHAMPS.forEach((cle) => {
    if (data[cle] === undefined) return;
    const v = data[cle];
    if (typeof v === "string") {
      payload[cle] = v.trim() === "" ? null : v.trim();
    } else if (Array.isArray(v)) {
      payload[cle] = v;
    } else {
      payload[cle] = v;
    }
  });
  return payload;
}

export function ClientsProvider({ children }) {
  const { user, chargement: chargementAuth } = useAuth();
  const [clients, setClients] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);

  const chargerClients = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .is("deleted_at", null)
      .order("id", { ascending: true });
    if (error) {
      setErreur(error.message);
      setClients([]);
    } else {
      setClients(data ?? []);
    }
    setChargement(false);
  }, []);

  useEffect(() => {
    if (chargementAuth) return;
    if (!user) {
      setClients([]);
      setErreur(null);
      setChargement(false);
      return;
    }
    chargerClients();
  }, [user, chargementAuth, chargerClients]);

  const addClient = useCallback(
    async (data) => {
      const payload = preparerPayload(data);
      const { data: cree, error } = await supabase
        .from("clients")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      await chargerClients();
      return cree;
    },
    [chargerClients]
  );

  const updateClient = useCallback(async (id, patch) => {
    const payload = preparerPayload(patch);
    const { data: maj, error } = await supabase
      .from("clients")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    setClients((prev) => prev.map((c) => (c.id === id ? maj : c)));
    return maj;
  }, []);

  const deleteClient = useCallback(async (id) => {
    setErreur(null);
    const { error } = await supabase
      .from("clients")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      setErreur(error.message);
      return false;
    }
    setClients((prev) => prev.filter((c) => c.id !== id));
    return true;
  }, []);

  const value = useMemo(
    () => ({ clients, chargement, erreur, addClient, updateClient, deleteClient }),
    [clients, chargement, erreur, addClient, updateClient, deleteClient]
  );

  return <ClientsContext.Provider value={value}>{children}</ClientsContext.Provider>;
}

export function useClients() {
  const ctx = useContext(ClientsContext);
  if (!ctx) throw new Error("useClients doit être utilisé à l'intérieur de <ClientsProvider>");
  return ctx;
}
