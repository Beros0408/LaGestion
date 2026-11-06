// Totaux d'une facture (règle B) : calcul entier en centimes, identique à la vue SQL public.factures_totaux.
// 1. HT de ligne = max(0, arrondi(quantité × prix unitaire) − remise de ligne).
// 2. Remise globale plafonnée au HT brut, répartie au prorata de la base de chaque taux
//    (méthode du plus fort reste ; à reste égal, le taux le plus élevé reçoit le centime).
// 3. TVA arrondie par taux sur la base remisée ; TTC = HT net + TVA.
// Arrondi au centime, moitié éloignée de zéro (comme round() de Postgres).
// Une facture émise porte ses totaux figés (migration 008) : ils priment sur tout calcul.
// Un avoir (migration 009) a des lignes positives et des totaux négatifs : le signe est porté par le document.
// Une facture de solde (migration 010) déduit ses acomptes taux par taux, par soustraction, jamais par recalcul.

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
  const figes = {
    htBrutC: c(f.total_ht_brut),
    remiseC: c(f.remise_appliquee),
    htC: c(f.total_ht),
    tva: (f.tva_detail ?? []).map((d) => ({ taux: Number(d.taux), baseC: c(d.base), tvaC: c(d.tva) })),
    tvaC: c(f.total_tva),
    ttcC: c(f.total_ttc),
  };
  return f.type === "solde" ? { ...figes, acomptesC: acomptesDeduitsC(f) } : figes;
}

// Cumul TTC des acomptes déduits d'une facture de solde, en centimes.
function acomptesDeduitsC(f) {
  return (f?.acomptes_deduits ?? []).reduce((s, a) => s + Number(enCentimes(a.total_ttc)), 0);
}

// Soustraction taux par taux : mêmes valeurs que totaux_solde (migration 010).
function deduireAcomptes(totaux, f) {
  const parTaux = new Map(totaux.tva.map((d) => [d.taux, { ...d }]));
  for (const a of f.acomptes_deduits ?? []) {
    for (const d of a.detail ?? []) {
      const taux = Number(d.taux);
      const g = parTaux.get(taux) ?? { taux, baseC: 0, tvaC: 0 };
      g.baseC -= Number(enCentimes(d.base));
      g.tvaC -= Number(enCentimes(d.tva));
      parTaux.set(taux, g);
    }
  }
  const tva = [...parTaux.values()].filter((d) => d.baseC !== 0 || d.tvaC !== 0).sort((a, b) => b.taux - a.taux);
  const htC = tva.reduce((s, d) => s + d.baseC, 0);
  const tvaC = tva.reduce((s, d) => s + d.tvaC, 0);
  return { ...totaux, tva, htC, tvaC, ttcC: htC + tvaC, acomptesC: acomptesDeduitsC(f) };
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
  const signe = (c) => (facture?.type === "avoir" && c !== 0n ? -Number(c) : Number(c));

  const totaux = {
    htBrutC: signe(htBrut),
    remiseC: signe(remise),
    htC: signe(ht),
    tva: tva.map((d) => ({ taux: d.taux, baseC: signe(d.baseC), tvaC: signe(d.tvaC) })),
    tvaC: signe(tvaTotal),
    ttcC: signe(ht + tvaTotal),
  };
  return facture?.type === "solde" ? deduireAcomptes(totaux, facture) : totaux;
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

const centimes = (euros) => Number(enCentimes(euros));

// Un remboursement réduit l'encaissé.
export const montantSigne = (p) => (p?.sens === "remboursement" ? -1 : 1) * (Number(p?.montant) || 0);

// Encaissé net des remboursements.
export function totalPaye(facture) {
  return (facture?.paiements ?? []).reduce((s, p) => s + centimes(montantSigne(p)), 0) / 100;
}

// Cumul des avoirs finalisés d'une facture, en positif (facture.avoirs : voir lierAvoirs).
export function totalAvoirs(facture) {
  return (facture?.avoirs ?? []).reduce((s, a) => s - centimes(totalTTC(a)), 0) / 100;
}

// Mêmes règles que la vue SQL public.factures_soldes. Un avoir n'a ni reste à payer ni trop-perçu.
export function resteAPayer(facture) {
  if (facture?.type === "avoir") return 0;
  return Math.max(0, centimes(totalTTC(facture)) - centimes(totalAvoirs(facture)) - centimes(totalPaye(facture))) / 100;
}

export function tropPercu(facture) {
  if (facture?.type === "avoir") return 0;
  return Math.max(0, centimes(totalPaye(facture)) - (centimes(totalTTC(facture)) - centimes(totalAvoirs(facture)))) / 100;
}

// Ce qu'il reste à créditer sur une facture, par taux (base HT et TVA, en euros).
export function resteCreditable(facture) {
  const avoirs = (facture?.avoirs ?? []).flatMap((a) => calculerTotaux(a).tva);
  return calculerTotaux(facture).tva
    .map((d) => {
      const deja = avoirs.filter((x) => x.taux === d.taux);
      return {
        taux: d.taux,
        base: (d.baseC + deja.reduce((s, x) => s + x.baseC, 0)) / 100,
        tva: (d.tvaC + deja.reduce((s, x) => s + x.tvaC, 0)) / 100,
      };
    })
    .filter((d) => d.base > 0 || d.tva > 0);
}

// Cumul TTC des acomptes déduits d'une facture de solde, en euros.
export const totalAcomptesDeduits = (facture) => acomptesDeduitsC(facture) / 100;

// Rattache à chaque facture ses avoirs finalisés, à chaque avoir sa facture d'origine (numéro et date),
// et à chaque acompte la facture ou le solde issu de son devis (acompte déduit : plus d'avoir).
export function lierAvoirs(factures) {
  const parId = new Map(factures.map((f) => [f.id, f]));
  const conversions = new Map(
    factures.filter((f) => f.devis_id && (f.type === "solde" || f.type === "facture")).map((f) => [f.devis_id, f.id])
  );
  const avoirs = new Map();
  factures
    .filter((f) => f.type === "avoir" && f.statut !== "brouillon")
    .forEach((a) => avoirs.set(a.facture_origine_id, [...(avoirs.get(a.facture_origine_id) ?? []), a]));
  return factures.map((f) => {
    const origine = f.facture_origine_id ? parId.get(f.facture_origine_id) : null;
    return {
      ...f,
      avoirs: avoirs.get(f.id) ?? [],
      origine_numero: origine?.numero ?? null,
      origine_date: origine?.date_emission ?? null,
      solde_id: f.type === "acompte" ? conversions.get(f.devis_id) ?? null : null,
    };
  });
}

// Document qui compte dans le facturé : ni brouillon, ni ancienne facture annulée sans avoir.
// Une facture annulée par avoir compte à sa date, et l'avoir en négatif à la sienne : les mois passés ne bougent pas.
export const estComptabilisee = (f) =>
  f.statut !== "brouillon" && (f.statut !== "annulee" || (f.avoirs ?? []).length > 0);

// Situation d'un client : facturé net des avoirs, encaissé net, reste à payer, trop-perçu.
export function soldeClient(factures) {
  const liste = factures.filter(estComptabilisee);
  const somme = (fn) => liste.reduce((s, f) => s + centimes(fn(f)), 0) / 100;
  return {
    facture: somme(totalTTC),
    encaisse: somme(totalPaye),
    reste: somme(resteAPayer),
    tropPercu: somme(tropPercu),
  };
}
