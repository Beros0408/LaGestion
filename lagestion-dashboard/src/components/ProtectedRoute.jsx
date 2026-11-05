import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { C } from "../theme";
import { useAuth } from "../context/AuthContext.jsx";
import { useEntreprise } from "../context/EntrepriseContext.jsx";

export default function ProtectedRoute() {
  const { user, chargement: chargementAuth } = useAuth();
  const { chargement: chargementEntreprise, entrepriseId, erreur, recharger } = useEntreprise();
  const location = useLocation();
  const chargement = chargementAuth || (user && chargementEntreprise);

  if (chargement) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{ backgroundColor: C.bgMain, fontFamily: "Inter, sans-serif" }}
      >
        <div className="flex flex-col items-center gap-3">
          <div
            className="h-10 w-10 animate-spin rounded-full border-2"
            style={{ borderColor: C.border, borderTopColor: C.primary }}
            aria-hidden="true"
          />
          <p
            className="text-sm"
            role="status"
            aria-live="polite"
            style={{ color: C.textSecondary }}
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
        style={{ backgroundColor: C.bgMain, fontFamily: "Inter, sans-serif" }}
      >
        <div role="alert" className="max-w-md text-center">
          <p className="text-sm" style={{ color: C.textPrimary }}>
            Impossible de charger votre entreprise : {erreur}
          </p>
          <button
            type="button"
            onClick={recharger}
            className="mt-4 rounded-xl px-3.5 py-2 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2"
            style={{ backgroundColor: C.primary }}
          >
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  if (!entrepriseId && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}
