import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import Coquille from "./composants/Coquille";
import Connexion from "./ecrans/Connexion";
import Jour from "./ecrans/Jour";
import Contacts from "./ecrans/Contacts";
import FicheContact from "./ecrans/FicheContact";
import Message from "./ecrans/Message";
import Import from "./ecrans/Import";
import Exclusions from "./ecrans/Exclusions";

// Toute réponse hors 2xx lève : on ne réessaie pas en silence, l'erreur s'affiche.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false }, mutations: { retry: false } } });

function Attente() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="size-8 animate-spin rounded-full border-[3px] border-border border-t-avisdoc-teal" />
    </div>
  );
}

function Aiguillage() {
  const { statut } = useAuth();
  if (statut === "chargement") return <Attente />;
  if (statut === "anonyme") return <Connexion />;
  return (
    <Routes>
      <Route element={<Coquille />}>
        <Route path="/jour" element={<Jour />} />
        <Route path="/contacts" element={<Contacts />} />
        <Route path="/contacts/:id" element={<FicheContact />} />
        <Route path="/contacts/:id/message/:type" element={<Message />} />
        <Route path="/import" element={<Import />} />
        <Route path="/exclusions" element={<Exclusions />} />
        <Route path="*" element={<Navigate to="/jour" replace />} />
      </Route>
    </Routes>
  );
}

export default function ProspectionApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <HashRouter>
          <Aiguillage />
        </HashRouter>
        <Sonner />
      </AuthProvider>
    </QueryClientProvider>
  );
}
