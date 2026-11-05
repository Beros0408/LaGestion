// Traduction des erreurs Supabase / PostgreSQL en messages français pour l'interface.

export const MESSAGE_REFUS =
  "Action refusée : votre rôle ne permet pas cette opération, ou l'élément n'existe plus.";

export function messageErreur(error) {
  if (!error) return "Une erreur inattendue est survenue.";
  const message = error.message || "";
  switch (error.code) {
    case "42501":
      // Refus de la RLS ou des droits ; les triggers de la base renvoient déjà un message français.
      if (/row-level security|permission denied/i.test(message)) {
        return "Action refusée : votre rôle ne permet pas cette opération dans cette entreprise.";
      }
      return message;
    case "PGRST116":
      // Mise à jour .single() sans ligne renvoyée : refus silencieux de la RLS ou ligne absente.
      return MESSAGE_REFUS;
    case "23505":
      return "Cet élément existe déjà (même e-mail, SIREN ou numéro de facture).";
    case "23503":
      return "Opération impossible : cet élément est lié à d'autres données.";
    case "23502":
      return "Opération impossible : aucune entreprise n'est sélectionnée.";
    case "P0001":
      if (message.includes("même entreprise")) {
        return "Opération refusée : l'élément lié appartient à une autre entreprise.";
      }
      return message;
    default:
      return message || "Une erreur inattendue est survenue.";
  }
}

// Conserve code et détails : certains écrans affinent le message (ex. doublon e-mail ou SIREN).
export function erreurFrancaise(error) {
  const e = new Error(messageErreur(error));
  e.code = error?.code;
  e.details = error?.details;
  return e;
}
