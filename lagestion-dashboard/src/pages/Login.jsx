import React, { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { LogIn } from "lucide-react";
import { C } from "../theme";
import Input from "../components/form/Input.jsx";
import { useAuth } from "../context/AuthContext.jsx";

function traduireErreur(err) {
  const message = (err?.message || "").toLowerCase();
  if (message.includes("invalid login")) {
    return "Identifiants invalides. Vérifiez votre e-mail et votre mot de passe.";
  }
  if (message.includes("email not confirmed")) {
    return "Adresse e-mail non confirmée. Consultez votre boîte de réception.";
  }
  if (message.includes("rate limit")) {
    return "Trop de tentatives. Réessayez dans quelques instants.";
  }
  return err?.message || "Une erreur est survenue lors de la connexion.";
}

export default function Login() {
  const { user, chargement, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [erreur, setErreur] = useState("");
  const [enCours, setEnCours] = useState(false);

  if (!chargement && user) {
    const destination = location.state?.from?.pathname || "/dashboard";
    return <Navigate to={destination} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErreur("");
    setEnCours(true);
    try {
      await signIn(email.trim(), motDePasse);
      const destination = location.state?.from?.pathname || "/dashboard";
      navigate(destination, { replace: true });
    } catch (err) {
      setErreur(traduireErreur(err));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ backgroundColor: C.bgMain, fontFamily: "Inter, sans-serif" }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Sora:wght@600;700&display=swap');`}</style>

      <main
        className="w-full max-w-md rounded-2xl p-6 sm:p-8"
        style={{
          backgroundColor: C.bgCard,
          border: `1px solid ${C.border}`,
          boxShadow: "0 4px 12px rgba(45,52,54,0.08)",
        }}
        aria-labelledby="titre-connexion"
      >
        <div className="mb-6 flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.secondary})` }}
            aria-hidden="true"
          >
            <span
              className="text-lg font-bold text-white"
              style={{ fontFamily: "Sora, sans-serif" }}
            >
              L
            </span>
          </div>
          <div>
            <h1
              id="titre-connexion"
              className="text-lg font-bold"
              style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}
            >
              Lagestion
            </h1>
            <p className="text-xs" style={{ color: C.textSecondary }}>
              Connexion à votre espace
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <Input
            label="E-mail"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@exemple.fr"
          />
          <Input
            label="Mot de passe"
            type="password"
            required
            autoComplete="current-password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
          />

          {erreur && (
            <div
              role="alert"
              className="rounded-xl p-3 text-sm"
              style={{
                backgroundColor: "rgba(231,76,60,0.08)",
                color: C.error,
                border: `1px solid ${C.error}`,
              }}
            >
              {erreur}
            </div>
          )}

          <button
            type="submit"
            disabled={enCours}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
            style={{ backgroundColor: C.primary }}
          >
            <LogIn size={16} aria-hidden="true" />
            {enCours ? "Connexion…" : "Se connecter"}
          </button>
        </form>
      </main>
    </div>
  );
}
