// Double authentification (TOTP de Supabase Auth, migration 018) : règles d'affichage et de saisie.
// La base fait foi (aal_suffisant) ; ces fonctions décident seulement de l'écran à montrer.

const N = " ";

export const LONGUEUR_CODE = 6;

// Code tapé avec ou sans espaces (« 123 456 ») : six chiffres.
export const normaliserCode = (code) => String(code ?? "").replace(/\s/g, "");
export const codeValide = (code) => new RegExp(`^\\d{${LONGUEUR_CODE}}$`).test(normaliserCode(code));

const totp = (facteurs) => (facteurs ?? []).filter((f) => f?.factor_type === "totp");
export const facteursVerifies = (facteurs) => totp(facteurs).filter((f) => f.status === "verified");
// Activation commencée puis abandonnée (QR code affiché, code jamais saisi) : à supprimer avant d'en recommencer une.
export const facteursInacheves = (facteurs) => totp(facteurs).filter((f) => f.status !== "verified");

// Même règle que aal_suffisant() en base : un facteur vérifié et une session encore en aal1 → code à saisir.
export const codeRequis = (niveauActuel, facteurs) => niveauActuel !== "aal2" && facteursVerifies(facteurs).length > 0;

// Nom d'appareil unique par utilisateur (exigé par Supabase) : « Téléphone », puis « Appareil de secours », puis numérotés.
export function nomNouvelAppareil(facteurs) {
  const pris = new Set(totp(facteurs).map((f) => f.friendly_name));
  const candidats = ["Téléphone", "Appareil de secours"];
  for (const nom of candidats) if (!pris.has(nom)) return nom;
  let i = 3;
  while (pris.has(`Appareil ${i}`)) i += 1;
  return `Appareil ${i}`;
}

// Clé de saisie manuelle lisible : groupes de quatre caractères.
export const clePresentee = (secret) => String(secret ?? "").replace(/\s/g, "").replace(/(.{4})(?=.)/g, "$1 ");

// Messages de Supabase Auth (en anglais) → français ; tout autre cas : message technique fourni par l'appelant.
export function messageErreurMfa(err, messageParDefaut) {
  const m = `${err?.code ?? ""} ${err?.message ?? ""}`.toLowerCase();
  if (m.includes("invalid totp") || m.includes("mfa_verification_failed") || m.includes("invalid code")) {
    return `Code incorrect ou expiré. Saisissez le code affiché en ce moment par l'application (il change toutes les 30${N}secondes).`;
  }
  if (m.includes("rate limit") || m.includes("too many")) return "Trop de tentatives. Patientez une minute avant de réessayer.";
  if (m.includes("enroll") && (m.includes("disabled") || m.includes("not_enabled") || m.includes("not enabled"))) {
    return "La double authentification n'est pas encore activée sur ce service. Contactez le support.";
  }
  if (m.includes("aal2")) return "Saisissez d'abord votre code de double authentification, puis recommencez.";
  if (m.includes("expired") || m.includes("challenge")) return "La vérification a expiré. Saisissez un nouveau code.";
  return messageParDefaut;
}
