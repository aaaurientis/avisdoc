import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";

/** Coquille applicative post-login : sidebar + zone de contenu. */
export default function AppShell() {
  return (
    <div className="ad-shell flex min-h-screen bg-background">
      <Sidebar />
      <main className="ad-content min-w-0 flex-1 px-9 py-8">
        <Outlet />
      </main>
    </div>
  );
}
