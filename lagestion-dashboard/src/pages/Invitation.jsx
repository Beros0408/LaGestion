import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AlertCircle, CheckCircle2, UserPlus } from "lucide-react";
import { BORDURE_CARTE, C, FOND_HORS_APPLICATION, OMBRE, alpha } from "../theme";
import Input from "../components/form/Input.jsx";
import LogoHorsApplication from "../components/LogoHorsApplication.jsx";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext.jsx";
import { LIBELLE_ROLE, useEntreprise } from "../context/EntrepriseContext.jsx";
import { MESSAGE_TECHNIQUE } from "../utils/erreurs";
import { normaliserEmail } from "../utils/equipe";
import VerificationMfa from "./VerificationMfa.jsx";

const N = " ";
const MOT_DE_PASSE_MIN = 8;
const FORME_JETON = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const dateHeure = (iso) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("fr-FR")} à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
};

// Messages de Supabase Auth (en anglais) → français ; tout autre cas : message technique générique.
function traduireErreurAuth(err) {
  const m = (err?.message || "").toLowerCase();
  if (m.includes("invalid login")) return "Mot de passe incorrect, ou aucun compte n'existe encore avec cette adresse.";
  if (m.includes("email not confirmed")) return `Adresse e-mail non confirmée${N}: ouvrez l'e-mail de confirmation, puis revenez sur ce lien.`;
  if (m.includes("signups not allowed") || m.includes("signup is disabled")) return "La création de compte est fermée sur ce service. Contactez l'administrateur de l'entreprise.";
  if (m.includes("password")) return `Mot de passe refusé${N}: ${MOT_DE_PASSE_MIN}${N}caractères au moins, sans motif trop simple.`;
  if (m.includes("rate limit")) return "Trop de tentatives ou d'e-mails envoyés. Réessayez dans quelques minutes.";
  return MESSAGE_TECHNIQUE;
}

function Alerte({ type = "erreur", children }) {
  const erreur = type === "erreur";
  const Icone = erreur ? AlertCircle : CheckCircle2;
  return (
    <div
      role={erreur ? "alert" : "status"}
      className="flex items-start gap-2 rounded-xl p-3 text-sm"
      style={{ backgroundColor: alpha(erreur ? C.error : C.success, 0.06), color: erreur ? C.errorText : C.successText, border: `1px solid ${erreur ? C.error : C.success}` }}
    >
      <Icone size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

const boutonPrimaire =
  "inline-flex w-full items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-70";
const boutonSecondaire = "rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2";

function Cadre({ children }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4" style={{ background: FOND_HORS_APPLICATION, fontFamily: "Inter, sans-serif" }}>
      <div className="w-full max-w-md">
        <LogoHorsApplication />
        <main className="w-full rounded-2xl p-6 sm:p-8" style={{ backgroundColor: C.fondCarte, border: BORDURE_CARTE, boxShadow: OMBRE.md }} aria-labelledby="titre-invitation">
          {children}
        </main>
      </div>
    </div>
  );
}

function Titre({ children, sousTitre }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: C.primary }} aria-hidden="true">
        <UserPlus size={20} style={{ color: C.onPrimary }} />
      </div>
      <div className="min-w-0">
        <h1 id="titre-invitation" className="break-words text-lg font-bold" style={{ color: C.textPrimary, fontFamily: "Sora, sans-serif" }}>{children}</h1>
        {sousTitre && <p className="mt-0.5 text-sm" style={{ color: C.textSecondary }}>{sousTitre}</p>}
      </div>
    </div>
  );
}

// Page ouverte par le lien d'invitation (migration 017), avec ou sans compte.
// Sans compte : création (adresse imposée, confirmation par e-mail, retour sur ce lien) ; avec compte : connexion.
// Connecté avec la bonne adresse, confirmée : « Rejoindre » → accept_invitation, puis tableau de bord de l'entreprise.
export default function Invitation() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, chargement: chargementAuth, codeRequis, signIn, signUp, signOut } = useAuth();
  const { chargement: chargementEntreprise, accepterInvitation } = useEntreprise();
  const [invitation, setInvitation] = useState(undefined);
  const [erreurLecture, setErreurLecture] = useState(null);
  const [mode, setMode] = useState("inscription");
  const [nom, setNom] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [erreurs, setErreurs] = useState({});
  const [erreur, setErreur] = useState(null);
  const [info, setInfo] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    let actif = true;
    if (!FORME_JETON.test(token ?? "")) {
      setInvitation(null);
      return undefined;
    }
    supabase.rpc("lire_invitation", { p_token: token }).then(({ data, error }) => {
      if (!actif) return;
      if (error) setErreurLecture(MESSAGE_TECHNIQUE);
      else setInvitation(data?.[0] ?? null);
    });
    return () => { actif = false; };
  }, [token]);

  if (erreurLecture) {
    return <Cadre><Titre>Invitation</Titre><Alerte>{erreurLecture}</Alerte></Cadre>;
  }
  if (invitation === undefined || chargementAuth) {
    return <Cadre><p role="status" id="titre-invitation" className="text-sm" style={{ color: C.textSecondary }}>Chargement de l'invitation…</p></Cadre>;
  }
  if (invitation === null) {
    return (
      <Cadre>
        <Titre>Lien d'invitation non valable</Titre>
        <p className="text-sm" style={{ color: C.textSecondary }}>
          Ce lien n'existe pas ou n'est plus actif{N}: il a peut-être été annulé ou remplacé par un nouveau lien. Demandez un nouveau lien à l'administrateur de l'entreprise.
        </p>
        <Link to="/login" className={`${boutonSecondaire} mt-5 inline-block`} style={{ color: C.primary, border: `1px solid ${C.border}` }}>Aller à la connexion</Link>
      </Cadre>
    );
  }
  if (invitation.etat !== "valide") {
    const expiree = invitation.etat === "expiree";
    return (
      <Cadre>
        <Titre>{expiree ? "Invitation expirée" : "Invitation déjà utilisée"}</Titre>
        <p className="text-sm" style={{ color: C.textSecondary }}>
          {expiree
            ? `Cette invitation à rejoindre ${invitation.entreprise_nom} a expiré le ${dateHeure(invitation.expires_at)}. Demandez un nouveau lien à l'administrateur de l'entreprise.`
            : `Cette invitation à rejoindre ${invitation.entreprise_nom} a déjà servi. Si c'était vous, connectez-vous pour retrouver l'entreprise.`}
        </p>
        <Link to={user ? "/dashboard" : "/login"} className={`${boutonSecondaire} mt-5 inline-block`} style={{ color: C.primary, border: `1px solid ${C.border}` }}>
          {user ? "Aller au tableau de bord" : "Aller à la connexion"}
        </Link>
      </Cadre>
    );
  }

  const email = invitation.email;
  const role = LIBELLE_ROLE[invitation.role] ?? invitation.role;
  const entete = (
    <Titre sousTitre={`Rôle${N}: ${role}. Invitation pour ${email}, valable jusqu'au ${dateHeure(invitation.expires_at)}.`}>
      Rejoindre {invitation.entreprise_nom}
    </Titre>
  );

  const executer = async (action) => {
    setErreur(null);
    setInfo(null);
    setEnvoi(true);
    try {
      await action();
    } catch (e) {
      setErreur(e?.message || MESSAGE_TECHNIQUE);
    } finally {
      setEnvoi(false);
    }
  };

  // Connecté : bonne adresse et confirmée → bouton Rejoindre ; sinon, explication.
  // Double authentification attendue (migration 018) : code d'abord, puis retour sur cette invitation.
  if (user && codeRequis) return <VerificationMfa />;

  if (user) {
    const memeAdresse = normaliserEmail(user.email) === normaliserEmail(email);
    return (
      <Cadre>
        {entete}
        {!memeAdresse ? (
          <>
            <Alerte>
              Vous utilisez le compte {user.email}. Cette invitation est destinée à {email}{N}: déconnectez-vous, puis connectez-vous ou créez un compte avec cette adresse.
            </Alerte>
            <button type="button" onClick={() => executer(signOut)} className={`${boutonPrimaire} mt-4`} style={{ color: C.onPrimary, backgroundColor: C.primary }}>
              Se déconnecter
            </button>
          </>
        ) : !user.email_confirmed_at ? (
          <Alerte>Adresse e-mail non confirmée{N}: ouvrez l'e-mail de confirmation, puis revenez sur ce lien.</Alerte>
        ) : (
          <>
            {erreur && <div className="mb-4"><Alerte>{erreur}</Alerte></div>}
            <button
              type="button"
              disabled={envoi || chargementEntreprise}
              onClick={() => executer(() => accepterInvitation(token))}
              className={boutonPrimaire}
              style={{ color: C.onPrimary, backgroundColor: C.primary }}
            >
              {envoi ? "Connexion à l'entreprise…" : `Rejoindre ${invitation.entreprise_nom}`}
            </button>
            <button type="button" onClick={() => navigate("/dashboard")} className={`${boutonSecondaire} mt-2 w-full`} style={{ color: C.textSecondary, border: `1px solid ${C.border}` }}>
              Plus tard
            </button>
          </>
        )}
      </Cadre>
    );
  }

  const inscrire = () => executer(async () => {
    const e = {};
    if (motDePasse.length < MOT_DE_PASSE_MIN) e.motDePasse = `${MOT_DE_PASSE_MIN}${N}caractères au moins.`;
    if (confirmation !== motDePasse) e.confirmation = "Les deux mots de passe ne sont pas identiques.";
    setErreurs(e);
    if (Object.keys(e).length) return;
    const r = await signUp(email, motDePasse, nom.trim(), `${window.location.origin}/invitation/${token}`)
      .catch((err) => { throw new Error(traduireErreurAuth(err)); });
    if (r.compteExistant) {
      setMode("connexion");
      setMotDePasse("");
      setConfirmation("");
      setInfo(`Un compte existe déjà avec cette adresse${N}: connectez-vous.`);
      return;
    }
    if (!r.session) {
      setInfo(`Compte créé. Un e-mail de confirmation a été envoyé à ${email}. Ouvrez-le et cliquez sur le lien${N}: vous reviendrez sur cette page pour rejoindre ${invitation.entreprise_nom}.`);
    }
  });

  const connecter = () => executer(() => signIn(email, motDePasse).catch((err) => { throw new Error(traduireErreurAuth(err)); }));

  const onglet = (valeur, libelle) => (
    <button
      type="button"
      aria-pressed={mode === valeur}
      onClick={() => { setMode(valeur); setErreur(null); setInfo(null); setErreurs({}); }}
      className="flex-1 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2"
      style={mode === valeur ? { color: C.onPrimary, backgroundColor: C.primary } : { color: C.textPrimary, backgroundColor: "transparent" }}
    >
      {libelle}
    </button>
  );

  return (
    <Cadre>
      {entete}
      <div className="mb-4 flex gap-1 rounded-xl p-1" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
        {onglet("inscription", "Créer mon compte")}
        {onglet("connexion", "J'ai déjà un compte")}
      </div>
      <form
        noValidate
        className="space-y-4"
        onSubmit={(e) => { e.preventDefault(); if (!envoi) (mode === "inscription" ? inscrire : connecter)(); }}
      >
        <Input label="E-mail" type="email" autoComplete="username" value={email} readOnly hint="L'adresse de l'invitation, imposée." />
        {mode === "inscription" && (
          <Input label="Votre nom (facultatif)" autoComplete="name" value={nom} onChange={(e) => setNom(e.target.value)} />
        )}
        <Input
          label="Mot de passe"
          type="password"
          required
          autoComplete={mode === "inscription" ? "new-password" : "current-password"}
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          error={erreurs.motDePasse}
          hint={mode === "inscription" ? `${MOT_DE_PASSE_MIN}${N}caractères au moins.` : undefined}
        />
        {mode === "inscription" && (
          <Input
            label="Confirmer le mot de passe"
            type="password"
            required
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            error={erreurs.confirmation}
          />
        )}
        {erreur && <Alerte>{erreur}</Alerte>}
        {info && <Alerte type="info">{info}</Alerte>}
        <button type="submit" disabled={envoi} className={boutonPrimaire} style={{ color: C.onPrimary, backgroundColor: C.primary }}>
          {envoi ? "Envoi…" : mode === "inscription" ? "Créer mon compte" : "Se connecter"}
        </button>
      </form>
    </Cadre>
  );
}
