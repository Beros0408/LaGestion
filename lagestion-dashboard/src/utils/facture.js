// Totaux d'une facture (règle B) : calcul entier en centimes, identique à la vue SQL public.factures_totaux.
// 1. HT de ligne = max(0, arrondi(quantité × prix unitaire) − remise de ligne).
// 2. Remise globale plafonnée au HT brut, répartie au prorata de la base de chaque taux
//    (méthode du plus fort reste ; à reste égal, le taux le plus élevé reçoit le centime).
// 3. TVA arrondie par taux sur la base remisée ; TTC = HT net + TVA.
// Arrondi au centime, moitié éloignée de zéro (comme round() de Postgres).
// Une facture émise porte ses totaux figés (migration 008) : ils priment sur tout calcul.

const enCentimes = (euros) => BigInt(Math.round((Number(euros) || 0) * 100));
const enEuros = (c) => Number(c) / 100;

// Division entière arrondie, moitié éloignée de zéro (d > 0).
function diviserArrondi(n, d) {
  if (n < 0n) return -diviserArrondi(-n, d);
  return (2n * n + d) / (2n * d);
}

function ligneHTCentimes(ligne) {
  const brut = diviserArrondi(enCentimes(ligne?.quantite) * enCentimes(ligne?.prix_unitaire), 100n);
  const ht = brut - enCentimes(ligne?.remise);
  return ht > 0n ? ht : 0n;
}

function totauxFiges(f) {
  const c = (euros) => Number(enCentimes(euros));
  return {
    htBrutC: c(f.total_ht_brut),
    remiseC: c(f.remise_appliquee),
    htC: c(f.total_ht),
    tva: (f.tva_detail ?? []).map((d) => ({ taux: Number(d.taux), baseC: c(d.base), tvaC: c(d.tva) })),
    tvaC: c(f.total_tva),
    ttcC: c(f.total_ttc),
  };
}

export function calculerTotaux(facture) {
  if (facture?.total_ttc != null) return totauxFiges(facture);
  const groupes = new Map();
  for (const l of facture?.lignes ?? []) {
    const taux = Number(l?.taux_tva) || 0;
    const g = groupes.get(taux) || { taux, baseBrute: 0n };
    g.baseBrute += ligneHTCentimes(l);
    groupes.set(taux, g);
  }
  const liste = [...groupes.values()];
  const htBrut = liste.reduce((s, g) => s + g.baseBrute, 0n);
  const demandee = enCentimes(facture?.remise);
  const remise = demandee < 0n ? 0n : demandee > htBrut ? htBrut : demandee;

  liste.forEach((g) => {
    g.part = htBrut > 0n ? (remise * g.baseBrute) / htBrut : 0n;
    g.reste = htBrut > 0n ? (remise * g.baseBrute) % htBrut : 0n;
  });
  let aRepartir = remise - liste.reduce((s, g) => s + g.part, 0n);
  [...liste]
    .sort((a, b) => (a.reste === b.reste ? b.taux - a.taux : a.reste > b.reste ? -1 : 1))
    .forEach((g) => { if (aRepartir > 0n) { g.part += 1n; aRepartir -= 1n; } });

  const tva = liste
    .map((g) => {
      const base = g.baseBrute - g.part;
      return { taux: g.taux, baseC: base, tvaC: diviserArrondi(base * BigInt(Math.round(g.taux * 100)), 10000n) };
    })
    .sort((a, b) => b.taux - a.taux);
  const tvaTotal = tva.reduce((s, d) => s + d.tvaC, 0n);
  const ht = htBrut - remise;

  return {
    htBrutC: Number(htBrut),
    remiseC: Number(remise),
    htC: Number(ht),
    tva: tva.map((d) => ({ taux: d.taux, baseC: Number(d.baseC), tvaC: Number(d.tvaC) })),
    tvaC: Number(tvaTotal),
    ttcC: Number(ht + tvaTotal),
  };
}

export function ligneHT(ligne) {
  return enEuros(ligneHTCentimes(ligne));
}

export function totalHTBrut(facture) {
  return enEuros(calculerTotaux(facture).htBrutC);
}

// HT net, après remise globale.
export function totalHT(facture) {
  return enEuros(calculerTotaux(facture).htC);
}

export function tvaParTaux(facture) {
  return calculerTotaux(facture).tva.map((d) => ({ taux: d.taux, base: enEuros(d.baseC), tva: enEuros(d.tvaC) }));
}

export function totalTVA(facture) {
  return enEuros(calculerTotaux(facture).tvaC);
}

// Remise globale effectivement appliquée (plafonnée au HT brut).
export function remiseGlobale(facture) {
  return enEuros(calculerTotaux(facture).remiseC);
}

export function totalTTC(facture) {
  return enEuros(calculerTotaux(facture).ttcC);
}

export function totalPaye(facture) {
  const paiements = facture?.paiements ?? [];
  return paiements.reduce((s, p) => s + (Number(p?.montant) || 0), 0);
}

export function resteAPayer(facture) {
  return Math.max(0, totalTTC(facture) - totalPaye(facture));
}
