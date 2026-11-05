import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext.jsx";
import { erreurFrancaise, messageErreur } from "../utils/erreurs";

const EntrepriseContext = createContext(null);

const CLE_ENTREPRISE = "lagestion.entrepriseCourante";
const ROLES_ECRITURE = ["admin", "manager", "commercial", "comptable"];
const ROLES_SUPPRESSION = ["admin", "manager"];

export const LIBELLE_ROLE = {
  admin: "Administrateur",
  manager: "Manager",
  commercial: "Commercial",
  comptable: "Comptable",
  lecture: "Lecture seule",
};

function lireEntrepriseMemorisee() {
  try {
    return localStorage.getItem(CLE_ENTREPRISE);
  } catch {
    return null;
  }
}

function memoriserEntreprise(id) {
  try {
    localStorage.setItem(CLE_ENTREPRISE, id);
  } catch {
    // Stockage indisponible (navigation privée) : l'entreprise par défaut sera reprise.
  }
}

// Profil de l'utilisateur ; créé à la première connexion (id = auth.uid()).
async function chargerProfil(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, nom")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (data) return data;
  const { error: e2 } = await supabase.from("profiles").insert({ id: userId });
  if (e2 && e2.code !== "23505") throw e2;
  return { id: userId, nom: null };
}

// Filtre user_id nécessaire : la RLS laisse aussi voir les appartenances des collègues.
async function chargerAppartenances(userId) {
  const { data, error } = await supabase
    .from("memberships")
    .select("role, entreprise:entreprises(id, nom, siret, adresse)")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? [])
    .filter((m) => m.entreprise)
    .map((m) => ({
      entrepriseId: m.entreprise.id,
      nom: m.entreprise.nom,
      siret: m.entreprise.siret,
      adresse: m.entreprise.adresse,
      role: m.role,
    }))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

function initialesDe(nom) {
  const mots = nom.split(/[\s._-]+/).filter(Boolean);
  if (mots.length === 0) return "?";
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return (mots[0][0] + mots[1][0]).toUpperCase();
}

export function EntrepriseProvider({ children }) {
  const { user, chargement: chargementAuth } = useAuth();
  const userId = user?.id ?? null;
  const [profil, setProfil] = useState(null);
  const [appartenances, setAppartenances] = useState([]);
  const [entrepriseId, setEntrepriseId] = useState(null);
  // Utilisateur pour lequel les données ont été chargées : évite une redirection
  // vers l'onboarding entre la connexion et la fin du premier chargement.
  const [chargePour, setChargePour] = useState(null);
  const [erreur, setErreur] = useState(null);

  const charger = useCallback(async () => {
    if (!userId) return;
    setErreur(null);
    try {
      const [p, liste] = await Promise.all([chargerProfil(userId), chargerAppartenances(userId)]);
      setProfil(p);
      setAppartenances(liste);
      const memorisee = lireEntrepriseMemorisee();
      const courante = liste.find((a) => a.entrepriseId === memorisee) ?? liste[0] ?? null;
      setEntrepriseId(courante?.entrepriseId ?? null);
    } catch (e) {
      setErreur(messageErreur(e));
    }
    setChargePour(userId);
  }, [userId]);

  useEffect(() => {
    if (chargementAuth) return;
    if (!userId) {
      setProfil(null);
      setAppartenances([]);
      setEntrepriseId(null);
      setErreur(null);
      setChargePour(null);
      return;
    }
    charger();
  }, [userId, chargementAuth, charger]);

  const chargement = chargementAuth || (userId !== null && chargePour !== userId);

  const creerEntreprise = useCallback(
    async (nom, siret) => {
      const { data: id, error } = await supabase.rpc("create_entreprise", {
        p_nom: nom,
        p_siret: siret || null,
      });
      if (error) throw erreurFrancaise(error);
      memoriserEntreprise(id);
      await charger();
      return id;
    },
    [charger]
  );

  // Nom de l'utilisateur courant (RLS : chacun ne modifie que son profil).
  const enregistrerNom = useCallback(
    async (nom) => {
      const { error } = await supabase.from("profiles").update({ nom }).eq("id", userId);
      if (error) throw erreurFrancaise(error);
      setProfil((p) => (p ? { ...p, nom } : p));
    },
    [userId]
  );

  const value = useMemo(() => {
    const courante = appartenances.find((a) => a.entrepriseId === entrepriseId) ?? null;
    const role = courante?.role ?? null;
    const nomAffiche = profil?.nom?.trim() || (user?.email ?? "").split("@")[0] || "Utilisateur";
    return {
      chargement,
      erreur,
      appartenances,
      entrepriseId,
      entreprise: courante,
      role,
      libelleRole: role ? LIBELLE_ROLE[role] : "",
      peutEcrire: ROLES_ECRITURE.includes(role),
      peutSupprimer: ROLES_SUPPRESSION.includes(role),
      nomAffiche,
      prenomAffiche: nomAffiche.split(/\s+/)[0],
      initiales: initialesDe(nomAffiche),
      creerEntreprise,
      enregistrerNom,
      recharger: charger,
    };
  }, [chargement, erreur, appartenances, entrepriseId, profil, user, creerEntreprise, enregistrerNom, charger]);

  return <EntrepriseContext.Provider value={value}>{children}</EntrepriseContext.Provider>;
}

export function useEntreprise() {
  const ctx = useContext(EntrepriseContext);
  if (!ctx) throw new Error("useEntreprise doit être utilisé à l'intérieur de <EntrepriseProvider>");
  return ctx;
}
