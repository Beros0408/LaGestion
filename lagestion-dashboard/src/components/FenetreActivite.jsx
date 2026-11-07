import React, { useMemo, useState } from "react";
import { useActivites } from "../context/ActivitesContext.jsx";
import { useOpportunites } from "../context/OpportunitesContext.jsx";
import { LIBELLE_TYPE_ACTIVITE } from "../utils/taches";
import FenetreFormulaire from "./FenetreFormulaire.jsx";
import Input from "./form/Input.jsx";
import Select from "./form/Select.jsx";
import Textarea from "./form/Textarea.jsx";

// Date et heure locales au format d'un champ datetime-local (AAAA-MM-JJTHH:MM).
const versChamp = (iso) => {
  const d = iso ? new Date(iso) : new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

// Ajout ou modification d'une activité d'un client, éventuellement liée à l'une de ses opportunités.
// Auteur et nom posés par la base ; modification réservée à l'auteur, à l'admin et au manager (contrôle en base).
export default function FenetreActivite({ clientId, activite, elementRetour, onFermer }) {
  const { addActivite, updateActivite } = useActivites();
  const { opportunites } = useOpportunites();
  const [type, setType] = useState(activite?.type ?? "appel");
  const [date, setDate] = useState(versChamp(activite?.date_activite));
  const [opportunite, setOpportunite] = useState(activite?.opportunite_id ?? "");
  const [commentaire, setCommentaire] = useState(activite?.commentaire ?? "");
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  const options = useMemo(
    () => [{ value: "", label: "Aucune" }, ...opportunites.filter((o) => o.client_id === clientId).map((o) => ({ value: o.id, label: o.nom }))],
    [opportunites, clientId]
  );

  const enregistrer = async () => {
    setEnvoi(true);
    setErreur(null);
    const donnees = { type, date_activite: new Date(date).toISOString(), opportunite_id: opportunite || null, commentaire };
    try {
      if (activite) await updateActivite(activite.id, donnees);
      else await addActivite({ ...donnees, client_id: clientId });
      onFermer();
    } catch (e) {
      setErreur(e.message);
      setEnvoi(false);
    }
  };

  return (
    <FenetreFormulaire
      titre={activite ? "Modifier l'activité" : "Nouvelle activité"}
      erreur={erreur}
      envoi={envoi}
      valide={commentaire.trim() !== "" && Boolean(date)}
      elementRetour={elementRetour}
      onFermer={onFermer}
      onValider={enregistrer}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select
          label="Type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          options={Object.entries(LIBELLE_TYPE_ACTIVITE).map(([value, label]) => ({ value, label }))}
        />
        <Input label="Date et heure" type="datetime-local" required value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <Select label="Opportunité" value={opportunite} onChange={(e) => setOpportunite(e.target.value)} options={options} />
      <Textarea label="Commentaire" required rows={4} value={commentaire} onChange={(e) => setCommentaire(e.target.value)} />
    </FenetreFormulaire>
  );
}
