import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { BORDURE_CARTE, C, FOND_HORS_APPLICATION, alpha } from "../theme";
import { useAuth } from "../context/AuthContext.jsx";
import { useEntreprise } from "../context/EntrepriseContext.jsx";
import AccesSuspendu from "../pages/AccesSuspendu.jsx";
import NomProfil from "../pages/NomProfil.jsx";

export default function ProtectedRoute() {
  const { user, chargement: chargementAuth } = useAuth();
  const { chargement: chargementEntreprise, entrepriseId, suspendues, erreur, recharger, profilSansNom } = useEntreprise();
  const location = useLocation();
  const chargement = chargementAuth || (user && chargementEntreprise);

  if (chargement) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ background: FOND_HORS_APPLICATION, fontFamily: "Inter, sans-serif" }}
      >
        <div className="flex flex-col items-center gap-3">
          <div
            className="h-10 w-10 animate-spin rounded-full border-2"
            style={{ borderColor: alpha(C.onPrimary, 0.35), borderTopColor: C.onPrimary }}
            aria-hidden="true"
          />
          <p
            className="text-sm"
            role="status"
            aria-live="polite"
            style={{ color: C.onPrimary }}
          >
            Chargement…
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (erreur) {
    return (
      <div
        className="flex min-h-screen items-center justify-center p-4"
        style={{ background: FOND_HORS_APPLICATION, fontFamily: "Inter, sans-serif" }}
      >
        <div role="alert" className="max-w-md text-center">
          <p className="text-sm" style={{ color: C.onPrimary }}>
            Impossible de charger votre entreprise : {erreur}
          </p>
          <button
            type="button"
            onClick={recharger}
            className="mt-4 rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
            style={{ backgroundColor: C.fondCarte, color: C.textPrimary, border: BORDURE_CARTE }}
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  // Profil sans nom : demandé avant tout autre écran (ses collègues le verraient « Membre sans nom »).
  if (profilSansNom) return <NomProfil />;

  // Aucune entreprise active : accès suspendu partout → page dédiée (création d'une entreprise possible) ;
  // sinon, création de la première entreprise.
  if (!entrepriseId && location.pathname !== "/onboarding") {
    if (suspendues.length > 0) return <AccesSuspendu />;
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}
