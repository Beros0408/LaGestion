import React, { useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Circle, ShieldCheck, Smartphone } from "lucide-react";
import { BORDURE_CARTE, C, COULEURS_ETAT, alpha } from "../../theme";
import Input from "../form/Input.jsx";
import ConfirmDialog from "../ConfirmDialog.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { MESSAGE_TECHNIQUE } from "../../utils/erreurs";
import { clePresentee, codeValide, facteursVerifies, LONGUEUR_CODE, messageErreurMfa, nomNouvelAppareil } from "../../utils/mfa";

const N = " ";
const bouton = "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60";
const dateFr = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR") : "");

function Etat({ active }) {
  const e = active ? COULEURS_ETAT.succes : COULEURS_ETAT.neutre;
  const Icone = active ? CheckCircle2 : Circle;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: e.badge, color: e.texte }}>
      <Icone size={14} aria-hidden="true" />
      {active ? "Activée" : "Désactivée"}
    </span>
  );
}

function Message({ type, children }) {
  const erreur = type === "erreur";
  const Icone = erreur ? AlertCircle : CheckCircle2;
  return (
    <div
      role={erreur ? "alert" : "status"}
      className="flex items-start gap-2 rounded-xl p-3 text-sm"
      style={{ backgroundColor: alpha(erreur ? C.error : C.success, 0.06), color: erreur ? C.errorText : C.successText, border: `1px solid ${erreur ? C.error : C.success}` }}
    >
      <Icone size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

// Paramètres → Profil : double authentification (TOTP de Supabase Auth, migration 018), proposée à tous.
// Activation : QR code (ou clé), puis premier code ; la session passe en aal2. Retrait d'un appareil confirmé.
export default function SectionMfa() {
  const { facteurs, commencerActivation, confirmerActivation, retirerFacteur } = useAuth();
  const appareils = facteursVerifies(facteurs);
  const active = appareils.length > 0;
  const [activation, setActivation] = useState(null); // { factorId, qrCode, secret }
  const [code, setCode] = useState("");
  const [erreurCode, setErreurCode] = useState(null);
  const [etat, setEtat] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const [aRetirer, setARetirer] = useState(null);
  const refRetour = useRef(null);

  const executer = async (action) => {
    setEtat(null);
    setEnvoi(true);
    try {
      await action();
    } catch (err) {
      setEtat({ type: "erreur", texte: messageErreurMfa(err, MESSAGE_TECHNIQUE) });
    } finally {
      setEnvoi(false);
    }
  };

  const commencer = () => executer(async () => {
    setCode("");
    setErreurCode(null);
    setActivation(await commencerActivation(nomNouvelAppareil(facteurs)));
  });

  const confirmer = (e) => {
    e.preventDefault();
    if (!codeValide(code)) {
      setErreurCode(`Saisissez les ${LONGUEUR_CODE}${N}chiffres affichés par l'application.`);
      return;
    }
    setErreurCode(null);
    executer(async () => {
      await confirmerActivation(activation.factorId, code);
      setActivation(null);
      setCode("");
      setEtat({ type: "ok", texte: active ? "Appareil de secours enregistré." : "Double authentification activée. Le code vous sera demandé à chaque connexion." });
    });
  };

  const annuler = () => executer(async () => {
    const id = activation?.factorId;
    setActivation(null);
    setCode("");
    setErreurCode(null);
    if (id) await retirerFacteur(id);
  });

  const retirer = () => {
    const f = aRetirer;
    setARetirer(null);
    executer(async () => {
      await retirerFacteur(f.id);
      setEtat({ type: "ok", texte: appareils.length > 1 ? `« ${f.friendly_name} » retiré.` : "Double authentification désactivée." });
    });
  };

  return (
    <section className="rounded-2xl p-5" style={{ backgroundColor: C.fondCarte, border: BORDURE_CARTE }} aria-labelledby="titre-section-mfa">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="titre-section-mfa" className="inline-flex items-center gap-2 text-[18px] font-semibold" style={{ color: C.textPrimary }}>
          <ShieldCheck size={18} aria-hidden="true" />
          Double authentification
        </h3>
        <Etat active={active} />
      </div>
      <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>
        En plus du mot de passe, un code à {LONGUEUR_CODE}{N}chiffres donné par une application de votre téléphone vous sera demandé à chaque connexion.
      </p>

      {active && (
        <ul className="mt-4 space-y-2">
          {appareils.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
              <span className="inline-flex items-center gap-2 text-sm" style={{ color: C.textPrimary }}>
                <Smartphone size={16} aria-hidden="true" style={{ color: C.textSecondary }} />
                <span className="font-medium">{f.friendly_name || "Appareil"}</span>
                <span style={{ color: C.textSecondary }}>· ajouté le {dateFr(f.created_at)}</span>
              </span>
              <button
                type="button"
                disabled={envoi}
                onClick={(e) => { refRetour.current = e.currentTarget; setARetirer(f); }}
                className={bouton}
                style={{ color: C.errorText, border: `1px solid ${C.border}` }}
              >
                Retirer
              </button>
            </li>
          ))}
        </ul>
      )}

      {active && appareils.length === 1 && !activation && (
        <p className="mt-3 text-sm" style={{ color: C.textPrimary }}>
          Conseil{N}: enregistrez aussi un second appareil (autre téléphone ou tablette). Si vous perdez le premier, il vous permettra
          de vous connecter ; sans appareil, seul le support peut réinitialiser votre double authentification.
        </p>
      )}

      {activation ? (
        <form onSubmit={confirmer} noValidate className="mt-4 space-y-4 rounded-xl p-4" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}` }}>
          <ol className="list-decimal space-y-1 pl-5 text-sm" style={{ color: C.textPrimary }}>
            <li>Installez une application d'authentification sur votre téléphone (par exemple Google Authenticator, Microsoft Authenticator ou FreeOTP).</li>
            <li>Dans l'application, ajoutez un compte en scannant ce QR code.</li>
            <li>Saisissez le code à {LONGUEUR_CODE}{N}chiffres qu'elle affiche.</li>
          </ol>
          <div className="inline-block rounded-xl p-3" style={{ backgroundColor: C.onPrimary, border: `1px solid ${C.border}` }}>
            <img src={activation.qrCode} alt="QR code à scanner avec votre application d'authentification" width={176} height={176} className="block" />
          </div>
          <p className="text-sm" style={{ color: C.textSecondary }}>
            Impossible de scanner{N}? Saisissez cette clé dans l'application{N}:{" "}
            <span className="break-all font-mono font-semibold" style={{ color: C.textPrimary }}>{clePresentee(activation.secret)}</span>
          </p>
          <div className="max-w-xs">
            <Input
              label="Code affiché par l'application"
              required
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={LONGUEUR_CODE + 1}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              error={erreurCode}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={envoi} className={bouton} style={{ color: C.onPrimary, backgroundColor: C.primary }}>
              {envoi ? "Vérification…" : "Confirmer"}
            </button>
            <button type="button" disabled={envoi} onClick={annuler} className={bouton} style={{ color: C.textSecondary, border: `1px solid ${C.border}` }}>
              Annuler
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-4">
          <button type="button" disabled={envoi} onClick={commencer} className={bouton} style={active ? { color: C.primary, border: `1px solid ${C.border}` } : { color: C.onPrimary, backgroundColor: C.primary }}>
            {envoi ? "Préparation…" : active ? "Ajouter un appareil de secours" : "Activer la double authentification"}
          </button>
        </div>
      )}

      {etat && <div className="mt-4"><Message type={etat.type}>{etat.texte}</Message></div>}

      <ConfirmDialog
        ouvert={Boolean(aRetirer)}
        titre={`Retirer « ${aRetirer?.friendly_name ?? "Appareil"} »${N}?`}
        message={appareils.length > 1
          ? "Cet appareil ne pourra plus servir à vous connecter."
          : "La double authentification sera désactivée : votre mot de passe suffira pour vous connecter."}
        libelleConfirmer="Retirer"
        onAnnuler={() => setARetirer(null)}
        onConfirmer={retirer}
        elementRetour={refRetour.current}
      />
    </section>
  );
}
