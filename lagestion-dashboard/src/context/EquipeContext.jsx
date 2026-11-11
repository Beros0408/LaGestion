import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext.jsx";
import { useEntreprise } from "./EntrepriseContext.jsx";
import { useTaches } from "./TachesContext.jsx";
import { erreurFrancaise, messageErreur } from "../utils/erreurs";

// Équipe de l'entreprise courante (migration 017) : membres (membres_equipe, e-mail pour l'admin seul),
// invitations en attente (admin seul, RLS) et toutes les écritures, par les fonctions de la base.
const EquipeContext = createContext(null);

export function EquipeProvider({ children }) {
  const { user } = useAuth();
  const { entrepriseId, estAdmin, recharger: rechargerEntreprises } = useEntreprise();
  const { rechargerTaches } = useTaches();
  const [membres, setMembres] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);

  const charger = useCallback(async () => {
    if (!entrepriseId) return;
    setErreur(null);
    const [m, i] = await Promise.all([
      supabase.rpc("membres_equipe", { p_entreprise: entrepriseId }),
      estAdmin
        ? supabase.from("invitations").select("id, email, role, token, expires_at, created_at")
            .eq("entreprise_id", entrepriseId).is("accepted_at", null).order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);
    if (m.error || i.error) {
      setErreur(messageErreur(m.error || i.error));
    } else {
      setMembres(m.data ?? []);
      setInvitations(i.data ?? []);
    }
    setChargement(false);
  }, [entrepriseId, estAdmin]);

  useEffect(() => {
    charger();
  }, [charger]);

  // Après un changement d'appartenance : liste, responsables possibles des tâches et, si l'utilisateur
  // s'est visé lui-même (rôle), ses droits dans l'entreprise courante.
  const apres = useCallback(async (userId) => {
    await charger();
    rechargerTaches();
    if (userId === user?.id) await rechargerEntreprises();
  }, [charger, rechargerTaches, rechargerEntreprises, user]);

  const appeler = useCallback(async (fonction, params, userId) => {
    const { data, error } = await supabase.rpc(fonction, { p_entreprise: entrepriseId, ...params });
    if (error) throw erreurFrancaise(error);
    await apres(userId);
    return data;
  }, [entrepriseId, apres]);

  const changerRole = useCallback((userId, role, reassignerA = null) =>
    appeler("changer_role", { p_user: userId, p_role: role, p_reassigner_a: reassignerA }, userId), [appeler]);
  const suspendre = useCallback((userId, reassignerA = null) =>
    appeler("suspendre_membre", { p_user: userId, p_reassigner_a: reassignerA }, userId), [appeler]);
  const reactiver = useCallback((userId) => appeler("reactiver_membre", { p_user: userId }, userId), [appeler]);
  const retirer = useCallback((userId, reassignerA = null) =>
    appeler("retirer_membre", { p_user: userId, p_reassigner_a: reassignerA }, userId), [appeler]);

  const inviter = useCallback(async (email, role) => {
    const { data, error } = await supabase.rpc("creer_invitation", { p_entreprise: entrepriseId, p_email: email, p_role: role });
    if (error) throw erreurFrancaise(error);
    await charger();
    return data;
  }, [entrepriseId, charger]);

  const renouveler = useCallback(async (id) => {
    const { data, error } = await supabase.rpc("renouveler_invitation", { p_id: id });
    if (error) throw erreurFrancaise(error);
    await charger();
    return data;
  }, [charger]);

  // Annulation : suppression (RLS : admin, invitation non acceptée). Aucune ligne = déjà acceptée ou supprimée.
  const annuler = useCallback(async (id) => {
    const { data, error } = await supabase.from("invitations").delete().eq("id", id).eq("entreprise_id", entrepriseId).select("id");
    if (error) throw erreurFrancaise(error);
    await charger();
    if (!data?.length) throw new Error("Cette invitation n'est plus en attente : elle a été acceptée ou déjà annulée.");
  }, [entrepriseId, charger]);

  const value = useMemo(
    () => ({ membres, invitations, chargement, erreur, recharger: charger, changerRole, suspendre, reactiver, retirer, inviter, renouveler, annuler }),
    [membres, invitations, chargement, erreur, charger, changerRole, suspendre, reactiver, retirer, inviter, renouveler, annuler]
  );
  return <EquipeContext.Provider value={value}>{children}</EquipeContext.Provider>;
}

export function useEquipe() {
  const ctx = useContext(EquipeContext);
  if (!ctx) throw new Error("useEquipe doit être utilisé à l'intérieur de <EquipeProvider>");
  return ctx;
}
