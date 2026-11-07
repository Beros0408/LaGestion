// Tâches et activités (migration 012) : règles d'affichage, sans écriture.
import { jourParis } from "./facture.js";

export const LIBELLE_ETAT_TACHE = {
  en_retard: "En retard",
  aujourdhui: "Aujourd'hui",
  a_venir: "À faire",
  faite: "Faite",
};

export const LIBELLE_TYPE_ACTIVITE = {
  appel: "Appel",
  rendez_vous: "Rendez-vous",
  email: "E-mail",
  note: "Note",
};

// Même règle que les factures (etatEcheance) : en retard le lendemain de l'échéance, pas le jour même.
export function etatTache(tache, jour = jourParis()) {
  if (tache?.statut === "faite") return "faite";
  if (tache?.echeance && tache.echeance < jour) return "en_retard";
  if (tache?.echeance === jour) return "aujourdhui";
  return "a_venir";
}

// Compteur de l'en-tête : tâches à faire en retard dont l'utilisateur est responsable.
export const nombreEnRetard = (taches, userId, jour = jourParis()) =>
  (taches ?? []).filter((t) => t.responsable === userId && !t.deleted_at && etatTache(t, jour) === "en_retard").length;

export const libelleEnRetard = (n) => (n === 1 ? "1 tâche en retard" : `${n} tâches en retard`);

// À faire d'abord (échéance la plus ancienne en tête), puis faites (la plus récente en tête).
export function trierTaches(taches) {
  return [...(taches ?? [])].sort((a, b) => {
    if (a.statut !== b.statut) return a.statut === "faite" ? 1 : -1;
    if (a.statut === "faite") return (b.faite_le ?? "").localeCompare(a.faite_le ?? "");
    return (a.echeance ?? "").localeCompare(b.echeance ?? "") || (a.titre ?? "").localeCompare(b.titre ?? "", "fr");
  });
}

// Mêmes droits que verifier_tache et verifier_activite (migration 012), pour n'afficher que les actions permises.
export const ROLES_ECRITURE = ["admin", "manager", "commercial", "comptable"];
export const peutChangerStatut = (role) => ROLES_ECRITURE.includes(role);
export const peutModifierTache = (tache, userId, role) =>
  ROLES_ECRITURE.includes(role) && (["admin", "manager"].includes(role) || tache?.auteur === userId || tache?.responsable === userId);
export const peutModifierActivite = (activite, userId, role) =>
  ROLES_ECRITURE.includes(role) && (["admin", "manager"].includes(role) || activite?.auteur === userId);

// Suggestion du tableau de bord → tâche (origine et objet lié, une seule tâche à faire par suggestion en base).
const ORIGINE_PAR_GROUPE = { relances: "relance", brouillons: "brouillon", inactives: "opportunite_inactive" };

export function tacheDepuisSuggestion(groupe, element, userId, jour = jourParis()) {
  const origine = ORIGINE_PAR_GROUPE[groupe];
  if (!origine || !element?.id) return null;
  return {
    titre: element.titre,
    echeance: jour,
    responsable: userId,
    origine,
    ...(origine === "opportunite_inactive" ? { opportunite_id: element.id } : { facture_id: element.id }),
  };
}

// Tâche à faire déjà créée pour cette suggestion (même règle que l'index uniq_taches_origine).
export function tacheDeSuggestion(taches, groupe, element) {
  const origine = ORIGINE_PAR_GROUPE[groupe];
  return (taches ?? []).find((t) => !t.deleted_at && t.statut === "a_faire" && t.origine === origine
    && (t.facture_id === element.id || t.opportunite_id === element.id)) ?? null;
}

// Historique d'un client : ses activités, celles de ses opportunités, et les relances de ses factures (lecture seule),
// de la plus récente à la plus ancienne.
export function historiqueClient({ clientId, activites = [], opportunites = [], factures = [] }) {
  const opps = new Map(opportunites.filter((o) => o.client_id === clientId).map((o) => [o.id, o]));
  const elements = activites
    .filter((a) => !a.deleted_at && (a.client_id === clientId || opps.has(a.opportunite_id)))
    .map((a) => ({
      cle: `a-${a.id}`,
      sorte: "activite",
      type: a.type,
      date: a.date_activite,
      auteur: a.auteur_nom,
      texte: a.commentaire,
      opportunite: opps.get(a.opportunite_id)?.nom ?? null,
      activite: a,
    }));
  factures
    .filter((f) => f.client_id === clientId)
    .forEach((f) => (f.relances ?? []).forEach((r) => elements.push({
      cle: `r-${r.id}`,
      sorte: "relance",
      type: "relance",
      date: r.created_at,
      auteur: r.auteur_nom,
      texte: r.objet,
      niveau: r.niveau,
      facture: f,
    })));
  return elements.sort((x, y) => (y.date ?? "").localeCompare(x.date ?? ""));
}
