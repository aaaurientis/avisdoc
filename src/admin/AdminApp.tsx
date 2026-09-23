import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { AdminDataProvider } from "./data/AdminDataContext";
import AppShell from "./components/AppShell";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Crm from "./pages/Crm";
import Merx from "./pages/Merx";
import Prospects from "./pages/Prospects";
import FichierClient from "./pages/FichierClient";
import Dictee from "./pages/Dictee";
import Couts from "./pages/Couts";
import Corbeille from "./pages/Corbeille";
import Confirmation from "./components/Confirmation";
import Debrief from "./pages/Debrief";
import Planning from "./pages/Planning";
import Clients from "./pages/Clients";
import Contacts from "./pages/Contacts";
import Documents from "./pages/Documents";
import Settings from "./pages/Settings";
import Audit from "./pages/Audit";
import Droits from "./pages/Droits";
import type { Module } from "./lib/modules";

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="size-8 animate-spin rounded-full border-[3px] border-border border-t-avisdoc-teal" />
    </div>
  );
}

/** Garde d'accès : la page n'est servie que si le module est autorisé. */
function Garde({ module, children }: { module: Module; children: React.ReactNode }) {
  const { peut } = useAuth();
  if (!peut(module)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

/**
 * Où l'on arrive en ouvrant le Hub.
 *
 * Sur un téléphone, on n'ouvre pas AvisDoc pour lire un tableau de bord : on sort d'un
 * rendez-vous et on veut raconter avant d'avoir oublié. On arrive donc sur la dictée,
 * et le bouton Retour mène au reste. Sur un écran large, rien ne change.
 */
function Accueil() {
  const { peut } = useAuth();
  const surTelephone = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
  return <Navigate to={surTelephone && peut("merx") ? "/dictee" : "/dashboard"} replace />;
}

/** Aiguillage selon l'état d'authentification. */
function Gate() {
  const { status } = useAuth();

  if (status === "loading") return <FullScreenLoader />;
  if (status === "unauthenticated") return <Login />;

  return (
    <AdminDataProvider>
      <Routes>
        {/* Hors de la coquille : un dictaphone se tient à l'écran entier, sans menu.
            Le bouton Retour, en haut à droite, ramène au Débrief. */}
        <Route path="/dictee" element={<Garde module="merx"><Dictee /></Garde>} />

        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/crm" element={<Garde module="crm"><Crm /></Garde>} />
          <Route path="/crm/:clientId" element={<Garde module="crm"><Crm /></Garde>} />
          <Route path="/merx" element={<Garde module="merx"><Merx /></Garde>} />
          <Route path="/prospects" element={<Garde module="merx"><Prospects /></Garde>} />
          <Route path="/clients" element={<Garde module="finance"><Clients /></Garde>} />
          <Route path="/fichier-client" element={<Garde module="merx"><FichierClient /></Garde>} />
          <Route path="/debrief" element={<Garde module="merx"><Debrief /></Garde>} />
          {/* L'écran a fusionné avec le Débrief : un lien gardé ne tombe pas dans le vide. */}
          <Route path="/notes-dictees" element={<Navigate to="/debrief" replace />} />
          <Route path="/couts" element={<Garde module="merx"><Couts /></Garde>} />
          <Route path="/planning" element={<Garde module="merx"><Planning /></Garde>} />
          <Route path="/corbeille" element={<Garde module="merx"><Corbeille /></Garde>} />
          <Route path="/contacts" element={<Garde module="contacts"><Contacts /></Garde>} />
          <Route path="/documents" element={<Garde module="documents"><Documents /></Garde>} />
          <Route path="/audit" element={<Garde module="admin"><Audit /></Garde>} />
          <Route path="/droits" element={<Garde module="admin"><Droits /></Garde>} />
          <Route path="/settings" element={<Garde module="admin"><Settings /></Garde>} />
          <Route path="*" element={<Accueil />} />
        </Route>
      </Routes>
    </AdminDataProvider>
  );
}

export default function AdminApp() {
  return (
    <AuthProvider>
      <HashRouter>
        <Gate />
      </HashRouter>
      <Sonner />
      {/* Une seule fenêtre de confirmation pour tout le Hub. */}
      <Confirmation />
    </AuthProvider>
  );
}
