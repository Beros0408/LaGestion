import React, { useState } from "react";
import { Link } from "react-router-dom";
import { PauseCircle } from "lucide-react";
import { BORDURE_CARTE, C, COULEURS_ETAT, FOND_HORS_APPLICATION, OMBRE } from "../theme";
import { useAuth } from "../context/AuthContext.jsx";
import { useEntreprise } from "../context/EntrepriseContext.jsx";
import LogoHorsApplication from "../components/LogoHorsApplication.jsx";

// Membre suspendu partout (migration 017), sans autre entreprise active : page dédiée au lieu de l'onboarding.
// La RLS lui masque tout ; le nom des entreprises vient de mes_acces_suspendus.
export default function AccesSuspendu() {
  const { signOut } = useAuth();
  const { suspendues, recharger } = useEntreprise();
  const [verification, setVerification] = useState(false);
  const etat = COULEURS_ETAT.avertissement;
  const une = suspendues.length === 1;

  const verifier = async () => {
    setVerification(true);
    await recharger();
    setVerification(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ background: FOND_HORS_APPLICATION, fontFamily: "Inter, sans-serif" }}>
      <div className="w-full max-w-md">
      <LogoHorsApplication />
      <main
        className="w-full rounded-2xl p-6 sm:p-8"
        style={{ backgroundColor: C.fondCarte, border: BORDURE_CARTE, boxShadow: OMBRE.md }}
        aria-labelledby="titre-suspendu"
      >
        <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: etat.badge }} aria-hidden="true">
          <PauseCircle size={20} style={{ color: etat.trait }} />
        </div>
        <h1 id="titre-suspendu" className="text-lg font-bold" style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}>
          {une ? `Votre accès à ${suspendues[0].nom} est suspendu` : "Vos accès sont suspendus"}
        </h1>
        {!une && (
          <ul className="mt-2 list-disc pl-5 text-sm" style={{ color: C.textPrimary }}>
            {suspendues.map((e) => <li key={e.entrepriseId}>{e.nom}</li>)}
          </ul>
        )}
        <p className="mt-3 text-sm" style={{ color: C.textSecondary }}>
          Rien n'a été supprimé. Un administrateur de l'entreprise peut rétablir votre accès ; vous retrouverez alors vos données.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={verifier}
            disabled={verification}
            className="rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-70"
            style={{ color: C.onPrimary, backgroundColor: C.primary }}
          >
            {verification ? "Vérification…" : "Vérifier à nouveau"}
          </button>
          <Link
            to="/onboarding"
            className="rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
            style={{ color: C.primary, border: `1px solid ${C.border}` }}
          >
            Créer une entreprise
          </Link>
          <button
            type="button"
            onClick={() => signOut().catch(() => {})}
            className="rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
            style={{ color: C.textSecondary, border: `1px solid ${C.border}` }}
          >
            Se déconnecter
          </button>
        </div>
      </main>
      </div>
    </div>
  );
}
