import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Send, AlertCircle } from "lucide-react";
import { C, alpha, euroCentimes, couleurEtat } from "../theme";
import { useFactures } from "../context/FacturesContext.jsx";
import { useClients } from "../context/ClientsContext.jsx";
import { useEntreprise } from "../context/EntrepriseContext.jsx";
import { LIBELLE_TYPE, libelleNumero } from "../data/factures";
import { LIBELLE_NIVEAU, derniereRelance, niveauSuivant, peutRelancer } from "../data/relances";
import { estImpayee, joursDeRetard, jourParis, resteAPayer, statutCalcule } from "../utils/facture";
import BadgeStatutFacture from "../components/BadgeStatutFacture.jsx";
import BarreReglement from "../components/BarreReglement.jsx";
import FenetreRelance from "../components/FenetreRelance.jsx";
import Select from "../components/form/Select.jsx";

const FILTRES = [
  { id: "tous", label: "Toutes" },
  { id: "echues", label: "Échues" },
  { id: "aechoir", label: "À échoir" },
];

const date = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");

export default function Impayes() {
  const { factures, chargement, erreur } = useFactures();
  const { clients } = useClients();
  const { peutEcrire, entreprise, role } = useEntreprise();
  const jour = useMemo(() => jourParis(), []);
  const [client, setClient] = useState("tous");
  const [filtre, setFiltre] = useState("tous");
  const [aRelancer, setARelancer] = useState(null);

  const clientsParId = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const impayees = useMemo(
    () => factures
      .filter((f) => estImpayee(f))
      .map((f) => ({
        ...f,
        clientNom: f.client_fige?.nom ?? clientsParId.get(f.client_id)?.nom ?? "Client inconnu",
        retard: joursDeRetard(f, jour),
        reste: resteAPayer(f),
      }))
      .sort((a, b) => b.retard - a.retard || (a.date_echeance ?? "").localeCompare(b.date_echeance ?? "")),
    [factures, clientsParId, jour]
  );

  const optionsClients = useMemo(() => {
    const noms = new Map(impayees.map((f) => [f.client_id, f.clientNom]));
    return [
      { value: "tous", label: "Tous les clients" },
      ...[...noms.entries()]
        .sort((a, b) => a[1].localeCompare(b[1], "fr", { sensitivity: "base" }))
        .map(([value, label]) => ({ value, label })),
    ];
  }, [impayees]);

  const visibles = useMemo(
    () => impayees.filter((f) => (client === "tous" || f.client_id === client)
      && (filtre === "tous" || (filtre === "echues" ? f.retard > 0 : f.retard === 0))),
    [impayees, client, filtre]
  );

  const somme = (liste) => liste.reduce((s, f) => s + Math.round(f.reste * 100), 0) / 100;
  const totalEchu = somme(visibles.filter((f) => f.retard > 0));
  const totalAEchoir = somme(visibles.filter((f) => f.retard === 0));
  const relanceOuverte = aRelancer ? factures.find((f) => f.id === aRelancer.id) : null;

  return (
    <>
      <div className="mb-5">
        <h2 className="text-[28px] font-semibold leading-tight" style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}>
          Impayés
        </h2>
        <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>
          {chargement ? "Chargement…" : (
            <>
              Échu <span className="font-semibold tabular-nums" style={{ color: totalEchu > 0 ? C.errorText : C.textPrimary }}>{euroCentimes(totalEchu)}</span>
              <span className="mx-1">·</span>
              À échoir <span className="font-semibold tabular-nums" style={{ color: C.textPrimary }}>{euroCentimes(totalAEchoir)}</span>
            </>
          )}
        </p>
      </div>

      {erreur && (
        <div role="alert" className="mb-4 flex items-start gap-2 rounded-xl p-3 text-sm" style={{ backgroundColor: alpha(C.error, 0.06), color: C.errorText, border: `1px solid ${C.error}` }}>
          <AlertCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>{erreur}</span>
        </div>
      )}

      <div className="rounded-2xl p-4" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
        <div className="flex flex-wrap items-end gap-4">
          <Select label="Client" className="min-w-[220px]" value={client} onChange={(e) => setClient(e.target.value)} options={optionsClients} />
          <div>
            <p className="mb-1 text-xs font-medium" style={{ color: C.textSecondary }}>Échéance</p>
            <div role="group" aria-label="Filtrer par échéance" className="flex flex-wrap items-center gap-1 rounded-xl p-1" style={{ backgroundColor: C.bgMain, border: `1px solid ${C.border}` }}>
              {FILTRES.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setFiltre(o.id)}
                  aria-pressed={filtre === o.id}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2"
                  style={{ color: filtre === o.id ? C.onPrimary : C.textSecondary, backgroundColor: filtre === o.id ? C.primary : "transparent" }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 rounded-2xl" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
        {visibles.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm" style={{ color: C.textSecondary }}>
            {chargement ? "Chargement des impayés…" : "Aucun impayé pour ces filtres."}
          </p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Factures impayées, de la plus en retard à la plus lointaine</caption>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {[["Facture", "left"], ["Client", "left"], ["Échéance", "left"], ["Ancienneté", "left"], ["Reste à payer", "right"], ["Statut", "left"], ["Dernière relance", "left"], ["", "right"]].map(([h, a], i) => (
                    <th key={i} scope="col" className={`px-3 py-2.5 text-xs font-semibold uppercase tracking-wider ${a === "right" ? "text-right" : "text-left"}`} style={{ color: C.textSecondary }}>
                      {h || <span className="sr-only">Actions</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibles.map((f) => {
                  const derniere = derniereRelance(f);
                  const statut = statutCalcule(f, jour);
                  const e = couleurEtat(statut, f.type);
                  return (
                    <tr key={f.id} style={{ borderBottom: `1px solid ${C.border}`, backgroundColor: e.fond }}>
                      <td className="whitespace-nowrap px-3 py-3 font-medium tabular-nums" style={{ boxShadow: `inset 4px 0 0 ${e.trait}`, paddingLeft: 16 }}>
                        <Link to={`/factures/${f.id}`} className="rounded underline focus:outline-none focus-visible:ring-2" style={{ color: C.primary }}>{libelleNumero(f)}</Link>
                        {f.type !== "facture" && <span className="ml-2 text-xs font-normal" style={{ color: C.textSecondary }}>{LIBELLE_TYPE[f.type]}</span>}
                      </td>
                      <td className="px-3 py-3" style={{ color: C.textSecondary }}>{f.clientNom}</td>
                      <td className="whitespace-nowrap px-3 py-3 tabular-nums" style={{ color: C.textSecondary }}>{date(f.date_echeance)}</td>
                      <td className="whitespace-nowrap px-3 py-3" style={{ color: f.retard > 0 ? C.errorText : C.textSecondary }}>
                        {f.retard > 0 ? `${f.retard} j de retard` : "À échoir"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-semibold tabular-nums" style={{ color: C.textPrimary }}>
                        {euroCentimes(f.reste)}
                        <div className="font-normal"><BarreReglement facture={f} statut={statut} /></div>
                      </td>
                      <td className="px-3 py-3"><BadgeStatutFacture statut={statut} type={f.type} /></td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs" style={{ color: C.textSecondary }}>
                        {derniere ? `${LIBELLE_NIVEAU[derniere.niveau]}, ${date(derniere.created_at)}` : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right">
                        {peutEcrire && peutRelancer(f, jour) && (
                          <button
                            type="button"
                            onClick={(e) => setARelancer({ id: f.id, element: e.currentTarget })}
                            aria-label={`Préparer une relance pour ${libelleNumero(f)} : ${LIBELLE_NIVEAU[niveauSuivant(f)]}`}
                            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none focus-visible:ring-2"
                            style={{ color: C.primary, backgroundColor: alpha(C.primary, 0.08) }}
                          >
                            <Send size={14} aria-hidden="true" />
                            {LIBELLE_NIVEAU[niveauSuivant(f)]}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {relanceOuverte && (
        <FenetreRelance
          facture={relanceOuverte}
          client={clientsParId.get(relanceOuverte.client_id)}
          entreprise={entreprise}
          role={role}
          elementRetour={aRelancer.element}
          onFermer={() => setARelancer(null)}
        />
      )}
    </>
  );
}
