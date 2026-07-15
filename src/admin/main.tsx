import { createRoot } from "react-dom/client";
import "@/index.css"; // design system partagé (fonts + tokens du site vitrine)
import "./admin.css"; // ajustements responsive du back-office
import AdminApp from "./AdminApp";

createRoot(document.getElementById("admin-root")!).render(<AdminApp />);
