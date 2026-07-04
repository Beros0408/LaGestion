import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, MoreHorizontal, Pencil, Trash2, ArrowRightLeft, Calendar, User } from "lucide-react";
import { C, euro } from "../theme";
import { useOpportunites } from "../context/OpportunitesContext.jsx";
import { useClients } from "../context/ClientsContext.jsx";
import { ETAPES } from "../data/opportunites";

const ETAPE_STYLE = {
  Qualification: { couleur: C.info,      bg: "rgba(52,152,219,0.12)" },
  Proposition:   { couleur: C.primary,   bg: "rgba(45,91,127,0.10)" },
  "Négociation": { couleur: C.accent,    bg: "rgba(244,162,97,0.15)" },
  Conclusion:    { couleur: C.success,   bg: "rgba(39,174,96,0.12)" },
};

function couleurProbabilite(p) {
  if (p >= 75) return { couleur: C.success, bg: "rgba(39,174,96,0.12)" };
  if (p >= 50) return { couleur: C.warning, bg: "rgba(243,156,18,0.12)" };
  return { couleur: C.textSecondary, bg: "rgba(99,110,114,0.12)" };
}

function formaterDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function Opportunites() {
  const navigate = useNavigate();
  const { opportunites, deleteOpportunite, moveOpportunite } = useOpportunites();
  const { clients } = useClients();

  const clientsParId = useMemo(() => {
    const map = new Map();
    clients.forEach((c) => map.set(c.id, c));
    return map;
  }, [clients]);

  const parEtape = useMemo(() => {
    const map = Object.fromEntries(ETAPES.map((e) => [e, []]));
    opportunites.forEach((o) => {
      if (map[o.etape]) map[o.etape].push(o);
    });
    ETAPES.forEach((e) => {
      map[e].sort((a, b) => new Date(a.dateCloture) - new Date(b.dateCloture));
    });
    return map;
  }, [opportunites]);

  const totaux = useMemo(() => {
    const total = opportunites.length;
    const pondere = opportunites.reduce((s, o) => s + o.montant * (o.probabilite / 100), 0);
    return { total, pondere };
  }, [opportunites]);

  const [colonneSurvolee, setColonneSurvolee] = useState(null);
  const [menuOuvert, setMenuOuvert] = useState(null);
  const [sousMenuOuvert, setSousMenuOuvert] = useState(false);

  const handleDrop = (etape, id) => {
    if (!id) return;
    moveOpportunite(Number(id), etape);
    setColonneSurvolee(null);
  };

  const handleDelete = (op) => {
    const ok = window.confirm(`Supprimer définitivement « ${op.nom} » ? Cette action est irréversible.`);
    if (!ok) return;
    deleteOpportunite(op.id);
  };

  const fermerMenu = () => {
    setMenuOuvert(null);
    setSousMenuOuvert(false);
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            className="text-[28px] font-semibold leading-tight"
            style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}
          >
            Opportunités
          </h2>
          <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>
            {totaux.total} {totaux.total > 1 ? "opportunités" : "opportunité"} · CA prévisionnel pondéré{" "}
            <span className="font-semibold tabular-nums" style={{ color: C.textPrimary }}>
              {euro(totaux.pondere)}
            </span>
          </p>
        </div>
        <Link
          to="/opportunites/nouvelle"
          className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2"
          style={{ backgroundColor: C.primary }}
        >
          <Plus size={16} aria-hidden="true" />
          Nouvelle opportunité
        </Link>
      </div>

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}
      >
        {ETAPES.map((etape) => {
          const items = parEtape[etape];
          const montantTotal = items.reduce((s, o) => s + o.montant, 0);
          const montantPondere = items.reduce((s, o) => s + o.montant * (o.probabilite / 100), 0);
          const style = ETAPE_STYLE[etape];
          const estSurvolee = colonneSurvolee === etape;
          return (
            <section
              key={etape}
              onDragOver={(e) => {
                e.preventDefault();
                if (colonneSurvolee !== etape) setColonneSurvolee(etape);
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget)) return;
                setColonneSurvolee((prev) => (prev === etape ? null : prev));
              }}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                handleDrop(etape, id);
              }}
              className="flex flex-col rounded-2xl p-3 transition-colors"
              style={{
                backgroundColor: C.bgCard,
                border: `1px solid ${estSurvolee ? style.couleur : C.border}`,
                boxShadow: "0 1px 3px rgba(45,52,54,0.06)",
              }}
              aria-label={`Colonne ${etape}`}
            >
              <header className="mb-3 flex items-start justify-between gap-2 px-1">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{ color: style.couleur, backgroundColor: style.bg }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ backgroundColor: style.couleur }}
                        aria-hidden="true"
                      />
                      {etape}
                    </span>
                    <span
                      className="text-xs font-semibold tabular-nums"
                      style={{ color: C.textSecondary }}
                      aria-label={`${items.length} opportunités dans ${etape}`}
                    >
                      {items.length}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs tabular-nums" style={{ color: C.textSecondary }}>
                    <span className="font-semibold" style={{ color: C.textPrimary }}>
                      {euro(montantTotal)}
                    </span>
                    <span className="mx-1">·</span>
                    Pondéré {euro(montantPondere)}
                  </p>
                </div>
              </header>

              <div className="flex flex-col gap-2.5">
                {items.length === 0 ? (
                  <div
                    className="rounded-xl border border-dashed py-8 text-center text-xs"
                    style={{ borderColor: C.border, color: C.textSecondary }}
                  >
                    Aucune opportunité
                  </div>
                ) : (
                  items.map((op) => (
                    <CarteOpportunite
                      key={op.id}
                      op={op}
                      client={clientsParId.get(op.clientId)}
                      etapeActuelle={etape}
                      menuOuvert={menuOuvert === op.id}
                      sousMenuOuvert={sousMenuOuvert}
                      onOuvrirMenu={() => {
                        setMenuOuvert(op.id);
                        setSousMenuOuvert(false);
                      }}
                      onFermerMenu={fermerMenu}
                      onOuvrirSousMenu={() => setSousMenuOuvert(true)}
                      onEdit={() => navigate(`/opportunites/${op.id}/modifier`)}
                      onDelete={() => handleDelete(op)}
                      onMove={(nouvelleEtape) => {
                        moveOpportunite(op.id, nouvelleEtape);
                        fermerMenu();
                      }}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function CarteOpportunite({
  op,
  client,
  etapeActuelle,
  menuOuvert,
  sousMenuOuvert,
  onOuvrirMenu,
  onFermerMenu,
  onOuvrirSousMenu,
  onEdit,
  onDelete,
  onMove,
}) {
  const proba = couleurProbabilite(op.probabilite);
  const conteneurMenuRef = useRef(null);
  const boutonMenuRef = useRef(null);

  useEffect(() => {
    if (!menuOuvert) return;
    const onClickExterieur = (e) => {
      if (!conteneurMenuRef.current) return;
      if (!conteneurMenuRef.current.contains(e.target)) onFermerMenu();
    };
    const onEchap = (e) => {
      if (e.key === "Escape") {
        onFermerMenu();
        boutonMenuRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onClickExterieur);
    document.addEventListener("keydown", onEchap);
    return () => {
      document.removeEventListener("mousedown", onClickExterieur);
      document.removeEventListener("keydown", onEchap);
    };
  }, [menuOuvert, onFermerMenu]);

  const autresEtapes = ETAPES.filter((e) => e !== etapeActuelle);

  return (
    <article
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(op.id));
      }}
      className="group relative rounded-xl p-3 transition-all"
      style={{
        backgroundColor: C.bgCard,
        border: `1px solid ${C.border}`,
        boxShadow: "0 1px 2px rgba(45,52,54,0.04)",
        cursor: "grab",
      }}
      aria-label={`Opportunité ${op.nom}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-semibold"
            style={{ color: C.textPrimary }}
            title={op.nom}
          >
            {op.nom}
          </p>
          <p className="mt-0.5 truncate text-xs" style={{ color: C.textSecondary }}>
            {client?.nom ?? "Client inconnu"}
          </p>
        </div>

        <div ref={conteneurMenuRef} className="relative shrink-0">
          <button
            ref={boutonMenuRef}
            type="button"
            aria-label={`Ouvrir le menu de l'opportunité ${op.nom}`}
            aria-haspopup="menu"
            aria-expanded={menuOuvert}
            onClick={(e) => {
              e.stopPropagation();
              if (menuOuvert) onFermerMenu();
              else onOuvrirMenu();
            }}
            className="rounded-lg p-1.5 transition-colors focus:outline-none focus-visible:ring-2"
            style={{ color: C.textSecondary }}
          >
            <MoreHorizontal size={16} aria-hidden="true" />
          </button>

          {menuOuvert && (
            <div
              role="menu"
              aria-label={`Actions pour ${op.nom}`}
              className="absolute right-0 top-8 z-20 w-48 overflow-hidden rounded-xl"
              style={{
                backgroundColor: C.bgCard,
                border: `1px solid ${C.border}`,
                boxShadow: "0 12px 28px rgba(45,52,54,0.10)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                role="menuitem"
                onClick={onEdit}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[#F1F3F5] focus:outline-none focus-visible:ring-2"
                style={{ color: C.textPrimary }}
              >
                <Pencil size={14} aria-hidden="true" />
                Modifier
              </button>

              <div
                className="relative"
                onMouseEnter={onOuvrirSousMenu}
              >
                <button
                  type="button"
                  role="menuitem"
                  aria-haspopup="menu"
                  aria-expanded={sousMenuOuvert}
                  onClick={onOuvrirSousMenu}
                  onFocus={onOuvrirSousMenu}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[#F1F3F5] focus:outline-none focus-visible:ring-2"
                  style={{ color: C.textPrimary }}
                >
                  <span className="flex items-center gap-2">
                    <ArrowRightLeft size={14} aria-hidden="true" />
                    Déplacer vers…
                  </span>
                  <span aria-hidden="true" style={{ color: C.textSecondary }}>›</span>
                </button>

                {sousMenuOuvert && (
                  <div
                    role="menu"
                    aria-label="Choisir une étape de destination"
                    className="absolute right-full top-0 mr-1 w-44 overflow-hidden rounded-xl"
                    style={{
                      backgroundColor: C.bgCard,
                      border: `1px solid ${C.border}`,
                      boxShadow: "0 12px 28px rgba(45,52,54,0.10)",
                    }}
                  >
                    {autresEtapes.map((e) => (
                      <button
                        key={e}
                        type="button"
                        role="menuitem"
                        onClick={() => onMove(e)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-[#F1F3F5] focus:outline-none focus-visible:ring-2"
                        style={{ color: C.textPrimary }}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: ETAPE_STYLE[e].couleur }}
                          aria-hidden="true"
                        />
                        {e}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ borderTop: `1px solid ${C.border}` }} />

              <button
                type="button"
                role="menuitem"
                onClick={onDelete}
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

      <div className="mt-3 flex items-center justify-between gap-2">
        <span
          className="text-sm font-semibold tabular-nums"
          style={{ color: C.textPrimary }}
        >
          {euro(op.montant)}
        </span>
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
          style={{ color: proba.couleur, backgroundColor: proba.bg }}
          aria-label={`Probabilité ${op.probabilite} pour cent`}
        >
          {op.probabilite}%
        </span>
      </div>

      <div
        className="mt-2 flex items-center justify-between gap-2 text-[11px]"
        style={{ color: C.textSecondary }}
      >
        <span className="inline-flex items-center gap-1 tabular-nums">
          <Calendar size={12} aria-hidden="true" />
          {formaterDate(op.dateCloture)}
        </span>
        <span className="inline-flex min-w-0 items-center gap-1 truncate">
          <User size={12} aria-hidden="true" />
          <span className="truncate" title={op.responsable}>{op.responsable}</span>
        </span>
      </div>
    </article>
  );
}
