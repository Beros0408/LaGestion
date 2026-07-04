export const ETAPES = ["Qualification", "Proposition", "Négociation", "Conclusion"];

export const opportunites = [
  { id: 1,  clientId: 1,  nom: "Refonte du site vitrine",              montant: 18500, probabilite: 25, etape: "Qualification", dateCloture: "2026-09-30", responsable: "Camille Lambert" },
  { id: 2,  clientId: 8,  nom: "Migration ERP vers Cloud",              montant: 42000, probabilite: 30, etape: "Qualification", dateCloture: "2026-10-15", responsable: "Camille Lambert" },
  { id: 3,  clientId: 16, nom: "Charte graphique et logo",              montant: 6800,  probabilite: 20, etape: "Qualification", dateCloture: "2026-08-22", responsable: "Nadia Bertrand" },
  { id: 4,  clientId: 19, nom: "Audit SEO et plan éditorial",           montant: 4200,  probabilite: 25, etape: "Qualification", dateCloture: "2026-09-05", responsable: "Nadia Bertrand" },

  { id: 5,  clientId: 2,  nom: "Contrat maintenance annuel",            montant: 12500, probabilite: 45, etape: "Proposition",   dateCloture: "2026-08-14", responsable: "Camille Lambert" },
  { id: 6,  clientId: 4,  nom: "Déploiement suite bureautique",         montant: 27800, probabilite: 55, etape: "Proposition",   dateCloture: "2026-09-18", responsable: "Julien Marchand" },
  { id: 7,  clientId: 13, nom: "Développement application interne",     montant: 34500, probabilite: 50, etape: "Proposition",   dateCloture: "2026-10-02", responsable: "Julien Marchand" },
  { id: 8,  clientId: 20, nom: "Renouvellement parc informatique",      montant: 21200, probabilite: 40, etape: "Proposition",   dateCloture: "2026-08-28", responsable: "Camille Lambert" },

  { id: 9,  clientId: 5,  nom: "Accompagnement conformité RGPD",        montant: 9600,  probabilite: 65, etape: "Négociation",   dateCloture: "2026-07-24", responsable: "Nadia Bertrand" },
  { id: 10, clientId: 9,  nom: "Solution de signature électronique",    montant: 5400,  probabilite: 70, etape: "Négociation",   dateCloture: "2026-07-30", responsable: "Julien Marchand" },
  { id: 11, clientId: 24, nom: "Étude de faisabilité industrielle",     montant: 14300, probabilite: 60, etape: "Négociation",   dateCloture: "2026-08-08", responsable: "Camille Lambert" },

  { id: 12, clientId: 11, nom: "Programme fidélité clientèle",          montant: 7200,  probabilite: 90, etape: "Conclusion",    dateCloture: "2026-07-12", responsable: "Nadia Bertrand" },
  { id: 13, clientId: 18, nom: "Équipement téléphonie IP",              montant: 8900,  probabilite: 85, etape: "Conclusion",    dateCloture: "2026-07-18", responsable: "Julien Marchand" },
  { id: 14, clientId: 7,  nom: "Formation outils collaboratifs",        montant: 3200,  probabilite: 95, etape: "Conclusion",    dateCloture: "2026-07-09", responsable: "Camille Lambert" },
];
