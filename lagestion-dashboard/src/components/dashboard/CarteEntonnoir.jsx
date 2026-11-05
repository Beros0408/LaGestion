import React, { lazy, Suspense, useState } from "react";
import { C, euroCentimes } from "../../theme";
import Bloc, { ChartFallback } from "./Bloc.jsx";

const EntonnoirPipeline = lazy(() => import("../charts/EntonnoirPipeline"));

const MESURES = [
  { cle: "montant", libelle: "Montant" },
  { cle: "nombre", libelle: "Nombre" },
];

function Indicateur({ libelle, valeur, detail }) {
  return (
    <div className="min-w-0">
      <p className="text-xs" style={{ color: C.textSecondary }}>{libelle}</p>
      <p className="tabular-nums" style={{ color: C.textPrimary, fontSize: 18, fontWeight: 600 }}>{valeur}</p>
      {detail && <p className="text-xs" style={{ color: C.textSecondary }}>{detail}</p>}
    </div>
  );
}

export default function CarteEntonnoir({ entonnoir, conclusion, valeurMoyenne, chargement, vide, index = 0, className = "" }) {
  const [mesure, setMesure] = useState("montant");
  const selecteur = (
    <div className="flex gap-1 rounded-lg p-0.5" style={{ backgroundColor: C.bgMain, border: `1px solid ${C.border}` }} role="group" aria-label="Mesure de l'entonnoir">
      {MESURES.map((m) => (
        <button
          key={m.cle}
          type="button"
          onClick={() => setMesure(m.cle)}
          aria-pressed={mesure === m.cle}
          className="rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2"
          style={{ color: mesure === m.cle ? C.onPrimary : C.textSecondary, backgroundColor: mesure === m.cle ? C.primary : "transparent" }}
        >
          {m.libelle}
        </button>
      ))}
    </div>
  );

  return (
    <Bloc titre="Entonnoir du pipeline" action={selecteur} index={index} className={className}
      chargement={chargement} vide={vide} messageVide="Aucune opportunité pour le moment." hauteur={220}>
      <div className="mx-auto" style={{ maxWidth: 520 }}>
        <Suspense fallback={<ChartFallback hauteur={220} />}>
          <EntonnoirPipeline data={entonnoir} mesure={mesure} />
        </Suspense>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 pt-4" style={{ borderTop: `1px solid ${C.border}` }}>
        <Indicateur
          libelle="Part en conclusion"
          valeur={conclusion.taux === null ? "—" : `${conclusion.taux.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`}
          detail={`${conclusion.numerateur} sur ${conclusion.denominateur}`}
        />
        <Indicateur libelle="Valeur moyenne d'une opportunité" valeur={valeurMoyenne === null ? "—" : euroCentimes(valeurMoyenne)} />
      </div>
    </Bloc>
  );
}
