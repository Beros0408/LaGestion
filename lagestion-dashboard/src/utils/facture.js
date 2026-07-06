export function ligneHT(ligne) {
  const q = Number(ligne?.quantite) || 0;
  const p = Number(ligne?.prix_unitaire) || 0;
  const r = Number(ligne?.remise) || 0;
  return Math.max(0, q * p - r);
}

export function ligneTVA(ligne) {
  const t = Number(ligne?.taux_tva) || 0;
  return ligneHT(ligne) * (t / 100);
}

export function ligneTTC(ligne) {
  return ligneHT(ligne) + ligneTVA(ligne);
}

export function totalHT(facture) {
  const lignes = facture?.lignes ?? [];
  return lignes.reduce((s, l) => s + ligneHT(l), 0);
}

export function tvaParTaux(facture) {
  const detail = new Map();
  const lignes = facture?.lignes ?? [];
  lignes.forEach((l) => {
    const taux = Number(l?.taux_tva) || 0;
    const ht = ligneHT(l);
    const tva = ht * (taux / 100);
    const cur = detail.get(taux) || { taux, base: 0, tva: 0 };
    cur.base += ht;
    cur.tva += tva;
    detail.set(taux, cur);
  });
  return Array.from(detail.values()).sort((a, b) => b.taux - a.taux);
}

export function totalTVA(facture) {
  return tvaParTaux(facture).reduce((s, d) => s + d.tva, 0);
}

export function remiseGlobale(facture) {
  return Number(facture?.remise) || 0;
}

export function totalTTC(facture) {
  const brut = totalHT(facture) + totalTVA(facture);
  return Math.max(0, brut - remiseGlobale(facture));
}

export function totalPaye(facture) {
  const paiements = facture?.paiements ?? [];
  return paiements.reduce((s, p) => s + (Number(p?.montant) || 0), 0);
}

export function resteAPayer(facture) {
  return Math.max(0, totalTTC(facture) - totalPaye(facture));
}
