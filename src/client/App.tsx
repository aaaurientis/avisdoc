import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth";
import { supabase } from "./lib/supabase";
import ClientShell from "./components/ClientShell";
import { Login } from "./pages/Login";
import { AuthConfirm } from "./pages/AuthConfirm";
import { Reservation } from "./pages/Reservation";
import { Bibliotheque } from "./pages/Bibliotheque";
import { Emails } from "./pages/Emails";

function Splash() {
  return (
    <div className="grid min-h-screen place-items-center bg-background text-muted-foreground">
      Chargement…
    </div>
  );
}

function NonRattache() {
  return (
    <div className="surface-hero grid min-h-screen place-items-center p-4">
      <div className="w-[420px] max-w-full rounded-3xl bg-card px-10 py-9 text-center shadow-floating">
        <h1 className="font-display text-2xl font-semibold text-avisdoc-ink">
          Compte non rattaché
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Ce compte n'est rattaché à aucun espace client. Contactez votre
          référent AvisDoc.
        </p>
        <button
          onClick={() => void supabase.auth.signOut()}
          className="mt-6 rounded-xl bg-avisdoc-ink px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
        >
          Se déconnecter
        </button>
      </div>
    </div>
  );
}

export default function ClientApp() {
  const { session, clientId, clientNom, chargement } = useAuth();

  return (
    <Routes>
      {/* Atterrissage des liens d'e-mail — doit s'exécuter même sans session. */}
      <Route path="/auth/confirm" element={<AuthConfirm />} />
      {/* Réservation publique (sans compte) — accès par lien à jeton. */}
      <Route path="/rdv/:token" element={<Reservation />} />

      {chargement ? (
        <Route path="*" element={<Splash />} />
      ) : !session ? (
        <Route path="*" element={<Login />} />
      ) : !clientId ? (
        <Route path="*" element={<NonRattache />} />
      ) : (
        <Route
          element={
            <ClientShell email={session.user.email ?? ""} clientNom={clientNom ?? "Votre espace"}>
              <Outlet />
            </ClientShell>
          }
        >
          <Route path="/" element={<Bibliotheque clientId={clientId} />} />
          <Route path="/emails" element={<Emails entreprise={clientNom ?? ""} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      )}
    </Routes>
  );
}
