import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useEntreprise } from "./EntrepriseContext.jsx";
import { erreurFrancaise, messageErreur, MESSAGE_REFUS } from "../utils/erreurs";
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
  const { entrepriseId } = useEntreprise();
  const [opportunites, setOpportunites] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);

  const chargerOpportunites = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    const { data, error } = await supabase
      .from("opportunites")
      .select("*")
      .eq("entreprise_id", entrepriseId)
      .is("deleted_at", null)
      .order("date_cloture", { ascending: true });
    if (error) {
      setErreur(messageErreur(error));
      setOpportunites([]);
    } else {
      setOpportunites(data ?? []);
    }
    setChargement(false);
  }, [entrepriseId]);

  useEffect(() => {
    if (!entrepriseId) {
      setOpportunites([]);
      setErreur(null);
      setChargement(false);
      return;
    }
    chargerOpportunites();
  }, [entrepriseId, chargerOpportunites]);

  const addOpportunite = useCallback(
    async (data) => {
      const payload = { ...preparerPayload(data), entreprise_id: entrepriseId };
      const { data: cree, error } = await supabase
        .from("opportunites")
        .insert(payload)
        .select()
        .single();
      if (error) throw erreurFrancaise(error);
      await chargerOpportunites();
      return cree;
    },
    [entrepriseId, chargerOpportunites]
  );

  const updateOpportunite = useCallback(async (id, patch) => {
    const payload = preparerPayload(patch);
    const { data: maj, error } = await supabase
      .from("opportunites")
      .update(payload)
      .eq("id", id)
      .eq("entreprise_id", entrepriseId)
      .select()
      .single();
    if (error) throw erreurFrancaise(error);
    setOpportunites((prev) => prev.map((o) => (o.id === id ? maj : o)));
    return maj;
  }, [entrepriseId]);

  const deleteOpportunite = useCallback(async (id) => {
    setErreur(null);
    const { data, error } = await supabase
      .from("opportunites")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("entreprise_id", entrepriseId)
      .select("id");
    if (error || data.length === 0) {
      setErreur(error ? messageErreur(error) : MESSAGE_REFUS);
      return false;
    }
    setOpportunites((prev) => prev.filter((o) => o.id !== id));
    return true;
  }, [entrepriseId]);

  const moveOpportunite = useCallback(async (id, nouvelleEtape) => {
    if (!ETAPES.includes(nouvelleEtape)) return null;
    setErreur(null);
    const { data: maj, error } = await supabase
      .from("opportunites")
      .update({ etape: nouvelleEtape })
      .eq("id", id)
      .eq("entreprise_id", entrepriseId)
      .select()
      .single();
    if (error) {
      setErreur(messageErreur(error));
      return null;
    }
    setOpportunites((prev) => prev.map((o) => (o.id === id ? maj : o)));
    return maj;
  }, [entrepriseId]);

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
