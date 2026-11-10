import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { EntrepriseProvider, useEntreprise } from "./context/EntrepriseContext.jsx";
import { ClientsProvider } from "./context/ClientsContext.jsx";
import { OpportunitesProvider } from "./context/OpportunitesContext.jsx";
import { FacturesProvider } from "./context/FacturesContext.jsx";
import { DevisProvider } from "./context/DevisContext.jsx";
import { ProduitsProvider } from "./context/ProduitsContext.jsx";
import { TachesProvider } from "./context/TachesContext.jsx";
import { ActivitesProvider } from "./context/ActivitesContext.jsx";
import "./index.css";

// Changement d'entreprise : les données (contexts) et les écrans sont recréés, aucun état de l'entreprise
// précédente ne subsiste ; une réponse tardive arrive sur un composant démonté et reste sans effet.
function EntrepriseActive({ children }) {
  const { entrepriseId } = useEntreprise();
  return <React.Fragment key={entrepriseId ?? "aucune"}>{children}</React.Fragment>;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <EntrepriseProvider>
          <EntrepriseActive>
          <ClientsProvider>
            <OpportunitesProvider>
              <FacturesProvider>
                <DevisProvider>
                  <ProduitsProvider>
                    <TachesProvider>
                      <ActivitesProvider>
                        <App />
                      </ActivitesProvider>
                    </TachesProvider>
                  </ProduitsProvider>
                </DevisProvider>
              </FacturesProvider>
            </OpportunitesProvider>
          </ClientsProvider>
          </EntrepriseActive>
        </EntrepriseProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
