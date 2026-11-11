import React, { useMemo, useState } from "react";
import { AlertCircle } from "lucide-react";
import { C, alpha } from "../../theme";
import FenetreFormulaire from "../FenetreFormulaire.jsx";
import Select from "../form/Select.jsx";
import { LIBELLE_ROLE } from "../../context/EntrepriseContext.jsx";
import { useEquipe } from "../../context/EquipeContext.jsx";
import {
  MESSAGE_DERNIER_ADMIN, ROLES, autresAdminsActifs, nomMembre, perdAdmin, reassignationProposee, repreneursPossibles,
} from "../../utils/equipe";

const N = " ";
const OPTIONS_ROLE = ROLES.map((r) => ({ value: r, label: LIBELLE_ROLE[r] }));

const TITRES = {
  role: (nom) => `Modifier le rôle de ${nom}`,
  suspendre: (nom) => `Suspendre ${nom}`,
  reactiver: (nom) => `Réactiver ${nom}`,
  retirer: (nom) => `Retirer ${nom} de l'entreprise`,
};
const VALIDER = { role: "Enregistrer", suspendre: "Suspendre", reactiver: "Réactiver", retirer: "Retirer" };

const pluriel = (n, un, plusieurs) => `${n}${N}${n > 1 ? plusieurs : un}`;

// Action d'un admin sur un membre : rôle, suspension, réactivation, retrait.
// Retrait, suspension et passage en lecture proposent de confier les tâches à faire à un autre membre
// (même transaction en base) ; « Ne pas réassigner » est possible. Dernier admin actif : action annoncée
// impossible avant l'envoi (la base la refuse de toute façon).
export default function FenetreMembre({ action, membre, moi, elementRetour, onFermer }) {
  const { membres, changerRole, suspendre, reactiver, retirer } = useEquipe();
  const nom = nomMembre(membre);
  const [role, setRole] = useState(membre.role);
  const repreneurs = useMemo(() => repreneursPossibles(membres, membre.user_id), [membres, membre.user_id]);
  const [repreneur, setRepreneur] = useState(repreneurs.some((m) => m.user_id === moi) ? moi : "");
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  const proposerReassignation = reassignationProposee(action, membre, role);
  const bloque = perdAdmin(action, membre, role) && autresAdminsActifs(membres, membre.user_id) === 0;
  const inchange = action === "role" && role === membre.role;

  const valider = async () => {
    setEnvoi(true);
    setErreur(null);
    const vers = proposerReassignation ? repreneur || null : null;
    try {
      let n = 0;
      if (action === "role") n = await changerRole(membre.user_id, role, vers);
      if (action === "suspendre") n = await suspendre(membre.user_id, vers);
      if (action === "reactiver") await reactiver(membre.user_id);
      if (action === "retirer") n = await retirer(membre.user_id, vers);
      const nomRepreneur = nomMembre(repreneurs.find((m) => m.user_id === vers) ?? {});
      const suite = n > 0 ? ` ${pluriel(n, "tâche réassignée", "tâches réassignées")} à ${vers === moi ? "vous" : nomRepreneur}.` : "";
      const fait = {
        role: `Rôle de ${nom}${N}: ${LIBELLE_ROLE[role]}.`,
        suspendre: `Accès de ${nom} suspendu.`,
        reactiver: `Accès de ${nom} rétabli.`,
        retirer: `${nom} ne fait plus partie de l'entreprise.`,
      }[action];
      onFermer(fait + suite);
    } catch (e) {
      setErreur(e.message);
      setEnvoi(false);
    }
  };

  const optionsRepreneur = [
    ...repreneurs.map((m) => ({ value: m.user_id, label: m.user_id === moi ? `${nomMembre(m)} (moi)` : nomMembre(m) })),
    { value: "", label: "Ne pas réassigner" },
  ];

  return (
    <FenetreFormulaire
      titre={TITRES[action](nom)}
      erreur={erreur}
      envoi={envoi}
      valide={!bloque && !inchange}
      libelleValider={VALIDER[action]}
      elementRetour={elementRetour}
      onFermer={() => onFermer(null)}
      onValider={valider}
    >
      {action === "role" && <Select label="Rôle" value={role} onChange={(e) => setRole(e.target.value)} options={OPTIONS_ROLE} />}
      {action === "suspendre" && (
        <p className="text-sm" style={{ color: C.textSecondary }}>
          {nom} ne verra plus rien de l'entreprise tant que son accès est suspendu. Ses données (clients, documents, activités) restent. Vous pourrez rétablir son accès à tout moment.
        </p>
      )}
      {action === "reactiver" && (
        <p className="text-sm" style={{ color: C.textSecondary }}>
          {nom} retrouve l'accès à l'entreprise avec le rôle {LIBELLE_ROLE[membre.role]}.
        </p>
      )}
      {action === "retirer" && (
        <p className="text-sm" style={{ color: C.textSecondary }}>
          {nom} perd l'accès à l'entreprise. Ses données (clients, documents, activités) restent. Pour revenir, une nouvelle invitation sera nécessaire.
        </p>
      )}
      {proposerReassignation && !bloque && (
        <Select
          label={`Tâches à faire de ${nom} (${membre.taches_a_faire})`}
          value={repreneur}
          onChange={(e) => setRepreneur(e.target.value)}
          options={optionsRepreneur}
          hint={repreneur ? "Confiées à ce membre ; les tâches faites ne changent pas." : `Elles restent attribuées à ${nom}.`}
        />
      )}
      {bloque && (
        <p role="note" className="flex items-start gap-2 rounded-xl p-3 text-sm" style={{ backgroundColor: alpha(C.error, 0.06), color: C.errorText, border: `1px solid ${C.error}` }}>
          <AlertCircle size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          {MESSAGE_DERNIER_ADMIN}
        </p>
      )}
    </FenetreFormulaire>
  );
}
