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
import Aide from "./pages/Aide";
import Clients from "./pages/Clients";
import Contacts from "./pages/Contacts";
import ContactsDashboard from "./pages/ContactsDashboard";
import Documents from "./pages/Documents";
import Infirmieres from "./pages/Infirmieres";
import JourneesStatistiques from "./pages/journees/Statistiques";
import JourneesCalendrier from "./pages/journees/Calendrier";
import InfirmiereFiche from "./pages/infirmieres/Fiche";
import Settings from "./pages/Settings";
import Audit from "./pages/Audit";
import Droits from "./pages/Droits";
import EnConstruction from "./pages/EnConstruction";
import Veille from "./pages/Veille";
import VeilleSurveiller from "./pages/VeilleSurveiller";
import Vigile from "./pages/Vigile";
import CommercialVeille from "./pages/CommercialVeille";
import VeilleArchives from "./pages/VeilleArchives";
import VeilleCpr from "./pages/VeilleCpr";
import VeilleDirect from "./pages/VeilleDirect";
import type { Module } from "./lib/modules";
import { lireArrivee } from "./lib/arrivee";

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="size-8 animate-spin rounded-full border-[3px] border-border border-t-avisdoc-teal" />
    </div>
  );
}

/** Garde d'accès : la page n'est servie que si le module est autorisé. */
function Garde({ module, children }: { module: Module; children: React.ReactNode }) {
  const { peut, droitsCharges } = useAuth();
  // Juger avant d'avoir lu les droits, c'est refuser à tort : on attend.
  if (!droitsCharges) return <FullScreenLoader />;
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
  const surTelephone = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
  // Sans condition sur le module : les droits ne sont pas encore chargés à cet instant.
  // La garde de /dictee fera le tri si l'accès manque.
  const versLaDictee = surTelephone && lireArrivee() === "dictee";
  return <Navigate to={versLaDictee ? "/dictee" : "/dashboard"} replace />;
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
        <Route path="/dictee" element={<Garde module="commercial"><Dictee /></Garde>} />

        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/crm" element={<Garde module="commercial"><Crm /></Garde>} />
          <Route path="/crm/:clientId" element={<Garde module="commercial"><Crm /></Garde>} />
          <Route path="/merx" element={<Garde module="commercial"><Merx /></Garde>} />
          <Route path="/prospects" element={<Garde module="commercial"><Prospects /></Garde>} />
          <Route path="/clients" element={<Garde module="finance"><Clients /></Garde>} />
          <Route path="/fichier-client" element={<Garde module="commercial"><FichierClient /></Garde>} />
          <Route path="/debrief" element={<Garde module="commercial"><Debrief /></Garde>} />
          {/* L'écran a fusionné avec le Débrief : un lien gardé ne tombe pas dans le vide. */}
          <Route path="/notes-dictees" element={<Navigate to="/debrief" replace />} />
          <Route path="/couts" element={<Garde module="commercial"><Couts /></Garde>} />
          <Route path="/planning" element={<Garde module="commercial"><Planning /></Garde>} />
          <Route path="/aide" element={<Garde module="commercial"><Aide /></Garde>} />
          <Route path="/corbeille" element={<Garde module="commercial"><Corbeille /></Garde>} />
          <Route path="/commercial-veille" element={<Garde module="commercial"><CommercialVeille /></Garde>} />
          {/* Veille à démarcher (bloc 3) — écrans à venir (phase B). */}
          <Route path="/demarche/entreprises" element={<Garde module="demarche"><EnConstruction titre="Entreprises" sousTitre="Veille à démarcher" /></Garde>} />
          <Route path="/demarche/collectivites" element={<Garde module="demarche"><EnConstruction titre="Collectivités" sousTitre="Veille à démarcher" /></Garde>} />
          <Route path="/demarche/intermediaires" element={<Garde module="demarche"><EnConstruction titre="Intermédiaires" sousTitre="Veille à démarcher" /></Garde>} />
          <Route path="/demarche/mutuelles" element={<Garde module="demarche"><EnConstruction titre="Mutuelle Assurance" sousTitre="Veille à démarcher" /></Garde>} />
          {/* Veille Marché (bloc 4) — 4 thèmes à venir (phase B) + écrans de veille actuels ci-dessous. */}
          <Route path="/marche/avis" element={<Garde module="veille"><EnConstruction titre="Les avis sur AvisDoc" sousTitre="Veille Marché" /></Garde>} />
          <Route path="/marche/incontournables" element={<Garde module="veille"><EnConstruction titre="À ne pas manquer" sousTitre="Veille Marché" /></Garde>} />
          <Route path="/marche/concurrence" element={<Garde module="veille"><EnConstruction titre="Concurrence & Évènements" sousTitre="Veille Marché" /></Garde>} />
          <Route path="/marche/publications" element={<Garde module="veille"><EnConstruction titre="Publi Scientifiques" sousTitre="Veille Marché" /></Garde>} />
          <Route path="/veille" element={<Garde module="veille"><Veille /></Garde>} />
          <Route path="/veille/direct" element={<Garde module="veille"><VeilleDirect /></Garde>} />
          <Route path="/veille/vigile" element={<Garde module="veille"><Vigile /></Garde>} />
          <Route path="/veille/surveiller" element={<Garde module="veille"><VeilleSurveiller /></Garde>} />
          <Route path="/veille/archives" element={<Garde module="veille"><VeilleArchives /></Garde>} />
          <Route path="/veille/cpr" element={<Garde module="veille"><VeilleCpr /></Garde>} />
          <Route path="/veille/:rapportId" element={<Garde module="veille"><Veille /></Garde>} />
          <Route path="/contacts" element={<Garde module="sante"><ContactsDashboard /></Garde>} />
          <Route path="/contacts/requis" element={<Garde module="sante"><Contacts fixedType="Requis" /></Garde>} />
          <Route path="/contacts/reseau" element={<Garde module="sante"><Contacts fixedType="Réseau d'Aval" /></Garde>} />
          <Route path="/journees" element={<Garde module="journee"><JourneesStatistiques /></Garde>} />
          <Route path="/journees/calendrier" element={<Garde module="journee"><JourneesCalendrier /></Garde>} />
          <Route path="/documents" element={<Garde module="documents"><Documents /></Garde>} />
          <Route path="/infirmieres" element={<Garde module="sante"><Infirmieres /></Garde>} />
          <Route path="/infirmieres/:id" element={<Garde module="sante"><InfirmiereFiche /></Garde>} />
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
