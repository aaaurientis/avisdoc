import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "@/components/ui/sonner";
import RequerantApp from "./App";
import EcranErreur from "@/components/EcranErreur";
import "../index.css"; // design system partagé (fonts + tokens)

createRoot(document.getElementById("requerant-root")!).render(
  <StrictMode>
    <EcranErreur>
      <RequerantApp />
    </EcranErreur>
    <Toaster />
  </StrictMode>,
);
