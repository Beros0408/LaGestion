import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useEntreprise } from "./EntrepriseContext.jsx";
import { erreurFrancaise, messageErreur, MESSAGE_REFUS } from "../utils/erreurs";

// Activités et notes de l'entreprise active (migration 012). Auteur et nom figés par la base.
const ActivitesContext = createContext(null);

const CHAMPS = ["type", "client_id", "opportunite_id", "date_activite", "commentaire"];

function preparerPayload(data) {
  const payload = {};
  CHAMPS.forEach((cle) => {
    if (data[cle] === undefined) return;
    const v = data[cle];
    payload[cle] = typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v;
  });
  return payload;
}

export function ActivitesProvider({ children }) {
  const { entrepriseId } = useEntreprise();
  const [activites, setActivites] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);

  const chargerActivites = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    const { data, error } = await supabase
      .from("activites")
      .select("*")
      .eq("entreprise_id", entrepriseId)
      .is("deleted_at", null)
      .order("date_activite", { ascending: false });
    if (error) {
      setErreur(messageErreur(error));
      setActivites([]);
    } else {
      setActivites(data ?? []);
    }
    setChargement(false);
  }, [entrepriseId]);

  useEffect(() => {
    if (!entrepriseId) {
      setActivites([]);
      setErreur(null);
      setChargement(false);
      return;
    }
    chargerActivites();
  }, [entrepriseId, chargerActivites]);

  const addActivite = useCallback(
    async (data) => {
      const payload = { ...preparerPayload(data), entreprise_id: entrepriseId };
      const { data: cree, error } = await supabase.from("activites").insert(payload).select().single();
      if (error) throw erreurFrancaise(error);
      setActivites((prev) => [cree, ...prev]);
      return cree;
    },
    [entrepriseId]
  );

  const updateActivite = useCallback(async (id, patch) => {
    const { data, error } = await supabase.from("activites").update(preparerPayload(patch)).eq("id", id).select();
    if (error) throw erreurFrancaise(error);
    if (!data?.length) throw new Error(MESSAGE_REFUS);
    setActivites((prev) => prev.map((a) => (a.id === id ? data[0] : a)));
    return data[0];
  }, []);

  const supprimerActivite = useCallback(async (id) => {
    const { data, error } = await supabase.from("activites").update({ deleted_at: new Date().toISOString() }).eq("id", id).select("id");
    if (error) throw erreurFrancaise(error);
    if (!data?.length) throw new Error(MESSAGE_REFUS);
    setActivites((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const value = useMemo(
    () => ({ activites, chargement, erreur, rechargerActivites: chargerActivites, addActivite, updateActivite, supprimerActivite }),
    [activites, chargement, erreur, chargerActivites, addActivite, updateActivite, supprimerActivite]
  );

  return <ActivitesContext.Provider value={value}>{children}</ActivitesContext.Provider>;
}

export function useActivites() {
  const ctx = useContext(ActivitesContext);
  if (!ctx) throw new Error("useActivites doit être utilisé à l'intérieur de <ActivitesProvider>");
  return ctx;
}
