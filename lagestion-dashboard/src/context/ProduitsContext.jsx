import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useEntreprise } from "./EntrepriseContext.jsx";
import { erreurFrancaise, messageErreur, MESSAGE_REFUS } from "../utils/erreurs";

// Catalogue d'articles (produits et services) de l'entreprise active.
const ProduitsContext = createContext(null);

const CHAMPS = ["type", "reference", "nom", "description", "unite", "prix_unitaire_ht", "taux_tva", "actif"];
const CHAMPS_NOMBRE = new Set(["prix_unitaire_ht", "taux_tva"]);

function preparerPayload(data) {
  const payload = {};
  CHAMPS.forEach((cle) => {
    if (data[cle] === undefined) return;
    const v = data[cle];
    if (CHAMPS_NOMBRE.has(cle)) {
      payload[cle] = Number(v) || 0;
    } else if (typeof v === "string") {
      payload[cle] = v.trim() === "" ? null : v.trim();
    } else {
      payload[cle] = v;
    }
  });
  return payload;
}

export function ProduitsProvider({ children }) {
  const { entrepriseId } = useEntreprise();
  const [produits, setProduits] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);

  const chargerProduits = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    const { data, error } = await supabase
      .from("produits")
      .select("*")
      .eq("entreprise_id", entrepriseId)
      .is("deleted_at", null)
      .order("nom", { ascending: true });
    if (error) {
      setErreur(messageErreur(error));
      setProduits([]);
    } else {
      setProduits(data ?? []);
    }
    setChargement(false);
  }, [entrepriseId]);

  useEffect(() => {
    if (!entrepriseId) {
      setProduits([]);
      setErreur(null);
      setChargement(false);
      return;
    }
    chargerProduits();
  }, [entrepriseId, chargerProduits]);

  const addProduit = useCallback(
    async (data) => {
      const payload = { ...preparerPayload(data), entreprise_id: entrepriseId };
      const { data: cree, error } = await supabase.from("produits").insert(payload).select().single();
      if (error) throw erreurFrancaise(error);
      await chargerProduits();
      return cree;
    },
    [entrepriseId, chargerProduits]
  );

  const updateProduit = useCallback(async (id, patch) => {
    const payload = preparerPayload(patch);
    const { data: maj, error } = await supabase.from("produits").update(payload).eq("id", id).select().single();
    if (error) throw erreurFrancaise(error);
    setProduits((prev) => prev.map((p) => (p.id === id ? maj : p)));
    return maj;
  }, []);

  const deleteProduit = useCallback(async (id) => {
    setErreur(null);
    const { data, error } = await supabase
      .from("produits")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    if (error || data.length === 0) {
      setErreur(error ? messageErreur(error) : MESSAGE_REFUS);
      return false;
    }
    setProduits((prev) => prev.filter((p) => p.id !== id));
    return true;
  }, []);

  const value = useMemo(
    () => ({ produits, chargement, erreur, addProduit, updateProduit, deleteProduit }),
    [produits, chargement, erreur, addProduit, updateProduit, deleteProduit]
  );

  return <ProduitsContext.Provider value={value}>{children}</ProduitsContext.Provider>;
}

export function useProduits() {
  const ctx = useContext(ProduitsContext);
  if (!ctx) throw new Error("useProduits doit être utilisé à l'intérieur de <ProduitsProvider>");
  return ctx;
}
