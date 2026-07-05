import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext.jsx";
import { ETAPES } from "../data/opportunites";

const OpportunitesContext = createContext(null);

const CHAMPS = ["client_id", "nom", "montant", "probabilite", "etape", "date_cloture", "responsable"];

function preparerPayload(data) {
  const payload = {};
  CHAMPS.forEach((cle) => {
    if (data[cle] === undefined) return;
    const v = data[cle];
    if (typeof v === "string") {
      payload[cle] = v.trim() === "" ? null : v.trim();
    } else {
      payload[cle] = v;
    }
  });
  return payload;
}

export function OpportunitesProvider({ children }) {
  const { user, chargement: chargementAuth } = useAuth();
  const [opportunites, setOpportunites] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);

  const chargerOpportunites = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    const { data, error } = await supabase
      .from("opportunites")
      .select("*")
      .is("deleted_at", null)
      .order("date_cloture", { ascending: true });
    if (error) {
      setErreur(error.message);
      setOpportunites([]);
    } else {
      setOpportunites(data ?? []);
    }
    setChargement(false);
  }, []);

  useEffect(() => {
    if (chargementAuth) return;
    if (!user) {
      setOpportunites([]);
      setErreur(null);
      setChargement(false);
      return;
    }
    chargerOpportunites();
  }, [user, chargementAuth, chargerOpportunites]);

  const addOpportunite = useCallback(
    async (data) => {
      const payload = preparerPayload(data);
      const { data: cree, error } = await supabase
        .from("opportunites")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      await chargerOpportunites();
      return cree;
    },
    [chargerOpportunites]
  );

  const updateOpportunite = useCallback(async (id, patch) => {
    const payload = preparerPayload(patch);
    const { data: maj, error } = await supabase
      .from("opportunites")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    setOpportunites((prev) => prev.map((o) => (o.id === id ? maj : o)));
    return maj;
  }, []);

  const deleteOpportunite = useCallback(async (id) => {
    setErreur(null);
    const { error } = await supabase
      .from("opportunites")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      setErreur(error.message);
      return false;
    }
    setOpportunites((prev) => prev.filter((o) => o.id !== id));
    return true;
  }, []);

  const moveOpportunite = useCallback(async (id, nouvelleEtape) => {
    if (!ETAPES.includes(nouvelleEtape)) return null;
    setErreur(null);
    const { data: maj, error } = await supabase
      .from("opportunites")
      .update({ etape: nouvelleEtape })
      .eq("id", id)
      .select()
      .single();
    if (error) {
      setErreur(error.message);
      return null;
    }
    setOpportunites((prev) => prev.map((o) => (o.id === id ? maj : o)));
    return maj;
  }, []);

  const value = useMemo(
    () => ({
      opportunites,
      chargement,
      erreur,
      addOpportunite,
      updateOpportunite,
      deleteOpportunite,
      moveOpportunite,
    }),
    [opportunites, chargement, erreur, addOpportunite, updateOpportunite, deleteOpportunite, moveOpportunite]
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
