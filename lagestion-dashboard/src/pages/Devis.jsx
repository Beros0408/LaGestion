import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search, Plus, ChevronUp, ChevronDown, ChevronsUpDown, Eye, Pencil, Trash2, SearchX, FileSignature, AlertCircle,
} from "lucide-react";
import { BORDURE_CARTE, C, alpha, euro } from "../theme";
import { useDevis } from "../context/DevisContext.jsx";
import { useClients } from "../context/ClientsContext.jsx";
import { useFactures } from "../context/FacturesContext.jsx";
import { useEntreprise } from "../context/EntrepriseContext.jsx";
import { STATUTS_DEVIS, LIBELLE_STATUT_DEVIS, aAcompteActif, devisModifiable, validiteDepassee } from "../data/devis";
import { totalTTC } from "../utils/facture";
import BadgeStatutDevis from "../components/BadgeStatutDevis.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";

const STATUT_OPTIONS = [
  { id: "tous", label: "Tous" },
  ...STATUTS_DEVIS.map((s) => ({ id: s, label: LIBELLE_STATUT_DEVIS[s] })),
];

const COLONNES = [
  { id: "numero", label: "Numéro", align: "left" },
  { id: "clientNom", label: "Client", align: "left" },
  { id: "date_emission", label: "Émission", align: "left" },
  { id: "date_validite", label: "Validité", align: "left" },
  { id: "montantTTC", label: "Montant TTC", align: "right" },
  { id: "statut", label: "Statut", align: "left" },
];

function useDebouncedValue(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function formaterDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function Devis() {
  const navigate = useNavigate();
  const { devis, chargement, erreur, deleteDevis } = useDevis();
  const { clients, chargement: chargementClients } = useClients();
  const { peutEcrire, peutSupprimer } = useEntreprise();
  const { factures } = useFactures();

  const [requete, setRequete] = useState("");
  const requeteDeb = useDebouncedValue(requete, 250);
  const [statut, setStatut] = useState("tous");
  const [tri, setTri] = useState({ col: "date_emission", dir: "desc" });
  const [aSupprimer, setASupprimer] = useState(null);

  const enrichis = useMemo(() => {
    const noms = new Map(clients.map((c) => [c.id, c.nom]));
    return devis.map((d) => ({
      ...d,
      clientNom: noms.get(d.client_id) ?? (chargementClients ? "…" : "Client supprimé"),
      montantTTC: totalTTC(d),
    }));
  }, [devis, clients, chargementClients]);

  const filtres = useMemo(() => {
    const q = requeteDeb.trim().toLowerCase();
    return enrichis.filter((d) => {
      if (statut !== "tous" && d.statut !== statut) return false;
      return !q || `${d.numero} ${d.clientNom}`.toLowerCase().includes(q);
    });
  }, [enrichis, requeteDeb, statut]);

  const tries = useMemo(() => {
    return [...filtres].sort((a, b) => {
      const av = a[tri.col];
      const bv = b[tri.col];
      const r = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv), "fr", { sensitivity: "base" });
      return tri.dir === "asc" ? r : -r;
    });
  }, [filtres, tri]);

  const enAttente = useMemo(
    () => enrichis.filter((d) => d.statut === "envoye").reduce((s, d) => s + d.montantTTC, 0),
    [enrichis]
  );

  const trier = (col) =>
    setTri((prev) => (prev.col === col ? { col, dir: prev.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" }));

  const reinitialiser = () => {
    setRequete("");
    setStatut("tous");
  };

  const confirmerSuppression = async () => {
    const { devis: cible } = aSupprimer;
    setASupprimer(null);
    await deleteDevis(cible.id);
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[28px] font-semibold leading-tight" style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}>
            Devis
          </h2>
          <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>
            {chargement ? (
              "Chargement…"
            ) : (
              <>
                {devis.length} devis · En attente de réponse{" "}
                <span className="font-semibold tabular-nums" style={{ color: C.textPrimary }}>{euro(enAttente)}</span>
              </>
            )}
          </p>
        </div>
        {peutEcrire && (
          <Link
            to="/devis/nouveau"
            className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2"
            style={{ backgroundColor: C.primary }}
          >
            <Plus size={16} aria-hidden="true" />
            Nouveau devis
          </Link>
        )}
      </div>

      {erreur && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-xl p-3 text-sm"
          style={{ backgroundColor: alpha(C.error, 0.06), color: C.errorText, border: `1px solid ${C.error}` }}
        >
          <AlertCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span><strong className="font-semibold">{"Erreur :"}</strong> {erreur}</span>
        </div>
      )}

      <div className="rounded-2xl p-4" style={{ backgroundColor: C.fondCarte, border: BORDURE_CARTE }}>
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[220px] flex-1">
            <label htmlFor="recherche-devis" className="mb-1 block text-xs font-medium" style={{ color: C.textSecondary }}>
              Rechercher
            </label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.textSecondary }} aria-hidden="true" />
              <input
                id="recherche-devis"
                type="search"
                value={requete}
                onChange={(e) => setRequete(e.target.value)}
                placeholder="Numéro ou client…"
                className="w-full rounded-xl py-2 pl-9 pr-3 text-sm focus:outline-none focus-visible:ring-2"
                style={{ backgroundColor: C.bgMain, border: `1px solid ${C.borderInput}`, color: C.textPrimary }}
              />
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium" style={{ color: C.textSecondary }}>Statut</p>
            <div
              role="group"
              aria-label="Filtrer par statut"
              className="flex flex-wrap items-center gap-1 rounded-xl p-1"
              style={{ backgroundColor: C.bgMain, border: `1px solid ${C.border}` }}
            >
              {STATUT_OPTIONS.map((o) => {
                const actif = statut === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setStatut(o.id)}
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
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl" style={{ backgroundColor: C.fondCarte, border: BORDURE_CARTE }}>
        {chargement && devis.length === 0 ? (
          <p className="px-6 py-16 text-center text-sm" role="status" aria-live="polite" style={{ color: C.textSecondary }}>
            Chargement des devis…
          </p>
        ) : devis.length === 0 ? (
          <EtatVide
            icone={FileSignature}
            titre="Aucun devis pour le moment"
            texte="Créez un premier devis, puis transformez-le en facture une fois accepté."
          />
        ) : tries.length === 0 ? (
          <EtatVide
            icone={SearchX}
            titre="Aucun devis ne correspond à vos filtres"
            texte="Essayez d'élargir la recherche ou de réinitialiser les filtres."
            action={{ libelle: "Réinitialiser les filtres", onClick: reinitialiser }}
          />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Liste des devis filtrés et triés</caption>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {COLONNES.map((col) => {
                    const estTri = tri.col === col.id;
                    const Icon = estTri ? (tri.dir === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
                    return (
                      <th
                        key={col.id}
                        scope="col"
                        aria-sort={estTri ? (tri.dir === "asc" ? "ascending" : "descending") : "none"}
                        className={`px-3 py-2.5 ${col.align === "right" ? "text-right" : "text-left"} text-xs font-semibold uppercase tracking-wider`}
                        style={{ color: C.textSecondary }}
                      >
                        <button
                          type="button"
                          onClick={() => trier(col.id)}
                          aria-label={`Trier par ${col.label}`}
                          className="inline-flex items-center gap-1 rounded transition-colors focus:outline-none focus-visible:ring-2"
                          style={{ color: estTri ? C.textPrimary : C.textSecondary }}
                        >
                          {col.label}
                          <Icon size={13} aria-hidden="true" />
                        </button>
                      </th>
                    );
                  })}
                  <th scope="col" className="px-3 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {tries.map((d) => (
                  <tr
                    key={d.id}
                    onClick={() => navigate(`/devis/${d.id}`)}
                    className="cursor-pointer transition-colors hover:bg-lg-hover"
                    style={{ borderBottom: `1px solid ${C.border}` }}
                  >
                    <td className="whitespace-nowrap px-3 py-3 font-medium tabular-nums" style={{ color: C.textPrimary }}>{d.numero}</td>
                    <td className="px-3 py-3" style={{ color: C.textSecondary }}>{d.clientNom}</td>
                    <td className="px-3 py-3 tabular-nums" style={{ color: C.textSecondary }}>{formaterDate(d.date_emission)}</td>
                    <td className="px-3 py-3 tabular-nums" style={{ color: C.textSecondary }}>
                      {formaterDate(d.date_validite)}
                      {validiteDepassee(d) && (
                        <span className="mt-0.5 block text-xs font-medium" style={{ color: C.warningText }}>Validité dépassée</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums" style={{ color: C.textPrimary }}>{euro(d.montantTTC)}</td>
                    <td className="px-3 py-3"><BadgeStatutDevis statut={d.statut} /></td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <BoutonAction label={`Voir ${d.numero}`} icon={Eye} onClick={() => navigate(`/devis/${d.id}`)} />
                        {peutEcrire && devisModifiable(d.statut) && (
                          <BoutonAction label={`Modifier ${d.numero}`} icon={Pencil} onClick={() => navigate(`/devis/${d.id}/modifier`)} />
                        )}
                        {peutSupprimer && d.statut !== "converti" && !aAcompteActif(factures, d.id) && (
                          <BoutonAction
                            label={`Supprimer ${d.numero}`}
                            icon={Trash2}
                            couleur={C.error}
                            onClick={(e) => setASupprimer({ devis: d, element: e.currentTarget })}
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
        titre="Supprimer ce devis ?"
        message={aSupprimer ? `Le devis ${aSupprimer.devis.numero} ne sera plus visible. Son numéro ne sera pas réattribué.` : ""}
        libelleAnnuler="Annuler"
        libelleConfirmer="Supprimer"
        onAnnuler={() => setASupprimer(null)}
        onConfirmer={confirmerSuppression}
        elementRetour={aSupprimer?.element}
      />
    </>
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
