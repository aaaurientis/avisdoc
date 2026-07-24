import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./lib/auth";
import ClientApp from "./App";
import "../index.css";

createRoot(document.getElementById("client-root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ClientApp />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
