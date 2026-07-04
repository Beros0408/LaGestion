import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { ClientsProvider } from "./context/ClientsContext.jsx";
import { OpportunitesProvider } from "./context/OpportunitesContext.jsx";
import { FacturesProvider } from "./context/FacturesContext.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <ClientsProvider>
        <OpportunitesProvider>
          <FacturesProvider>
            <App />
          </FacturesProvider>
        </OpportunitesProvider>
      </ClientsProvider>
    </BrowserRouter>
  </React.StrictMode>
);
