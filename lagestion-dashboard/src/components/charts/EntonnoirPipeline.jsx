import React, { useId, useMemo } from "react";
import { FunnelChart, Funnel, LabelList, Tooltip, ResponsiveContainer } from "recharts";
import { C, ENTONNOIR, euro, euroCentimes } from "../../theme";
import TooltipShell from "./TooltipShell";

const HAUTEUR = 220;
const ESPACE = 4;           // espace vertical entre deux bandes (px)
const RAYON = 4;            // arrondi des coins (px)
const LARGEUR_MIN = 0.6;    // largeur minimale d'une bande, en part de la plus large (lisibilité du libellé)
const PART_DROITE_POINTE = 0.55; // dernière bande : part de la hauteur aux bords droits avant la pointe

const LARGEUR_CARACTERE = 0.55; // largeur moyenne d'un caractère semi-gras, en part de la taille de police

// Libellé dans la bande, sur une seule ligne (dernière bande : centré dans la partie aux bords droits).
// La police se réduit (12 → 10 px) pour tenir dans la bande ; à défaut, seul le numéro est affiché.
function LibelleBande({ viewBox, value, index, nombreBandes }) {
  if (!viewBox) return null;
  const derniere = index === nombreBandes - 1;
  const haut = viewBox.y + ESPACE / 2;
  const hauteurUtile = viewBox.height - ESPACE;
  const y = derniere ? haut + (hauteurUtile * PART_DROITE_POINTE) / 2 + 2 : haut + hauteurUtile / 2;
  // Largeur disponible : partie la plus étroite de la zone du libellé, moins une marge
  const largeurDispo = (derniere ? viewBox.width * 2 : viewBox.width) - 8;
  const taille = Math.min(12, largeurDispo / (String(value).length * LARGEUR_CARACTERE));
  const texte = taille >= 10 ? value : `${index + 1}.`;
  return (
    <text x={viewBox.x + viewBox.width / 2} y={y} textAnchor="middle" dominantBaseline="central"
      fill={C.onPrimary} fontSize={Math.max(10, Math.min(12, taille))} fontWeight={600} style={{ pointerEvents: "none" }}>
      {texte}
    </text>
  );
}

const pourcent = (v) => (v === null ? "—" : `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`);

// Polygone aux coins arrondis (points en ordre) ; les points confondus (pointe) sont fusionnés.
function cheminArrondi(points, r) {
  const pts = points.filter((p, i) => {
    const s = points[(i + 1) % points.length];
    return Math.hypot(p[0] - s[0], p[1] - s[1]) > 0.5;
  });
  const n = pts.length;
  const segments = pts.map((p, i) => {
    const prec = pts[(i - 1 + n) % n];
    const suiv = pts[(i + 1) % n];
    const versPrec = Math.hypot(prec[0] - p[0], prec[1] - p[1]);
    const versSuiv = Math.hypot(suiv[0] - p[0], suiv[1] - p[1]);
    const k = Math.min(r, versPrec / 2, versSuiv / 2);
    const a = [p[0] + ((prec[0] - p[0]) * k) / versPrec, p[1] + ((prec[1] - p[1]) * k) / versPrec];
    const b = [p[0] + ((suiv[0] - p[0]) * k) / versSuiv, p[1] + ((suiv[1] - p[1]) * k) / versSuiv];
    return { a, p, b };
  });
  return segments
    .map(({ a, p, b }, i) => `${i === 0 ? "M" : "L"}${a[0]},${a[1]} Q${p[0]},${p[1]} ${b[0]},${b[1]}`)
    .join(" ") + " Z";
}

// Forme personnalisée d'une bande : trapèze arrondi, dégradé horizontal, voile de survol.
// Dernière bande : bords droits sur la partie haute (place du libellé), puis pointe.
function Bande({ x, y, upperWidth, lowerWidth, height, payload }) {
  if (!payload) return null;
  const cx = x + upperWidth / 2;
  const haut = y + ESPACE / 2;
  const bas = y + height - ESPACE / 2;
  const points = payload.derniere
    ? [[x, haut], [x + upperWidth, haut], [x + upperWidth, haut + (bas - haut) * PART_DROITE_POINTE], [cx, bas], [x, haut + (bas - haut) * PART_DROITE_POINTE]]
    : [[x, haut], [x + upperWidth, haut], [cx + lowerWidth / 2, bas], [cx - lowerWidth / 2, bas]];
  const d = cheminArrondi(points, RAYON);
  const [debut, fin] = ENTONNOIR[payload.rang - 1];
  const idDegrade = `${payload.idGraphique}-degrade-${payload.rang}`;
  return (
    <g className="lg-bande" style={{ animationDelay: `${(payload.rang - 1) * 80}ms` }}>
      <defs>
        <linearGradient id={idDegrade} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={debut} />
          <stop offset="100%" stopColor={fin} />
        </linearGradient>
      </defs>
      <path d={d} fill={`url(#${idDegrade})`} />
      <path d={d} fill={C.onPrimary} className="lg-bande-voile" />
    </g>
  );
}

function Infobulle({ active, payload }) {
  if (!active || !payload?.length) return null;
  const e = payload[0].payload;
  return (
    <TooltipShell>
      <p className="mb-0.5 font-semibold" style={{ color: C.textPrimary }}>{e.libelleBande}</p>
      <p className="tabular-nums" style={{ color: C.textSecondary }}>
        {e.nombre} opportunité{e.nombre > 1 ? "s" : ""} · {euroCentimes(e.montant)}
      </p>
      {e.rang > 1 && (
        <p className="tabular-nums" style={{ color: C.textSecondary }}>
          Passage depuis l'étape précédente : {pourcent(e.passage)}
        </p>
      )}
    </TooltipShell>
  );
}

// mesure : "montant" ou "nombre" ; la largeur des bandes suit la mesure (avec un minimum lisible).
function EntonnoirPipeline({ data, mesure }) {
  const idGraphique = useId().replace(/:/g, "");
  const lignes = useMemo(() => {
    const valeur = (e) => (mesure === "montant" ? e.montant : e.nombre);
    const max = Math.max(...data.map(valeur));
    return data.map((e, i) => ({
      ...e,
      idGraphique,
      derniere: i === data.length - 1,
      libelleBande: `${e.rang}. ${e.etape}`,
      largeur: max > 0 ? Math.max(valeur(e), max * LARGEUR_MIN) : 1,
      part: mesure === "montant" ? e.partMontant : e.partNombre,
      passage: mesure === "montant" ? e.passageMontant : e.passageNombre,
      valeurTexte: mesure === "montant" ? euro(e.montant) : e.nombre.toLocaleString("fr-FR"),
    }));
  }, [data, mesure, idGraphique]);

  return (
    <div className="lg-entonnoir grid items-stretch gap-3" style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
      <div style={{ height: HAUTEUR }}>
        <ResponsiveContainer>
          <FunnelChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            <Tooltip content={<Infobulle />} cursor={false} />
            <Funnel data={lignes} dataKey="largeur" nameKey="libelleBande" shape={Bande} isAnimationActive={false}>
              <LabelList dataKey="libelleBande" content={<LibelleBande nombreBandes={lignes.length} />} />
            </Funnel>
          </FunnelChart>
        </ResponsiveContainer>
      </div>
      {/* Valeur et part de la 1re étape, alignées sur chaque bande */}
      <ul className="grid text-xs tabular-nums" style={{ height: HAUTEUR, gridTemplateRows: `repeat(${lignes.length}, 1fr)` }}>
        {lignes.map((e) => (
          <li key={e.etape} className="lg-entonnoir-valeur flex items-center whitespace-nowrap" style={{ animationDelay: `${(e.rang - 1) * 80}ms` }}>
            <span className="font-semibold" style={{ color: C.textPrimary }}>{e.valeurTexte}</span>
            <span className="ml-1" style={{ color: C.textSecondary }}>({pourcent(e.part)})</span>
            <span className="sr-only"> — {e.etape}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default React.memo(EntonnoirPipeline);
