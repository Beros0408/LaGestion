import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Plus, Pencil, Trash2, SearchX, Boxes, AlertCircle, Upload } from "lucide-react";
import { C, alpha, euroCentimes } from "../theme";
import { useProduits } from "../context/ProduitsContext.jsx";
import { useEntreprise } from "../context/EntrepriseContext.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import { LIBELLE_TYPE_ARTICLE } from "../data/catalogue";

const TYPE_OPTIONS = [
  { id: "tous", label: "Tous" },
  { id: "produit", label: "Produits" },
  { id: "service", label: "Services" },
];

const ETAT_OPTIONS = [
  { id: "tous", label: "Tous" },
  { id: "actif", label: "Actifs" },
  { id: "inactif", label: "Inactifs" },
];

const COLONNES = ["Référence", "Article", "Type", "Unité", "Prix HT", "TVA", "Statut"];

function useDebouncedValue(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export default function Catalogue() {
  const navigate = useNavigate();
  const { produits, chargement, erreur, deleteProduit } = useProduits();
  const { peutEcrire, peutSupprimer } = useEntreprise();

  const [requete, setRequete] = useState("");
  const requeteDeb = useDebouncedValue(requete, 250);
  const [type, setType] = useState("tous");
  const [etat, setEtat] = useState("tous");
  const [aSupprimer, setASupprimer] = useState(null);

  const filtres = useMemo(() => {
    const q = requeteDeb.trim().toLowerCase();
    return produits.filter((p) => {
      if (type !== "tous" && p.type !== type) return false;
      if (etat === "actif" && !p.actif) return false;
      if (etat === "inactif" && p.actif) return false;
      if (q) {
        const texte = `${p.nom} ${p.reference ?? ""} ${p.description ?? ""}`.toLowerCase();
        if (!texte.includes(q)) return false;
      }
      return true;
    });
  }, [produits, requeteDeb, type, etat]);

  const reinitialiser = () => {
    setRequete("");
    setType("tous");
    setEtat("tous");
  };

  const confirmerSuppression = async () => {
    const { produit } = aSupprimer;
    setASupprimer(null);
    await deleteProduit(produit.id);
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[28px] font-semibold leading-tight" style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}>
            Catalogue
          </h2>
          <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>
            {chargement
              ? "Chargement…"
              : `${produits.length} ${produits.length > 1 ? "articles" : "article"} · produits et services réutilisables dans vos factures`}
          </p>
        </div>
        {peutEcrire && (
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/catalogue/import"
              className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
              style={{ color: C.textSecondary, backgroundColor: "transparent", border: `1px solid ${C.border}` }}
            >
              <Upload size={16} aria-hidden="true" />
              Importer
            </Link>
            <Link
              to="/catalogue/nouveau"
              className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2"
              style={{ backgroundColor: C.primary }}
            >
              <Plus size={16} aria-hidden="true" />
              Nouvel article
            </Link>
          </div>
        )}
      </div>

      {erreur && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-xl p-3 text-sm"
          style={{ backgroundColor: alpha(C.error, 0.06), color: C.errorText, border: `1px solid ${C.error}` }}
        >
          <AlertCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span><strong className="font-semibold">Erreur :</strong> {erreur}</span>
        </div>
      )}

      <div className="rounded-2xl p-4" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[220px] flex-1">
            <label htmlFor="recherche-catalogue" className="mb-1 block text-xs font-medium" style={{ color: C.textSecondary }}>
              Rechercher
            </label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.textSecondary }} aria-hidden="true" />
              <input
                id="recherche-catalogue"
                type="search"
                value={requete}
                onChange={(e) => setRequete(e.target.value)}
                placeholder="Nom, référence ou description…"
                className="w-full rounded-xl py-2 pl-9 pr-3 text-sm focus:outline-none focus-visible:ring-2"
                style={{ backgroundColor: C.bgMain, border: `1px solid ${C.borderInput}`, color: C.textPrimary }}
              />
            </div>
          </div>
          <GroupeFiltre label="Type" options={TYPE_OPTIONS} value={type} onChange={setType} ariaLabel="Filtrer par type" />
          <GroupeFiltre label="Statut" options={ETAT_OPTIONS} value={etat} onChange={setEtat} ariaLabel="Filtrer par statut" />
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
        {chargement && produits.length === 0 ? (
          <p className="px-6 py-16 text-center text-sm" role="status" aria-live="polite" style={{ color: C.textSecondary }}>
            Chargement du catalogue…
          </p>
        ) : produits.length === 0 ? (
          <EtatVide
            icone={Boxes}
            titre="Votre catalogue est vide"
            texte="Ajoutez vos produits et prestations pour remplir les lignes de facture en un clic."
          />
        ) : filtres.length === 0 ? (
          <EtatVide
            icone={SearchX}
            titre="Aucun article ne correspond à vos filtres"
            texte="Essayez d'élargir la recherche ou de réinitialiser les filtres."
            action={{ libelle: "Réinitialiser les filtres", onClick: reinitialiser }}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Articles du catalogue filtrés</caption>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {COLONNES.map((c) => (
                    <th
                      key={c}
                      scope="col"
                      className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wider ${c === "Prix HT" || c === "TVA" ? "text-right" : "text-left"}`}
                      style={{ color: C.textSecondary }}
                    >
                      {c}
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filtres.map((p) => (
                  <tr
                    key={p.id}
                    onClick={peutEcrire ? () => navigate(`/catalogue/${p.id}/modifier`) : undefined}
                    className={`transition-colors hover:bg-lg-hover ${peutEcrire ? "cursor-pointer" : ""}`}
                    style={{ borderBottom: `1px solid ${C.border}` }}
                  >
                    <td className="whitespace-nowrap px-3 py-3 text-xs tabular-nums" style={{ color: C.textSecondary }}>{p.reference || "—"}</td>
                    <td className="min-w-[200px] px-3 py-3">
                      <p className="font-medium" style={{ color: C.textPrimary }}>{p.nom}</p>
                      {p.description && <p className="mt-0.5 text-xs" style={{ color: C.textSecondary }}>{p.description}</p>}
                    </td>
                    <td className="px-3 py-3" style={{ color: C.textSecondary }}>{LIBELLE_TYPE_ARTICLE[p.type]}</td>
                    <td className="px-3 py-3" style={{ color: C.textSecondary }}>{p.unite || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums" style={{ color: C.textPrimary }}>{euroCentimes(p.prix_unitaire_ht)}</td>
                    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums" style={{ color: C.textSecondary }}>{String(p.taux_tva).replace(".", ",")} %</td>
                    <td className="px-3 py-3"><BadgeEtat actif={p.actif} /></td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {peutEcrire && (
                          <BoutonAction label={`Modifier ${p.nom}`} icon={Pencil} onClick={() => navigate(`/catalogue/${p.id}/modifier`)} />
                        )}
                        {peutSupprimer && (
                          <BoutonAction
                            label={`Supprimer ${p.nom}`}
                            icon={Trash2}
                            couleur={C.error}
                            onClick={(e) => setASupprimer({ produit: p, element: e.currentTarget })}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        ouvert={Boolean(aSupprimer)}
        titre="Supprimer cet article ?"
        message={aSupprimer ? `« ${aSupprimer.produit.nom} » ne sera plus proposé dans les factures. Les factures existantes ne changent pas.` : ""}
        libelleAnnuler="Annuler"
        libelleConfirmer="Supprimer"
        onAnnuler={() => setASupprimer(null)}
        onConfirmer={confirmerSuppression}
        elementRetour={aSupprimer?.element}
      />
    </>
  );
}

function GroupeFiltre({ label, options, value, onChange, ariaLabel }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium" style={{ color: C.textSecondary }}>{label}</p>
      <div
        role="group"
        aria-label={ariaLabel}
        className="flex items-center gap-1 rounded-xl p-1"
        style={{ backgroundColor: C.bgMain, border: `1px solid ${C.border}` }}
      >
        {options.map((o) => {
          const actif = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(o.id)}
              aria-pressed={actif}
              className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2"
              style={{ color: actif ? C.onPrimary : C.textSecondary, backgroundColor: actif ? C.primary : "transparent" }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BadgeEtat({ actif }) {
  const couleur = actif ? C.success : C.textSecondary;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ color: actif ? C.successText : C.textSecondary, backgroundColor: alpha(couleur, 0.12) }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: couleur }} aria-hidden="true" />
      {actif ? "Actif" : "Inactif"}
    </span>
  );
}

function BoutonAction({ label, icon: Icon, couleur = C.textSecondary, onClick }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      aria-label={label}
      title={label}
      className="rounded-lg p-1.5 transition-colors focus:outline-none focus-visible:ring-2"
      style={{ color: couleur }}
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}

function EtatVide({ icone: Icone, titre, texte, action }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: C.bgMain, color: C.textSecondary }}>
        <Icone size={24} aria-hidden="true" />
      </div>
      <p className="text-base font-semibold" style={{ color: C.textPrimary }}>{titre}</p>
      <p className="text-sm" style={{ color: C.textSecondary }}>{texte}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-1 rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
          style={{ color: C.primary, backgroundColor: alpha(C.primary, 0.08) }}
        >
          {action.libelle}
        </button>
      )}
    </div>
  );
}
