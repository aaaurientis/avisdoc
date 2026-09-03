import { Outlet } from "react-router-dom";
import BarreLaterale from "./BarreLaterale";

/** Coquille applicative après connexion : barre latérale + contenu. */
export default function Coquille() {
  return (
    <div className="pr-coquille flex min-h-screen bg-background">
      <BarreLaterale />
      <main className="pr-contenu min-w-0 flex-1 px-9 py-8">
        <Outlet />
      </main>
    </div>
  );
}
