import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { C } from "../theme";
import { useAuth } from "../context/AuthContext.jsx";

export default function ProtectedRoute() {
  const { user, chargement } = useAuth();
  const location = useLocation();

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

  return <Outlet />;
}
