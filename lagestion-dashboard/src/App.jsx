import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Clients from "./pages/Clients.jsx";
import ClientForm from "./pages/ClientForm.jsx";
import ClientDetail from "./pages/ClientDetail.jsx";
import Opportunites from "./pages/Opportunites.jsx";
import OpportuniteForm from "./pages/OpportuniteForm.jsx";
import Factures from "./pages/Factures.jsx";
import FactureForm from "./pages/FactureForm.jsx";
import FactureDetail from "./pages/FactureDetail.jsx";

export default function App() {
  return (
    <Routes>
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
        <Route path="/factures" element={<Factures />} />
        <Route path="/factures/nouvelle" element={<FactureForm />} />
        <Route path="/factures/:id" element={<FactureDetail />} />
        <Route path="/factures/:id/modifier" element={<FactureForm />} />
      </Route>
    </Routes>
  );
}
