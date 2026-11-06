// Calculs du tableau de bord : fonctions pures, montants additionnés en centimes entiers.
// Les totaux d'une facture viennent exclusivement de utils/facture.js.
// Dates au format ISO « AAAA-MM-JJ » ; « aujourdhui » est passé en paramètre (déterminisme, tests).
import { estComptabilisee, estImpayee, montantSigne, statutCalcule, totalAvoirs, totalHT, totalTTC, totalPaye, resteAPayer } from "./facture.js";
import { LIBELLE_STATUT, LIBELLE_TYPE, libelleNumero } from "../data/factures.js";
import { LIBELLE_NIVEAU, niveauSuivant, relanceAProposer } from "../data/relances.js";
const N = "\u00a0";
import { LIBELLE_STATUT_DEVIS } from "../data/devis.js";
import { ETAPES } from "../data/opportunites.js";
import { SECTEUR_NON_RENSEIGNE, SECTEUR_AUTRES } from "../data/secteurs.js";

export const PERIODES = [
  { cle: "30j", libelle: "30 jours" },
  { cle: "6m", libelle: "6 mois" },
  { cle: "12m", libelle: "12 mois" },
];

const ETAPE_FINALE = "Conclusion";
const JOURS_SANS_MOUVEMENT = 30;
const MAX_PAR_ACTION = 5;
const MAX_SECTEURS = 6;
const MAX_PRIORITAIRES = 5;
export const TRANCHES_AGE = [
  { cle: "0-30", libelle: "0-30 jours", max: 30 },
  { cle: "31-60", libelle: "31-60 jours", max: 60 },
  { cle: "61-90", libelle: "61-90 jours", max: 90 },
  { cle: "90+", libelle: "Plus de 90 jours", max: Infinity },
];

// ---------- Dates ----------

const enDate = (iso) => new Date(`${iso}T00:00:00Z`);
const enIso = (d) => d.toISOString().slice(0, 10);

export function ajouterJours(iso, n) {
  const d = enDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return enIso(d);
}

function premierDuMois(iso, decalageMois) {
  const d = enDate(iso);
  return enIso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + decalageMois, 1)));
}

export function joursEntre(debutIso, finIso) {
  return Math.round((enDate(finIso) - enDate(debutIso)) / 86400000);
}

// Jour local d'un horodatage (created_at, updated_at) ; une date « AAAA-MM-JJ » est rendue telle quelle.
export function jourLocal(valeur) {
  if (!valeur) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(valeur)) return valeur;
  const d = new Date(valeur);
  if (Number.isNaN(d.getTime())) return null;
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function aujourdhuiLocal() {
  return jourLocal(new Date().toISOString());
}

// Période courante et période précédente de même durée.
//   30j : les 30 derniers jours, aujourd'hui compris ; précédente : les 30 jours d'avant.
//   6m / 12m : les 6 ou 12 mois calendaires, mois en cours compris ; précédente : les 6 ou 12 mois d'avant.
export function bornesPeriode(cle, aujourdhui) {
  if (cle === "30j") {
    const debut = ajouterJours(aujourdhui, -29);
    const finPrec = ajouterJours(debut, -1);
    return { debut, fin: aujourdhui, precedente: { debut: ajouterJours(finPrec, -29), fin: finPrec } };
  }
  const n = cle === "6m" ? 6 : 12;
  const debut = premierDuMois(aujourdhui, -(n - 1));
  return {
    debut,
    fin: aujourdhui,
    precedente: { debut: premierDuMois(aujourdhui, -(2 * n - 1)), fin: ajouterJours(debut, -1) },
  };
}

const dans = (iso, b) => Boolean(iso) && iso >= b.debut && iso <= b.fin;

function moisCouverts(b) {
  const mois = [];
  let m = b.debut.slice(0, 7);
  const finMois = b.fin.slice(0, 7);
  while (m <= finMois) {
    mois.push(m);
    m = premierDuMois(`${m}-01`, 1).slice(0, 7);
  }
  return mois;
}

const LIBELLE_MOIS = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];
const MOIS_LONG = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

// ---------- Montants ----------

export const centimes = (euros) => Math.round((Number(euros) || 0) * 100);
export const euros = (c) => c / 100;

// Part en % (une décimale) ; null si la base est nulle.
export function pourcentage(valeur, base) {
  if (!base) return null;
  return Math.round((valeur / base) * 1000) / 10;
}

// Variation en % (une décimale) ; null si la période précédente est nulle (pas de base de comparaison).
export function variation(courant, precedent) {
  if (!precedent) return null;
  return Math.round(((courant - precedent) / precedent) * 1000) / 10;
}


function nomClient(clientsParId, id) {
  return clientsParId.get(id)?.nom ?? "Client supprimé";
}

// ---------- Calcul principal ----------

export function calculerTableauDeBord({ factures = [], clients = [], opportunites = [], periode = "12m", aujourdhui }) {
  const b = bornesPeriode(periode, aujourdhui);
  const clientsParId = new Map(clients.map((c) => [c.id, c]));

  const htC = new Map(factures.map((f) => [f.id, centimes(totalHT(f))]));
  const facturees = factures.filter(estComptabilisee);
  const facturesPeriode = facturees.filter((f) => dans(f.date_emission, b));
  const facturesPrec = facturees.filter((f) => dans(f.date_emission, b.precedente));
  const paiements = factures.flatMap((f) => (f.paiements ?? []).map((p) => ({ ...p, facture: f })));

  const somme = (liste, fn) => liste.reduce((s, x) => s + fn(x), 0);

  // KPI
  const caC = somme(facturesPeriode, (f) => htC.get(f.id));
  const caPrecC = somme(facturesPrec, (f) => htC.get(f.id));
  const encC = somme(paiements.filter((p) => dans(p.date, b)), (p) => centimes(montantSigne(p)));
  const encPrecC = somme(paiements.filter((p) => dans(p.date, b.precedente)), (p) => centimes(montantSigne(p)));
  const impayees = factures.filter(estImpayee);
  const ouvertes = opportunites.filter((o) => o.etape !== ETAPE_FINALE);
  const nouveaux = clients.filter((c) => dans(jourLocal(c.created_at), b)).length;
  const nouveauxPrec = clients.filter((c) => dans(jourLocal(c.created_at), b.precedente)).length;

  const kpi = {
    ca: { valeur: euros(caC), precedent: euros(caPrecC), variation: variation(caC, caPrecC) },
    encaissements: { valeur: euros(encC), precedent: euros(encPrecC), variation: variation(encC, encPrecC) },
    impayes: { montant: euros(somme(impayees, (f) => centimes(resteAPayer(f)))), nombre: impayees.length },
    pipelinePondere: euros(
      somme(ouvertes, (o) => Math.round(centimes(o.montant) * (Number(o.probabilite) || 0) / 100))
    ),
    opportunitesEnCours: ouvertes.length,
    nouveauxClients: { valeur: nouveaux, precedent: nouveauxPrec, variation: variation(nouveaux, nouveauxPrec) },
  };

  // Facturé HT et encaissé par mois (la somme des mois égale les KPI de la période)
  const mensuel = moisCouverts(b).map((m) => {
    const [a, mm] = m.split("-").map(Number);
    return {
      mois: m,
      libelle: LIBELLE_MOIS[mm - 1],
      libelleLong: `${MOIS_LONG[mm - 1]} ${a}`,
      factureC: 0,
      encaisseC: 0,
    };
  });
  const parMois = new Map(mensuel.map((x) => [x.mois, x]));
  facturesPeriode.forEach((f) => { parMois.get(f.date_emission.slice(0, 7)).factureC += htC.get(f.id); });
  paiements.filter((p) => dans(p.date, b)).forEach((p) => { parMois.get(p.date.slice(0, 7)).encaisseC += centimes(montantSigne(p)); });

  // CA HT par secteur et par client (période)
  const parSecteur = new Map();
  const parClient = new Map();
  facturesPeriode.forEach((f) => {
    const c = clientsParId.get(f.client_id);
    const secteur = c?.secteur?.trim() || SECTEUR_NON_RENSEIGNE;
    parSecteur.set(secteur, (parSecteur.get(secteur) ?? 0) + htC.get(f.id));
    parClient.set(f.client_id, (parClient.get(f.client_id) ?? 0) + htC.get(f.id));
  });
  // Au plus 6 secteurs nommés (une couleur chacun), le reste dans « Autres secteurs », puis « Non renseigné ».
  const nommes = [...parSecteur.entries()]
    .filter(([nom, c]) => c > 0 && nom !== SECTEUR_NON_RENSEIGNE)
    .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0], "fr"));
  const groupes = nommes.slice(0, MAX_SECTEURS);
  const autresC = somme(nommes.slice(MAX_SECTEURS), ([, c]) => c);
  if (autresC > 0) groupes.push([SECTEUR_AUTRES, autresC]);
  if (parSecteur.get(SECTEUR_NON_RENSEIGNE) > 0) groupes.push([SECTEUR_NON_RENSEIGNE, parSecteur.get(SECTEUR_NON_RENSEIGNE)]);
  const secteurs = groupes.map(([nom, c]) => ({ nom, montant: euros(c), part: caC ? Math.round((c / caC) * 1000) / 10 : 0 }));
  const topClients = [...parClient.entries()]
    .filter(([, c]) => c > 0)
    .map(([id, c]) => ({ id, nom: nomClient(clientsParId, id), montantC: c }))
    .sort((x, y) => y.montantC - x.montantC || x.nom.localeCompare(y.nom, "fr"))
    .slice(0, 5)
    .map(({ id, nom, montantC }) => ({ id, nom, montant: euros(montantC) }));

  // Entonnoir (à date) : part par rapport à la 1re étape et passage depuis l'étape précédente,
  // en montant et en nombre (null quand la base est nulle).
  const etapes = ETAPES.map((etape) => {
    const liste = opportunites.filter((o) => o.etape === etape);
    return { etape, nombre: liste.length, montantC: somme(liste, (o) => centimes(o.montant)) };
  });
  const entonnoir = etapes.map((e, i) => {
    const premiere = etapes[0];
    const prec = etapes[i - 1];
    return {
      rang: i + 1,
      etape: e.etape,
      nombre: e.nombre,
      montant: euros(e.montantC),
      partMontant: pourcentage(e.montantC, premiere.montantC),
      partNombre: pourcentage(e.nombre, premiere.nombre),
      passageMontant: prec ? pourcentage(e.montantC, prec.montantC) : null,
      passageNombre: prec ? pourcentage(e.nombre, prec.nombre) : null,
    };
  });
  const totalOppC = somme(etapes, (e) => e.montantC);
  const pipeline = {
    valeurMoyenne: opportunites.length ? euros(Math.round(totalOppC / opportunites.length)) : null,
  };

  // Opportunités à conclure en priorité : ouvertes, plus fort montant pondéré
  const prioritaires = ouvertes
    .map((o) => ({
      id: o.id,
      nom: o.nom,
      client: nomClient(clientsParId, o.client_id),
      etape: o.etape,
      montant: euros(centimes(o.montant)),
      probabilite: Number(o.probabilite) || 0,
      pondereC: Math.round(centimes(o.montant) * (Number(o.probabilite) || 0) / 100),
      dateCloture: o.date_cloture ?? null,
      depassee: Boolean(o.date_cloture) && o.date_cloture < aujourdhui,
    }))
    .sort((x, y) => y.pondereC - x.pondereC || y.montant - x.montant || String(x.nom ?? "").localeCompare(String(y.nom ?? ""), "fr"))
    .slice(0, MAX_PRIORITAIRES)
    .map(({ pondereC, ...o }) => ({ ...o, pondere: euros(pondereC) }));

  // Jauges
  const enConclusion = opportunites.filter((o) => o.etape === ETAPE_FINALE).length;
  // Taux d'encaissement : sur les factures de la période, nettes de leurs avoirs (les avoirs ne s'y ajoutent pas).
  const aEncaisserC = (f) => centimes(totalTTC(f)) - centimes(totalAvoirs(f));
  const facturesSeules = facturesPeriode.filter((f) => f.type !== "avoir");
  const ttcPeriodeC = somme(facturesSeules, aEncaisserC);
  const payePeriodeC = somme(facturesSeules, (f) => Math.max(0, Math.min(centimes(totalPaye(f)), aEncaisserC(f))));
  const jauges = {
    conclusion: {
      taux: opportunites.length ? Math.round((enConclusion / opportunites.length) * 1000) / 10 : null,
      numerateur: enConclusion,
      denominateur: opportunites.length,
    },
    encaissement: {
      taux: ttcPeriodeC ? Math.round((payePeriodeC / ttcPeriodeC) * 1000) / 10 : null,
      paye: euros(payePeriodeC),
      facture: euros(ttcPeriodeC),
    },
  };

  // Âge des créances (à date, jours depuis l'émission)
  const ages = TRANCHES_AGE.map((t) => ({ ...t, montantC: 0, nombre: 0 }));
  impayees.forEach((f) => {
    const jours = Math.max(0, joursEntre(f.date_emission, aujourdhui));
    const t = ages.find((x) => jours <= x.max);
    t.montantC += centimes(resteAPayer(f));
    t.nombre += 1;
  });
  const ageCreances = ages.map(({ cle, libelle, montantC, nombre }) => ({ cle, libelle, montant: euros(montantC), nombre }));

  // Actions suggérées (règles déterministes)
  const relances = impayees
    .filter((f) => relanceAProposer(f, aujourdhui))
    .map((f) => ({
      id: f.id,
      titre: `Relancer la facture ${f.numero}${N}: ${LIBELLE_NIVEAU[niveauSuivant(f)]}`,
      detail: `${nomClient(clientsParId, f.client_id)} · reste ${fmtEuro(euros(centimes(resteAPayer(f))))}`,
      jours: f.date_echeance ? Math.max(0, joursEntre(f.date_echeance, aujourdhui)) : null,
      lien: `/factures/${f.id}`,
    }))
    .sort((x, y) => (y.jours ?? 0) - (x.jours ?? 0) || x.titre.localeCompare(y.titre, "fr"));
  const brouillons = factures
    .filter((f) => f.statut === "brouillon")
    .map((f) => ({
      id: f.id,
      titre: `Finaliser le brouillon de ${nomClient(clientsParId, f.client_id)}`,
      detail: nomClient(clientsParId, f.client_id),
      jours: Math.max(0, joursEntre(f.date_emission, aujourdhui)),
      lien: `/factures/${f.id}`,
    }))
    .sort((x, y) => y.jours - x.jours || x.titre.localeCompare(y.titre, "fr"));
  const limiteMouvement = ajouterJours(aujourdhui, -JOURS_SANS_MOUVEMENT);
  const inactives = ouvertes
    .filter((o) => {
      const j = jourLocal(o.updated_at);
      return j && j < limiteMouvement;
    })
    .map((o) => ({
      id: o.id,
      titre: `Relancer « ${o.nom} »`,
      detail: `${nomClient(clientsParId, o.client_id)} · ${o.etape}`,
      jours: joursEntre(jourLocal(o.updated_at), aujourdhui),
      lien: `/opportunites/${o.id}/modifier`,
    }))
    .sort((x, y) => y.jours - x.jours || x.titre.localeCompare(y.titre, "fr"));
  const groupe = (cle, libelle, liste) => ({ cle, libelle, total: liste.length, elements: liste.slice(0, MAX_PAR_ACTION) });
  const actions = [
    groupe("relances", "Factures en retard à relancer", relances),
    groupe("brouillons", "Brouillons à finaliser", brouillons),
    groupe("inactives", `Opportunités sans mouvement depuis ${JOURS_SANS_MOUVEMENT} jours`, inactives),
  ];

  const facturesRecentes = [...factures]
    .sort((x, y) => (y.date_emission ?? "").localeCompare(x.date_emission ?? "") || (y.numero ?? "").localeCompare(x.numero ?? ""))
    .slice(0, 5)
    .map((f) => ({
      id: f.id,
      numero: libelleNumero(f),
      client: nomClient(clientsParId, f.client_id),
      montantTTC: euros(centimes(totalTTC(f))),
      echeance: f.date_echeance,
      statut: statutCalcule(f, aujourdhui),
    }));

  return {
    bornes: b,
    kpi,
    mensuel: mensuel.map(({ factureC, encaisseC, ...m }) => ({ ...m, facture: euros(factureC), encaisse: euros(encaisseC) })),
    secteurs,
    topClients,
    entonnoir,
    pipeline,
    prioritaires,
    jauges,
    ageCreances,
    actions,
    facturesRecentes,
    vide: {
      factures: facturesPeriode.length === 0,
      encaissements: encC === 0 && facturesPeriode.length === 0,
      opportunites: opportunites.length === 0,
      creances: impayees.length === 0,
    },
  };
}

// ---------- Activités récentes (audit_events) ----------

const statutMinuscule = (s) => (LIBELLE_STATUT[s] ?? s ?? "").toLocaleLowerCase("fr");
const fmtEuro = (n) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(n);

export function phraseActivite(evt, facturesParId = new Map()) {
  const n = evt.new_data ?? {};
  const o = evt.old_data ?? {};
  const d = evt.action === "delete" ? o : n;
  const supprimee = evt.action === "update" && !o.deleted_at && n.deleted_at;
  const restauree = evt.action === "update" && o.deleted_at && !n.deleted_at;

  switch (evt.table_name) {
    case "clients": {
      if (evt.action === "insert") return `Client ${d.nom} créé`;
      if (evt.action === "delete") return `Client ${d.nom} supprimé définitivement`;
      if (supprimee) return `Client ${d.nom} supprimé`;
      if (restauree) return `Client ${d.nom} restauré`;
      return `Fiche client ${d.nom} modifiée`;
    }
    case "factures": {
      // Un brouillon n'a pas de numéro ; « Facture … » au féminin, « Avoir … » et « Brouillon … » au masculin.
      const avoir = d.type === "avoir";
      const nom = d.numero
        ? `${LIBELLE_TYPE[d.type] ?? "Facture"} ${d.numero}`
        : `Brouillon ${avoir ? "d'avoir" : d.type === "acompte" ? "d'acompte" : d.type === "solde" ? "de solde" : "de facture"}`;
      const e = d.numero && !avoir ? "e" : "";
      if (evt.action === "insert") return `${nom} créé${e}`;
      if (evt.action === "delete") return `${nom} supprimé${e} définitivement`;
      if (supprimee) return `${nom} supprimé${e}`;
      if (restauree) return `${nom} restauré${e}`;
      if (o.statut !== n.statut && n.statut === "finalisee") return `${nom} finalisé${n.numero && !avoir ? "e" : ""}`;
      if (o.statut !== n.statut && n.statut === "annulee") return `${nom} annulée par avoir`;
      if (o.statut !== n.statut) return `${nom} marqué${e} ${statutMinuscule(n.statut)}`;
      return `${nom} modifié${e}`;
    }
    case "devis": {
      if (evt.action === "insert") return `Devis ${d.numero} créé`;
      if (evt.action === "delete") return `Devis ${d.numero} supprimé définitivement`;
      if (supprimee) return `Devis ${d.numero} supprimé`;
      if (restauree) return `Devis ${d.numero} restauré`;
      if (o.statut !== n.statut) return `Devis ${d.numero} marqué ${(LIBELLE_STATUT_DEVIS[n.statut] ?? n.statut ?? "").toLocaleLowerCase("fr")}`;
      return `Devis ${d.numero} modifié`;
    }
    case "opportunites": {
      if (evt.action === "insert") return `Opportunité « ${d.nom} » créée`;
      if (evt.action === "delete") return `Opportunité « ${d.nom} » supprimée définitivement`;
      if (supprimee) return `Opportunité « ${d.nom} » supprimée`;
      if (restauree) return `Opportunité « ${d.nom} » restaurée`;
      if (o.etape !== n.etape) return `Opportunité « ${d.nom} » passée en ${n.etape}`;
      return `Opportunité « ${d.nom} » modifiée`;
    }
    case "relances": {
      const numero = facturesParId.get(d.facture_id)?.numero;
      const niveau = LIBELLE_NIVEAU[d.niveau] ?? "Relance";
      return `${niveau} préparée${numero ? ` sur la facture ${numero}` : ""}`;
    }
    case "paiements": {
      const numero = facturesParId.get(d.facture_id)?.numero;
      const sur = numero ? ` sur la facture ${numero}` : "";
      const genre = d.sens === "remboursement" ? "Remboursement" : "Paiement";
      if (evt.action === "insert") return `${genre} de ${fmtEuro(Number(d.montant) || 0)} enregistré${sur}`;
      if (evt.action === "delete") return `${genre} de ${fmtEuro(Number(d.montant) || 0)} supprimé${sur}`;
      return `${genre} modifié${sur}`;
    }
    default:
      return `Modification dans ${evt.table_name}`;
  }
}

// « à l'instant », « il y a 5 min », « il y a 3 h », « hier », « il y a 4 j », puis la date.
export function quandRelatif(iso, maintenant = new Date()) {
  const d = new Date(iso);
  const s = Math.max(0, Math.round((maintenant - d) / 1000));
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  const jours = joursEntre(jourLocal(d.toISOString()), jourLocal(maintenant.toISOString()));
  if (jours <= 1) return "hier";
  if (jours < 7) return `il y a ${jours} j`;
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "long" });
}
