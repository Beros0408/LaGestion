import React from "react";
import { C } from "../../theme";
import Card from "../Card";

// Carte titrée du tableau de bord, avec état de chargement (squelette) et état vide explicites.
export default function Bloc({ titre, action, index = 0, chargement, vide, messageVide, hauteur = 240, className = "", children }) {
  let contenu = children;
  if (chargement) {
    contenu = (
      <div
        role="status"
        aria-label="Chargement"
        style={{ width: "100%", height: hauteur, backgroundColor: C.bgHover, borderRadius: 12 }}
      />
    );
  } else if (vide) {
    contenu = (
      <div className="flex items-center justify-center text-center text-sm" style={{ minHeight: Math.min(hauteur, 160), color: C.textSecondary }}>
        {messageVide}
      </div>
    );
  }
  return (
    <Card index={index} className={className}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 style={{ color: C.textPrimary, fontSize: 18, fontWeight: 600 }}>{titre}</h3>
        {action}
      </div>
      {contenu}
    </Card>
  );
}

export function SqueletteTuile() {
  return (
    <div role="status" aria-label="Chargement" className="rounded-2xl" style={{ height: 124, backgroundColor: C.bgHover }} />
  );
}

export function ChartFallback({ hauteur = 240 }) {
  return <div aria-hidden="true" style={{ width: "100%", height: hauteur, backgroundColor: C.bgHover, borderRadius: 12 }} />;
}
