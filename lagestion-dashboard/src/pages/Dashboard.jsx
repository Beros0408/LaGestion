import React, { useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar,
} from "recharts";
import {
  TrendingUp, TrendingDown, Calendar, ArrowRight,
  CheckCircle2, Clock, AlertTriangle,
} from "lucide-react";
import { C, euro, num } from "../theme";

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

function Badge({ statut }) {
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
}

function KpiCard({ titre, valeur, variation, positif, sousTitre, accent }) {
  const TrendIcon = positif ? TrendingUp : TrendingDown;
  return (
    <div
      className="rounded-2xl p-5 transition-transform duration-200 hover:-translate-y-0.5"
      style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, boxShadow: "0 1px 3px rgba(45,52,54,0.04)" }}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.textSecondary }}>
          {titre}
        </p>
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accent }} aria-hidden="true" />
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums" style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}>
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
    </div>
  );
}

function CardTitle({ children, action }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h3 className="text-base font-semibold" style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}>
        {children}
      </h3>
      {action}
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg px-3 py-2 text-xs shadow-lg" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
      <p className="mb-1 font-semibold" style={{ color: C.textPrimary }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || p.fill }}>
          {p.name === "ca" ? "Chiffre d'affaires" : "Objectif"} : <span className="font-semibold">{euro(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const [periode, setPeriode] = useState("12 mois");

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
        <KpiCard titre="Chiffre d'affaires" valeur={euro(78400)} variation="+9,1 %" positif sousTitre="vs mois dernier" accent={C.primary} />
        <KpiCard titre="Nouveaux clients" valeur={num(34)} variation="+12 %" positif sousTitre="ce mois-ci" accent={C.secondary} />
        <KpiCard titre="Factures impayées" valeur={euro(33460)} variation="-4,2 %" positif={false} sousTitre="8 factures" accent={C.error} />
        <KpiCard titre="Pipeline en cours" valeur={euro(330000)} variation="+6,8 %" positif sousTitre="42 opportunités" accent={C.accent} />
      </div>

      {/* Graphiques principaux */}
      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* Évolution du CA */}
        <div className="rounded-2xl p-5 xl:col-span-2" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
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
            <ResponsiveContainer>
              <AreaChart data={caData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradCa" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={C.primary} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={C.primary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="mois" tick={{ fontSize: 11, fill: C.textSecondary }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: C.textSecondary }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v / 1000}k`} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="objectif" stroke={C.textSecondary} strokeDasharray="4 4" strokeWidth={1.5} fill="none" name="objectif" />
                <Area type="monotone" dataKey="ca" stroke={C.primary} strokeWidth={2.5} fill="url(#gradCa)" name="ca" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Répartition */}
        <div className="rounded-2xl p-5" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
          <CardTitle>Répartition par secteur</CardTitle>
          <div style={{ width: "100%", height: 180 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie data={repartition} dataKey="valeur" nameKey="nom" cx="50%" cy="50%" innerRadius={48} outerRadius={75} paddingAngle={3} stroke="none">
                  {repartition.map((e, i) => <Cell key={i} fill={e.couleur} />)}
                </Pie>
                <Tooltip formatter={(v, n) => [`${v} %`, n]} contentStyle={{ borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
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
        </div>
      </div>

      {/* Pipeline + Activité */}
      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* Pipeline commercial */}
        <div className="rounded-2xl p-5 xl:col-span-2" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
          <CardTitle
            action={<span className="text-xs font-semibold" style={{ color: C.secondary }}>Total : {euro(330000)}</span>}
          >
            Pipeline commercial
          </CardTitle>
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={pipeline} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: C.textSecondary }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v / 1000}k`} />
                <YAxis type="category" dataKey="etape" tick={{ fontSize: 12, fill: C.textPrimary }} axisLine={false} tickLine={false} width={92} />
                <Tooltip formatter={(v) => [euro(v), "Montant pondéré"]} contentStyle={{ borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 12 }} cursor={{ fill: "rgba(45,91,127,0.05)" }} />
                <Bar dataKey="montant" radius={[0, 6, 6, 0]} barSize={26}>
                  {pipeline.map((_, i) => (
                    <Cell key={i} fill={[C.primary, C.secondary, C.accent, C.info][i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Activité récente */}
        <div className="rounded-2xl p-5" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
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
        </div>
      </div>

      {/* Dernières factures */}
      <div className="mt-5 rounded-2xl p-5" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
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
                  <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: C.textSecondary }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {facturesRecentes.map((f) => (
                <tr key={f.num} className="transition-colors" style={{ borderBottom: `1px solid ${C.border}` }}>
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
      </div>
    </>
  );
}
