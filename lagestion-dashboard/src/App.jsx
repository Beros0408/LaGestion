import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Login from "./pages/Login.jsx";
import Onboarding from "./pages/Onboarding.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Clients from "./pages/Clients.jsx";
import ClientForm from "./pages/ClientForm.jsx";
import ClientDetail from "./pages/ClientDetail.jsx";
import Opportunites from "./pages/Opportunites.jsx";
import OpportuniteForm from "./pages/OpportuniteForm.jsx";
import Devis from "./pages/Devis.jsx";
import DevisForm from "./pages/DevisForm.jsx";
import DevisDetail from "./pages/DevisDetail.jsx";
import Factures from "./pages/Factures.jsx";
import FactureForm from "./pages/FactureForm.jsx";
import FactureDetail from "./pages/FactureDetail.jsx";
import AvoirForm from "./pages/AvoirForm.jsx";
import Catalogue from "./pages/Catalogue.jsx";
import ProduitForm from "./pages/ProduitForm.jsx";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/clients/nouveau" element={<ClientForm />} />
          <Route path="/clients/:id" element={<ClientDetail />} />
          <Route path="/clients/:id/modifier" element={<ClientForm />} />
          <Route path="/opportunites" element={<Opportunites />} />
          <Route path="/opportunites/nouvelle" element={<OpportuniteForm />} />
          <Route path="/opportunites/:id/modifier" element={<OpportuniteForm />} />
          <Route path="/devis" element={<Devis />} />
          <Route path="/devis/nouveau" element={<DevisForm />} />
          <Route path="/devis/:id" element={<DevisDetail />} />
          <Route path="/devis/:id/modifier" element={<DevisForm />} />
          <Route path="/factures" element={<Factures />} />
          <Route path="/factures/nouvelle" element={<FactureForm />} />
          <Route path="/factures/:id" element={<FactureDetail />} />
          <Route path="/factures/:id/modifier" element={<FactureForm />} />
          <Route path="/factures/:id/avoir" element={<AvoirForm />} />
          <Route path="/factures/:id/avoir/modifier" element={<AvoirForm edition />} />
          <Route path="/catalogue" element={<Catalogue />} />
          <Route path="/catalogue/nouveau" element={<ProduitForm />} />
          <Route path="/catalogue/:id/modifier" element={<ProduitForm />} />
        </Route>
      </Route>
    </Routes>
  );
}
