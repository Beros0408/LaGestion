import React, { useMemo, useState } from "react";
import { useTaches } from "../context/TachesContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useClients } from "../context/ClientsContext.jsx";
import { useOpportunites } from "../context/OpportunitesContext.jsx";
import { useDevis } from "../context/DevisContext.jsx";
import { useFactures } from "../context/FacturesContext.jsx";
import { libelleNumero } from "../data/factures";
import { jourParis } from "../utils/facture";
import { ROLES_ECRITURE } from "../utils/taches";
import FenetreFormulaire from "./FenetreFormulaire.jsx";
import Input from "./form/Input.jsx";
import Select from "./form/Select.jsx";

const TYPES_LIEN = [
  { value: "", label: "Aucun" },
  { value: "client_id", label: "Client" },
  { value: "opportunite_id", label: "Opportunité" },
  { value: "devis_id", label: "Devis" },
  { value: "facture_id", label: "Facture" },
];
const lienDe = (t) => TYPES_LIEN.find((l) => l.value && t?.[l.value]);

// Création ou modification d'une tâche. Un seul objet lié au plus ; responsable parmi les membres actifs de l'entreprise
// au rôle qui écrit (un membre lecture ne pourrait pas marquer sa tâche faite ; refusé aussi en base, migration 017
// pour le statut). Le responsable actuel reste dans la liste, même suspendu, pour que le choix affiché soit le vrai.
// La base refuse ce qui sort des droits (auteur, responsable, admin, manager) ou de l'entreprise.
export default function FenetreTache({ tache, initiale = {}, elementRetour, onFermer }) {
  const { membres, addTache, updateTache } = useTaches();
  const { user } = useAuth();
  const { clients } = useClients();
  const { opportunites } = useOpportunites();
  const { devis } = useDevis();
  const { factures } = useFactures();
  const depart = tache ?? initiale;
  const [titre, setTitre] = useState(depart.titre ?? "");
  const [echeance, setEcheance] = useState(depart.echeance ?? jourParis());
  const [responsable, setResponsable] = useState(depart.responsable ?? user?.id ?? "");
  const [typeLien, setTypeLien] = useState(lienDe(depart)?.value ?? "");
  const [objet, setObjet] = useState(lienDe(depart) ? depart[lienDe(depart).value] : "");
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  const objets = useMemo(() => {
    if (typeLien === "client_id") return clients.map((c) => ({ value: c.id, label: c.nom }));
    if (typeLien === "opportunite_id") return opportunites.map((o) => ({ value: o.id, label: o.nom }));
    if (typeLien === "devis_id") return devis.map((d) => ({ value: d.id, label: d.numero ?? "Brouillon de devis" }));
    if (typeLien === "facture_id") return factures.map((f) => ({ value: f.id, label: libelleNumero(f) }));
    return [];
  }, [typeLien, clients, opportunites, devis, factures]);

  const valide = titre.trim() !== "" && echeance && responsable && (!typeLien || objet);

  const enregistrer = async () => {
    setEnvoi(true);
    setErreur(null);
    const liens = { client_id: null, opportunite_id: null, devis_id: null, facture_id: null };
    if (typeLien) liens[typeLien] = objet;
    const donnees = { titre, echeance, responsable, ...liens };
    try {
      if (tache) await updateTache(tache.id, donnees);
      else await addTache({ ...donnees, origine: initiale.origine });
      onFermer();
    } catch (e) {
      setErreur(e.message);
      setEnvoi(false);
    }
  };

  return (
    <FenetreFormulaire
      titre={tache ? "Modifier la tâche" : "Nouvelle tâche"}
      erreur={erreur}
      envoi={envoi}
      valide={valide}
      elementRetour={elementRetour}
      onFermer={onFermer}
      onValider={enregistrer}
    >
      <Input label="Titre" required maxLength={200} value={titre} onChange={(e) => setTitre(e.target.value)} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input label="Échéance" type="date" required value={echeance} onChange={(e) => setEcheance(e.target.value)} />
        <Select
          label="Responsable"
          required
          value={responsable}
          onChange={(e) => setResponsable(e.target.value)}
          options={membres.filter((m) => (ROLES_ECRITURE.includes(m.role) && m.statut === "actif") || m.id === depart.responsable).map((m) => ({ value: m.id, label: m.id === user?.id ? `${m.nom} (moi)` : m.nom }))}
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Select label="Lié à" value={typeLien} onChange={(e) => { setTypeLien(e.target.value); setObjet(""); }} options={TYPES_LIEN} />
        {typeLien && (
          <Select
            label={TYPES_LIEN.find((l) => l.value === typeLien).label}
            required
            value={objet}
            onChange={(e) => setObjet(e.target.value)}
            options={[{ value: "", label: "Choisir…" }, ...objets]}
          />
        )}
      </div>
    </FenetreFormulaire>
  );
}
