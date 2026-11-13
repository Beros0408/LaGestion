import React, { useState } from "react";
import { UserRound } from "lucide-react";
import { BORDURE_CARTE, C, FOND_HORS_APPLICATION, OMBRE, alpha } from "../theme";
import Input from "../components/form/Input.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useEntreprise } from "../context/EntrepriseContext.jsx";
import { erreurNomProfil, NOM_PROFIL_MAX } from "../utils/equipe";

// Affichée par ProtectedRoute tant que le profil de l'utilisateur connecté n'a pas de nom (compte créé dans
// Supabase, inscription sans nom) : ses collègues le voient sinon « Membre sans nom ». Seul son propre profil
// est lu et écrit (RLS modification_profil) ; aucune donnée des collègues.
export default function NomProfil() {
  const { signOut } = useAuth();
  const { nomInscription, enregistrerNom } = useEntreprise();
  const [nom, setNom] = useState(nomInscription);
  const [erreur, setErreur] = useState(null);
  const [erreurEnvoi, setErreurEnvoi] = useState(null);
  const [enCours, setEnCours] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const err = erreurNomProfil(nom);
    setErreur(err);
    if (err) return;
    setErreurEnvoi(null);
    setEnCours(true);
    try {
      await enregistrerNom(nom.trim());
    } catch (ex) {
      setErreurEnvoi(ex?.message || "Enregistrement impossible.");
      setEnCours(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ background: FOND_HORS_APPLICATION, fontFamily: "Inter, sans-serif" }}>
      <main
        className="w-full max-w-md rounded-2xl p-6 sm:p-8"
        style={{ backgroundColor: C.fondCarte, border: BORDURE_CARTE, boxShadow: OMBRE.md }}
        aria-labelledby="titre-nom-profil"
      >
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: C.primary }} aria-hidden="true">
            <UserRound size={20} style={{ color: C.onPrimary }} />
          </div>
          <div className="min-w-0">
            <h1 id="titre-nom-profil" className="text-lg font-bold" style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}>
              Comment vous appelez-vous{" "}?
            </h1>
            <p className="mt-0.5 text-sm" style={{ color: C.textSecondary }}>
              Votre nom est affiché à vos collègues, par exemple comme responsable d'une tâche.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <Input
            label="Votre nom"
            required
            autoComplete="name"
            autoFocus
            maxLength={NOM_PROFIL_MAX}
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            error={erreur}
            hint="Prénom et nom, par exemple Marie Dupont."
          />
          {erreurEnvoi && (
            <div role="alert" className="rounded-xl p-3 text-sm" style={{ backgroundColor: alpha(C.error, 0.08), color: C.errorText, border: `1px solid ${C.error}` }}>
              {erreurEnvoi}
            </div>
          )}
          <button
            type="submit"
            disabled={enCours}
            className="inline-flex w-full items-center justify-center rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-70"
            style={{ color: C.onPrimary, backgroundColor: C.primary }}
          >
            {enCours ? "Enregistrement…" : "Continuer"}
          </button>
          <button
            type="button"
            onClick={() => signOut().catch(() => {})}
            className="w-full rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
            style={{ color: C.textSecondary, border: `1px solid ${C.border}` }}
          >
            Se déconnecter
          </button>
        </form>
      </main>
    </div>
  );
}
