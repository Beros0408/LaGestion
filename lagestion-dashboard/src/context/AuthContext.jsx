import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { codeRequis as calculerCodeRequis, facteursInacheves, normaliserCode } from "../utils/mfa";

const AuthContext = createContext(null);

// Niveau d'assurance de la session (aal1 après le mot de passe, aal2 après le code) et facteurs de l'utilisateur.
// frais : facteurs relus sur le serveur (un facteur activé depuis un autre appareil n'est pas dans la session).
async function lireMfa(session, frais) {
  let facteurs = session.user?.factors ?? [];
  if (frais) {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (!error && data) facteurs = data.all ?? [];
  }
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  return { userId: session.user?.id ?? null, niveau: aal?.currentLevel ?? null, facteurs };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [mfa, setMfa] = useState({ userId: null, niveau: null, facteurs: [] });

  useEffect(() => {
    let annule = false;

    supabase.auth.getSession().then(({ data }) => {
      if (annule) return;
      setSession(data?.session ?? null);
      setChargement(false);
    });

    const { data: souscription } = supabase.auth.onAuthStateChange((_evenement, nouvelleSession) => {
      setSession(nouvelleSession ?? null);
      setChargement(false);
    });

    return () => {
      annule = true;
      souscription?.subscription?.unsubscribe();
    };
  }, []);

  // Hors du rappel onAuthStateChange (un appel à Supabase Auth y bloquerait le client).
  // Les valeurs précédentes restent affichées pendant la relecture : pas d'écran de chargement à chaque rafraîchissement du jeton.
  const actualiserMfa = useCallback(async (frais = false) => {
    const { data } = await supabase.auth.getSession();
    if (!data?.session) return;
    const lu = await lireMfa(data.session, frais);
    setMfa(lu);
  }, []);

  useEffect(() => {
    // Déconnexion : niveau oublié, sinon une reconnexion du même utilisateur reprendrait brièvement l'ancien aal2.
    if (!session) {
      setMfa({ userId: null, niveau: null, facteurs: [] });
      return undefined;
    }
    let actif = true;
    // Facteurs relus sur le serveur : ceux de la session peuvent être périmés (activation qui vient d'être confirmée).
    // Lecture impossible : niveau inconnu, donc code demandé si la session porte un facteur vérifié (jamais l'inverse).
    lireMfa(session, true)
      .catch(() => ({ userId: session.user?.id ?? null, niveau: null, facteurs: session.user?.factors ?? [] }))
      .then((lu) => actif && setMfa(lu));
    return () => { actif = false; };
  }, [session]);

  // Retour sur l'onglet : facteurs relus (activation sur un autre appareil, session restée en aal1).
  useEffect(() => {
    if (!session) return undefined;
    const auRetour = () => {
      if (document.visibilityState === "visible") actualiserMfa(true).catch(() => {});
    };
    document.addEventListener("visibilitychange", auRetour);
    return () => document.removeEventListener("visibilitychange", auRetour);
  }, [session, actualiserMfa]);

  // Saisie du code à la connexion (facteur choisi parmi les appareils vérifiés).
  const verifierCode = useCallback(async (factorId, code) => {
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: normaliserCode(code) });
    if (error) throw error;
    await actualiserMfa(false);
  }, [actualiserMfa]);

  // Activation, étape 1 : activations abandonnées supprimées, nouveau facteur (QR code, clé de saisie manuelle).
  const commencerActivation = useCallback(async (nomAppareil) => {
    const { data: liste, error: e1 } = await supabase.auth.mfa.listFactors();
    if (e1) throw e1;
    for (const f of facteursInacheves(liste?.all)) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
      if (error) throw error;
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: nomAppareil, issuer: "LaGestion" });
    if (error) throw error;
    return { factorId: data.id, qrCode: data.totp?.qr_code ?? "", secret: data.totp?.secret ?? "" };
  }, []);

  // Activation, étape 2 : premier code ; la session passe en aal2.
  const confirmerActivation = useCallback(async (factorId, code) => {
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: normaliserCode(code) });
    if (error) throw error;
    await actualiserMfa(true);
  }, [actualiserMfa]);

  // Retrait d'un appareil (activation abandonnée, ou facteur vérifié : Supabase exige alors une session aal2).
  const retirerFacteur = useCallback(async (factorId) => {
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) throw error;
    await actualiserMfa(true);
  }, [actualiserMfa]);

  const signIn = useCallback(async (email, motDePasse) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: motDePasse,
    });
    if (error) throw error;
  }, []);

  // Inscription (page d'invitation). Avec « Confirm email » activé dans Supabase : pas de session tant que
  // l'adresse n'est pas confirmée ; le lien de l'e-mail ramène sur redirection. Une adresse déjà inscrite
  // renvoie un utilisateur sans identité (Supabase ne révèle pas l'existence du compte) : compteExistant.
  const signUp = useCallback(async (email, motDePasse, nom, redirection) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password: motDePasse,
      options: { emailRedirectTo: redirection, data: nom ? { nom } : undefined },
    });
    if (error) throw error;
    return {
      session: data.session ?? null,
      compteExistant: Boolean(data.user) && Array.isArray(data.user.identities) && data.user.identities.length === 0,
    };
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  // Tant que le niveau d'assurance de l'utilisateur connecté n'est pas lu, l'authentification reste « en chargement » :
  // aucun écran ne charge de données avant de savoir si un code est attendu.
  const mfaLu = !session || mfa.userId === session.user?.id;
  const codeRequis = Boolean(session) && mfaLu && calculerCodeRequis(mfa.niveau, mfa.facteurs);

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      chargement: chargement || !mfaLu,
      signIn,
      signUp,
      signOut,
      niveauAssurance: mfa.niveau,
      facteurs: mfa.facteurs,
      codeRequis,
      verifierCode,
      commencerActivation,
      confirmerActivation,
      retirerFacteur,
      actualiserMfa,
    }),
    [session, chargement, mfaLu, signIn, signUp, signOut, mfa, codeRequis, verifierCode, commencerActivation, confirmerActivation, retirerFacteur, actualiserMfa]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé à l'intérieur de <AuthProvider>");
  return ctx;
}
