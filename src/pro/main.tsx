import { createRoot } from "react-dom/client";
import "@/index.css"; // design system partagé
import ProApp from "./ProApp";

createRoot(document.getElementById("pro-root")!).render(<ProApp />);
