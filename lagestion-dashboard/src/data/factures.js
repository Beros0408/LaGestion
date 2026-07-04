export const STATUTS = ["Payée", "En attente", "En retard", "Brouillon"];

export const TAUX_TVA = [20, 10, 5.5, 0];

export const factures = [
  {
    id: 1,
    numero: "FAC-2026-0001",
    clientId: 1,
    dateEmission: "2026-04-14",
    dateEcheance: "2026-05-14",
    statut: "Payée",
    lignes: [
      { description: "Prestation d'expertise — 2 journées", quantite: 2, prixUnitaire: 750, tauxTva: 20 },
    ],
  },
  {
    id: 2,
    numero: "FAC-2026-0002",
    clientId: 4,
    dateEmission: "2026-04-22",
    dateEcheance: "2026-05-22",
    statut: "Payée",
    lignes: [
      { description: "Licence suite bureautique — 15 postes", quantite: 15, prixUnitaire: 289, tauxTva: 20 },
      { description: "Mise en service et paramétrage", quantite: 1, prixUnitaire: 850, tauxTva: 20 },
    ],
  },
  {
    id: 3,
    numero: "FAC-2026-0003",
    clientId: 5,
    dateEmission: "2026-05-02",
    dateEcheance: "2026-06-02",
    statut: "Payée",
    lignes: [
      { description: "Accompagnement conformité RGPD — forfait", quantite: 1, prixUnitaire: 4200, tauxTva: 20 },
    ],
  },
  {
    id: 4,
    numero: "FAC-2026-0004",
    clientId: 11,
    dateEmission: "2026-05-10",
    dateEcheance: "2026-06-10",
    statut: "En retard",
    lignes: [
      { description: "Développement programme de fidélité", quantite: 1, prixUnitaire: 6800, tauxTva: 20 },
      { description: "Cartes fidélité imprimées", quantite: 500, prixUnitaire: 1.2, tauxTva: 10 },
    ],
  },
  {
    id: 5,
    numero: "FAC-2026-0005",
    clientId: 2,
    dateEmission: "2026-05-18",
    dateEcheance: "2026-06-18",
    statut: "Payée",
    lignes: [
      { description: "Maintenance annuelle — abonnement mensuel", quantite: 12, prixUnitaire: 950, tauxTva: 20 },
    ],
  },
  {
    id: 6,
    numero: "FAC-2026-0006",
    clientId: 18,
    dateEmission: "2026-05-25",
    dateEcheance: "2026-06-25",
    statut: "Payée",
    lignes: [
      { description: "Postes téléphoniques IP", quantite: 8, prixUnitaire: 320, tauxTva: 20 },
      { description: "Configuration réseau", quantite: 1, prixUnitaire: 1400, tauxTva: 20 },
    ],
  },
  {
    id: 7,
    numero: "FAC-2026-0007",
    clientId: 20,
    dateEmission: "2026-06-04",
    dateEcheance: "2026-07-04",
    statut: "En attente",
    lignes: [
      { description: "Renouvellement 10 postes de travail", quantite: 10, prixUnitaire: 1590, tauxTva: 20 },
    ],
  },
  {
    id: 8,
    numero: "FAC-2026-0008",
    clientId: 9,
    dateEmission: "2026-06-10",
    dateEcheance: "2026-07-10",
    statut: "En attente",
    lignes: [
      { description: "Solution signature électronique — 12 mois", quantite: 1, prixUnitaire: 4800, tauxTva: 20 },
    ],
  },
  {
    id: 9,
    numero: "FAC-2026-0009",
    clientId: 24,
    dateEmission: "2026-06-16",
    dateEcheance: "2026-07-16",
    statut: "En attente",
    lignes: [
      { description: "Étude de faisabilité industrielle", quantite: 1, prixUnitaire: 8500, tauxTva: 20 },
    ],
  },
  {
    id: 10,
    numero: "FAC-2026-0010",
    clientId: 7,
    dateEmission: "2026-06-20",
    dateEcheance: "2026-06-27",
    statut: "En retard",
    lignes: [
      { description: "Formation outils collaboratifs (2 journées)", quantite: 2, prixUnitaire: 850, tauxTva: 20 },
    ],
  },
  {
    id: 11,
    numero: "FAC-2026-0011",
    clientId: 13,
    dateEmission: "2026-06-24",
    dateEcheance: "2026-07-24",
    statut: "Brouillon",
    lignes: [
      { description: "Développement application interne — spécifications", quantite: 1, prixUnitaire: 3400, tauxTva: 20 },
    ],
  },
  {
    id: 12,
    numero: "FAC-2026-0012",
    clientId: 14,
    dateEmission: "2026-06-30",
    dateEcheance: "2026-07-30",
    statut: "Brouillon",
    lignes: [
      { description: "Consultation graphique — projet identité", quantite: 1, prixUnitaire: 480, tauxTva: 20 },
    ],
  },
];
