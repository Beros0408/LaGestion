import React, { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Building2 } from "lucide-react";
import { C } from "../theme";
import Input from "../components/form/Input.jsx";
import { useEntreprise } from "../context/EntrepriseContext.jsx";

function valider(nom, siret) {
  const erreurs = {};
  if (!nom.trim()) erreurs.nom = "Le nom de l'entreprise est obligatoire.";
  const s = siret.replace(/\s/g, "");
  if (s && !/^\d{14}$/.test(s)) erreurs.siret = "Le SIRET doit comporter exactement 14 chiffres.";
  return erreurs;
}

export default function Onboarding() {
  const { entrepriseId, creerEntreprise } = useEntreprise();
  const navigate = useNavigate();

  const [nom, setNom] = useState("");
  const [siret, setSiret] = useState("");
  const [erreurs, setErreurs] = useState({});
  const [erreurEnvoi, setErreurEnvoi] = useState("");
  const [enCours, setEnCours] = useState(false);

  if (entrepriseId && !enCours) return <Navigate to="/dashboard" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const v = valider(nom, siret);
    setErreurs(v);
    if (Object.keys(v).length > 0) return;
    setErreurEnvoi("");
    setEnCours(true);
    try {
      await creerEntreprise(nom.trim(), siret.replace(/\s/g, ""));
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setErreurEnvoi(err?.message || "Création de l'entreprise impossible.");
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
        aria-labelledby="titre-onboarding"
      >
        <div className="mb-6 flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: `linear-gradient(135deg, ${C.primary}, ${C.secondary})` }}
            aria-hidden="true"
          >
            <Building2 size={20} className="text-white" />
          </div>
          <div>
            <h1
              id="titre-onboarding"
              className="text-lg font-bold"
              style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}
            >
              Créer mon entreprise
            </h1>
            <p className="text-xs" style={{ color: C.textSecondary }}>
              Vos clients, opportunités et factures y seront rattachés.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <Input
            label="Nom de l'entreprise"
            required
            autoComplete="organization"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            error={erreurs.nom}
          />
          <Input
            label="SIRET (facultatif)"
            inputMode="numeric"
            value={siret}
            onChange={(e) => setSiret(e.target.value)}
            error={erreurs.siret}
            hint="14 chiffres"
          />

          {erreurEnvoi && (
            <div
              role="alert"
              className="rounded-xl p-3 text-sm"
              style={{
                backgroundColor: "rgba(231,76,60,0.08)",
                color: C.error,
                border: `1px solid ${C.error}`,
              }}
            >
              {erreurEnvoi}
            </div>
          )}

          <button
            type="submit"
            disabled={enCours}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0"
            style={{ backgroundColor: C.primary }}
          >
            {enCours ? "Création…" : "Créer mon entreprise"}
          </button>
        </form>
      </main>
    </div>
  );
}
