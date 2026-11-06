import React, { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Mail, Phone, MapPin, ChevronDown, ExternalLink } from "lucide-react";
import { C, OMBRE, alpha, euroCentimes } from "../../theme";
import { ligneHT } from "../../utils/facture";

// Briques communes aux fiches facture et devis.

export function BoutonSecondaire({ onClick, ariaLabel, icon: Icon, children, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
      style={{ color: C.textSecondary, backgroundColor: "transparent", border: `1px solid ${C.border}` }}
    >
      <Icon size={16} aria-hidden="true" />
      {children}
    </button>
  );
}

export function MenuStatut({ badge, ariaLabel, statutActuel, options, ouvert, onOuvrir, onFermer, onSelectionner, disabled }) {
  const conteneurRef = useRef(null);
  const boutonRef = useRef(null);

  useEffect(() => {
    if (!ouvert) return;
    const onClickExterieur = (e) => {
      if (!conteneurRef.current) return;
      if (!conteneurRef.current.contains(e.target)) onFermer();
    };
    const onEchap = (e) => {
      if (e.key === "Escape") {
        onFermer();
        boutonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onClickExterieur);
    document.addEventListener("keydown", onEchap);
    return () => {
      document.removeEventListener("mousedown", onClickExterieur);
      document.removeEventListener("keydown", onEchap);
    };
  }, [ouvert, onFermer]);

  return (
    <div ref={conteneurRef} className="relative">
      <button
        ref={boutonRef}
        type="button"
        onClick={onOuvrir}
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-label={ariaLabel}
        disabled={disabled}
        className="inline-flex items-center gap-1 rounded-full focus:outline-none focus-visible:ring-2 disabled:opacity-60"
      >
        {badge}
        <ChevronDown size={14} aria-hidden="true" style={{ color: C.textSecondary }} />
      </button>
      {ouvert && (
        <div
          role="menu"
          aria-label="Choisir un statut"
          className="absolute left-0 top-9 z-20 w-56 overflow-hidden rounded-xl"
          style={{
            backgroundColor: C.bgCard,
            border: `1px solid ${C.border}`,
            boxShadow: OMBRE.lg,
          }}
        >
          {options.map(({ value: s, label }) => {
            const actif = s === statutActuel;
            return (
              <button
                key={s}
                type="button"
                role="menuitem"
                aria-current={actif || undefined}
                onClick={() => onSelectionner(s)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-lg-hover focus:outline-none focus-visible:ring-2"
                style={{ color: actif ? C.primary : C.textPrimary, fontWeight: actif ? 600 : 400 }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// negatif : montants de ligne affichés en négatif (avoir).
export function CarteLignes({ lignes, legende, negatif = false }) {
  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
      <h3 className="mb-3" style={{ color: C.textPrimary, fontSize: 18, fontWeight: 600 }}>Lignes d'articles</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">{legende}</caption>
          <thead>
            <tr style={{ borderBottom: `1px solid ${C.border}` }}>
              <th scope="col" className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: C.textSecondary }}>Description</th>
              <th scope="col" className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: C.textSecondary }}>Référence</th>
              <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: C.textSecondary }}>Qté</th>
              <th scope="col" className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: C.textSecondary }}>Unité</th>
              <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: C.textSecondary }}>Prix U. HT</th>
              <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: C.textSecondary }}>Remise</th>
              <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: C.textSecondary }}>TVA</th>
              <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: C.textSecondary }}>Total HT</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l, i) => (
              <tr key={l.id ?? i} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td className="px-3 py-3" style={{ color: C.textPrimary }}>{l.description || "—"}</td>
                <td className="px-3 py-3 text-xs" style={{ color: C.textSecondary }}>{l.reference || "—"}</td>
                <td className="px-3 py-3 text-right tabular-nums" style={{ color: C.textSecondary }}>{l.quantite}</td>
                <td className="px-3 py-3 text-xs" style={{ color: C.textSecondary }}>{l.unite || "—"}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums" style={{ color: C.textSecondary }}>{euroCentimes(l.prix_unitaire)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums" style={{ color: C.textSecondary }}>
                  {Number(l.remise) > 0 ? `− ${euroCentimes(l.remise)}` : "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums" style={{ color: C.textSecondary }}>{String(l.taux_tva).replace(".", ",")} %</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums" style={{ color: C.textPrimary }}>{euroCentimes(negatif && ligneHT(l) !== 0 ? -ligneHT(l) : ligneHT(l))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// children : lignes supplémentaires du résumé (ex. paiements de la facture).
export function CarteResume({ recap, children }) {
  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
      <h3 className="mb-3" style={{ color: C.textPrimary, fontSize: 18, fontWeight: 600 }}>Résumé financier</h3>
      <dl className="space-y-2 text-sm">
        {recap.remise !== 0 && (
          <>
            <div className="flex items-center justify-between">
              <dt style={{ color: C.textSecondary }}>Total HT brut</dt>
              <dd className="tabular-nums" style={{ color: C.textPrimary }}>{euroCentimes(recap.htBrut)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt style={{ color: C.textSecondary }}>Remise globale</dt>
              <dd className="tabular-nums" style={{ color: C.textPrimary }}>{recap.remise > 0 ? "−" : "+"} {euroCentimes(Math.abs(recap.remise))}</dd>
            </div>
          </>
        )}
        <div className="flex items-center justify-between">
          <dt style={{ color: C.textSecondary }}>{recap.remise !== 0 ? "Total HT net" : "Total HT"}</dt>
          <dd className="font-semibold tabular-nums" style={{ color: C.textPrimary }}>{euroCentimes(recap.ht)}</dd>
        </div>
        {recap.tvaDetail.length === 0 ? (
          <div className="flex items-center justify-between">
            <dt style={{ color: C.textSecondary }}>TVA</dt>
            <dd className="tabular-nums" style={{ color: C.textSecondary }}>{euroCentimes(0)}</dd>
          </div>
        ) : (
          recap.tvaDetail.map((d) => (
            <div key={d.taux} className="flex items-center justify-between">
              <dt style={{ color: C.textSecondary }}>
                TVA {String(d.taux).replace(".", ",")} % <span>(base {euroCentimes(d.base)})</span>
              </dt>
              <dd className="tabular-nums" style={{ color: C.textPrimary }}>{euroCentimes(d.tva)}</dd>
            </div>
          ))
        )}
        <div className="flex items-center justify-between pt-2" style={{ borderTop: `1px solid ${C.border}` }}>
          <dt className="font-semibold" style={{ color: C.textPrimary }}>Total TTC</dt>
          <dd className="text-lg font-bold tabular-nums" style={{ color: C.textPrimary }}>{euroCentimes(recap.ttc)}</dd>
        </div>
        {children}
      </dl>
    </div>
  );
}

export function CarteClient({ client, chargement, messageAbsent = "Client introuvable." }) {
  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
      <h3 className="mb-3" style={{ color: C.textPrimary, fontSize: 18, fontWeight: 600 }}>Client</h3>
      {client ? (
        <div className="space-y-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: C.textPrimary }}>
              {client.nom}
            </p>
            <p className="text-xs" style={{ color: C.textSecondary }}>
              {client.type === "entreprise" ? "Entreprise" : "Particulier"}
            </p>
          </div>

          {client.type === "entreprise" && (client.siren || client.tva_intra) && (
            <dl className="space-y-1 text-xs">
              {client.siren && (
                <div className="flex items-baseline justify-between gap-2">
                  <dt style={{ color: C.textSecondary }}>SIREN</dt>
                  <dd className="tabular-nums" style={{ color: C.textPrimary }}>{client.siren}</dd>
                </div>
              )}
              {client.tva_intra && (
                <div className="flex items-baseline justify-between gap-2">
                  <dt style={{ color: C.textSecondary }}>TVA intracom.</dt>
                  <dd className="truncate tabular-nums" style={{ color: C.textPrimary }}>{client.tva_intra}</dd>
                </div>
              )}
            </dl>
          )}

          {client.adresse && (
            <p className="flex items-start gap-2 text-sm" style={{ color: C.textSecondary }}>
              <MapPin size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
              <span>{client.adresse}</span>
            </p>
          )}
          {client.telephone && (
            <p className="flex items-center gap-2 text-sm tabular-nums" style={{ color: C.textSecondary }}>
              <Phone size={14} aria-hidden="true" />
              {client.telephone}
            </p>
          )}
          {client.email && (
            <p className="flex items-center gap-2 text-sm" style={{ color: C.textSecondary }}>
              <Mail size={14} aria-hidden="true" />
              <span className="truncate">{client.email}</span>
            </p>
          )}

          {client.id && (
            <Link
              to={`/clients/${client.id}`}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2"
              style={{ color: C.primary, backgroundColor: alpha(C.primary, 0.08) }}
              aria-label={`Voir la fiche de ${client.nom}`}
            >
              <ExternalLink size={12} aria-hidden="true" />
              Voir la fiche client
            </Link>
          )}
        </div>
      ) : chargement ? (
        <p className="text-sm" role="status" aria-live="polite" style={{ color: C.textSecondary }}>
          Chargement du client…
        </p>
      ) : (
        <p className="text-sm" style={{ color: C.textSecondary }}>{messageAbsent}</p>
      )}
    </div>
  );
}

export function CarteBloc({ titre, contenu, chapeau }) {
  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
      <h3 className="mb-1" style={{ color: C.textPrimary, fontSize: 18, fontWeight: 600 }}>{titre}</h3>
      {chapeau && (
        <p className="mb-2 text-xs" style={{ color: C.textSecondary }}>{chapeau}</p>
      )}
      <p className="whitespace-pre-line text-sm leading-relaxed" style={{ color: C.textPrimary }}>
        {contenu}
      </p>
    </div>
  );
}

export function Panneau({ children, centre }) {
  return (
    <div
      className={`rounded-2xl p-8 ${centre ? "flex flex-col items-center gap-3 text-center" : ""}`}
      style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}
    >
      {children}
    </div>
  );
}

export function Spinner() {
  return (
    <div
      className="h-8 w-8 animate-spin rounded-full border-2"
      style={{ borderColor: C.border, borderTopColor: C.primary }}
      aria-hidden="true"
    />
  );
}
