import { createRoot } from "react-dom/client";
import "@/index.css"; // design system partagé
import ProApp from "./ProApp";
import EcranErreur from "@/components/EcranErreur";

createRoot(document.getElementById("pro-root")!).render(
  <EcranErreur>
    <ProApp />
  </EcranErreur>,
);
