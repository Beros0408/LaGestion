import React, { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, Phone, Mail, MapPin } from "lucide-react";
import { C } from "../theme";
import { useClients } from "../context/ClientsContext.jsx";

const AVATAR_PALETTE = [C.primary, C.secondary, C.accent, C.info];

function initiales(nom) {
  return (nom || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

function couleurAvatar(nom) {
  const s = nom || "";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
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

function urlComplete(u) {
  if (!u) return null;
  return /^https?:\/\//i.test(u) ? u : `https://${u}`;
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

export default function ClientDetail() {
  const { id } = useParams();
  const { clients, chargement } = useClients();

  const client = useMemo(
    () => clients.find((c) => String(c.id) === String(id)),
    [clients, id]
  );

  if (!client) {
    if (chargement) {
      return (
        <div
          className="rounded-2xl p-8 text-center"
          style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}
          role="status"
          aria-live="polite"
        >
          <p className="text-sm" style={{ color: C.textSecondary }}>Chargement du client…</p>
        </div>
      );
    }
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

  const score = typeof client.score === "number" ? client.score : 0;
  const scoreCouleur = couleurScore(score);

  const infosEntreprise = client.type === "entreprise"
    ? [
        client.siren     && { label: "SIREN", value: client.siren },
        client.siret     && { label: "SIRET", value: client.siret },
        client.tva_intra && { label: "TVA intracommunautaire", value: client.tva_intra },
        client.site_web  && { label: "Site web", value: client.site_web, href: urlComplete(client.site_web) },
      ].filter(Boolean)
    : [];

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
                <span>{TYPE_CLIENT[client.type] ?? client.type}</span>
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
          <Coordonnee icon={Mail}   label="E-mail"    value={client.email} />
          <Coordonnee icon={Phone}  label="Téléphone" value={client.telephone} />
          <Coordonnee icon={MapPin} label="Adresse"   value={client.adresse} />

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
                  style={{ width: `${score}%`, backgroundColor: scoreCouleur }}
                />
              </div>
              <span
                className="text-sm font-semibold tabular-nums"
                style={{ color: C.textPrimary }}
                aria-label={`${libelleScore(score)} : ${score} sur 100`}
              >
                {score}
                <span className="text-xs font-normal" style={{ color: C.textSecondary }}> / 100</span>
              </span>
            </div>
            <p className="mt-1 text-xs font-medium" style={{ color: scoreCouleur }}>
              {libelleScore(score)}
            </p>
          </div>
        </div>
      </div>

      {/* Corps en 2 colonnes */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Colonne principale */}
        <div className="space-y-5 lg:col-span-2">
          <CarteVide titre="Historique des interactions" message="Aucune interaction enregistrée." />

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
          {infosEntreprise.length > 0 && (
            <div className="rounded-2xl p-5" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
              <h3
                className="mb-3 text-base font-semibold"
                style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}
              >
                Informations entreprise
              </h3>
              <dl className="space-y-3">
                {infosEntreprise.map((info) => (
                  <div key={info.label}>
                    <dt className="text-xs font-medium" style={{ color: C.textSecondary }}>{info.label}</dt>
                    <dd className="mt-0.5 truncate text-sm" style={{ color: C.textPrimary }}>
                      {info.href ? (
                        <a
                          href={info.href}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded focus:outline-none focus-visible:ring-2"
                          style={{ color: C.primary }}
                        >
                          {info.value}
                        </a>
                      ) : (
                        <span className="tabular-nums">{info.value}</span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          <CarteVide titre="Opportunités liées" message="Aucune opportunité liée." />
          <CarteVide titre="Factures liées"     message="Aucune facture liée." />
          <CarteVide titre="Documents"          message="Aucun document associé." />
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

function CarteVide({ titre, message }) {
  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
      <h3
        className="mb-3 text-base font-semibold"
        style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}
      >
        {titre}
      </h3>
      <p className="text-sm" style={{ color: C.textSecondary }}>{message}</p>
    </div>
  );
}

function BadgeStatutClient({ statut }) {
  const s = STATUT_CLIENT[statut];
  if (!s) return null;
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
