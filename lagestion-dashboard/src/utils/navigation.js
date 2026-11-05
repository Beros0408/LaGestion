// Page parente logique et libellé du fil d'Ariane de chaque écran (routes de App.jsx).
// Sert au bouton « Retour » quand il n'y a pas d'historique dans l'application (lien ouvert directement).
import { matchPath } from "react-router-dom";

// Ordre important : les routes les plus spécifiques d'abord (« /clients/nouveau » avant « /clients/:id »).
const ROUTES = [
  { motif: "/dashboard", libelle: "Tableau de bord", parent: null },
  { motif: "/clients", libelle: "Clients", parent: () => "/dashboard" },
  { motif: "/clients/nouveau", libelle: "Nouveau client", parent: () => "/clients" },
  { motif: "/clients/:id/modifier", libelle: "Modifier le client", parent: ({ id }) => `/clients/${id}` },
  { motif: "/clients/:id", libelle: "Fiche client", parent: () => "/clients" },
  { motif: "/opportunites", libelle: "Opportunités", parent: () => "/dashboard" },
  { motif: "/opportunites/nouvelle", libelle: "Nouvelle opportunité", parent: () => "/opportunites" },
  { motif: "/opportunites/:id/modifier", libelle: "Modifier l'opportunité", parent: () => "/opportunites" },
  { motif: "/devis", libelle: "Devis", parent: () => "/dashboard" },
  { motif: "/devis/nouveau", libelle: "Nouveau devis", parent: () => "/devis" },
  { motif: "/devis/:id/modifier", libelle: "Modifier le devis", parent: ({ id }) => `/devis/${id}` },
  { motif: "/devis/:id", libelle: "Fiche devis", parent: () => "/devis" },
  { motif: "/factures", libelle: "Factures", parent: () => "/dashboard" },
  { motif: "/factures/nouvelle", libelle: "Nouvelle facture", parent: () => "/factures" },
  { motif: "/factures/:id/modifier", libelle: "Modifier la facture", parent: ({ id }) => `/factures/${id}` },
  { motif: "/factures/:id", libelle: "Fiche facture", parent: () => "/factures" },
  { motif: "/catalogue", libelle: "Catalogue", parent: () => "/dashboard" },
  { motif: "/catalogue/nouveau", libelle: "Nouvel article", parent: () => "/catalogue" },
  { motif: "/catalogue/:id/modifier", libelle: "Modifier l'article", parent: () => "/catalogue" },
];

function trouver(chemin) {
  for (const r of ROUTES) {
    const m = matchPath({ path: r.motif, end: true }, chemin);
    if (m) return { route: r, params: m.params };
  }
  return null;
}

// Page parente (null pour le tableau de bord, page d'accueil) ; route inconnue → tableau de bord.
export function pageParente(chemin) {
  const t = trouver(chemin);
  if (!t) return "/dashboard";
  return t.route.parent ? t.route.parent(t.params) : null;
}

export function libellePage(chemin) {
  return trouver(chemin)?.route.libelle ?? "Tableau de bord";
}
