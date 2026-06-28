import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Clients from "./pages/Clients.jsx";
import ClientForm from "./pages/ClientForm.jsx";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/clients/nouveau" element={<ClientForm />} />
        <Route path="/clients/:id/modifier" element={<ClientForm />} />
      </Route>
    </Routes>
  );
}
