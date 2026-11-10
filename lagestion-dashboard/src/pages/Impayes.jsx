import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Send, AlertCircle } from "lucide-react";
import { BORDURE_CARTE, C, alpha, euroCentimes, couleurEtat } from "../theme";
import { useFactures } from "../context/FacturesContext.jsx";
import { useClients } from "../context/ClientsContext.jsx";
import { useEntreprise } from "../context/EntrepriseContext.jsx";
import { LIBELLE_TYPE, libelleNumero } from "../data/factures";
import { LIBELLE_NIVEAU, derniereRelance, niveauPropose, peutRelancer } from "../data/relances";
import { estImpayee, etatEcheance, joursDeRetard, jourParis, resteAPayer } from "../utils/facture";
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
  const [filtre, setFiltre] = useState("echues");
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

  // Lignes communes au tableau et aux cartes : même tri, mêmes filtres, mêmes droits de relance.
  const lignes = useMemo(
    () => visibles.map((f) => {
      const echeance = etatEcheance(f, jour);
      return {
        f,
        echeance,
        derniere: derniereRelance(f),
        relancable: peutEcrire && peutRelancer(f, jour),
        niveau: niveauPropose(f, role),
        lisere: echeance === "en_retard" ? { boxShadow: `inset 4px 0 0 ${couleurEtat("en_retard").trait}` } : undefined,
      };
    }),
    [visibles, jour, peutEcrire, role]
  );

  // Totaux de l'en-tête : filtre client seul, pour que l'onglet ouvert (« Échues ») ne mette pas « À échoir » à zéro.
  const somme = (liste) => liste.reduce((s, f) => s + Math.round(f.reste * 100), 0) / 100;
  const duClient = impayees.filter((f) => client === "tous" || f.client_id === client);
  const totalEchu = somme(duClient.filter((f) => f.retard > 0));
  const totalAEchoir = somme(duClient.filter((f) => f.retard === 0));
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

      <div className="rounded-2xl p-4" style={{ backgroundColor: C.fondCarte, border: BORDURE_CARTE }}>
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

      <div className="mt-5 rounded-2xl" style={{ backgroundColor: C.fondCarte, border: BORDURE_CARTE }}>
        {visibles.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm" style={{ color: C.textSecondary }}>
            {chargement ? "Chargement des impayés…" : "Aucun impayé pour ces filtres."}
          </p>
        ) : (
          <>
            {/* Tableau à partir de 1 280 px (76 px de défilement à 1 024) ; en dessous, cartes. L'un des deux est toujours en display: none. */}
            <div className="relative hidden overflow-x-auto xl:block">
              <table className="w-full text-sm">
                <caption className="sr-only">Factures impayées, de la plus en retard à la plus lointaine</caption>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                    {[["Facture", "left"], ["Client", "left"], ["Échéance", "left"], ["Retard", "left"], ["Reste à payer", "right"], ["Statut", "left"], ["Dernière relance", "left"], ["", "right"]].map(([h, a], i) => (
                      <th key={i} scope="col" className={`px-2 py-2.5 text-xs font-semibold uppercase tracking-wider ${a === "right" ? "text-right" : "text-left"}`} style={{ color: C.textSecondary }}>
                        {h || <span className="sr-only">Actions</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l) => (
                    <tr key={l.f.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                      <td className="whitespace-nowrap px-2 py-3 font-medium tabular-nums" style={l.lisere}>
                        <LienFacture f={l.f} />
                        {l.f.type !== "facture" && <span className="block text-xs font-normal" style={{ color: C.textSecondary }}>{LIBELLE_TYPE[l.f.type]}</span>}
                      </td>
                      <td className="px-2 py-3" style={{ color: C.textSecondary }}>
                        <span className="line-clamp-2 min-w-[7rem] max-w-[12rem]" title={l.f.clientNom}>{l.f.clientNom}</span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-3 tabular-nums" style={{ color: C.textSecondary }}>{date(l.f.date_echeance)}</td>
                      <td className="whitespace-nowrap px-2 py-3 tabular-nums"><Retard l={l} /></td>
                      <td className="whitespace-nowrap px-2 py-3 text-right font-semibold tabular-nums" style={{ color: C.textPrimary }}>
                        {euroCentimes(l.f.reste)}
                        <div className="ml-auto mt-1.5 w-36 text-left"><BarreReglement facture={l.f} /></div>
                      </td>
                      <td className="whitespace-nowrap px-2 py-3"><BadgeStatutFacture statut={l.echeance} type={l.f.type} /></td>
                      <td className="px-2 py-3 text-xs tabular-nums" style={{ color: C.textSecondary }}><DerniereRelance l={l} /></td>
                      <td className="whitespace-nowrap px-2 py-3 text-right">{l.relancable && <BoutonRelancer l={l} onRelancer={setARelancer} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="xl:hidden" aria-label="Factures impayées, de la plus en retard à la plus lointaine">
              {lignes.map((l, i) => (
                <li key={l.f.id} className="px-4 py-4" style={{ ...l.lisere, borderTop: i > 0 ? `1px solid ${C.border}` : undefined }}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium tabular-nums"><LienFacture f={l.f} /></p>
                      {l.f.type !== "facture" && <p className="text-xs" style={{ color: C.textSecondary }}>{LIBELLE_TYPE[l.f.type]}</p>}
                      <p className="mt-0.5 text-sm" style={{ color: C.textSecondary }}>{l.f.clientNom}</p>
                    </div>
                    <BadgeStatutFacture statut={l.echeance} type={l.f.type} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <dt className="text-xs" style={{ color: C.textSecondary }}>Échéance</dt>
                      <dd className="tabular-nums" style={{ color: C.textPrimary }}>{date(l.f.date_echeance)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs" style={{ color: C.textSecondary }}>Retard</dt>
                      <dd className="tabular-nums"><Retard l={l} /></dd>
                    </div>
                    <div>
                      <dt className="text-xs" style={{ color: C.textSecondary }}>Reste à payer</dt>
                      <dd className="font-semibold tabular-nums" style={{ color: C.textPrimary }}>{euroCentimes(l.f.reste)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs" style={{ color: C.textSecondary }}>Dernière relance</dt>
                      <dd className="text-xs tabular-nums" style={{ color: C.textSecondary }}><DerniereRelance l={l} /></dd>
                    </div>
                  </dl>
                  <div className="mt-3"><BarreReglement facture={l.f} /></div>
                  {l.relancable && <div className="mt-3"><BoutonRelancer l={l} onRelancer={setARelancer} /></div>}
                </li>
              ))}
            </ul>
          </>
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

function LienFacture({ f }) {
  return (
    <Link to={`/factures/${f.id}`} className="whitespace-nowrap rounded underline focus:outline-none focus-visible:ring-2" style={{ color: C.primary }}>
      {libelleNumero(f)}
    </Link>
  );
}

function Retard({ l }) {
  if (l.echeance === "en_retard") return <span style={{ color: C.errorText }}>{l.f.retard} j</span>;
  if (l.echeance === "echeance_aujourdhui") return <span className="font-medium" style={{ color: C.textPrimary }}>Aujourd'hui</span>;
  return <span style={{ color: C.textSecondary }}>—</span>;
}

function DerniereRelance({ l }) {
  if (!l.derniere) return "—";
  return (
    <>
      <span className="block whitespace-nowrap">{LIBELLE_NIVEAU[l.derniere.niveau]}</span>
      <span className="block whitespace-nowrap">{date(l.derniere.created_at)}</span>
    </>
  );
}

// Ouvre la fenêtre existante, niveau proposé présélectionné (niveauPropose, comme FenetreRelance).
function BoutonRelancer({ l, onRelancer }) {
  return (
    <button
      type="button"
      onClick={(e) => onRelancer({ id: l.f.id, element: e.currentTarget })}
      aria-label={`Relancer la facture ${libelleNumero(l.f)}, ${LIBELLE_NIVEAU[l.niveau].toLowerCase()} proposée`}
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none focus-visible:ring-2"
      style={{ color: C.primary, backgroundColor: alpha(C.primary, 0.08) }}
    >
      <Send size={14} aria-hidden="true" />
      Relancer
    </button>
  );
}
