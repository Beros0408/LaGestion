export function ligneHT(ligne) {
  const q = Number(ligne?.quantite) || 0;
  const p = Number(ligne?.prix_unitaire) || 0;
  return q * p;
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

export function totalTTC(facture) {
  return totalHT(facture) + totalTVA(facture);
}
