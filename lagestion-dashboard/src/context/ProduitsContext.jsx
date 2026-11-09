import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useEntreprise } from "./EntrepriseContext.jsx";
import { erreurFrancaise, messageErreur, MESSAGE_REFUS } from "../utils/erreurs";
import { executerImport } from "../utils/import.js";

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

// Unicité (uniq_produits_reference) : seul index unique de la table.
const motifImport = (error) =>
  error.code === "23505" ? "Référence déjà utilisée par un autre article." : messageErreur(error);

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

  // Import (utils/import.js) : insertion par lots, entreprise_id sur chaque ligne ; un seul rechargement à la fin.
  const importerProduits = useCallback(
    async (plan, surProgression) => {
      const acces = {
        inserer: async (lignes) => {
          const payload = lignes.map((d) => ({ ...preparerPayload(d), entreprise_id: entrepriseId }));
          // missing=default : un champ absent prend la valeur par défaut de la colonne (type, TVA 20 %, actif).
          const { error } = await supabase.from("produits").insert(payload, { defaultToNull: false });
          return { error: error ? motifImport(error) : null };
        },
        mettreAJour: async (id, patch) => {
          const { data, error } = await supabase
            .from("produits")
            .update(preparerPayload(patch))
            .eq("id", id)
            .eq("entreprise_id", entrepriseId)
            .select("id");
          return { error: error ? motifImport(error) : null, n: data?.length ?? 0 };
        },
      };
      try {
        return await executerImport(plan, acces, surProgression);
      } finally {
        await chargerProduits();
      }
    },
    [entrepriseId, chargerProduits]
  );

  const value = useMemo(
    () => ({ produits, chargement, erreur, addProduit, updateProduit, deleteProduit, importerProduits }),
    [produits, chargement, erreur, addProduit, updateProduit, deleteProduit, importerProduits]
  );

  return <ProduitsContext.Provider value={value}>{children}</ProduitsContext.Provider>;
}

export function useProduits() {
  const ctx = useContext(ProduitsContext);
  if (!ctx) throw new Error("useProduits doit être utilisé à l'intérieur de <ProduitsProvider>");
  return ctx;
}
