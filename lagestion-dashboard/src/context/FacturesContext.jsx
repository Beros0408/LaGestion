import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext.jsx";
import { STATUTS } from "../data/factures";

const FacturesContext = createContext(null);

const CHAMPS_FACTURE = ["client_id", "numero", "date_emission", "date_echeance", "statut"];
const CHAMPS_LIGNE = ["description", "quantite", "prix_unitaire", "taux_tva"];

function preparerEnteteFacture(data) {
  const payload = {};
  CHAMPS_FACTURE.forEach((cle) => {
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

function preparerLignes(lignes, factureId) {
  return lignes.map((l, i) => {
    const ligne = { facture_id: factureId, position: i };
    CHAMPS_LIGNE.forEach((cle) => {
      const v = l?.[cle];
      if (cle === "description") {
        ligne[cle] = typeof v === "string" ? v.trim() : (v ?? "");
      } else {
        ligne[cle] = Number(v) || 0;
      }
    });
    return ligne;
  });
}

function normaliserFacture(row) {
  const lignesBrutes = row.lignes_facture ?? [];
  const lignes = lignesBrutes
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const { lignes_facture: _omit, ...entete } = row;
  return { ...entete, lignes };
}

function prochainNumero(existants) {
  const annee = new Date().getFullYear();
  const prefix = `FAC-${annee}-`;
  const max = existants
    .filter((f) => typeof f.numero === "string" && f.numero.startsWith(prefix))
    .reduce((m, f) => {
      const n = parseInt(f.numero.slice(prefix.length), 10);
      return Number.isNaN(n) ? m : Math.max(m, n);
    }, 0);
  return `${prefix}${String(max + 1).padStart(4, "0")}`;
}

export function FacturesProvider({ children }) {
  const { user, chargement: chargementAuth } = useAuth();
  const [factures, setFactures] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);

  const chargerFactures = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    const { data, error } = await supabase
      .from("factures")
      .select("*, lignes_facture(*)")
      .is("deleted_at", null)
      .order("date_emission", { ascending: false });
    if (error) {
      setErreur(error.message);
      setFactures([]);
    } else {
      setFactures((data ?? []).map(normaliserFacture));
    }
    setChargement(false);
  }, []);

  useEffect(() => {
    if (chargementAuth) return;
    if (!user) {
      setFactures([]);
      setErreur(null);
      setChargement(false);
      return;
    }
    chargerFactures();
  }, [user, chargementAuth, chargerFactures]);

  const addFacture = useCallback(
    async (data) => {
      const { lignes = [], ...entete } = data;
      const numero = entete.numero || prochainNumero(factures);
      const payload = preparerEnteteFacture({ ...entete, numero });
      const { data: cree, error } = await supabase
        .from("factures")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      if (lignes.length > 0) {
        const rows = preparerLignes(lignes, cree.id);
        const { error: e2 } = await supabase.from("lignes_facture").insert(rows);
        if (e2) throw e2;
      }
      await chargerFactures();
      return cree;
    },
    [factures, chargerFactures]
  );

  const updateFacture = useCallback(
    async (id, patch) => {
      const { lignes, ...entete } = patch;
      const payload = preparerEnteteFacture(entete);
      if (Object.keys(payload).length > 0) {
        const { error } = await supabase.from("factures").update(payload).eq("id", id);
        if (error) throw error;
      }
      if (Array.isArray(lignes)) {
        const { error: e1 } = await supabase.from("lignes_facture").delete().eq("facture_id", id);
        if (e1) throw e1;
        if (lignes.length > 0) {
          const rows = preparerLignes(lignes, id);
          const { error: e2 } = await supabase.from("lignes_facture").insert(rows);
          if (e2) throw e2;
        }
      }
      await chargerFactures();
    },
    [chargerFactures]
  );

  const deleteFacture = useCallback(async (id) => {
    setErreur(null);
    const { error } = await supabase
      .from("factures")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      setErreur(error.message);
      return false;
    }
    setFactures((prev) => prev.filter((f) => f.id !== id));
    return true;
  }, []);

  const changerStatut = useCallback(async (id, nouveauStatut) => {
    if (!STATUTS.includes(nouveauStatut)) return null;
    setErreur(null);
    const { data: maj, error } = await supabase
      .from("factures")
      .update({ statut: nouveauStatut })
      .eq("id", id)
      .select()
      .single();
    if (error) {
      setErreur(error.message);
      return null;
    }
    setFactures((prev) => prev.map((f) => (f.id === id ? { ...f, statut: maj.statut } : f)));
    return maj;
  }, []);

  const value = useMemo(
    () => ({ factures, chargement, erreur, addFacture, updateFacture, deleteFacture, changerStatut }),
    [factures, chargement, erreur, addFacture, updateFacture, deleteFacture, changerStatut]
  );

  return <FacturesContext.Provider value={value}>{children}</FacturesContext.Provider>;
}

export function useFactures() {
  const ctx = useContext(FacturesContext);
  if (!ctx) throw new Error("useFactures doit être utilisé à l'intérieur de <FacturesProvider>");
  return ctx;
}
