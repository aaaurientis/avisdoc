import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { AdminDataProvider } from "./data/AdminDataContext";
import AppShell from "./components/AppShell";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Crm from "./pages/Crm";
import Clients from "./pages/Clients";
import Contacts from "./pages/Contacts";
import Documents from "./pages/Documents";
import Settings from "./pages/Settings";

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="size-8 animate-spin rounded-full border-[3px] border-border border-t-avisdoc-teal" />
    </div>
  );
}

/** Aiguillage selon l'état d'authentification. */
function Gate() {
  const { status } = useAuth();

  if (status === "loading") return <FullScreenLoader />;
  if (status === "unauthenticated") return <Login />;

  return (
    <AdminDataProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/crm" element={<Crm />} />
          <Route path="/crm/:clientId" element={<Crm />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
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
    </AuthProvider>
  );
}
