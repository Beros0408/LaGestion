import React, { useMemo, useRef, useState, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { C, euro, euroCentimes } from "../theme";
import BadgeStatutFacture from "../components/BadgeStatutFacture.jsx";
import TuileKpi from "../components/dashboard/TuileKpi.jsx";
import Bloc, { SqueletteTuile, ChartFallback } from "../components/dashboard/Bloc.jsx";
import ActionsSuggerees from "../components/dashboard/ActionsSuggerees.jsx";
import ActivitesRecentes from "../components/dashboard/ActivitesRecentes.jsx";
import CarteEntonnoir from "../components/dashboard/CarteEntonnoir.jsx";
import OpportunitesPrioritaires from "../components/dashboard/OpportunitesPrioritaires.jsx";
import { couleurSecteur, COULEURS_AGES } from "../components/dashboard/couleurs";
import { useOpportunites } from "../context/OpportunitesContext.jsx";
import { useFactures } from "../context/FacturesContext.jsx";
import { useClients } from "../context/ClientsContext.jsx";
import { useEntreprise } from "../context/EntrepriseContext.jsx";
import { calculerTableauDeBord, aujourdhuiLocal, PERIODES } from "../utils/dashboard";
import { useTaches } from "../context/TachesContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { jourParis } from "../utils/facture";
import { peutChangerStatut, tacheDepuisSuggestion } from "../utils/taches";

const BarresMensuelles = lazy(() => import("../components/charts/BarresMensuelles"));
const DonutSecteurs = lazy(() => import("../components/charts/DonutSecteurs"));
const BarresHorizontales = lazy(() => import("../components/charts/BarresHorizontales"));
const Jauge = lazy(() => import("../components/charts/Jauge"));

const ONGLETS = [
  { cle: "ventes", libelle: "Ventes" },
  { cle: "facturation", libelle: "Facturation" },
  { cle: "pipeline", libelle: "Pipeline" },
];

const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;
const pourcent = (v) => `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
const dateCourte = (iso) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }) : "—");

function Legende({ elements }) {
  return (
    <ul className="mt-3 space-y-1.5">
      {elements.map((e) => (
        <li key={e.nom} className="flex items-center justify-between gap-3 text-sm">
          <span className="flex min-w-0 items-center gap-2" style={{ color: C.textSecondary }}>
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: e.couleur }} aria-hidden="true" />
            <span className="truncate">{e.nom}</span>
          </span>
          <span className="shrink-0 font-semibold tabular-nums" style={{ color: C.textPrimary }}>{e.valeur}</span>
        </li>
      ))}
    </ul>
  );
}

function Graphique({ hauteur, children }) {
  return (
    <div style={{ width: "100%", height: hauteur }}>
      <Suspense fallback={<ChartFallback hauteur={hauteur} />}>{children}</Suspense>
    </div>
  );
}

function BlocJauge({ titre, jauge, couleur, libelle, detail, messageVide, chargement, index }) {
  return (
    <Bloc titre={titre} index={index} chargement={chargement} vide={jauge.taux === null} messageVide={messageVide} hauteur={150}>
      <Suspense fallback={<ChartFallback hauteur={150} />}>
        <Jauge taux={jauge.taux ?? 0} couleur={couleur} libelle={libelle} />
      </Suspense>
      <p className="mt-2 text-center text-xs" style={{ color: C.textSecondary }}>{detail}</p>
    </Bloc>
  );
}

export default function Dashboard() {
  const [periode, setPeriode] = useState("12m");
  const [onglet, setOnglet] = useState("ventes");
  const refsOnglets = useRef([]);
  const { opportunites, chargement: chOpp, erreur: errOpp } = useOpportunites();
  const { factures, chargement: chFac, erreur: errFac } = useFactures();
  const { clients, chargement: chCli, erreur: errCli } = useClients();
  const { entrepriseId, role } = useEntreprise();
  const { taches, addTache } = useTaches();
  const { user } = useAuth();
  const [tacheEnCours, setTacheEnCours] = useState(null);
  const [erreurTache, setErreurTache] = useState(null);

  // Suggestion → tâche en un clic : responsable moi, échéance aujourd'hui ; la base refuse un doublon.
  const creerTache = async (groupe, element) => {
    setErreurTache(null);
    setTacheEnCours(element.id);
    try {
      await addTache(tacheDepuisSuggestion(groupe, element, user?.id, jourParis()));
    } catch (e) {
      setErreurTache(e.message);
    } finally {
      setTacheEnCours(null);
    }
  };
  const chargement = chOpp || chFac || chCli;
  const erreur = errOpp || errFac || errCli;

  const t = useMemo(
    () => calculerTableauDeBord({ factures, clients, opportunites, periode, aujourdhui: aujourdhuiLocal(), role }),
    [factures, clients, opportunites, periode, role]
  );
  const { kpi } = t;
  const libellePeriode = PERIODES.find((p) => p.cle === periode).libelle;

  const clavierOnglets = (e, i) => {
    const pas = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!pas) return;
    e.preventDefault();
    const j = (i + pas + ONGLETS.length) % ONGLETS.length;
    setOnglet(ONGLETS[j].cle);
    refsOnglets.current[j]?.focus();
  };

  return (
    <>
      {/* Période */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" style={{ color: C.textSecondary }}>
          Synthèse de votre activité sur {libellePeriode} (du {dateCourte(t.bornes.debut)} au {dateCourte(t.bornes.fin)}).
        </p>
        <div className="flex items-center gap-1 rounded-xl p-1" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }} role="group" aria-label="Période">
          {PERIODES.map((p) => (
            <button
              key={p.cle}
              type="button"
              onClick={() => setPeriode(p.cle)}
              aria-pressed={periode === p.cle}
              className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2"
              style={{ color: periode === p.cle ? C.onPrimary : C.textSecondary, backgroundColor: periode === p.cle ? C.primary : "transparent" }}
            >
              {p.libelle}
            </button>
          ))}
        </div>
      </div>

      {erreur && (
        <p role="alert" className="mb-4 rounded-xl p-3 text-sm" style={{ color: C.errorText, border: `1px solid ${C.error}` }}>{erreur}</p>
      )}

      {/* Tuiles KPI */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {chargement ? (
          Array.from({ length: 6 }, (_, i) => <SqueletteTuile key={i} />)
        ) : (
          <>
            <TuileKpi index={0} teinte="bleu" titre="CA facturé HT" valeur={euro(kpi.ca.valeur)} variation={kpi.ca.variation} />
            <TuileKpi index={1} teinte="vert" titre="Encaissements" valeur={euro(kpi.encaissements.valeur)} variation={kpi.encaissements.variation} />
            <TuileKpi index={2} teinte="orange" titre="Impayés" valeur={euro(kpi.impayes.montant)} detail={pluriel(kpi.impayes.nombre, "facture")} />
            <TuileKpi index={3} teinte="vertEau" titre="Pipeline pondéré" valeur={euro(kpi.pipelinePondere)} />
            <TuileKpi index={4} teinte="violet" titre="Opportunités en cours" valeur={kpi.opportunitesEnCours.toLocaleString("fr-FR")} />
            <TuileKpi index={5} teinte="bleuNuit" titre="Nouveaux clients" valeur={kpi.nouveauxClients.valeur.toLocaleString("fr-FR")} variation={kpi.nouveauxClients.variation} />
          </>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* Onglets */}
        <div className="min-w-0 xl:col-span-2">
          <div role="tablist" aria-label="Vues du tableau de bord" className="mb-4 flex gap-1 rounded-xl p-1" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, width: "fit-content" }}>
            {ONGLETS.map((o, i) => (
              <button
                key={o.cle}
                ref={(el) => { refsOnglets.current[i] = el; }}
                type="button"
                role="tab"
                id={`onglet-${o.cle}`}
                aria-selected={onglet === o.cle}
                aria-controls={`panneau-${o.cle}`}
                tabIndex={onglet === o.cle ? 0 : -1}
                onClick={() => setOnglet(o.cle)}
                onKeyDown={(e) => clavierOnglets(e, i)}
                className="rounded-lg px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2"
                style={{ color: onglet === o.cle ? C.onPrimary : C.textSecondary, backgroundColor: onglet === o.cle ? C.primary : "transparent" }}
              >
                {o.libelle}
              </button>
            ))}
          </div>

          <div role="tabpanel" id={`panneau-${onglet}`} aria-labelledby={`onglet-${onglet}`} className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {onglet === "ventes" && (
              <>
                <Bloc titre="Facturé et encaissé par mois" className="md:col-span-2" index={1} chargement={chargement}
                  vide={t.vide.encaissements} messageVide="Aucune facture ni aucun encaissement sur la période." hauteur={280}>
                  <Graphique hauteur={280}><BarresMensuelles data={t.mensuel} /></Graphique>
                </Bloc>
                <Bloc titre="CA par secteur" index={2} chargement={chargement} vide={t.secteurs.length === 0} messageVide="Aucune facture sur la période.">
                  <Graphique hauteur={200}><DonutSecteurs data={t.secteurs} /></Graphique>
                  <Legende elements={t.secteurs.map((s, i) => ({ nom: s.nom, couleur: couleurSecteur(s.nom, i), valeur: `${euro(s.montant)} · ${pourcent(s.part)}` }))} />
                </Bloc>
                <Bloc titre="Top 5 des clients" index={3} chargement={chargement} vide={t.topClients.length === 0} messageVide="Aucune facture sur la période.">
                  <Graphique hauteur={Math.max(120, t.topClients.length * 44)}>
                    <BarresHorizontales data={t.topClients} cleLibelle="nom" couleurs={[C.chart2]} />
                  </Graphique>
                </Bloc>
              </>
            )}

            {onglet === "facturation" && (
              <>
                <BlocJauge titre="Taux d'encaissement" index={1} chargement={chargement} jauge={t.jauges.encaissement} couleur={C.chart5}
                  libelle="Taux d'encaissement" messageVide="Aucune facture sur la période."
                  detail={`${euroCentimes(t.jauges.encaissement.paye)} payés sur ${euroCentimes(t.jauges.encaissement.facture)} TTC facturés`} />
                <Bloc titre="Âge des créances" index={2} chargement={chargement} vide={t.vide.creances} messageVide="Aucune facture impayée.">
                  <Graphique hauteur={190}>
                    <BarresHorizontales data={t.ageCreances} cleLibelle="libelle" couleurs={COULEURS_AGES} largeurLibelle={110} />
                  </Graphique>
                </Bloc>
                <Bloc titre="Factures récentes" className="md:col-span-2" index={3} chargement={chargement}
                  vide={t.facturesRecentes.length === 0} messageVide="Aucune facture pour le moment."
                  action={<Link to="/factures" className="flex items-center gap-1 text-xs font-semibold focus:outline-none focus-visible:ring-2" style={{ color: C.primary }}>Voir tout <ArrowRight size={13} aria-hidden="true" /></Link>}>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                          {["Numéro", "Client", "Montant TTC", "Échéance", "Statut"].map((h) => (
                            <th key={h} scope="col" className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: C.textSecondary }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {t.facturesRecentes.map((f) => (
                          <tr key={f.id} className="transition-colors hover:bg-lg-hover" style={{ borderBottom: `1px solid ${C.border}` }}>
                            <td className="px-3 py-3 font-medium tabular-nums">
                              <Link to={`/factures/${f.id}`} className="focus:outline-none focus-visible:ring-2" style={{ color: C.primary }}>{f.numero}</Link>
                            </td>
                            <td className="px-3 py-3" style={{ color: C.textSecondary }}>{f.client}</td>
                            <td className="px-3 py-3 font-semibold tabular-nums" style={{ color: C.textPrimary }}>{euroCentimes(f.montantTTC)}</td>
                            <td className="px-3 py-3" style={{ color: C.textSecondary }}>{dateCourte(f.echeance)}</td>
                            <td className="px-3 py-3"><BadgeStatutFacture statut={f.statut} type={f.type} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Bloc>
              </>
            )}

            {onglet === "pipeline" && (
              <div className="grid grid-cols-1 gap-5 md:col-span-2 xl:grid-cols-2 2xl:grid-cols-5">
                <CarteEntonnoir index={1} className="2xl:col-span-2" chargement={chargement} vide={t.vide.opportunites}
                  entonnoir={t.entonnoir} conclusion={t.jauges.conclusion} valeurMoyenne={t.pipeline.valeurMoyenne} />
                <Bloc titre="Opportunités à conclure en priorité" index={2} className="min-w-0 2xl:col-span-3" chargement={chargement}>
                  <OpportunitesPrioritaires opportunites={t.prioritaires} />
                </Bloc>
              </div>
            )}
          </div>
        </div>

        {/* Colonne latérale */}
        <div className="grid min-w-0 grid-cols-1 content-start gap-5 md:grid-cols-2 xl:grid-cols-1">
          <Bloc titre="Actions suggérées" index={4} chargement={chargement} hauteur={180}>
            {erreurTache && <p role="alert" className="mb-3 text-sm" style={{ color: C.errorText }}>{erreurTache}</p>}
            <ActionsSuggerees groupes={t.actions} taches={taches} peutCreer={peutChangerStatut(role)} enCours={tacheEnCours} onCreerTache={creerTache} />
          </Bloc>
          <Bloc titre="Activités récentes" index={5} chargement={chargement} hauteur={180}>
            <ActivitesRecentes entrepriseId={entrepriseId} estAdmin={role === "admin"} factures={factures} />
          </Bloc>
        </div>
      </div>
    </>
  );
}
