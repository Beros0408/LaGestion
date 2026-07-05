import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Search, Plus, ChevronUp, ChevronDown, ChevronsUpDown,
  Eye, Pencil, Trash2, SearchX, MoreHorizontal, RefreshCw, Download,
} from "lucide-react";
import { C, euro } from "../theme";
import { useFactures } from "../context/FacturesContext.jsx";
import { useClients } from "../context/ClientsContext.jsx";
import { STATUTS } from "../data/factures";
import { totalTTC } from "../utils/facture";
import { exporterFacturesExcel } from "../utils/excel";
import BadgeStatutFacture from "../components/BadgeStatutFacture.jsx";

const STATUT_OPTIONS = [
  { id: "tous", label: "Tous" },
  ...STATUTS.map((s) => ({ id: s, label: s })),
];

const COLUMNS = [
  { id: "numero",         label: "Numéro",       sortable: true,  align: "left" },
  { id: "clientNom",      label: "Client",       sortable: true,  align: "left" },
  { id: "dateEmission",   label: "Émission",     sortable: true,  align: "left" },
  { id: "dateEcheance",   label: "Échéance",     sortable: true,  align: "left" },
  { id: "montantTTC",     label: "Montant TTC",  sortable: true,  align: "right" },
  { id: "statut",         label: "Statut",       sortable: true,  align: "left" },
  { id: "actions",        label: "",             sortable: false, align: "right" },
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

export default function Factures() {
  const navigate = useNavigate();
  const { factures, deleteFacture, changerStatut } = useFactures();
  const { clients } = useClients();

  const [requete, setRequete] = useState("");
  const requeteDeb = useDebouncedValue(requete, 250);
  const [statut, setStatut] = useState("tous");
  const [tri, setTri] = useState({ col: "dateEmission", dir: "desc" });

  const clientsParId = useMemo(() => {
    const map = new Map();
    clients.forEach((c) => map.set(c.id, c));
    return map;
  }, [clients]);

  const enrichies = useMemo(() => {
    return factures.map((f) => ({
      ...f,
      clientNom: clientsParId.get(f.clientId)?.nom ?? "Client inconnu",
      montantTTC: totalTTC(f),
    }));
  }, [factures, clientsParId]);

  const filtrees = useMemo(() => {
    const q = requeteDeb.trim().toLowerCase();
    return enrichies.filter((f) => {
      if (statut !== "tous" && f.statut !== statut) return false;
      if (q) {
        const hay = `${f.numero} ${f.clientNom}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [enrichies, requeteDeb, statut]);

  const triees = useMemo(() => {
    const arr = [...filtrees];
    arr.sort((a, b) => {
      const av = a[tri.col];
      const bv = b[tri.col];
      let r;
      if (typeof av === "number" && typeof bv === "number") r = av - bv;
      else r = String(av).localeCompare(String(bv), "fr", { sensitivity: "base" });
      return tri.dir === "asc" ? r : -r;
    });
    return arr;
  }, [filtrees, tri]);

  const recap = useMemo(() => {
    let nombre = 0;
    let totalTotal = 0;
    let impaye = 0;
    factures.forEach((f) => {
      nombre += 1;
      const ttc = totalTTC(f);
      totalTotal += ttc;
      if (f.statut === "En attente" || f.statut === "En retard") impaye += ttc;
    });
    return { nombre, totalTotal, impaye };
  }, [factures]);

  const handleSort = (col) => {
    setTri((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { col, dir: "asc" }
    );
  };

  const reinitialiserFiltres = () => {
    setRequete("");
    setStatut("tous");
  };

  const handleView = (f) => navigate(`/factures/${f.id}`);
  const handleEdit = (f) => navigate(`/factures/${f.id}/modifier`);
  const handleDelete = (f) => {
    const ok = window.confirm(`Supprimer définitivement « ${f.numero} » ? Cette action est irréversible.`);
    if (!ok) return;
    deleteFacture(f.id);
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[28px] font-semibold leading-tight" style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}>
            Factures
          </h2>
          <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>
            {recap.nombre} {recap.nombre > 1 ? "factures" : "facture"} · Total facturé{" "}
            <span className="font-semibold tabular-nums" style={{ color: C.textPrimary }}>{euro(recap.totalTotal)}</span>
            <span className="mx-1">·</span>
            Impayé{" "}
            <span className="font-semibold tabular-nums" style={{ color: recap.impaye > 0 ? C.error : C.textPrimary }}>
              {euro(recap.impaye)}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => exporterFacturesExcel(triees, clients)}
            aria-label="Exporter la liste des factures au format Excel"
            className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
            style={{ color: C.textSecondary, backgroundColor: "transparent", border: `1px solid ${C.border}` }}
          >
            <Download size={16} aria-hidden="true" />
            Exporter en Excel
          </button>
          <Link
            to="/factures/nouvelle"
            className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2"
            style={{ backgroundColor: C.primary }}
          >
            <Plus size={16} aria-hidden="true" />
            Nouvelle facture
          </Link>
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[220px] flex-1">
            <label htmlFor="recherche-factures" className="mb-1 block text-xs font-medium" style={{ color: C.textSecondary }}>
              Rechercher
            </label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.textSecondary }} aria-hidden="true" />
              <input
                id="recherche-factures"
                type="search"
                value={requete}
                onChange={(e) => setRequete(e.target.value)}
                placeholder="Numéro ou client…"
                className="w-full rounded-xl py-2 pl-9 pr-3 text-sm focus:outline-none focus-visible:ring-2"
                style={{ backgroundColor: C.bgMain, border: `1px solid ${C.border}`, color: C.textPrimary }}
              />
            </div>
          </div>

          <FilterGroup
            label="Statut"
            options={STATUT_OPTIONS}
            value={statut}
            onChange={setStatut}
            ariaLabel="Filtrer par statut"
          />
        </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
        {triees.length === 0 ? (
          <EtatVide onReset={reinitialiserFiltres} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Liste des factures filtrées et triées</caption>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {COLUMNS.map((col) => {
                    const estTri = tri.col === col.id;
                    const sens = estTri ? tri.dir : null;
                    const ariaSort = !col.sortable
                      ? undefined
                      : estTri
                        ? (sens === "asc" ? "ascending" : "descending")
                        : "none";
                    const Icon = estTri ? (sens === "asc" ? ChevronUp : ChevronDown) : ChevronsUpDown;
                    const alignement = col.align === "right" ? "text-right" : "text-left";
                    return (
                      <th
                        key={col.id}
                        scope="col"
                        aria-sort={ariaSort}
                        className={`px-3 py-2.5 ${alignement} text-xs font-semibold uppercase tracking-wider`}
                        style={{ color: C.textSecondary }}
                      >
                        {col.sortable ? (
                          <button
                            type="button"
                            onClick={() => handleSort(col.id)}
                            aria-label={`Trier par ${col.label}`}
                            className="inline-flex items-center gap-1 rounded transition-colors focus:outline-none focus-visible:ring-2"
                            style={{ color: estTri ? C.textPrimary : C.textSecondary }}
                          >
                            {col.label}
                            <Icon size={13} aria-hidden="true" />
                          </button>
                        ) : col.label ? col.label : <span className="sr-only">Actions</span>}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {triees.map((f) => (
                  <LigneFacture
                    key={f.id}
                    facture={f}
                    onView={() => handleView(f)}
                    onEdit={() => handleEdit(f)}
                    onDelete={() => handleDelete(f)}
                    onChangerStatut={(s) => changerStatut(f.id, s)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function FilterGroup({ label, options, value, onChange, ariaLabel }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium" style={{ color: C.textSecondary }}>{label}</p>
      <div
        role="group"
        aria-label={ariaLabel}
        className="flex flex-wrap items-center gap-1 rounded-xl p-1"
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
              style={{
                color: actif ? "#fff" : C.textSecondary,
                backgroundColor: actif ? C.primary : "transparent",
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LigneFacture({ facture, onView, onEdit, onDelete, onChangerStatut }) {
  const [menuOuvert, setMenuOuvert] = useState(false);
  const [sousMenuOuvert, setSousMenuOuvert] = useState(false);
  const conteneurRef = useRef(null);
  const boutonRef = useRef(null);

  useEffect(() => {
    if (!menuOuvert) return;
    const onClickExterieur = (e) => {
      if (!conteneurRef.current) return;
      if (!conteneurRef.current.contains(e.target)) {
        setMenuOuvert(false);
        setSousMenuOuvert(false);
      }
    };
    const onEchap = (e) => {
      if (e.key === "Escape") {
        setMenuOuvert(false);
        setSousMenuOuvert(false);
        boutonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onClickExterieur);
    document.addEventListener("keydown", onEchap);
    return () => {
      document.removeEventListener("mousedown", onClickExterieur);
      document.removeEventListener("keydown", onEchap);
    };
  }, [menuOuvert]);

  return (
    <tr
      onClick={onView}
      className="cursor-pointer transition-colors hover:bg-[#F1F3F5]"
      style={{ borderBottom: `1px solid ${C.border}` }}
    >
      <td className="px-3 py-3 font-medium tabular-nums" style={{ color: C.textPrimary }}>{facture.numero}</td>
      <td className="px-3 py-3" style={{ color: C.textSecondary }}>{facture.clientNom}</td>
      <td className="px-3 py-3 tabular-nums" style={{ color: C.textSecondary }}>{formaterDate(facture.dateEmission)}</td>
      <td className="px-3 py-3 tabular-nums" style={{ color: C.textSecondary }}>{formaterDate(facture.dateEcheance)}</td>
      <td className="px-3 py-3 text-right font-semibold tabular-nums" style={{ color: C.textPrimary }}>{euro(facture.montantTTC)}</td>
      <td className="px-3 py-3"><BadgeStatutFacture statut={facture.statut} /></td>
      <td className="px-3 py-3">
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <BoutonAction label={`Voir ${facture.numero}`} icon={Eye} onClick={onView} />
          <BoutonAction label={`Modifier ${facture.numero}`} icon={Pencil} onClick={onEdit} />

          <div ref={conteneurRef} className="relative">
            <button
              ref={boutonRef}
              type="button"
              aria-label={`Autres actions pour ${facture.numero}`}
              aria-haspopup="menu"
              aria-expanded={menuOuvert}
              onClick={() => {
                setMenuOuvert((v) => !v);
                setSousMenuOuvert(false);
              }}
              className="rounded-lg p-1.5 transition-colors focus:outline-none focus-visible:ring-2"
              style={{ color: C.textSecondary }}
            >
              <MoreHorizontal size={16} aria-hidden="true" />
            </button>

            {menuOuvert && (
              <div
                role="menu"
                aria-label={`Actions pour ${facture.numero}`}
                className="absolute right-0 top-8 z-20 w-48 overflow-hidden rounded-xl"
                style={{
                  backgroundColor: C.bgCard,
                  border: `1px solid ${C.border}`,
                  boxShadow: "0 12px 28px rgba(45,52,54,0.10)",
                }}
              >
                <div className="relative" onMouseEnter={() => setSousMenuOuvert(true)}>
                  <button
                    type="button"
                    role="menuitem"
                    aria-haspopup="menu"
                    aria-expanded={sousMenuOuvert}
                    onClick={() => setSousMenuOuvert((v) => !v)}
                    onFocus={() => setSousMenuOuvert(true)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[#F1F3F5] focus:outline-none focus-visible:ring-2"
                    style={{ color: C.textPrimary }}
                  >
                    <span className="flex items-center gap-2">
                      <RefreshCw size={14} aria-hidden="true" />
                      Changer le statut
                    </span>
                    <span aria-hidden="true" style={{ color: C.textSecondary }}>›</span>
                  </button>

                  {sousMenuOuvert && (
                    <div
                      role="menu"
                      aria-label="Choisir un statut"
                      className="absolute right-full top-0 mr-1 w-40 overflow-hidden rounded-xl"
                      style={{
                        backgroundColor: C.bgCard,
                        border: `1px solid ${C.border}`,
                        boxShadow: "0 12px 28px rgba(45,52,54,0.10)",
                      }}
                    >
                      {STATUTS.map((s) => {
                        const actif = s === facture.statut;
                        return (
                          <button
                            key={s}
                            type="button"
                            role="menuitem"
                            aria-current={actif || undefined}
                            onClick={() => {
                              if (!actif) onChangerStatut(s);
                              setMenuOuvert(false);
                              setSousMenuOuvert(false);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[#F1F3F5] focus:outline-none focus-visible:ring-2"
                            style={{ color: actif ? C.primary : C.textPrimary, fontWeight: actif ? 600 : 400 }}
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div style={{ borderTop: `1px solid ${C.border}` }} />

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOuvert(false);
                    setSousMenuOuvert(false);
                    onDelete();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[#F1F3F5] focus:outline-none focus-visible:ring-2"
                  style={{ color: C.error }}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  Supprimer
                </button>
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

function BoutonAction({ label, icon: Icon, couleur = C.textSecondary, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded-lg p-1.5 transition-colors focus:outline-none focus-visible:ring-2"
      style={{ color: couleur }}
    >
      <Icon size={16} aria-hidden="true" />
    </button>
  );
}

function EtatVide({ onReset }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <div
        className="flex h-12 w-12 items-center justify-center rounded-full"
        style={{ backgroundColor: C.bgMain, color: C.textSecondary }}
      >
        <SearchX size={24} aria-hidden="true" />
      </div>
      <p className="text-base font-semibold" style={{ color: C.textPrimary }}>
        Aucune facture ne correspond à vos filtres
      </p>
      <p className="text-sm" style={{ color: C.textSecondary }}>
        Essayez d'élargir la recherche ou de réinitialiser les filtres.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mt-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2"
        style={{ color: C.primary, backgroundColor: "rgba(45,91,127,0.08)" }}
      >
        Réinitialiser les filtres
      </button>
    </div>
  );
}
