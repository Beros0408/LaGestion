import React, { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft, Pencil, Phone, Mail, MapPin, FileText,
  Calendar as CalendarIcon, StickyNote,
  CheckCircle2, Clock, AlertTriangle,
} from "lucide-react";
import { C, euro } from "../theme";
import { useClients } from "../context/ClientsContext.jsx";
import { getClientActivity } from "../data/clientActivity";

const AVATAR_PALETTE = [C.primary, C.secondary, C.accent, C.info];

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

const STATUT_CLIENT = {
  actif:    { label: "Actif",    color: C.success,        bg: "rgba(39,174,96,0.12)" },
  prospect: { label: "Prospect", color: C.info,           bg: "rgba(52,152,219,0.12)" },
  inactif:  { label: "Inactif",  color: C.textSecondary,  bg: "rgba(99,110,114,0.12)" },
};

const TYPE_CLIENT = {
  particulier: "Particulier",
  entreprise:  "Entreprise",
};

const STATUT_FACTURE = {
  payee:      { label: "Payée",      color: C.success, bg: "rgba(39,174,96,0.12)",  icon: CheckCircle2 },
  en_attente: { label: "En attente", color: C.info,    bg: "rgba(52,152,219,0.12)", icon: Clock },
  retard:     { label: "En retard",  color: C.error,   bg: "rgba(231,76,60,0.12)",  icon: AlertTriangle },
};

const STATUT_OPP = {
  qualification: { label: "Qualification", color: C.primary,   bg: "rgba(45,91,127,0.12)" },
  proposition:   { label: "Proposition",   color: C.secondary, bg: "rgba(74,155,142,0.12)" },
  negociation:   { label: "Négociation",   color: C.accent,    bg: "rgba(244,162,97,0.18)" },
  conclusion:    { label: "Conclusion",    color: C.success,   bg: "rgba(39,174,96,0.12)" },
};

const TYPE_INTERACTION = {
  appel:   { label: "Appel",   color: C.secondary,     icon: Phone },
  email:   { label: "E-mail",  color: C.info,          icon: Mail },
  reunion: { label: "Réunion", color: C.accent,        icon: CalendarIcon },
  note:    { label: "Note",    color: C.textSecondary, icon: StickyNote },
};

const formatDate = (iso) =>
  new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));

export default function ClientDetail() {
  const { id } = useParams();
  const numericId = Number(id);
  const { clients } = useClients();

  const client = useMemo(
    () => clients.find((c) => c.id === numericId),
    [clients, numericId]
  );

  const activity = useMemo(() => getClientActivity(numericId), [numericId]);

  if (!client) {
    return (
      <div
        className="rounded-2xl p-8 text-center"
        style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}
      >
        <p className="text-base font-semibold" style={{ color: C.textPrimary }}>Client introuvable</p>
        <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>
          Ce client n'existe pas ou a été supprimé.
        </p>
        <Link
          to="/clients"
          className="mt-4 inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
          style={{ color: C.primary, backgroundColor: "rgba(45,91,127,0.08)" }}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Retour à la liste
        </Link>
      </div>
    );
  }

  const scoreCouleur = couleurScore(client.score);

  return (
    <>
      {/* Fil d'Ariane */}
      <nav
        className="mb-4 flex items-center gap-1.5 text-xs"
        aria-label="Fil d'Ariane"
        style={{ color: C.textSecondary }}
      >
        <Link
          to="/clients"
          className="rounded transition-colors hover:underline focus:outline-none focus-visible:ring-2"
          style={{ color: C.textSecondary }}
        >
          Clients
        </Link>
        <span aria-hidden="true">/</span>
        <span className="truncate font-medium" style={{ color: C.textPrimary }}>{client.nom}</span>
      </nav>

      {/* En-tête de la fiche */}
      <div
        className="rounded-2xl p-5"
        style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            <span
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white"
              style={{ backgroundColor: couleurAvatar(client.nom) }}
              aria-hidden="true"
            >
              {initiales(client.nom)}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  className="text-[28px] font-semibold leading-tight"
                  style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}
                >
                  {client.nom}
                </h2>
                <BadgeStatutClient statut={client.statut} />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm" style={{ color: C.textSecondary }}>
                <span>{TYPE_CLIENT[client.type]}</span>
                {client.tags?.length > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="flex flex-wrap gap-1.5">
                      {client.tags.map((t) => (
                        <span
                          key={t}
                          className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                          style={{ color: C.primary, backgroundColor: "rgba(45,91,127,0.08)" }}
                        >
                          {t}
                        </span>
                      ))}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/clients"
              className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
              style={{
                color: C.textSecondary,
                backgroundColor: "transparent",
                border: `1px solid ${C.border}`,
              }}
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Retour à la liste
            </Link>
            <Link
              to={`/clients/${client.id}/modifier`}
              className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2"
              style={{ backgroundColor: C.primary }}
            >
              <Pencil size={16} aria-hidden="true" />
              Modifier
            </Link>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Coordonnee icon={Mail}   label="E-mail"   value={client.email} />
          <Coordonnee icon={Phone}  label="Téléphone" value={client.telephone} />
          <Coordonnee icon={MapPin} label="Adresse"  value={client.adresse} />

          <div>
            <p className="mb-1 text-xs font-medium" style={{ color: C.textSecondary }}>Score client</p>
            <div className="flex items-center gap-2">
              <div
                className="h-1.5 flex-1 overflow-hidden rounded-full"
                style={{ backgroundColor: C.bgMain }}
                aria-hidden="true"
              >
                <div
                  className="h-full rounded-full"
                  style={{ width: `${client.score}%`, backgroundColor: scoreCouleur }}
                />
              </div>
              <span
                className="text-sm font-semibold tabular-nums"
                style={{ color: C.textPrimary }}
                aria-label={`${libelleScore(client.score)} : ${client.score} sur 100`}
              >
                {client.score}
                <span className="text-xs font-normal" style={{ color: C.textSecondary }}> / 100</span>
              </span>
            </div>
            <p className="mt-1 text-xs font-medium" style={{ color: scoreCouleur }}>
              {libelleScore(client.score)}
            </p>
          </div>
        </div>
      </div>

      {/* Corps en 2 colonnes */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Colonne principale */}
        <div className="space-y-5 lg:col-span-2">
          <div className="rounded-2xl p-5" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
            <h3
              className="mb-4 text-base font-semibold"
              style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}
            >
              Historique des interactions
            </h3>
            {activity.interactions.length > 0 ? (
              <ol className="relative">
                {activity.interactions.map((it, idx) => (
                  <InteractionItem
                    key={it.id}
                    interaction={it}
                    dernier={idx === activity.interactions.length - 1}
                  />
                ))}
              </ol>
            ) : (
              <p className="text-sm" style={{ color: C.textSecondary }}>
                Aucune interaction enregistrée pour ce client.
              </p>
            )}
          </div>

          <div className="rounded-2xl p-5" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
            <h3
              className="mb-3 text-base font-semibold"
              style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}
            >
              Notes
            </h3>
            {client.notes ? (
              <p
                className="whitespace-pre-line text-sm leading-relaxed"
                style={{ color: C.textPrimary }}
              >
                {client.notes}
              </p>
            ) : (
              <p className="text-sm" style={{ color: C.textSecondary }}>
                Aucune note pour ce client.
              </p>
            )}
          </div>
        </div>

        {/* Colonne latérale */}
        <div className="space-y-5">
          <CarteListe
            titre="Opportunités liées"
            vide="Aucune opportunité ouverte."
            items={activity.opportunites}
            render={(op) => (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium" style={{ color: C.textPrimary }}>{op.nom}</p>
                  <p className="text-xs font-semibold tabular-nums" style={{ color: C.textSecondary }}>
                    {euro(op.montant)}
                  </p>
                </div>
                <BadgeOpp statut={op.statut} />
              </div>
            )}
          />

          <CarteListe
            titre="Factures liées"
            vide="Aucune facture enregistrée."
            items={activity.factures}
            render={(f) => (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium tabular-nums" style={{ color: C.textPrimary }}>{f.num}</p>
                  <p className="text-xs" style={{ color: C.textSecondary }}>Échéance : {f.echeance}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm font-semibold tabular-nums" style={{ color: C.textPrimary }}>{euro(f.montant)}</span>
                  <BadgeFacture statut={f.statut} />
                </div>
              </div>
            )}
          />

          <CarteListe
            titre="Documents"
            vide="Aucun document associé."
            items={activity.documents}
            render={(d) => (
              <div className="flex items-center gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
                  style={{ color: C.primary, backgroundColor: "rgba(45,91,127,0.08)" }}
                  aria-hidden="true"
                >
                  <FileText size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" style={{ color: C.textPrimary }}>{d.nom}</p>
                  <p className="text-xs" style={{ color: C.textSecondary }}>{d.taille}</p>
                </div>
              </div>
            )}
          />
        </div>
      </div>
    </>
  );
}

function Coordonnee({ icon: Icon, label, value }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-medium" style={{ color: C.textSecondary }}>{label}</p>
      <div className="flex items-center gap-2 text-sm" style={{ color: C.textPrimary }}>
        <Icon size={14} aria-hidden="true" style={{ color: C.textSecondary, flexShrink: 0 }} />
        <span className="truncate">{value || "—"}</span>
      </div>
    </div>
  );
}

function InteractionItem({ interaction, dernier }) {
  const t = TYPE_INTERACTION[interaction.type] ?? TYPE_INTERACTION.note;
  const Icon = t.icon;
  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {!dernier && (
        <span
          className="absolute left-4 top-9 w-px"
          style={{ backgroundColor: C.border, height: "calc(100% - 2.25rem)" }}
          aria-hidden="true"
        />
      )}
      <span
        className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        style={{ color: t.color, backgroundColor: `${t.color}22` }}
        aria-hidden="true"
      >
        <Icon size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="text-sm font-semibold" style={{ color: C.textPrimary }}>
            <span className="sr-only">{t.label} : </span>
            {interaction.titre}
          </p>
          <span className="text-xs tabular-nums" style={{ color: C.textSecondary }}>
            {formatDate(interaction.date)}
          </span>
        </div>
        <p className="mt-1 text-sm leading-snug" style={{ color: C.textSecondary }}>
          {interaction.description}
        </p>
      </div>
    </li>
  );
}

function CarteListe({ titre, vide, items, render }) {
  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
      <h3
        className="mb-3 text-base font-semibold"
        style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}
      >
        {titre}
      </h3>
      {items.length > 0 ? (
        <ul>
          {items.map((item, i) => (
            <li
              key={item.id}
              className="py-2.5 first:pt-0 last:pb-0"
              style={{ borderTop: i === 0 ? "none" : `1px solid ${C.border}` }}
            >
              {render(item)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm" style={{ color: C.textSecondary }}>{vide}</p>
      )}
    </div>
  );
}

function BadgeStatutClient({ statut }) {
  const s = STATUT_CLIENT[statut];
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

function BadgeFacture({ statut }) {
  const s = STATUT_FACTURE[statut];
  const Icon = s.icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ color: s.color, backgroundColor: s.bg }}
    >
      <Icon size={12} aria-hidden="true" />
      {s.label}
    </span>
  );
}

function BadgeOpp({ statut }) {
  const s = STATUT_OPP[statut];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium"
      style={{ color: s.color, backgroundColor: s.bg }}
    >
      {s.label}
    </span>
  );
}
