import React, { useState, useMemo, useEffect } from "react";
import {
  Search, Plus, ChevronUp, ChevronDown, ChevronsUpDown,
  ChevronLeft, ChevronRight, Eye, Pencil, Trash2, SearchX,
} from "lucide-react";
import { C } from "../theme";
import { clients as allClients } from "../data/clients";

const STATUTS = {
  actif:    { label: "Actif",    color: C.success,        bg: "rgba(39,174,96,0.12)" },
  prospect: { label: "Prospect", color: C.info,           bg: "rgba(52,152,219,0.12)" },
  inactif:  { label: "Inactif",  color: C.textSecondary,  bg: "rgba(99,110,114,0.12)" },
};

const TYPES = {
  particulier: "Particulier",
  entreprise:  "Entreprise",
};

const STATUT_OPTIONS = [
  { id: "tous",     label: "Tous" },
  { id: "actif",    label: "Actif" },
  { id: "prospect", label: "Prospect" },
  { id: "inactif",  label: "Inactif" },
];

const TYPE_OPTIONS = [
  { id: "tous",        label: "Tous" },
  { id: "particulier", label: "Particulier" },
  { id: "entreprise",  label: "Entreprise" },
];

const COLUMNS = [
  { id: "nom",       label: "Nom",       sortable: true,  align: "left" },
  { id: "type",      label: "Type",      sortable: true,  align: "left" },
  { id: "email",     label: "E-mail",    sortable: true,  align: "left" },
  { id: "telephone", label: "Téléphone", sortable: true,  align: "left" },
  { id: "statut",    label: "Statut",    sortable: true,  align: "left" },
  { id: "tags",      label: "Tags",      sortable: false, align: "left" },
  { id: "score",     label: "Score",     sortable: true,  align: "left" },
  { id: "actions",   label: "",          sortable: false, align: "right" },
];

const PAGE_SIZE = 10;
const AVATAR_PALETTE = [C.primary, C.secondary, C.accent, C.info];

function useDebouncedValue(value, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

function initiales(nom) {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

function couleurAvatar(nom) {
  let h = 0;
  for (let i = 0; i < nom.length; i++) h = (h * 31 + nom.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function couleurScore(score) {
  if (score >= 75) return C.success;
  if (score >= 50) return C.warning;
  return C.error;
}

function libelleScore(score) {
  if (score >= 75) return "Score élevé";
  if (score >= 50) return "Score moyen";
  return "Score faible";
}

export default function Clients() {
  const [requete, setRequete] = useState("");
  const requeteDeb = useDebouncedValue(requete, 250);
  const [statut, setStatut] = useState("tous");
  const [type, setType] = useState("tous");
  const [tri, setTri] = useState({ col: "nom", dir: "asc" });
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState(() => new Set());

  const filtres = useMemo(() => {
    const q = requeteDeb.trim().toLowerCase();
    return allClients.filter((c) => {
      if (statut !== "tous" && c.statut !== statut) return false;
      if (type !== "tous" && c.type !== type) return false;
      if (q) {
        const hay = `${c.nom} ${c.email} ${c.telephone}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [requeteDeb, statut, type]);

  const tries = useMemo(() => {
    const arr = [...filtres];
    arr.sort((a, b) => {
      const av = a[tri.col];
      const bv = b[tri.col];
      let r;
      if (typeof av === "number" && typeof bv === "number") r = av - bv;
      else r = String(av).localeCompare(String(bv), "fr", { sensitivity: "base" });
      return tri.dir === "asc" ? r : -r;
    });
    return arr;
  }, [filtres, tri]);

  useEffect(() => { setPage(1); }, [requeteDeb, statut, type]);

  const total = tries.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageSure = Math.min(page, totalPages);
  const debut = total === 0 ? 0 : (pageSure - 1) * PAGE_SIZE;
  const fin = Math.min(debut + PAGE_SIZE, total);
  const visibles = tries.slice(debut, fin);

  const handleSort = (col) => {
    setTri((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { col, dir: "asc" }
    );
  };

  const toggleSelection = (id) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const tousSurPage = visibles.length > 0 && visibles.every((c) => selection.has(c.id));
  const certainsSurPage = visibles.some((c) => selection.has(c.id));
  const toggleSelectionPage = () => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (tousSurPage) visibles.forEach((c) => next.delete(c.id));
      else visibles.forEach((c) => next.add(c.id));
      return next;
    });
  };

  const reinitialiserFiltres = () => {
    setRequete("");
    setStatut("tous");
    setType("tous");
  };

  return (
    <>
      {/* En-tête de page */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[28px] font-semibold leading-tight" style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}>
            Clients
          </h2>
          <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>
            {allClients.length} {allClients.length > 1 ? "clients enregistrés" : "client enregistré"}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2"
          style={{ backgroundColor: C.primary }}
        >
          <Plus size={16} aria-hidden="true" />
          Nouveau client
        </button>
      </div>

      {/* Barre d'outils */}
      <div className="rounded-2xl p-4" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[220px] flex-1">
            <label htmlFor="recherche-clients" className="mb-1 block text-xs font-medium" style={{ color: C.textSecondary }}>
              Rechercher
            </label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: C.textSecondary }} aria-hidden="true" />
              <input
                id="recherche-clients"
                type="search"
                value={requete}
                onChange={(e) => setRequete(e.target.value)}
                placeholder="Nom, e-mail ou téléphone…"
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

          <FilterGroup
            label="Type"
            options={TYPE_OPTIONS}
            value={type}
            onChange={setType}
            ariaLabel="Filtrer par type"
          />
        </div>
      </div>

      {/* Tableau */}
      <div className="mt-5 overflow-hidden rounded-2xl" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
        {total === 0 ? (
          <EtatVide onReset={reinitialiserFiltres} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Liste des clients filtrés et triés</caption>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    <th scope="col" className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={tousSurPage}
                        ref={(el) => { if (el) el.indeterminate = !tousSurPage && certainsSurPage; }}
                        onChange={toggleSelectionPage}
                        aria-label="Tout sélectionner sur la page"
                        className="h-4 w-4 cursor-pointer rounded focus-visible:ring-2"
                        style={{ accentColor: C.primary }}
                      />
                    </th>
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
                          ) : col.label ? (
                            col.label
                          ) : (
                            <span className="sr-only">Actions</span>
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((c) => (
                    <LigneClient
                      key={c.id}
                      client={c}
                      selected={selection.has(c.id)}
                      onToggle={() => toggleSelection(c.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              style={{ borderTop: `1px solid ${C.border}` }}
            >
              <p className="text-xs tabular-nums" style={{ color: C.textSecondary }} aria-live="polite">
                {debut + 1}–{fin} sur {total}
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={pageSure <= 1}
                  aria-label="Page précédente"
                  className="rounded-lg p-2 transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ color: C.textSecondary }}
                >
                  <ChevronLeft size={16} aria-hidden="true" />
                </button>
                <span className="px-2 text-xs font-medium tabular-nums" style={{ color: C.textPrimary }}>
                  Page {pageSure} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={pageSure >= totalPages}
                  aria-label="Page suivante"
                  className="rounded-lg p-2 transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ color: C.textSecondary }}
                >
                  <ChevronRight size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
          </>
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

function LigneClient({ client, selected, onToggle }) {
  return (
    <tr style={{ borderBottom: `1px solid ${C.border}` }}>
      <td className="px-3 py-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Sélectionner ${client.nom}`}
          className="h-4 w-4 cursor-pointer rounded focus-visible:ring-2"
          style={{ accentColor: C.primary }}
        />
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{ backgroundColor: couleurAvatar(client.nom) }}
            aria-hidden="true"
          >
            {initiales(client.nom)}
          </span>
          <span className="font-medium" style={{ color: C.textPrimary }}>{client.nom}</span>
        </div>
      </td>
      <td className="px-3 py-3" style={{ color: C.textSecondary }}>{TYPES[client.type]}</td>
      <td className="px-3 py-3" style={{ color: C.textSecondary }}>{client.email}</td>
      <td className="px-3 py-3 tabular-nums" style={{ color: C.textSecondary }}>{client.telephone}</td>
      <td className="px-3 py-3"><BadgeStatut statut={client.statut} /></td>
      <td className="px-3 py-3">
        {client.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {client.tags.map((t) => (
              <span
                key={t}
                className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                style={{ color: C.primary, backgroundColor: "rgba(45,91,127,0.08)" }}
              >
                {t}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs" style={{ color: C.textSecondary }}>—</span>
        )}
      </td>
      <td className="px-3 py-3"><CelluleScore score={client.score} /></td>
      <td className="px-3 py-3">
        <div className="flex items-center justify-end gap-1">
          <BoutonAction label={`Voir ${client.nom}`} icon={Eye} />
          <BoutonAction label={`Modifier ${client.nom}`} icon={Pencil} />
          <BoutonAction label={`Supprimer ${client.nom}`} icon={Trash2} couleur={C.error} />
        </div>
      </td>
    </tr>
  );
}

function BadgeStatut({ statut }) {
  const s = STATUTS[statut];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ color: s.color, backgroundColor: s.bg }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} aria-hidden="true" />
      {s.label}
    </span>
  );
}

function CelluleScore({ score }) {
  const couleur = couleurScore(score);
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-1.5 w-14 overflow-hidden rounded-full"
        style={{ backgroundColor: C.bgMain }}
        aria-hidden="true"
      >
        <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: couleur }} />
      </div>
      <span
        className="text-xs font-semibold tabular-nums"
        style={{ color: C.textPrimary }}
        aria-label={`${libelleScore(score)} : ${score} sur 100`}
      >
        {score}
      </span>
    </div>
  );
}

function BoutonAction({ label, icon: Icon, couleur = C.textSecondary }) {
  return (
    <button
      type="button"
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
        Aucun client ne correspond à vos filtres
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
