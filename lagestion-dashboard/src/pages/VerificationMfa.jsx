import React, { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { BORDURE_CARTE, C, FOND_HORS_APPLICATION, OMBRE, alpha } from "../theme";
import Input from "../components/form/Input.jsx";
import Select from "../components/form/Select.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { MESSAGE_TECHNIQUE } from "../utils/erreurs";
import { codeValide, facteursVerifies, LONGUEUR_CODE, messageErreurMfa } from "../utils/mfa";

const N = " ";

// Affichée par ProtectedRoute (et la page d'invitation) tant que la session est en aal1 alors que l'utilisateur
// a un facteur vérifié : la base ne lui renvoie aucune donnée avant la saisie du code (migration 018).
export default function VerificationMfa() {
  const { facteurs, verifierCode, signOut } = useAuth();
  const appareils = facteursVerifies(facteurs);
  const [factorId, setFactorId] = useState(appareils[0]?.id ?? "");
  const [code, setCode] = useState("");
  const [erreurChamp, setErreurChamp] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!codeValide(code)) {
      setErreurChamp(`Saisissez les ${LONGUEUR_CODE}${N}chiffres affichés par l'application.`);
      return;
    }
    setErreurChamp(null);
    setErreur(null);
    setEnCours(true);
    try {
      await verifierCode(factorId || appareils[0]?.id, code);
    } catch (err) {
      setErreur(messageErreurMfa(err, MESSAGE_TECHNIQUE));
      setCode("");
      setEnCours(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ background: FOND_HORS_APPLICATION, fontFamily: "Inter, sans-serif" }}>
      <main
        className="w-full max-w-md rounded-2xl p-6 sm:p-8"
        style={{ backgroundColor: C.fondCarte, border: BORDURE_CARTE, boxShadow: OMBRE.md }}
        aria-labelledby="titre-mfa"
      >
        <div className="mb-5 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: C.primary }} aria-hidden="true">
            <ShieldCheck size={20} style={{ color: C.onPrimary }} />
          </div>
          <div className="min-w-0">
            <h1 id="titre-mfa" className="text-lg font-bold" style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}>
              Double authentification
            </h1>
            <p className="mt-0.5 text-sm" style={{ color: C.textSecondary }}>
              Saisissez le code à {LONGUEUR_CODE}{N}chiffres affiché par votre application d'authentification.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {appareils.length > 1 && (
            <Select
              label="Appareil"
              value={factorId}
              onChange={(e) => setFactorId(e.target.value)}
              options={appareils.map((f) => ({ value: f.id, label: f.friendly_name || "Appareil" }))}
            />
          )}
          <Input
            label="Code"
            required
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={LONGUEUR_CODE + 1}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            error={erreurChamp}
            hint={`Le code change toutes les 30${N}secondes.`}
          />
          {erreur && (
            <div role="alert" className="rounded-xl p-3 text-sm" style={{ backgroundColor: alpha(C.error, 0.08), color: C.errorText, border: `1px solid ${C.error}` }}>
              {erreur}
            </div>
          )}
          <button
            type="submit"
            disabled={enCours}
            className="inline-flex w-full items-center justify-center rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-70"
            style={{ color: C.onPrimary, backgroundColor: C.primary }}
          >
            {enCours ? "Vérification…" : "Vérifier"}
          </button>
          <button
            type="button"
            onClick={() => signOut().catch(() => {})}
            className="w-full rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
            style={{ color: C.textSecondary, border: `1px solid ${C.border}` }}
          >
            Se déconnecter
          </button>
          <p className="text-xs" style={{ color: C.textSecondary }}>
            Téléphone perdu{N}? Utilisez votre appareil de secours s'il est enregistré ; sinon, contactez le support pour faire réinitialiser la double authentification.
          </p>
        </form>
      </main>
    </div>
  );
}
