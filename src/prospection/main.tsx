import { createRoot } from "react-dom/client";
import "@/index.css"; // design system partagé (fonts + tokens du site vitrine)
import "./prospection.css";
import { initTheme } from "./lib/theme";
import ProspectionApp from "./ProspectionApp";

initTheme();

createRoot(document.getElementById("prospection-root")!).render(<ProspectionApp />);
