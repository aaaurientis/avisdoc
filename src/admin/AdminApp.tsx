import { HashRouter, Navigate, Route, Routes, useLocation, useParams } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { AdminDataProvider } from "./data/AdminDataContext";
import AppShell from "./components/AppShell";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Crm from "./pages/Crm";
import CrmSynthese from "./pages/CrmSynthese";
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
import TypologiesClients from "./pages/TypologiesClients";
import Audit from "./pages/Audit";
import Droits from "./pages/Droits";
import Veille from "./pages/Veille";
import VeilleSurveiller from "./pages/VeilleSurveiller";
import Scope from "./pages/Vigile";
import CommercialVeille from "./pages/CommercialVeille";
import VeilleArchives from "./pages/VeilleArchives";
import VeilleCpr from "./pages/VeilleCpr";
import VeilleDirect from "./pages/VeilleDirect";
import { GardeVeille } from "./pages/veille/useVeille";
import { MODULE_DU_CRM, MODULES_CRM, type Module } from "./lib/modules";
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
/**
 * Les écrans de fiches sont communs aux quatre CRM (?crm=…) : il faut le droit du CRM de l'adresse,
 * ou, sans CRM dans l'adresse (une fiche ouverte par son lien), le droit d'au moins un CRM.
 */
function GardeCrm({ children }: { children: React.ReactNode }) {
  const { peut, droitsCharges } = useAuth();
  const crm = new URLSearchParams(useLocation().search).get("crm");
  if (!droitsCharges) return <FullScreenLoader />;
  const ok = crm && MODULE_DU_CRM[crm] ? peut(MODULE_DU_CRM[crm]) : MODULES_CRM.some((m) => peut(m));
  return ok ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

/** L'Aide et la Corbeille servent aux CRM et à la Veille Marché (?veille=marche). */
function GardeAide({ children }: { children: React.ReactNode }) {
  const veilleMarche = new URLSearchParams(useLocation().search).get("veille") === "marche";
  return veilleMarche ? <Garde module="veille">{children}</Garde> : <GardeCrm>{children}</GardeCrm>;
}

/** La Veille Marché demande son droit ; la veille commerciale, celui du CRM de l'adresse (?seul=… ou ?crm=…). */
function GardeDeLaVeille({ children }: { children: React.ReactNode }) {
  const { peut, droitsCharges } = useAuth();
  const { veille } = useParams();
  const q = new URLSearchParams(useLocation().search);
  if (!droitsCharges) return <FullScreenLoader />;
  const crm = q.get("seul") ?? q.get("crm");
  const ok = veille === "marche" ? peut("veille") : crm && MODULE_DU_CRM[crm] ? peut(MODULE_DU_CRM[crm]) : MODULES_CRM.some((m) => peut(m));
  return ok ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

/** Les anciennes adresses de Paramétrage et CPR (dans la veille avant le 09/11) mènent à Admin, onglet demandé compris. */
function VersAdmin({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}

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
          <Route path="/crm" element={<GardeCrm><Crm /></GardeCrm>} />
          <Route path="/crm-synthese" element={<Garde module="crm_synthese"><CrmSynthese /></Garde>} />
          <Route path="/crm/:clientId" element={<GardeCrm><Crm /></GardeCrm>} />
          <Route path="/merx" element={<GardeCrm><Merx /></GardeCrm>} />
          <Route path="/prospects" element={<GardeCrm><Prospects /></GardeCrm>} />
          <Route path="/clients" element={<Garde module="finance"><Clients /></Garde>} />
          <Route path="/fichier-client" element={<GardeCrm><FichierClient /></GardeCrm>} />
          <Route path="/debrief" element={<Garde module="commercial"><Debrief /></Garde>} />
          {/* L'écran a fusionné avec le Débrief : un lien gardé ne tombe pas dans le vide. */}
          <Route path="/notes-dictees" element={<Navigate to="/debrief" replace />} />
          <Route path="/couts" element={<Garde module="commercial"><Couts /></Garde>} />
          <Route path="/planning" element={<GardeCrm><Planning /></GardeCrm>} />
          <Route path="/aide" element={<GardeAide><Aide /></GardeAide>} />
          <Route path="/corbeille" element={<GardeAide><Corbeille /></GardeAide>} />
          <Route path="/commercial-veille" element={<Garde module="commercial"><CommercialVeille /></Garde>} />
          {/* Veille à démarcher et les squelettes de la Veille Marché (phase A d'Arthur) : remplacés par les CRM et la Veille Marché (Olivier, 09/11). */}
          <Route path="/demarche/entreprises" element={<Navigate to="/veille/commerciale/direct?seul=demarcher" replace />} />
          <Route path="/demarche/collectivites" element={<Navigate to="/veille/commerciale/direct?seul=collectivites" replace />} />
          <Route path="/demarche/intermediaires" element={<Navigate to="/veille/commerciale/direct?seul=intermediaires" replace />} />
          <Route path="/demarche/mutuelles" element={<Navigate to="/veille/commerciale/direct?seul=mutuelles" replace />} />
          <Route path="/marche/avis" element={<Navigate to="/veille/marche/direct?seul=nous" replace />} />
          <Route path="/marche/incontournables" element={<Navigate to="/veille/marche/direct?seul=nous" replace />} />
          <Route path="/marche/concurrence" element={<Navigate to="/veille/marche/direct?seul=concurrents" replace />} />
          <Route path="/marche/publications" element={<Navigate to="/veille/marche/direct?seul=publications" replace />} />
          {/* Deux veilles depuis le 02/11 : /veille/commerciale/… (celle des CRM) et /veille/marche/… ; les anciennes adresses y mènent. */}
          <Route path="/veille" element={<Navigate to="/veille/commerciale" replace />} />
          <Route path="/veille/:veille" element={<GardeVeille><GardeDeLaVeille><Veille /></GardeDeLaVeille></GardeVeille>} />
          <Route path="/veille/:veille/direct" element={<GardeVeille><GardeDeLaVeille><VeilleDirect /></GardeDeLaVeille></GardeVeille>} />
          <Route path="/veille/:veille/vigile" element={<GardeVeille><GardeDeLaVeille><Scope /></GardeDeLaVeille></GardeVeille>} />
          {/* Paramétrage et CPR sont dans Admin depuis le 09/11 (piste de Gemini) ; les anciennes adresses y mènent. */}
          <Route path="/veille/:veille/surveiller" element={<VersAdmin to="/parametrage-veille" />} />
          <Route path="/veille/:veille/archives" element={<GardeVeille><GardeDeLaVeille><VeilleArchives /></GardeDeLaVeille></GardeVeille>} />
          <Route path="/veille/:veille/cpr" element={<VersAdmin to="/cpr" />} />
          <Route path="/veille/:veille/:rapportId" element={<GardeVeille><GardeDeLaVeille><Veille /></GardeDeLaVeille></GardeVeille>} />
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
          <Route path="/parametrage-veille" element={<Garde module="admin"><VeilleSurveiller /></Garde>} />
          <Route path="/cpr" element={<Garde module="admin"><VeilleCpr /></Garde>} />
          <Route path="/typologies" element={<Garde module="admin"><TypologiesClients /></Garde>} />
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
