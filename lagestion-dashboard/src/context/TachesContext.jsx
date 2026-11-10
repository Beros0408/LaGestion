import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useEntreprise } from "./EntrepriseContext.jsx";
import { erreurFrancaise, messageErreur, MESSAGE_REFUS } from "../utils/erreurs";

// Tâches de l'entreprise active (migration 012) et membres pouvant en être responsables.
// Les droits (rôle lecture, auteur, responsable, membre de l'entreprise) sont contrôlés en base.
const TachesContext = createContext(null);

const CHAMPS = ["titre", "echeance", "responsable", "statut", "client_id", "opportunite_id", "devis_id", "facture_id", "origine"];

function preparerPayload(data) {
  const payload = {};
  CHAMPS.forEach((cle) => {
    if (data[cle] === undefined) return;
    const v = data[cle];
    payload[cle] = typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v;
  });
  return payload;
}

export function TachesProvider({ children }) {
  const { entrepriseId } = useEntreprise();
  const [taches, setTaches] = useState([]);
  const [membres, setMembres] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);

  const chargerTaches = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    const [t, m] = await Promise.all([
      supabase.from("taches").select("*").eq("entreprise_id", entrepriseId).is("deleted_at", null).order("echeance", { ascending: true }),
      supabase.from("memberships").select("user_id, role").eq("entreprise_id", entrepriseId),
    ]);
    if (t.error || m.error) {
      setErreur(messageErreur(t.error || m.error));
      setTaches([]);
      setMembres([]);
      setChargement(false);
      return;
    }
    const ids = (m.data ?? []).map((x) => x.user_id);
    const p = ids.length ? await supabase.from("profiles").select("id, nom").in("id", ids) : { data: [] };
    const noms = new Map((p.data ?? []).map((x) => [x.id, x.nom]));
    setTaches(t.data ?? []);
    setMembres(
      (m.data ?? [])
        .map((x) => ({ id: x.user_id, role: x.role, nom: noms.get(x.user_id)?.trim() || "Membre sans nom" }))
        .sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
    );
    setChargement(false);
  }, [entrepriseId]);

  useEffect(() => {
    if (!entrepriseId) {
      setTaches([]);
      setMembres([]);
      setErreur(null);
      setChargement(false);
      return;
    }
    chargerTaches();
  }, [entrepriseId, chargerTaches]);

  const addTache = useCallback(
    async (data) => {
      const payload = { ...preparerPayload(data), entreprise_id: entrepriseId };
      const { data: cree, error } = await supabase.from("taches").insert(payload).select().single();
      if (error) throw erreurFrancaise(error);
      setTaches((prev) => [...prev, cree]);
      return cree;
    },
    [entrepriseId]
  );

  const updateTache = useCallback(async (id, patch) => {
    const { data, error } = await supabase.from("taches").update(preparerPayload(patch)).eq("id", id).eq("entreprise_id", entrepriseId).select();
    if (error) throw erreurFrancaise(error);
    if (!data?.length) throw new Error(MESSAGE_REFUS);
    setTaches((prev) => prev.map((t) => (t.id === id ? data[0] : t)));
    return data[0];
  }, [entrepriseId]);

  const changerStatut = useCallback((id, statut) => updateTache(id, { statut }), [updateTache]);

  const supprimerTache = useCallback(async (id) => {
    const { data, error } = await supabase.from("taches").update({ deleted_at: new Date().toISOString() }).eq("id", id).eq("entreprise_id", entrepriseId).select("id");
    if (error) throw erreurFrancaise(error);
    if (!data?.length) throw new Error(MESSAGE_REFUS);
    setTaches((prev) => prev.filter((t) => t.id !== id));
  }, [entrepriseId]);

  const value = useMemo(
    () => ({ taches, membres, chargement, erreur, rechargerTaches: chargerTaches, addTache, updateTache, changerStatut, supprimerTache }),
    [taches, membres, chargement, erreur, chargerTaches, addTache, updateTache, changerStatut, supprimerTache]
  );

  return <TachesContext.Provider value={value}>{children}</TachesContext.Provider>;
}

export function useTaches() {
  const ctx = useContext(TachesContext);
  if (!ctx) throw new Error("useTaches doit être utilisé à l'intérieur de <TachesProvider>");
  return ctx;
}
