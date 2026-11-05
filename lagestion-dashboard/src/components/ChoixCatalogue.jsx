import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { C, OMBRE, VOILE, euroCentimes } from "../theme";
import { useProduits } from "../context/ProduitsContext.jsx";
import { LIBELLE_TYPE_ARTICLE } from "../data/catalogue";
import usePiegeFocus from "../hooks/usePiegeFocus";

// Fenêtre de choix d'un article actif du catalogue (pré-remplissage d'une ligne de facture).
export default function ChoixCatalogue({ ouvert, onChoisir, onFermer, elementRetour }) {
  const { produits, chargement } = useProduits();
  const [requete, setRequete] = useState("");
  const refFenetre = useRef(null);
  const refRecherche = useRef(null);
  const id = useId();
  const auClavier = usePiegeFocus({ ouvert, refFenetre, refInitial: refRecherche, elementRetour, onEchap: onFermer });

  useEffect(() => {
    if (ouvert) setRequete("");
  }, [ouvert]);

  const actifs = useMemo(() => {
    const q = requete.trim().toLowerCase();
    return produits
      .filter((p) => p.actif)
      .filter((p) => !q || `${p.nom} ${p.reference ?? ""} ${p.description ?? ""}`.toLowerCase().includes(q));
  }, [produits, requete]);

  if (!ouvert) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onKeyDown={auClavier}>
      <div className="lg-dialog-voile absolute inset-0" style={{ backgroundColor: VOILE }} onClick={onFermer} aria-hidden="true" />
      <div
        ref={refFenetre}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titre`}
        className="lg-dialog relative flex max-h-[85vh] w-full max-w-xl flex-col p-6"
        style={{ backgroundColor: C.bgCard, borderRadius: 20, border: `1px solid ${C.border}`, boxShadow: OMBRE.lg }}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={`${id}-titre`} style={{ color: C.textPrimary, fontSize: 18, fontWeight: 600 }}>Choisir dans le catalogue</h2>
          <button
            type="button"
            onClick={onFermer}
            aria-label="Fermer le catalogue"
            className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl hover:bg-lg-hover focus:outline-none focus-visible:ring-2"
            style={{ color: C.textSecondary }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <label htmlFor={`${id}-recherche`} className="mb-1 mt-3 block text-xs font-medium" style={{ color: C.textSecondary }}>
          Rechercher un article actif
        </label>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.textSecondary }} aria-hidden="true" />
          <input
            ref={refRecherche}
            id={`${id}-recherche`}
            type="search"
            value={requete}
            onChange={(e) => setRequete(e.target.value)}
            placeholder="Nom, référence ou description…"
            className="w-full rounded-xl py-2 pl-9 pr-3 text-sm focus:outline-none focus-visible:ring-2"
            style={{ backgroundColor: C.bgMain, border: `1px solid ${C.borderInput}`, color: C.textPrimary }}
          />
        </div>

        <p className="sr-only" aria-live="polite">{`${actifs.length} article${actifs.length > 1 ? "s" : ""} proposé${actifs.length > 1 ? "s" : ""}`}</p>

        <ul className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto" aria-label="Articles actifs">
          {chargement && produits.length === 0 ? (
            <li className="py-6 text-center text-sm" style={{ color: C.textSecondary }}>Chargement du catalogue…</li>
          ) : actifs.length === 0 ? (
            <li className="py-6 text-center text-sm" style={{ color: C.textSecondary }}>
              {requete ? "Aucun article actif ne correspond à cette recherche." : "Aucun article actif dans le catalogue."}
            </li>
          ) : (
            actifs.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onChoisir(p)}
                  className="flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-lg-hover focus:outline-none focus-visible:ring-2"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium" style={{ color: C.textPrimary }}>{p.nom}</span>
                    <span className="block text-xs" style={{ color: C.textSecondary }}>
                      {[p.reference, LIBELLE_TYPE_ARTICLE[p.type], p.unite].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block whitespace-nowrap text-sm font-semibold tabular-nums" style={{ color: C.textPrimary }}>
                      {euroCentimes(p.prix_unitaire_ht)} HT
                    </span>
                    <span className="block text-xs tabular-nums" style={{ color: C.textSecondary }}>
                      TVA {String(p.taux_tva).replace(".", ",")} %
                    </span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
