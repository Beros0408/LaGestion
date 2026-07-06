import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext.jsx";
import { STATUTS } from "../data/factures";

const FacturesContext = createContext(null);

const CHAMPS_FACTURE = [
  "client_id",
  "numero",
  "date_emission",
  "date_echeance",
  "statut",
  "remise",
  "conditions_paiement",
  "mode_paiement",
  "notes_internes",
  "message_client",
];
const CHAMPS_LIGNE = [
  "description",
  "reference",
  "unite",
  "quantite",
  "prix_unitaire",
  "taux_tva",
  "remise",
];
const CHAMPS_TEXTE_LIGNE = new Set(["description", "reference", "unite"]);
const CHAMPS_PAIEMENT = ["date", "montant", "mode", "reference"];

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

function preparerLignes(lignes, factureId) {
  return lignes.map((l, i) => {
    const ligne = { facture_id: factureId, position: i };
    CHAMPS_LIGNE.forEach((cle) => {
      const v = l?.[cle];
      if (CHAMPS_TEXTE_LIGNE.has(cle)) {
        if (cle === "description") {
          ligne[cle] = typeof v === "string" ? v.trim() : (v ?? "");
        } else {
          const t = typeof v === "string" ? v.trim() : v;
          ligne[cle] = t ? t : null;
        }
      } else if (cle === "quantite") {
        const n = Number(v);
        ligne[cle] = Number.isFinite(n) && n > 0 ? n : 1;
      } else {
        ligne[cle] = Number(v) || 0;
      }
    });
    return ligne;
  });
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
      .select("*, lignes_facture(*), paiements(*)")
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

  const ajouterPaiement = useCallback(
    async (factureId, data) => {
      const payload = { facture_id: factureId, ...preparerPaiement(data) };
      const { data: cree, error } = await supabase
        .from("paiements")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      await chargerFactures();
      return cree;
    },
    [chargerFactures]
  );

  const supprimerPaiement = useCallback(
    async (paiementId) => {
      const { error } = await supabase.from("paiements").delete().eq("id", paiementId);
      if (error) throw error;
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
        numero: prochainNumero(factures),
        date_emission: new Date().toISOString().slice(0, 10),
        date_echeance: null,
        statut: "brouillon",
        remise: Number(source.remise) || 0,
        conditions_paiement: source.conditions_paiement ?? null,
        mode_paiement: source.mode_paiement ?? null,
        notes_internes: source.notes_internes ?? null,
        message_client: source.message_client ?? null,
      };
      const { data: cree, error } = await supabase
        .from("factures")
        .insert(preparerEnteteFacture(payload))
        .select()
        .single();
      if (error) throw error;
      const lignes = source.lignes ?? [];
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

  const value = useMemo(
    () => ({
      factures,
      chargement,
      erreur,
      addFacture,
      updateFacture,
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
      addFacture,
      updateFacture,
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
