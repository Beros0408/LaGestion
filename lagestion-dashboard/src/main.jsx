import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { ClientsProvider } from "./context/ClientsContext.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <ClientsProvider>
        <App />
      </ClientsProvider>
    </BrowserRouter>
  </React.StrictMode>
);
