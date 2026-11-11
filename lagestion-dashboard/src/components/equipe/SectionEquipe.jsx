import React, { useRef, useState } from "react";
import { AlertCircle, Ban, CheckCircle2, Copy, Lock, PauseCircle, UserPlus } from "lucide-react";
import { BORDURE_CARTE, C, COULEURS_ETAT, alpha } from "../../theme";
import { useAuth } from "../../context/AuthContext.jsx";
import { LIBELLE_ROLE, useEntreprise } from "../../context/EntrepriseContext.jsx";
import { useEquipe } from "../../context/EquipeContext.jsx";
import ConfirmDialog from "../ConfirmDialog.jsx";
import FenetreFormulaire from "../FenetreFormulaire.jsx";
import Input from "../form/Input.jsx";
import Select from "../form/Select.jsx";
import FenetreMembre from "./FenetreMembre.jsx";
import { LIBELLE_STATUT_MEMBRE, ROLES, emailValide, invitationExpiree, lienInvitation, nomMembre, normaliserEmail } from "../../utils/equipe";

const N = " ";
const OPTIONS_ROLE = ROLES.map((r) => ({ value: r, label: LIBELLE_ROLE[r] }));
const dateHeure = (iso) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("fr-FR")} à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
};

function Carte({ titre, description, action, children }) {
  return (
    <section className="rounded-2xl p-5" style={{ backgroundColor: C.fondCarte, border: BORDURE_CARTE }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-[18px] font-semibold" style={{ color: C.textPrimary }}>{titre}</h3>
          {description && <p className="mt-1 text-sm" style={{ color: C.textSecondary }}>{description}</p>}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
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
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

// Statut d'un membre : jetons d'état, icône et libellé (jamais la couleur seule).
function BadgeStatut({ statut }) {
  const e = COULEURS_ETAT[statut === "suspendu" ? "avertissement" : "succes"];
  const Icone = statut === "suspendu" ? PauseCircle : CheckCircle2;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium" style={{ color: e.texte, background: e.badge }}>
      <Icone size={13} aria-hidden="true" style={{ color: e.trait }} />
      {LIBELLE_STATUT_MEMBRE[statut] ?? statut}
    </span>
  );
}

function BadgeExpiree() {
  const e = COULEURS_ETAT.neutre;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium" style={{ color: e.texte, background: e.badge }}>
      <Ban size={13} aria-hidden="true" style={{ color: e.trait }} />
      Expirée
    </span>
  );
}

const boutonLigne =
  "inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold focus:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-60";
const styleLigne = { color: C.primary, backgroundColor: alpha(C.primary, 0.08) };
const styleDiscret = { color: C.textSecondary, border: `1px solid ${C.border}` };

async function copier(texte) {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch {
    return false;
  }
}

function FenetreInvitation({ elementRetour, onFermer }) {
  const { inviter } = useEquipe();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("commercial");
  const [erreurChamp, setErreurChamp] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  const valider = async () => {
    if (!emailValide(email)) {
      setErreurChamp("Saisissez une adresse e-mail valide, par exemple marie@exemple.fr.");
      return;
    }
    setEnvoi(true);
    setErreur(null);
    try {
      const invitation = await inviter(normaliserEmail(email), role);
      onFermer(invitation);
    } catch (e) {
      setErreur(e.message);
      setEnvoi(false);
    }
  };

  return (
    <FenetreFormulaire
      titre="Inviter un membre"
      erreur={erreur}
      envoi={envoi}
      libelleValider="Créer le lien"
      elementRetour={elementRetour}
      onFermer={() => onFermer(null)}
      onValider={valider}
    >
      <Input
        label="E-mail de la personne invitée"
        type="email"
        required
        autoComplete="off"
        value={email}
        onChange={(e) => { setEmail(e.target.value); setErreurChamp(null); }}
        error={erreurChamp}
        hint="Elle devra se connecter ou créer son compte avec cette adresse, puis la confirmer."
      />
      <Select label="Rôle" value={role} onChange={(e) => setRole(e.target.value)} options={OPTIONS_ROLE} />
      <p className="text-xs" style={{ color: C.textSecondary }}>
        Aucun e-mail n'est envoyé{N}: vous copiez le lien et le transmettez vous-même. Il fonctionne une seule fois, pendant 7{N}jours.
      </p>
    </FenetreFormulaire>
  );
}

// Paramètres → Équipe. Admin : membres (e-mail compris), actions, invitations en attente.
// Autres rôles : lecture seule des noms, rôles et statuts (ni e-mail ni invitation).
export default function SectionEquipe() {
  const { user } = useAuth();
  const { estAdmin } = useEntreprise();
  const { membres, invitations, chargement, erreur, renouveler, annuler } = useEquipe();
  const [fenetre, setFenetre] = useState(null);
  const [aAnnuler, setAAnnuler] = useState(null);
  const [etat, setEtat] = useState(null);
  const [lien, setLien] = useState(null);
  const retour = useRef(null);
  const moi = user?.id;

  const ouvrir = (contenu) => (e) => {
    retour.current = e.currentTarget;
    setEtat(null);
    setFenetre(contenu);
  };

  const copierLien = async (invitation) => {
    const url = lienInvitation(window.location.origin, invitation.token);
    const ok = await copier(url);
    setLien({ email: invitation.email, url, copie: ok });
    setEtat(null);
  };

  const executer = async (action, texte) => {
    setEtat(null);
    try {
      await action();
      setEtat({ type: "ok", texte });
    } catch (e) {
      setEtat({ type: "erreur", texte: e.message });
    }
  };

  if (chargement) {
    return <p role="status" className="text-sm" style={{ color: C.textSecondary }}>Chargement de l'équipe…</p>;
  }

  return (
    <div className="space-y-4">
      {!estAdmin && (
        <p role="note" className="flex items-start gap-2 rounded-xl p-3 text-sm" style={{ backgroundColor: C.fondCarte, border: BORDURE_CARTE, color: C.textSecondary }}>
          <Lock size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          Seul un administrateur peut gérer l'équipe.
        </p>
      )}
      {erreur && <Message type="erreur">{erreur}</Message>}
      {etat && <Message type={etat.type}>{etat.texte}</Message>}
      {lien && (
        <div role="status" className="rounded-xl p-3 text-sm" style={{ backgroundColor: C.bgCard, border: `1px solid ${C.border}`, color: C.textPrimary }}>
          <p>
            {lien.copie ? "Lien copié" : "Copiez ce lien"} pour {lien.email}{N}: transmettez-le vous-même. Il fonctionne une seule fois, jusqu'à son expiration.
          </p>
          <Input label="Lien d'invitation" value={lien.url} readOnly onFocus={(e) => e.target.select()} className="mt-2" />
        </div>
      )}

      <Carte titre="Membres" description={`${membres.length}${N}membre${membres.length > 1 ? "s" : ""} dans l'entreprise.`}>
        <ul className="divide-y" style={{ borderColor: C.border }}>
          {membres.map((m) => {
            const estMoi = m.user_id === moi;
            return (
              <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3" style={{ borderColor: C.border }}>
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold" style={{ color: C.textPrimary }}>
                    {nomMembre(m)}{estMoi && <span style={{ color: C.textSecondary, fontWeight: 400 }}> (vous)</span>}
                  </p>
                  {estAdmin && m.email && <p className="break-all text-xs" style={{ color: C.textSecondary }}>{m.email}</p>}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm" style={{ color: C.textPrimary }}>{LIBELLE_ROLE[m.role]}</span>
                  <BadgeStatut statut={m.statut} />
                  {estAdmin && (
                    <>
                      <button type="button" className={boutonLigne} style={styleLigne} onClick={ouvrir({ action: "role", membre: m })} aria-label={`Modifier le rôle de ${nomMembre(m)}`}>
                        Rôle
                      </button>
                      {!estMoi && m.statut === "actif" && (
                        <button type="button" className={boutonLigne} style={styleDiscret} onClick={ouvrir({ action: "suspendre", membre: m })} aria-label={`Suspendre ${nomMembre(m)}`}>
                          Suspendre
                        </button>
                      )}
                      {!estMoi && m.statut === "suspendu" && (
                        <button type="button" className={boutonLigne} style={styleLigne} onClick={ouvrir({ action: "reactiver", membre: m })} aria-label={`Réactiver ${nomMembre(m)}`}>
                          Réactiver
                        </button>
                      )}
                      {!estMoi && (
                        <button type="button" className={boutonLigne} style={{ color: C.errorText, border: `1px solid ${C.border}` }} onClick={ouvrir({ action: "retirer", membre: m })} aria-label={`Retirer ${nomMembre(m)} de l'entreprise`}>
                          Retirer
                        </button>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Carte>

      {estAdmin && (
        <Carte
          titre="Invitations en attente"
          description="Un lien par personne, valable 7 jours et une seule fois. L'adresse du compte doit être celle de l'invitation, et confirmée."
          action={
            <button type="button" className={`${boutonLigne} text-white`} style={{ backgroundColor: C.primary }} onClick={ouvrir({ action: "inviter" })}>
              <UserPlus size={16} aria-hidden="true" /> Inviter un membre
            </button>
          }
        >
          {invitations.length === 0 ? (
            <p className="text-sm" style={{ color: C.textSecondary }}>Aucune invitation en attente.</p>
          ) : (
            <ul className="divide-y" style={{ borderColor: C.border }}>
              {invitations.map((i) => {
                const expiree = invitationExpiree(i);
                return (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3" style={{ borderColor: C.border }}>
                    <div className="min-w-0">
                      <p className="break-all text-sm font-semibold" style={{ color: C.textPrimary }}>{i.email}</p>
                      <p className="text-xs" style={{ color: C.textSecondary }}>
                        {LIBELLE_ROLE[i.role]} · {expiree ? `expirée le ${dateHeure(i.expires_at)}` : `expire le ${dateHeure(i.expires_at)}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {expiree ? (
                        <BadgeExpiree />
                      ) : (
                        <button type="button" className={boutonLigne} style={styleLigne} onClick={() => copierLien(i)} aria-label={`Copier le lien d'invitation de ${i.email}`}>
                          <Copy size={14} aria-hidden="true" /> Copier le lien
                        </button>
                      )}
                      <button
                        type="button"
                        className={boutonLigne}
                        style={styleDiscret}
                        aria-label={`Renouveler l'invitation de ${i.email}`}
                        onClick={() => executer(async () => { const n = await renouveler(i.id); await copierLien(n); },
                          `Invitation de ${i.email} renouvelée pour 7${N}jours. L'ancien lien ne fonctionne plus.`)}
                      >
                        Renouveler
                      </button>
                      <button
                        type="button"
                        className={boutonLigne}
                        style={{ color: C.errorText, border: `1px solid ${C.border}` }}
                        aria-label={`Annuler l'invitation de ${i.email}`}
                        onClick={(e) => { retour.current = e.currentTarget; setAAnnuler(i); }}
                      >
                        Annuler
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Carte>
      )}

      {fenetre?.action === "inviter" && (
        <FenetreInvitation
          elementRetour={retour.current}
          onFermer={(invitation) => {
            setFenetre(null);
            if (invitation) copierLien(invitation);
          }}
        />
      )}
      {fenetre && fenetre.action !== "inviter" && (
        <FenetreMembre
          action={fenetre.action}
          membre={fenetre.membre}
          moi={moi}
          elementRetour={retour.current}
          onFermer={(texte) => {
            setFenetre(null);
            if (texte) setEtat({ type: "ok", texte });
          }}
        />
      )}
      <ConfirmDialog
        ouvert={Boolean(aAnnuler)}
        titre={`Annuler l'invitation${N}?`}
        message={aAnnuler ? `Le lien envoyé à ${aAnnuler.email} cessera de fonctionner.` : ""}
        libelleAnnuler="Garder l'invitation"
        libelleConfirmer="Annuler l'invitation"
        elementRetour={retour.current}
        onAnnuler={() => setAAnnuler(null)}
        onConfirmer={() => {
          const i = aAnnuler;
          setAAnnuler(null);
          if (lien?.email === i.email) setLien(null);
          executer(() => annuler(i.id), `Invitation de ${i.email} annulée.`);
        }}
      />
    </div>
  );
}
