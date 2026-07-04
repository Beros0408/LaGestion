import React, { useState, useMemo, lazy, Suspense } from "react";
import {
  TrendingUp, TrendingDown, Calendar, ArrowRight,
  CheckCircle2, Clock, AlertTriangle,
} from "lucide-react";
import { C, euro, num } from "../theme";
import Card from "../components/Card";

const CaChart = lazy(() => import("../components/charts/CaChart"));
const DonutChart = lazy(() => import("../components/charts/DonutChart"));
const PipelineChart = lazy(() => import("../components/charts/PipelineChart"));

const caData = [
  { mois: "Juil.", ca: 41200, objectif: 40000 },
  { mois: "Août", ca: 38600, objectif: 40000 },
  { mois: "Sept.", ca: 47800, objectif: 45000 },
  { mois: "Oct.", ca: 52300, objectif: 48000 },
  { mois: "Nov.", ca: 49900, objectif: 50000 },
  { mois: "Déc.", ca: 61400, objectif: 55000 },
  { mois: "Janv.", ca: 54100, objectif: 55000 },
  { mois: "Févr.", ca: 58700, objectif: 58000 },
  { mois: "Mars", ca: 66200, objectif: 62000 },
  { mois: "Avr.", ca: 63500, objectif: 65000 },
  { mois: "Mai", ca: 71800, objectif: 68000 },
  { mois: "Juin", ca: 78400, objectif: 72000 },
];

const repartition = [
  { nom: "Services", valeur: 38, couleur: C.primary },
  { nom: "Commerce", valeur: 27, couleur: C.secondary },
  { nom: "Industrie", valeur: 19, couleur: C.accent },
  { nom: "Conseil", valeur: 16, couleur: C.info },
];

const dominantSecteurIndex = repartition.reduce(
  (max, e, i, arr) => (e.valeur > arr[max].valeur ? i : max),
  0
);

const pipeline = [
  { etape: "Qualification", montant: 124000 },
  { etape: "Proposition", montant: 98000 },
  { etape: "Négociation", montant: 67000 },
  { etape: "Conclusion", montant: 41000 },
];

const facturesRecentes = [
  { num: "FAC-2026-0612", client: "Atelier Durand", montant: 4820, statut: "payee", echeance: "12 juin" },
  { num: "FAC-2026-0611", client: "Sarl Moreau & Fils", montant: 12400, statut: "en_attente", echeance: "28 juin" },
  { num: "FAC-2026-0609", client: "Boutique Lefèvre", montant: 2310, statut: "retard", echeance: "10 juin" },
  { num: "FAC-2026-0608", client: "Groupe Bernard", montant: 18750, statut: "en_attente", echeance: "30 juin" },
  { num: "FAC-2026-0605", client: "Cabinet Petit", montant: 6900, statut: "payee", echeance: "05 juin" },
];

const activites = [
  { type: "facture", texte: "Facture FAC-2026-0612 réglée par Atelier Durand", quand: "Il y a 2 h", couleur: C.success },
  { type: "client", texte: "Nouveau client ajouté : Groupe Bernard", quand: "Il y a 5 h", couleur: C.primary },
  { type: "opportunite", texte: "Opportunité « Refonte ERP » passée en Négociation", quand: "Hier", couleur: C.accent },
  { type: "relance", texte: "Relance automatique envoyée à Boutique Lefèvre", quand: "Hier", couleur: C.warning },
  { type: "client", texte: "Fiche Sarl Moreau & Fils mise à jour", quand: "Il y a 2 j", couleur: C.secondary },
];

const statutFacture = {
  payee: { label: "Payée", color: C.success, bg: "rgba(39,174,96,0.12)", icon: CheckCircle2 },
  en_attente: { label: "En attente", color: C.info, bg: "rgba(52,152,219,0.12)", icon: Clock },
  retard: { label: "En retard", color: C.error, bg: "rgba(231,76,60,0.12)", icon: AlertTriangle },
};

const Badge = React.memo(function Badge({ statut }) {
  const s = statutFacture[statut];
  const Icon = s.icon;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ color: s.color, backgroundColor: s.bg }}
    >
      <Icon size={13} aria-hidden="true" />
      {s.label}
    </span>
  );
});

const KpiCard = React.memo(function KpiCard({ titre, valeur, variation, positif, sousTitre, accent, index = 0 }) {
  const TrendIcon = positif ? TrendingUp : TrendingDown;
  return (
    <Card index={index}>
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.textSecondary }}>
          {titre}
        </p>
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accent }} aria-hidden="true" />
      </div>
      <p className="mt-3 tabular-nums" style={{ color: C.textPrimary, fontSize: 40, fontWeight: 700, lineHeight: 1.1 }}>
        {valeur}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold"
          style={{ color: positif ? C.success : C.error, backgroundColor: positif ? "rgba(39,174,96,0.1)" : "rgba(231,76,60,0.1)" }}
        >
          <TrendIcon size={13} aria-hidden="true" />
          {variation}
        </span>
        <span className="text-xs" style={{ color: C.textSecondary }}>{sousTitre}</span>
      </div>
    </Card>
  );
});

function CardTitle({ children, action }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h3 style={{ color: C.textPrimary, fontSize: 18, fontWeight: 600 }}>
        {children}
      </h3>
      {action}
    </div>
  );
}

function ChartFallback({ height }) {
  return (
    <div
      style={{ width: "100%", height, backgroundColor: "#F1F3F5", borderRadius: 8 }}
      aria-hidden="true"
    />
  );
}

const MOIS_PAR_PERIODE = { "30 jours": 1, "6 mois": 6, "12 mois": 12 };

export default function Dashboard() {
  const [periode, setPeriode] = useState("12 mois");
  const [activeSecteurIndex, setActiveSecteurIndex] = useState(dominantSecteurIndex);

  const nMois = MOIS_PAR_PERIODE[periode];
  const caFiltered = useMemo(() => caData.slice(-nMois), [nMois]);
  const dernier = caFiltered[caFiltered.length - 1];
  const precedent =
    caFiltered.length >= 2
      ? caFiltered[caFiltered.length - 2]
      : caData[caData.length - nMois - 1];
  const variationPct = precedent ? ((dernier.ca - precedent.ca) / precedent.ca) * 100 : 0;
  const variationPositive = variationPct >= 0;
  const variationLabel = `${variationPositive ? "+" : ""}${variationPct.toFixed(1).replace(".", ",")} %`;

  return (
    <>
      {/* Bandeau période */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm" style={{ color: C.textSecondary }}>
          Voici la synthèse de votre activité commerciale.
        </p>
        <div className="flex items-center gap-1 rounded-xl p-1" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
          {["30 jours", "6 mois", "12 mois"].map((p) => (
            <button
              key={p}
              onClick={() => setPeriode(p)}
              aria-pressed={periode === p}
              className="rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2"
              style={{
                color: periode === p ? "#fff" : C.textSecondary,
                backgroundColor: periode === p ? C.primary : "transparent",
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Cartes KPI */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard index={0} titre="Chiffre d'affaires" valeur={euro(dernier.ca)} variation={variationLabel} positif={variationPositive} sousTitre="vs mois dernier" accent={C.primary} />
        <KpiCard index={1} titre="Nouveaux clients" valeur={num(34)} variation="+12 %" positif sousTitre="ce mois-ci" accent={C.secondary} />
        <KpiCard index={2} titre="Factures impayées" valeur={euro(33460)} variation="-4,2 %" positif={false} sousTitre="8 factures" accent={C.error} />
        <KpiCard index={3} titre="Pipeline en cours" valeur={euro(330000)} variation="+6,8 %" positif sousTitre="42 opportunités" accent="#244A68" />
      </div>

      {/* Graphiques principaux */}
      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* Évolution du CA */}
        <Card index={4} className="xl:col-span-2">
          <CardTitle
            action={
              <span className="flex items-center gap-1.5 text-xs" style={{ color: C.textSecondary }}>
                <Calendar size={13} aria-hidden="true" /> {periode}
              </span>
            }
          >
            Évolution du chiffre d'affaires
          </CardTitle>
          <div style={{ width: "100%", height: 280 }}>
            <Suspense fallback={<ChartFallback height={280} />}>
              <CaChart data={caFiltered} />
            </Suspense>
          </div>
        </Card>

        {/* Répartition */}
        <Card index={5}>
          <CardTitle>Répartition par secteur</CardTitle>
          <Suspense fallback={<ChartFallback height={180} />}>
            <DonutChart
              data={repartition}
              activeIndex={activeSecteurIndex}
              setActiveIndex={setActiveSecteurIndex}
              dominantIndex={dominantSecteurIndex}
            />
          </Suspense>
          <ul className="mt-3 space-y-2">
            {repartition.map((e) => (
              <li key={e.nom} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2" style={{ color: C.textSecondary }}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: e.couleur }} aria-hidden="true" />
                  {e.nom}
                </span>
                <span className="font-semibold tabular-nums" style={{ color: C.textPrimary }}>{e.valeur} %</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Pipeline + Activité */}
      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* Pipeline commercial */}
        <Card index={6} className="xl:col-span-2">
          <CardTitle
            action={<span className="text-xs font-semibold" style={{ color: C.secondary }}>Total : {euro(330000)}</span>}
          >
            Pipeline commercial
          </CardTitle>
          <div style={{ width: "100%", height: 220 }}>
            <Suspense fallback={<ChartFallback height={220} />}>
              <PipelineChart data={pipeline} />
            </Suspense>
          </div>
        </Card>

        {/* Activité récente */}
        <Card index={7}>
          <CardTitle>Activité récente</CardTitle>
          <ul className="space-y-4">
            {activites.map((a, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: a.couleur }} aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm leading-snug" style={{ color: C.textPrimary }}>{a.texte}</p>
                  <p className="text-xs" style={{ color: C.textSecondary }}>{a.quand}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* Dernières factures */}
      <Card index={8} className="mt-5">
        <CardTitle
          action={
            <button className="flex items-center gap-1 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2" style={{ color: C.primary }}>
              Voir tout <ArrowRight size={13} aria-hidden="true" />
            </button>
          }
        >
          Dernières factures
        </CardTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                {["Numéro", "Client", "Montant", "Échéance", "Statut"].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: C.textSecondary }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {facturesRecentes.map((f) => (
                <tr key={f.num} className="transition-colors hover:bg-[#F8F9FA]" style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td className="px-3 py-3 font-medium tabular-nums" style={{ color: C.textPrimary }}>{f.num}</td>
                  <td className="px-3 py-3" style={{ color: C.textSecondary }}>{f.client}</td>
                  <td className="px-3 py-3 font-semibold tabular-nums" style={{ color: C.textPrimary }}>{euro(f.montant)}</td>
                  <td className="px-3 py-3" style={{ color: C.textSecondary }}>{f.echeance}</td>
                  <td className="px-3 py-3"><Badge statut={f.statut} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
