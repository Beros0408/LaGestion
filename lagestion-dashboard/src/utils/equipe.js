// Équipe (migration 017) : libellés, lien d'invitation, contrôles de saisie, choix de réassignation.
// La base fait foi (garde du dernier admin, droits) ; ces fonctions ne servent qu'à l'affichage et aux formulaires.

export const ROLES = ["admin", "manager", "commercial", "comptable", "lecture"];
export const ROLES_ECRITURE = ["admin", "manager", "commercial", "comptable"];

export const LIBELLE_STATUT_MEMBRE = { actif: "Actif", suspendu: "Suspendu" };

// Même forme que le contrôle de creer_invitation : un @, un point dans le domaine, aucun espace.
export const emailValide = (email) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(email ?? "").trim());

export const normaliserEmail = (email) => String(email ?? "").trim().toLowerCase();

export const lienInvitation = (origine, token) => `${String(origine).replace(/\/+$/, "")}/invitation/${token}`;

export const invitationExpiree = (invitation, maintenant = new Date()) => new Date(invitation.expires_at) <= maintenant;

// Membres qui peuvent reprendre les tâches d'un autre : actifs, rôle qui écrit, autre que lui.
export const repreneursPossibles = (membres, userId) =>
  membres.filter((m) => m.user_id !== userId && m.statut === "actif" && ROLES_ECRITURE.includes(m.role));

// Réassignation proposée : seulement si le membre a des tâches à faire et qu'il cesse de pouvoir les traiter
// (retrait, suspension, passage en lecture).
export function reassignationProposee(action, membre, nouveauRole) {
  if (!membre || (membre.taches_a_faire ?? 0) === 0) return false;
  if (action === "retirer" || action === "suspendre") return true;
  return action === "role" && nouveauRole === "lecture" && membre.role !== "lecture";
}

// Admins actifs autres que userId : 0 → l'action sur userId serait refusée par la base (annoncé avant).
export const autresAdminsActifs = (membres, userId) =>
  membres.filter((m) => m.user_id !== userId && m.role === "admin" && m.statut === "actif").length;

export function perdAdmin(action, membre, nouveauRole) {
  if (!membre || membre.role !== "admin" || membre.statut !== "actif") return false;
  if (action === "retirer" || action === "suspendre") return true;
  return action === "role" && nouveauRole !== "admin";
}

export const MESSAGE_DERNIER_ADMIN =
  "Impossible : l'entreprise doit garder au moins un administrateur actif. Nommez d'abord un autre administrateur.";

// Nom du profil, demandé à la connexion tant qu'il est vide (vu par les collègues, ex. responsable d'une tâche).
// Message d'erreur, ou null si le nom convient : 2 à 80 caractères, pas une adresse e-mail.
export const NOM_PROFIL_MIN = 2;
export const NOM_PROFIL_MAX = 80;
export function erreurNomProfil(nom) {
  const n = String(nom ?? "").trim();
  if (n.length < NOM_PROFIL_MIN) return `Saisissez votre nom (${NOM_PROFIL_MIN} caractères au moins).`;
  if (n.length > NOM_PROFIL_MAX) return `${NOM_PROFIL_MAX} caractères au plus.`;
  if (emailValide(n)) return "Saisissez votre nom, pas une adresse e-mail : il est affiché à vos collègues.";
  return null;
}

// Nom affiché d'un membre : nom du profil, sinon partie locale de l'e-mail (admin), sinon libellé neutre.
export const nomMembre = (m) => m.nom?.trim() || (m.email ? m.email.split("@")[0] : "") || "Membre sans nom";
