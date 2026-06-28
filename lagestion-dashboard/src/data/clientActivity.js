const PROFIL_ACTIF = {
  interactions: [
    { id: "i1", type: "email",   titre: "Devis envoyé",        date: "2026-06-26", description: "Envoi du devis pour la prestation annuelle, en attente de retour." },
    { id: "i2", type: "appel",   titre: "Appel de cadrage",    date: "2026-06-20", description: "Échange avec le décisionnaire sur le périmètre et les délais." },
    { id: "i3", type: "reunion", titre: "Atelier découverte",  date: "2026-06-12", description: "Présentation de l'offre, identification des besoins clés." },
    { id: "i4", type: "note",    titre: "Note interne",        date: "2026-06-03", description: "Client très réactif, fort potentiel d'extension de contrat." },
    { id: "i5", type: "email",   titre: "Premier contact",     date: "2026-05-22", description: "Demande de renseignements via le formulaire du site." },
  ],
  opportunites: [
    { id: "op1", nom: "Refonte espace de travail", montant: 28000, statut: "negociation" },
    { id: "op2", nom: "Pack maintenance 12 mois",  montant: 9600,  statut: "proposition" },
  ],
  factures: [
    { id: "f1", num: "FAC-2026-0612", montant: 4820, statut: "payee",      echeance: "12 juin 2026" },
    { id: "f2", num: "FAC-2026-0589", montant: 6300, statut: "payee",      echeance: "28 mai 2026" },
    { id: "f3", num: "FAC-2026-0631", montant: 8950, statut: "en_attente", echeance: "30 juin 2026" },
  ],
  documents: [
    { id: "d1", nom: "Contrat-cadre.pdf",        taille: "412 Ko" },
    { id: "d2", nom: "Cahier-des-charges.docx",  taille: "78 Ko"  },
    { id: "d3", nom: "Devis-2026-0312.pdf",      taille: "188 Ko" },
  ],
};

const PROFIL_PROSPECT = {
  interactions: [
    { id: "i1", type: "appel",   titre: "Premier appel",          date: "2026-06-24", description: "Découverte du besoin, prise de rendez-vous." },
    { id: "i2", type: "email",   titre: "Documentation envoyée",  date: "2026-06-21", description: "Plaquette commerciale et grille tarifaire transmises." },
    { id: "i3", type: "note",    titre: "Note interne",           date: "2026-06-18", description: "Budget annoncé, décision attendue sous 4 semaines." },
  ],
  opportunites: [
    { id: "op1", nom: "Diagnostic flash", montant: 4500, statut: "qualification" },
  ],
  factures: [],
  documents: [
    { id: "d1", nom: "Plaquette-commerciale.pdf", taille: "1,2 Mo" },
  ],
};

const PROFIL_INACTIF = {
  interactions: [
    { id: "i1", type: "email",   titre: "Tentative de relance", date: "2026-06-08", description: "Relance sans retour à ce jour." },
    { id: "i2", type: "note",    titre: "Note interne",         date: "2026-05-15", description: "Pas de projet identifié à court terme, à recontacter au T3." },
    { id: "i3", type: "reunion", titre: "Dernier point annuel", date: "2026-03-04", description: "Bilan du contrat 2025, pas de reconduction immédiate." },
  ],
  opportunites: [],
  factures: [
    { id: "f1", num: "FAC-2025-1124", montant: 2310, statut: "retard", echeance: "10 décembre 2025" },
  ],
  documents: [
    { id: "d1", nom: "Bilan-contrat-2025.pdf", taille: "320 Ko" },
  ],
};

const PROFIL_PREMIUM = {
  interactions: [
    { id: "i1", type: "reunion", titre: "Comité de pilotage trimestriel", date: "2026-06-27", description: "Revue des indicateurs et roadmap S2 2026." },
    { id: "i2", type: "email",   titre: "Reporting mensuel envoyé",       date: "2026-06-15", description: "Synthèse des actions et résultats du mois." },
    { id: "i3", type: "appel",   titre: "Point de coordination",          date: "2026-06-09", description: "Validation du planning de déploiement de la phase 2." },
    { id: "i4", type: "reunion", titre: "Atelier stratégique",            date: "2026-05-28", description: "Définition des objectifs annuels et arbitrages budgétaires." },
    { id: "i5", type: "note",    titre: "Note interne",                   date: "2026-05-12", description: "Compte stratégique : point trimestriel avec la direction à prévoir." },
  ],
  opportunites: [
    { id: "op1", nom: "Renouvellement contrat-cadre 2027",   montant: 124000, statut: "negociation" },
    { id: "op2", nom: "Mission complémentaire — audit RGPD", montant: 18500,  statut: "proposition" },
    { id: "op3", nom: "Extension périmètre filiale Sud",     montant: 42000,  statut: "qualification" },
  ],
  factures: [
    { id: "f1", num: "FAC-2026-0608", montant: 18750, statut: "en_attente", echeance: "30 juin 2026" },
    { id: "f2", num: "FAC-2026-0571", montant: 22400, statut: "payee",      echeance: "31 mai 2026" },
    { id: "f3", num: "FAC-2026-0534", montant: 21500, statut: "payee",      echeance: "30 avril 2026" },
  ],
  documents: [
    { id: "d1", nom: "Contrat-cadre-2026.pdf",             taille: "688 Ko" },
    { id: "d2", nom: "Reporting-juin-2026.pdf",            taille: "245 Ko" },
    { id: "d3", nom: "Plan-de-charge.xlsx",                taille: "94 Ko"  },
    { id: "d4", nom: "Compte-rendu-comite-2026-06.docx",   taille: "57 Ko"  },
  ],
};

const PROFIL_VIDE = {
  interactions: [],
  opportunites: [],
  factures: [],
  documents: [],
};

const PROFILS_PAR_ID = {
  1:  PROFIL_ACTIF,
  2:  PROFIL_ACTIF,
  3:  PROFIL_INACTIF,
  4:  PROFIL_PREMIUM,
  5:  PROFIL_ACTIF,
  6:  PROFIL_PROSPECT,
  7:  PROFIL_ACTIF,
  8:  PROFIL_PROSPECT,
  9:  PROFIL_ACTIF,
  10: PROFIL_INACTIF,
  11: PROFIL_ACTIF,
  12: PROFIL_PROSPECT,
  13: PROFIL_ACTIF,
  14: PROFIL_ACTIF,
  15: PROFIL_INACTIF,
  16: PROFIL_PROSPECT,
  17: PROFIL_ACTIF,
  18: PROFIL_ACTIF,
  19: PROFIL_PROSPECT,
  20: PROFIL_PREMIUM,
  21: PROFIL_INACTIF,
  22: PROFIL_ACTIF,
  23: PROFIL_PROSPECT,
  24: PROFIL_ACTIF,
};

export function getClientActivity(id) {
  return PROFILS_PAR_ID[id] ?? PROFIL_VIDE;
}
