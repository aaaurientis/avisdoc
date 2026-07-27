import { createRoot } from "react-dom/client";
import "@/index.css"; // design system partagé (fonts + tokens du site vitrine)
import "./admin.css"; // ajustements responsive du back-office
import { initTheme } from "./lib/theme";
import AdminApp from "./AdminApp";

initTheme(); // avant le rendu — évite le flash clair en mode sombre

createRoot(document.getElementById("admin-root")!).render(<AdminApp />);
