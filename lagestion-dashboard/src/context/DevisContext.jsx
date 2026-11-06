import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useEntreprise } from "./EntrepriseContext.jsx";
import { useFactures } from "./FacturesContext.jsx";
import { erreurFrancaise, messageErreur, MESSAGE_REFUS } from "../utils/erreurs";
import { preparerLignes } from "../utils/lignesDocument";

const DevisContext = createContext(null);

// Numéro et statut absents : la base attribue le numéro, le statut change par changerStatut ou convertirDevis.
const CHAMPS_DEVIS = ["client_id", "date_emission", "date_validite", "remise", "notes_internes", "message_client"];

function preparerEntete(data) {
  const payload = {};
  CHAMPS_DEVIS.forEach((cle) => {
    if (data[cle] === undefined) return;
    const v = data[cle];
    if (cle === "remise") {
      payload[cle] = Number(v) || 0;
    } else if (typeof v === "string") {
      payload[cle] = v.trim() === "" ? null : v.trim();
    } else {
      payload[cle] = v;
    }
  });
  return payload;
}

function normaliserDevis(row) {
  const lignes = (row.lignes_devis ?? []).slice().sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const { lignes_devis: _l, ...entete } = row;
  return { ...entete, lignes };
}

export function DevisProvider({ children }) {
  const { entrepriseId } = useEntreprise();
  const { rechargerFactures } = useFactures();
  const [devis, setDevis] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);

  const chargerDevis = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    const { data, error } = await supabase
      .from("devis")
      .select("*, lignes_devis(*)")
      .eq("entreprise_id", entrepriseId)
      .is("deleted_at", null)
      .order("date_emission", { ascending: false });
    if (error) {
      setErreur(messageErreur(error));
      setDevis([]);
    } else {
      setDevis((data ?? []).map(normaliserDevis));
    }
    setChargement(false);
  }, [entrepriseId]);

  useEffect(() => {
    if (!entrepriseId) {
      setDevis([]);
      setErreur(null);
      setChargement(false);
      return;
    }
    chargerDevis();
  }, [entrepriseId, chargerDevis]);

  const addDevis = useCallback(
    async (data) => {
      const { lignes = [], ...entete } = data;
      const { data: cree, error } = await supabase
        .from("devis")
        .insert({ ...preparerEntete(entete), entreprise_id: entrepriseId })
        .select()
        .single();
      if (error) throw erreurFrancaise(error);
      if (lignes.length > 0) {
        const rows = preparerLignes(lignes, "devis_id", cree.id, entrepriseId);
        const { error: e2 } = await supabase.from("lignes_devis").insert(rows);
        if (e2) throw erreurFrancaise(e2);
      }
      await chargerDevis();
      return cree;
    },
    [entrepriseId, chargerDevis]
  );

  // Transaction côté base (fonction enregistrer_devis) : en-tête et lignes réussissent ou échouent ensemble.
  const updateDevis = useCallback(
    async (id, patch) => {
      const { lignes, ...entete } = patch;
      const { error } = await supabase.rpc("enregistrer_devis", {
        p_id: id,
        p_entete: preparerEntete(entete),
        p_lignes: Array.isArray(lignes) ? preparerLignes(lignes, "devis_id", id, entrepriseId) : null,
      });
      if (error) {
        await chargerDevis();
        throw erreurFrancaise(error);
      }
      await chargerDevis();
    },
    [entrepriseId, chargerDevis]
  );

  const deleteDevis = useCallback(async (id) => {
    setErreur(null);
    const { data, error } = await supabase
      .from("devis")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    if (error || data.length === 0) {
      setErreur(error ? messageErreur(error) : MESSAGE_REFUS);
      return false;
    }
    setDevis((prev) => prev.filter((d) => d.id !== id));
    return true;
  }, []);

  // En cas de refus, la page peut ne plus être à jour : le devis est relu avant d'afficher le message.
  const changerStatutDevis = useCallback(
    async (id, statut) => {
      const { data, error } = await supabase.from("devis").update({ statut }).eq("id", id).select("id");
      if (error || data.length === 0) {
        await chargerDevis();
        throw error ? erreurFrancaise(error) : new Error(MESSAGE_REFUS);
      }
      await chargerDevis();
    },
    [chargerDevis]
  );

  // Transaction côté base (fonction convertir_devis) ; renvoie l'identifiant de la facture créée.
  const convertirDevis = useCallback(
    async (id) => {
      const { data: factureId, error } = await supabase.rpc("convertir_devis", { p_devis_id: id });
      if (error) {
        await chargerDevis();
        throw erreurFrancaise(error);
      }
      await Promise.all([chargerDevis(), rechargerFactures()]);
      return factureId;
    },
    [chargerDevis, rechargerFactures]
  );

  const value = useMemo(
    () => ({ devis, chargement, erreur, addDevis, updateDevis, deleteDevis, changerStatutDevis, convertirDevis }),
    [devis, chargement, erreur, addDevis, updateDevis, deleteDevis, changerStatutDevis, convertirDevis]
  );

  return <DevisContext.Provider value={value}>{children}</DevisContext.Provider>;
}

export function useDevis() {
  const ctx = useContext(DevisContext);
  if (!ctx) throw new Error("useDevis doit être utilisé à l'intérieur de <DevisProvider>");
  return ctx;
}
