import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext.jsx";
import { erreurFrancaise, messageErreur } from "../utils/erreurs";
import { lireLogo } from "../utils/logo";
import {
  ANCIENNE_CLE, cleMemorisation, entrepriseInitiale, cheminLogoAutorise, MESSAGE_LOGO_REFUSE,
} from "../utils/entrepriseCourante";

const EntrepriseContext = createContext(null);

const ROLES_ECRITURE = ["admin", "manager", "commercial", "comptable"];
const ROLES_SUPPRESSION = ["admin", "manager"];

export const LIBELLE_ROLE = {
  admin: "Administrateur",
  manager: "Manager",
  commercial: "Commercial",
  comptable: "Comptable",
  lecture: "Lecture seule",
};

function lireEntrepriseMemorisee(userId) {
  try {
    localStorage.removeItem(ANCIENNE_CLE);
    return localStorage.getItem(cleMemorisation(userId));
  } catch {
    return null;
  }
}

function memoriserEntreprise(userId, id) {
  try {
    localStorage.setItem(cleMemorisation(userId), id);
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
    .select("role, entreprise:entreprises(*)")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? [])
    .filter((m) => m.entreprise)
    .map((m) => versAppartenance(m.entreprise, m.role))
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

// Entreprises où l'utilisateur est suspendu (migration 017) : la RLS les lui masque ; leur nom vient de la base.
async function chargerSuspendues() {
  const { data, error } = await supabase.rpc("mes_acces_suspendus");
  if (error) throw error;
  return (data ?? []).map((e) => ({ entrepriseId: e.entreprise_id, nom: e.nom }));
}

// Appartenance : tous les paramètres de l'entreprise (migration 013), son identifiant et le rôle de l'utilisateur.
const versAppartenance = (entreprise, role) => ({ ...entreprise, entrepriseId: entreprise.id, role });

// Logo : chemin versionné dans le bucket privé logos ; un ancien fichier reste lisible par les documents qui le citent.
const extensionLogo = (type) => (type === "image/png" ? "png" : "jpg");

function initialesDe(nom) {
  const mots = nom.split(/[\s._-]+/).filter(Boolean);
  if (mots.length === 0) return "?";
  if (mots.length === 1) return mots[0].slice(0, 2).toUpperCase();
  return (mots[0][0] + mots[1][0]).toUpperCase();
}

export function EntrepriseProvider({ children }) {
  const { user, chargement: chargementAuth, codeRequis } = useAuth();
  const userId = user?.id ?? null;
  const [profil, setProfil] = useState(null);
  const [appartenances, setAppartenances] = useState([]);
  const [suspendues, setSuspendues] = useState([]);
  const [entrepriseId, setEntrepriseId] = useState(null);
  // Utilisateur pour lequel les données ont été chargées : évite une redirection
  // vers l'onboarding entre la connexion et la fin du premier chargement.
  const [chargePour, setChargePour] = useState(null);
  const [erreur, setErreur] = useState(null);
  // Entreprise demandée, appliquée une fois le tableau de bord affiché (voir basculerVers).
  const [cible, setCible] = useState(null);
  const location = useLocation();
  const navigate = useNavigate();

  const charger = useCallback(async () => {
    if (!userId) return;
    setErreur(null);
    try {
      const [p, liste, sus] = await Promise.all([chargerProfil(userId), chargerAppartenances(userId), chargerSuspendues()]);
      setProfil(p);
      setAppartenances(liste);
      setSuspendues(sus);
      // Un rechargement (création depuis le sélecteur, « Réessayer ») garde l'entreprise courante si elle existe encore.
      setEntrepriseId((actuelle) =>
        liste.some((a) => a.entrepriseId === actuelle) ? actuelle : entrepriseInitiale(liste, lireEntrepriseMemorisee(userId))
      );
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
      setSuspendues([]);
      setEntrepriseId(null);
      setErreur(null);
      setChargePour(null);
      setCible(null);
      return;
    }
    // Code de double authentification attendu : la base ne renverrait rien (migration 018). Aucun chargement,
    // donc jamais de renvoi à tort vers /onboarding ; chargement relancé dès la saisie du code.
    if (codeRequis) return;
    charger();
  }, [userId, chargementAuth, codeRequis, charger]);

  const chargement = chargementAuth || (userId !== null && chargePour !== userId);

  // Changement d'entreprise : le tableau de bord d'abord, l'entreprise ensuite. La navigation passe par
  // startTransition (React Router) : changées ensemble, l'entreprise serait rendue avant la nouvelle URL,
  // et une page de l'ancienne entreprise (« /clients/42 ») s'afficherait un instant comme introuvable.
  // Refs : basculerVers reste stable d'une navigation à l'autre (pas de re-rendu des consommateurs).
  const cheminRef = useRef(location.pathname);
  cheminRef.current = location.pathname;
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const basculerVers = useCallback((id) => {
    setCible(id);
    if (cheminRef.current !== "/dashboard") navigateRef.current("/dashboard");
  }, []);

  useEffect(() => {
    if (!cible || location.pathname !== "/dashboard") return;
    if (appartenances.some((a) => a.entrepriseId === cible)) {
      memoriserEntreprise(userId, cible);
      setEntrepriseId(cible);
    }
    setCible(null);
  }, [cible, location.pathname, appartenances, userId]);

  // activer = false (création depuis le sélecteur) : l'entreprise courante ne change pas ici ; l'appelant bascule ensuite.
  const creerEntreprise = useCallback(
    async (nom, siret, { activer = true } = {}) => {
      const { data: id, error } = await supabase.rpc("create_entreprise", {
        p_nom: nom,
        p_siret: siret || null,
      });
      if (error) throw erreurFrancaise(error);
      if (activer) memoriserEntreprise(userId, id);
      await charger();
      return id;
    },
    [userId, charger]
  );

  // Invitation (migration 017) : la base vérifie jeton, expiration, adresse confirmée ; un membre existant garde
  // son rôle. Le nom saisi à l'inscription remplit un profil encore sans nom. Puis bascule vers l'entreprise.
  const accepterInvitation = useCallback(
    async (token) => {
      const { data: id, error } = await supabase.rpc("accept_invitation", { p_token: token });
      if (error) throw erreurFrancaise(error);
      const nomInscription = user?.user_metadata?.nom?.trim();
      if (nomInscription && !profil?.nom?.trim()) {
        await supabase.from("profiles").update({ nom: nomInscription }).eq("id", userId);
      }
      await charger();
      basculerVers(id);
      return id;
    },
    [user, userId, profil, charger, basculerVers]
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

  // Paramètres de l'entreprise courante (RLS : admin seul). Aucune ligne renvoyée = droit refusé.
  const enregistrerEntreprise = useCallback(
    async (patch) => {
      const { data, error } = await supabase.from("entreprises").update(patch).eq("id", entrepriseId).select("*");
      if (error) throw erreurFrancaise(error);
      if (!data?.length) throw new Error("Seul un administrateur peut modifier les informations de l'entreprise.");
      setAppartenances((liste) => liste.map((a) => (a.entrepriseId === entrepriseId ? versAppartenance(data[0], a.role) : a)));
      return data[0];
    },
    [entrepriseId]
  );

  const enregistrerLogo = useCallback(
    async (fichier) => {
      const chemin = `${entrepriseId}/logo-${Date.now()}.${extensionLogo(fichier.type)}`;
      const { error } = await supabase.storage.from("logos").upload(chemin, fichier, { contentType: fichier.type, upsert: false });
      if (error) throw erreurFrancaise(error);
      return enregistrerEntreprise({ logo_url: chemin });
    },
    [entrepriseId, enregistrerEntreprise]
  );

  // Lien temporaire (1 h) vers le logo : le bucket est privé. Chemin hors du dossier de l'entreprise courante : refusé.
  const lienLogo = useCallback(async (chemin) => {
    if (!chemin) return null;
    if (!cheminLogoAutorise(chemin, entrepriseId)) throw new Error(MESSAGE_LOGO_REFUSE);
    const { data, error } = await supabase.storage.from("logos").createSignedUrl(chemin, 3600);
    if (error) throw erreurFrancaise(error);
    return data?.signedUrl ?? null;
  }, [entrepriseId]);

  // Logo d'un document (chemin figé ou actuel) téléchargé depuis le bucket privé, pour le PDF ; null sans logo.
  const chargerLogoPdf = useCallback(async (chemin) => {
    if (!chemin) return null;
    if (!cheminLogoAutorise(chemin, entrepriseId)) throw new Error(MESSAGE_LOGO_REFUSE);
    const { data, error } = await supabase.storage.from("logos").download(chemin);
    if (error) throw erreurFrancaise(error);
    return lireLogo(data);
  }, [entrepriseId]);

  const value = useMemo(() => {
    const courante = appartenances.find((a) => a.entrepriseId === entrepriseId) ?? null;
    const role = courante?.role ?? null;
    const nomAffiche = profil?.nom?.trim() || (user?.email ?? "").split("@")[0] || "Utilisateur";
    return {
      chargement,
      erreur,
      appartenances,
      suspendues,
      entrepriseId,
      entreprise: courante,
      role,
      libelleRole: role ? LIBELLE_ROLE[role] : "",
      peutEcrire: ROLES_ECRITURE.includes(role),
      peutSupprimer: ROLES_SUPPRESSION.includes(role),
      nomAffiche,
      prenomAffiche: nomAffiche.split(/\s+/)[0],
      initiales: initialesDe(nomAffiche),
      estAdmin: role === "admin",
      email: user?.email ?? "",
      nomProfil: profil?.nom ?? "",
      // Profil chargé mais sans nom : ProtectedRoute demande le nom avant tout écran (page NomProfil).
      profilSansNom: !!profil && !profil.nom?.trim(),
      nomInscription: user?.user_metadata?.nom?.trim() ?? "",
      creerEntreprise,
      basculerVers,
      accepterInvitation,
      enregistrerNom,
      enregistrerEntreprise,
      enregistrerLogo,
      lienLogo,
      chargerLogoPdf,
      recharger: charger,
    };
  }, [chargement, erreur, appartenances, suspendues, entrepriseId, profil, user, creerEntreprise, basculerVers, accepterInvitation, enregistrerNom, enregistrerEntreprise, enregistrerLogo, lienLogo, chargerLogoPdf, charger]);

  return <EntrepriseContext.Provider value={value}>{children}</EntrepriseContext.Provider>;
}

export function useEntreprise() {
  const ctx = useContext(EntrepriseContext);
  if (!ctx) throw new Error("useEntreprise doit être utilisé à l'intérieur de <EntrepriseProvider>");
  return ctx;
}
