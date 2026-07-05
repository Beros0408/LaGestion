import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [chargement, setChargement] = useState(true);

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

  const signIn = useCallback(async (email, motDePasse) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: motDePasse,
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const value = useMemo(
    () => ({ session, user: session?.user ?? null, chargement, signIn, signOut }),
    [session, chargement, signIn, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé à l'intérieur de <AuthProvider>");
  return ctx;
}
