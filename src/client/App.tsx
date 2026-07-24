import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { supabase } from "./lib/supabase";
import { Login } from "./pages/Login";
import { Bibliotheque } from "./pages/Bibliotheque";
import { Emails } from "./pages/Emails";

export default function ClientApp() {
  const { session, clientId, clientNom, chargement } = useAuth();

  if (chargement) return <div className="p-8 text-muted-foreground">Chargement…</div>;
  if (!session) return <Login />;

  if (!clientId) {
    return (
      <div className="mx-auto mt-24 max-w-md px-6 text-center">
        <h1 className="font-display text-2xl font-semibold text-avisdoc-ink">Compte non rattaché</h1>
        <p className="mt-3 text-muted-foreground">
          Ce compte n'est rattaché à aucun espace client. Contactez votre référent AvisDoc.
        </p>
        <button onClick={() => supabase.auth.signOut()} className="mt-6 rounded-xl bg-avisdoc-ink px-4 py-2 text-white">
          Se déconnecter
        </button>
      </div>
    );
  }

  const lien = (a: boolean) => `rounded-lg px-3 py-1.5 text-sm ${a ? "bg-white/15" : "hover:bg-white/10"}`;

  return (
    <div className="min-h-screen">
      <header className="bg-avisdoc-ink text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <span className="font-display text-lg">AvisDoc <span className="text-avisdoc-teal">· {clientNom}</span></span>
            <nav className="flex gap-1">
              <NavLink to="/" end className={({ isActive }) => lien(isActive)}>Documents</NavLink>
              <NavLink to="/emails" className={({ isActive }) => lien(isActive)}>E-mails</NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-white/70">{session.user.email}</span>
            <button onClick={() => supabase.auth.signOut()} className="rounded-lg border border-white/30 px-3 py-1 hover:bg-white/10">
              Déconnexion
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <Routes>
          <Route path="/" element={<Bibliotheque clientId={clientId} />} />
          <Route path="/emails" element={<Emails entreprise={clientNom ?? ""} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
