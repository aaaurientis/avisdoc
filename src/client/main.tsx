import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import ClientApp from "./App";
import EcranErreur from "@/components/EcranErreur";
import "../index.css"; // design system partagé (fonts + tokens du site vitrine)
import "../admin/admin.css"; // ajustements responsive de la coquille (sidebar)

createRoot(document.getElementById("client-root")!).render(
  <StrictMode>
    <EcranErreur>
      <BrowserRouter>
        <AuthProvider>
          <ClientApp />
        </AuthProvider>
      </BrowserRouter>
    </EcranErreur>
  </StrictMode>
);
