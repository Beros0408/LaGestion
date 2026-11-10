// Entreprise courante d'un utilisateur membre de plusieurs entreprises (migration 016).

// Ancienne clé commune à tous les comptes du navigateur : supprimée, jamais reprise.
export const ANCIENNE_CLE = "lagestion.entrepriseCourante";

// Une clé par utilisateur : un autre compte connecté sur le même navigateur ne reprend pas ce choix.
export function cleMemorisation(userId) {
  return `${ANCIENNE_CLE}.${userId}`;
}

// Entreprise mémorisée si l'utilisateur en est toujours membre, sinon la première de la liste ; null sans appartenance.
export function entrepriseInitiale(appartenances, memorisee) {
  const courante = appartenances.find((a) => a.entrepriseId === memorisee) ?? appartenances[0] ?? null;
  return courante?.entrepriseId ?? null;
}

// Même règle que la contrainte entreprises_logo_dossier : {entreprise_id}/logo-{horodatage}.png|jpg.
export function cheminLogoAutorise(chemin, entrepriseId) {
  if (typeof chemin !== "string" || !entrepriseId) return false;
  const prefixe = `${entrepriseId}/logo-`;
  if (!chemin.startsWith(prefixe)) return false;
  return /^[0-9]+\.(png|jpg)$/.test(chemin.slice(prefixe.length));
}

export const MESSAGE_LOGO_REFUSE = "Logo refusé : son chemin n'appartient pas à l'entreprise courante.";

// Changement d'entreprise ou création refusés pendant l'écriture d'un import.
export function messageImportEnCours(nomEntreprise) {
  return `Un import est en cours dans ${nomEntreprise}. Attendez la fin avant de changer d'entreprise.`;
}
