import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useEntreprise } from "./EntrepriseContext.jsx";
import { erreurFrancaise, messageErreur, MESSAGE_REFUS } from "../utils/erreurs";
import { STATUTS } from "../data/factures";
import { lierAvoirs } from "../utils/facture";
import { preparerLignes } from "../utils/lignesDocument";

const FacturesContext = createContext(null);

// Numéro et statut absents : la base attribue le numéro à la finalisation, le statut change par changerStatut.
const CHAMPS_FACTURE = [
  "client_id",
  "date_emission",
  "date_echeance",
  "remise",
  "conditions_paiement",
  "mode_paiement",
  "notes_internes",
  "message_client",
  "motif",
];
const CHAMPS_PAIEMENT = ["date", "montant", "mode", "reference", "sens"];

function preparerEnteteFacture(data) {
  const payload = {};
  CHAMPS_FACTURE.forEach((cle) => {
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

function preparerPaiement(data) {
  const payload = {};
  CHAMPS_PAIEMENT.forEach((cle) => {
    if (data[cle] === undefined) return;
    const v = data[cle];
    if (cle === "montant") {
      payload[cle] = Number(v) || 0;
    } else if (typeof v === "string") {
      payload[cle] = v.trim() === "" ? null : v.trim();
    } else {
      payload[cle] = v;
    }
  });
  return payload;
}

function normaliserFacture(row) {
  const lignesBrutes = row.lignes_facture ?? [];
  const lignes = lignesBrutes
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const paiementsBruts = row.paiements ?? [];
  const paiements = paiementsBruts
    .slice()
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  const { lignes_facture: _l, paiements: _p, ...entete } = row;
  return { ...entete, lignes, paiements };
}

export function FacturesProvider({ children }) {
  const { entrepriseId } = useEntreprise();
  const [factures, setFactures] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);

  const chargerFactures = useCallback(async () => {
    setChargement(true);
    setErreur(null);
    const { data, error } = await supabase
      .from("factures")
      .select("*, lignes_facture(*), paiements(*)")
      .eq("entreprise_id", entrepriseId)
      .is("deleted_at", null)
      .order("date_emission", { ascending: false });
    if (error) {
      setErreur(messageErreur(error));
      setFactures([]);
    } else {
      setFactures(lierAvoirs((data ?? []).map(normaliserFacture)));
    }
    setChargement(false);
  }, [entrepriseId]);

  useEffect(() => {
    if (!entrepriseId) {
      setFactures([]);
      setErreur(null);
      setChargement(false);
      return;
    }
    chargerFactures();
  }, [entrepriseId, chargerFactures]);

  const addFacture = useCallback(
    async (data) => {
      const { lignes = [], ...entete } = data;
      const payload = { ...preparerEnteteFacture(entete), entreprise_id: entrepriseId };
      const { data: cree, error } = await supabase
        .from("factures")
        .insert(payload)
        .select()
        .single();
      if (error) throw erreurFrancaise(error);
      if (lignes.length > 0) {
        const rows = preparerLignes(lignes, "facture_id", cree.id, entrepriseId);
        const { error: e2 } = await supabase.from("lignes_facture").insert(rows);
        if (e2) throw erreurFrancaise(e2);
      }
      await chargerFactures();
      return cree;
    },
    [entrepriseId, chargerFactures]
  );

  // Transaction côté base (fonction enregistrer_facture) : en-tête et lignes réussissent ou échouent ensemble.
  const updateFacture = useCallback(
    async (id, patch) => {
      const { lignes, ...entete } = patch;
      const { error } = await supabase.rpc("enregistrer_facture", {
        p_id: id,
        p_entete: preparerEnteteFacture(entete),
        p_lignes: Array.isArray(lignes) ? preparerLignes(lignes, "facture_id", id, entrepriseId) : null,
      });
      if (error) {
        await chargerFactures();
        throw erreurFrancaise(error);
      }
      await chargerFactures();
    },
    [entrepriseId, chargerFactures]
  );

  // Transaction côté base (fonction finaliser_facture) : numéro, date, totaux et identités figés.
  const finaliserFacture = useCallback(
    async (id) => {
      const { data: numero, error } = await supabase.rpc("finaliser_facture", { p_facture_id: id });
      if (error) {
        await chargerFactures();
        throw erreurFrancaise(error);
      }
      await chargerFactures();
      return numero;
    },
    [chargerFactures]
  );

  // Transaction côté base (fonction creer_avoir) : renvoie l'identifiant du brouillon d'avoir.
  const creerAvoir = useCallback(
    async (factureId, { motif, total, lignes }) => {
      const { data: avoirId, error } = await supabase.rpc("creer_avoir", {
        p_facture_id: factureId,
        p_motif: motif.trim(),
        p_total: total,
        p_lignes: total ? null : preparerLignes(lignes, "facture_id", factureId, entrepriseId),
      });
      if (error) {
        await chargerFactures();
        throw erreurFrancaise(error);
      }
      await chargerFactures();
      return avoirId;
    },
    [entrepriseId, chargerFactures]
  );

  const deleteFacture = useCallback(async (id) => {
    setErreur(null);
    const { data, error } = await supabase
      .from("factures")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .select("id");
    if (error || data.length === 0) {
      setErreur(error ? messageErreur(error) : MESSAGE_REFUS);
      return false;
    }
    setFactures((prev) => prev.filter((f) => f.id !== id));
    return true;
  }, []);

  // Un refus est affiché par la liste (erreur) et renvoyé à la fiche, qui a son propre message.
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
      setErreur(messageErreur(error));
      throw erreurFrancaise(error);
    }
    setFactures((prev) => prev.map((f) => (f.id === id ? { ...f, statut: maj.statut } : f)));
    return maj;
  }, []);

  const ajouterPaiement = useCallback(
    async (factureId, data) => {
      const payload = { entreprise_id: entrepriseId, facture_id: factureId, ...preparerPaiement(data) };
      const { data: cree, error } = await supabase
        .from("paiements")
        .insert(payload)
        .select()
        .single();
      if (error) throw erreurFrancaise(error);
      await chargerFactures();
      return cree;
    },
    [entrepriseId, chargerFactures]
  );

  const supprimerPaiement = useCallback(
    async (paiementId) => {
      const { data, error } = await supabase.from("paiements").delete().eq("id", paiementId).select("id");
      if (error) throw erreurFrancaise(error);
      if (data.length === 0) throw new Error(MESSAGE_REFUS);
      await chargerFactures();
      return true;
    },
    [chargerFactures]
  );

  const dupliquerFacture = useCallback(
    async (id) => {
      const source = factures.find((f) => f.id === id);
      if (!source) throw new Error("Facture source introuvable.");
      const payload = {
        client_id: source.client_id,
        date_emission: new Date().toISOString().slice(0, 10),
        date_echeance: null,
        remise: Number(source.remise) || 0,
        conditions_paiement: source.conditions_paiement ?? null,
        mode_paiement: source.mode_paiement ?? null,
        notes_internes: source.notes_internes ?? null,
        message_client: source.message_client ?? null,
      };
      const { data: cree, error } = await supabase
        .from("factures")
        .insert({ ...preparerEnteteFacture(payload), entreprise_id: entrepriseId })
        .select()
        .single();
      if (error) throw erreurFrancaise(error);
      const lignes = source.lignes ?? [];
      if (lignes.length > 0) {
        const rows = preparerLignes(lignes, "facture_id", cree.id, entrepriseId);
        const { error: e2 } = await supabase.from("lignes_facture").insert(rows);
        if (e2) throw erreurFrancaise(e2);
      }
      await chargerFactures();
      return cree;
    },
    [entrepriseId, factures, chargerFactures]
  );

  const value = useMemo(
    () => ({
      factures,
      chargement,
      erreur,
      rechargerFactures: chargerFactures,
      addFacture,
      updateFacture,
      finaliserFacture,
      creerAvoir,
      deleteFacture,
      changerStatut,
      ajouterPaiement,
      supprimerPaiement,
      dupliquerFacture,
    }),
    [
      factures,
      chargement,
      erreur,
      chargerFactures,
      addFacture,
      updateFacture,
      finaliserFacture,
      creerAvoir,
      deleteFacture,
      changerStatut,
      ajouterPaiement,
      supprimerPaiement,
      dupliquerFacture,
    ]
  );

  return <FacturesContext.Provider value={value}>{children}</FacturesContext.Provider>;
}

export function useFactures() {
  const ctx = useContext(FacturesContext);
  if (!ctx) throw new Error("useFactures doit être utilisé à l'intérieur de <FacturesProvider>");
  return ctx;
}
