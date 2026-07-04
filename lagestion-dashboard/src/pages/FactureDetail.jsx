import React, { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, Mail, Phone, MapPin } from "lucide-react";
import { C, euro } from "../theme";
import { useFactures } from "../context/FacturesContext.jsx";
import { useClients } from "../context/ClientsContext.jsx";
import { ligneHT, totalHT, tvaParTaux, totalTTC } from "../utils/facture";
import BadgeStatutFacture from "../components/BadgeStatutFacture.jsx";

function formaterDateLongue(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

export default function FactureDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { factures } = useFactures();
  const { clients } = useClients();

  const idNumerique = Number(id);
  const facture = useMemo(
    () => factures.find((f) => f.id === idNumerique),
    [factures, idNumerique]
  );
  const client = useMemo(
    () => (facture ? clients.find((c) => c.id === facture.clientId) : null),
    [clients, facture]
  );

  const recap = useMemo(() => {
    if (!facture) return null;
    return {
      ht: totalHT(facture),
      tvaDetail: tvaParTaux(facture),
      ttc: totalTTC(facture),
    };
  }, [facture]);

  if (!facture) {
    return (
      <div
        className="rounded-2xl p-8 text-center"
        style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}
      >
        <p className="text-sm" style={{ color: C.textSecondary }}>Facture introuvable.</p>
        <button
          type="button"
          onClick={() => navigate("/factures")}
          className="mt-4 rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
          style={{ color: C.primary, backgroundColor: "rgba(45,91,127,0.08)" }}
        >
          Retour à la liste
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3">
            <h2
              className="text-[28px] font-semibold leading-tight tabular-nums"
              style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}
            >
              {facture.numero}
            </h2>
            <BadgeStatutFacture statut={facture.statut} />
          </div>
          <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>
            Émise le {formaterDateLongue(facture.dateEmission)} · Échéance le {formaterDateLongue(facture.dateEcheance)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/factures"
            className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
            style={{ color: C.textSecondary, backgroundColor: "transparent", border: `1px solid ${C.border}` }}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            Retour à la liste
          </Link>
          <Link
            to={`/factures/${facture.id}/modifier`}
            className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2"
            style={{ backgroundColor: C.primary }}
          >
            <Pencil size={16} aria-hidden="true" />
            Modifier
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="rounded-2xl p-5 xl:col-span-2" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
          <h3 className="mb-3" style={{ color: C.textPrimary, fontSize: 18, fontWeight: 600 }}>Lignes</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  <th scope="col" className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: C.textSecondary }}>Description</th>
                  <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: C.textSecondary }}>Quantité</th>
                  <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: C.textSecondary }}>Prix U. HT</th>
                  <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: C.textSecondary }}>TVA</th>
                  <th scope="col" className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: C.textSecondary }}>Total HT</th>
                </tr>
              </thead>
              <tbody>
                {facture.lignes.map((l, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td className="px-3 py-3" style={{ color: C.textPrimary }}>{l.description || "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums" style={{ color: C.textSecondary }}>{l.quantite}</td>
                    <td className="px-3 py-3 text-right tabular-nums" style={{ color: C.textSecondary }}>{euro(l.prixUnitaire)}</td>
                    <td className="px-3 py-3 text-right tabular-nums" style={{ color: C.textSecondary }}>{String(l.tauxTva).replace(".", ",")} %</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums" style={{ color: C.textPrimary }}>{euro(ligneHT(l))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <dt style={{ color: C.textSecondary }}>Total HT</dt>
              <dd className="font-semibold tabular-nums" style={{ color: C.textPrimary }}>{euro(recap.ht)}</dd>
            </div>
            {recap.tvaDetail.length === 0 ? (
              <div className="flex items-center justify-between">
                <dt style={{ color: C.textSecondary }}>TVA</dt>
                <dd className="tabular-nums" style={{ color: C.textSecondary }}>{euro(0)}</dd>
              </div>
            ) : (
              recap.tvaDetail.map((d) => (
                <div key={d.taux} className="flex items-center justify-between">
                  <dt style={{ color: C.textSecondary }}>
                    TVA {String(d.taux).replace(".", ",")} % <span>(base {euro(d.base)})</span>
                  </dt>
                  <dd className="tabular-nums" style={{ color: C.textPrimary }}>{euro(d.tva)}</dd>
                </div>
              ))
            )}
            <div className="flex items-center justify-between pt-2" style={{ borderTop: `1px solid ${C.border}` }}>
              <dt className="font-semibold" style={{ color: C.textPrimary }}>Total TTC</dt>
              <dd className="text-lg font-bold tabular-nums" style={{ color: C.textPrimary }}>{euro(recap.ttc)}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-2xl p-5" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
          <h3 className="mb-3" style={{ color: C.textPrimary, fontSize: 18, fontWeight: 600 }}>Client</h3>
          {client ? (
            <div className="space-y-3">
              <div>
                <Link
                  to={`/clients/${client.id}`}
                  className="text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2"
                  style={{ color: C.primary }}
                >
                  {client.nom}
                </Link>
                <p className="text-xs" style={{ color: C.textSecondary }}>
                  {client.type === "entreprise" ? "Entreprise" : "Particulier"}
                </p>
              </div>
              {client.email && (
                <p className="flex items-center gap-2 text-sm" style={{ color: C.textSecondary }}>
                  <Mail size={14} aria-hidden="true" />
                  <span className="truncate">{client.email}</span>
                </p>
              )}
              {client.telephone && (
                <p className="flex items-center gap-2 text-sm tabular-nums" style={{ color: C.textSecondary }}>
                  <Phone size={14} aria-hidden="true" />
                  {client.telephone}
                </p>
              )}
              {client.adresse && (
                <p className="flex items-start gap-2 text-sm" style={{ color: C.textSecondary }}>
                  <MapPin size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
                  <span>{client.adresse}</span>
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm" style={{ color: C.textSecondary }}>Client introuvable.</p>
          )}
        </div>
      </div>
    </>
  );
}
