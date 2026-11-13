import React, { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Building2 } from "lucide-react";
import { BORDURE_CARTE, C, FOND_HORS_APPLICATION, OMBRE, alpha } from "../theme";
import Input from "../components/form/Input.jsx";
import { useEntreprise } from "../context/EntrepriseContext.jsx";
import { useGardeModifications, useQuitter } from "../context/GardeModificationsContext.jsx";

function valider(nom, siret) {
  const erreurs = {};
  if (!nom.trim()) erreurs.nom = "Le nom de l'entreprise est obligatoire.";
  else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nom.trim())) {
    erreurs.nom = "Saisissez le nom de l'entreprise, pas une adresse e-mail : il figure sur vos devis et vos factures.";
  }
  const s = siret.replace(/\s/g, "");
  if (s && !/^\d{14}$/.test(s)) erreurs.siret = "Le SIRET doit comporter exactement 14 chiffres.";
  return erreurs;
}

// ajout : création d'une entreprise supplémentaire depuis le sélecteur (dans le Layout) ;
// l'utilisateur en devient admin et elle devient l'entreprise courante, tableau de bord d'abord.
export default function Onboarding({ ajout = false }) {
  const { entrepriseId, creerEntreprise, enregistrerNom, basculerVers } = useEntreprise();
  const navigate = useNavigate();
  const location = useLocation();
  const quitter = useQuitter();

  const [nomPersonne, setNomPersonne] = useState("");
  const [nom, setNom] = useState("");
  const [siret, setSiret] = useState("");
  const [erreurs, setErreurs] = useState({});
  const [erreurEnvoi, setErreurEnvoi] = useState("");
  const [enCours, setEnCours] = useState(false);

  useGardeModifications(ajout && !enCours && (nom.trim() !== "" || siret.trim() !== ""));

  if (!ajout && entrepriseId && !enCours) return <Navigate to="/dashboard" replace />;

  const annuler = () =>
    quitter(() => {
      if (location.key !== "default") navigate(-1);
      else navigate("/dashboard", { replace: true });
    });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const v = valider(nom, siret);
    setErreurs(v);
    if (Object.keys(v).length > 0) return;
    setErreurEnvoi("");
    setEnCours(true);
    try {
      if (ajout) {
        const id = await creerEntreprise(nom.trim(), siret.replace(/\s/g, ""), { activer: false });
        basculerVers(id);
        return;
      }
      if (nomPersonne.trim()) await enregistrerNom(nomPersonne.trim());
      await creerEntreprise(nom.trim(), siret.replace(/\s/g, ""));
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setErreurEnvoi(err?.message || "Création de l'entreprise impossible.");
      setEnCours(false);
    }
  };

  const Titre = ajout ? "h2" : "h1";
  const Cadre = ajout ? "section" : "main";

  const carte = (
    <Cadre
      className={`w-full max-w-md rounded-2xl p-6 sm:p-8${ajout ? " mx-auto" : ""}`}
      style={{
        backgroundColor: C.fondCarte,
        border: BORDURE_CARTE,
        boxShadow: OMBRE.md,
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
          <Titre
            id="titre-onboarding"
            className="text-lg font-bold"
            style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}
          >
            {ajout ? "Créer une entreprise" : "Créer mon entreprise"}
          </Titre>
          <p className="text-xs" style={{ color: C.textSecondary }}>
            {ajout
              ? "Vous en serez administrateur. Ses données restent séparées de celles de vos autres entreprises."
              : "Vos clients, opportunités et factures y seront rattachés."}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {!ajout && (
          <Input
            label="Votre nom (facultatif)"
            autoComplete="name"
            value={nomPersonne}
            onChange={(e) => setNomPersonne(e.target.value)}
            hint="Affiché dans le menu et les salutations"
          />
        )}
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
              backgroundColor: alpha(C.error, 0.08),
              color: C.errorText,
              border: `1px solid ${C.error}`,
            }}
          >
            {erreurEnvoi}
          </div>
        )}

        <div className={ajout ? "flex flex-wrap items-center justify-end gap-2" : undefined}>
          {ajout && (
            <button
              type="button"
              onClick={annuler}
              disabled={enCours}
              className="rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-70"
              style={{ color: C.textSecondary, backgroundColor: "transparent", border: `1px solid ${C.border}` }}
            >
              Annuler
            </button>
          )}
          <button
            type="submit"
            disabled={enCours}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-white transition-transform hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0${ajout ? "" : " w-full"}`}
            style={{ backgroundColor: C.primary }}
          >
            {enCours ? "Création…" : ajout ? "Créer l'entreprise" : "Créer mon entreprise"}
          </button>
        </div>
      </form>
    </Cadre>
  );

  if (ajout) return carte;

  return (
    <div
      className="flex min-h-screen items-center justify-center p-4"
      style={{ background: FOND_HORS_APPLICATION, fontFamily: "Inter, sans-serif" }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Sora:wght@600;700&display=swap');`}</style>
      {carte}
    </div>
  );
}
