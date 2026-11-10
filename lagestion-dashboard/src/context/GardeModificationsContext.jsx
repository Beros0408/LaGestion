import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import ConfirmDialog from "../components/ConfirmDialog.jsx";

// Garde contre la perte de saisie : un formulaire signale qu'il est modifié ;
// quitter() demande alors confirmation avant d'exécuter la navigation.
// Limite (BrowserRouter) : la barre latérale et le bouton « Précédent » du navigateur ne sont pas interceptés.
const GardeModificationsContext = createContext(null);

export function GardeModificationsProvider({ children }) {
  const [modifie, setModifie] = useState(false);
  const [demande, setDemande] = useState(null); // { action, origine }
  // Import en cours d'écriture : changement d'entreprise et création d'entreprise refusés (sélecteur).
  const [importEnCours, setImportEnCours] = useState(false);

  const quitter = useCallback(
    (action) => {
      if (!modifie) {
        action();
        return;
      }
      setDemande({ action, origine: document.activeElement });
    },
    [modifie]
  );

  const confirmer = () => {
    const { action } = demande;
    setDemande(null);
    setModifie(false);
    action();
  };

  const value = useMemo(() => ({ setModifie, quitter, importEnCours, setImportEnCours }), [quitter, importEnCours]);

  return (
    <GardeModificationsContext.Provider value={value}>
      {children}
      <ConfirmDialog
        ouvert={demande !== null}
        titre="Quitter sans enregistrer ?"
        message="Vos modifications seront perdues."
        libelleAnnuler="Rester sur la page"
        libelleConfirmer="Quitter sans enregistrer"
        onAnnuler={() => setDemande(null)}
        onConfirmer={confirmer}
        elementRetour={demande?.origine}
      />
    </GardeModificationsContext.Provider>
  );
}

// À appeler dans un formulaire : signale l'état modifié et protège le rechargement / la fermeture de l'onglet.
export function useGardeModifications(modifie) {
  const ctx = useContext(GardeModificationsContext);
  const setModifie = ctx?.setModifie;

  useEffect(() => {
    if (!setModifie) return undefined;
    setModifie(modifie);
    return () => setModifie(false);
  }, [modifie, setModifie]);

  useEffect(() => {
    if (!modifie) return undefined;
    const avertir = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", avertir);
    return () => window.removeEventListener("beforeunload", avertir);
  }, [modifie]);
}

// Navigation protégée : exécute l'action, après confirmation si un formulaire est modifié.
export function useQuitter() {
  const ctx = useContext(GardeModificationsContext);
  return ctx?.quitter ?? ((action) => action());
}

// À appeler par l'écran d'import : signale l'écriture en cours.
export function useSignalerImport(actif) {
  const setImportEnCours = useContext(GardeModificationsContext)?.setImportEnCours;
  useEffect(() => {
    if (!setImportEnCours) return undefined;
    setImportEnCours(actif);
    return () => setImportEnCours(false);
  }, [actif, setImportEnCours]);
}

export function useImportEnCours() {
  return useContext(GardeModificationsContext)?.importEnCours ?? false;
}
