import { Suspense, lazy, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { ThemeProvider } from "./components/ThemeProvider";
import SkipLink from "./components/SkipLink";
import Index from "./pages/Index";

const Entreprises = lazy(() => import("./pages/Entreprises"));
const Collectivites = lazy(() => import("./pages/Collectivites"));
const Professionnels = lazy(() => import("./pages/Professionnels"));
const APropos = lazy(() => import("./pages/APropos"));
const Contact = lazy(() => import("./pages/Contact"));
const CGU = lazy(() => import("./pages/CGU"));
const PolitiqueConfidentialite = lazy(() => import("./pages/PolitiqueConfidentialite"));
const MentionsLegales = lazy(() => import("./pages/MentionsLegales"));
const SuppressionDonnees = lazy(() => import("./pages/SuppressionDonnees"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const RouteLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="flex items-center gap-3 text-muted-foreground text-sm">
      <span className="h-3 w-3 rounded-full bg-primary animate-pulse" aria-hidden />
      Chargement…
    </div>
  </div>
);

const ScrollToTop = () => {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) return;
    window.scrollTo({ top: 0, left: 0 });
  }, [pathname, hash]);
  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <SkipLink />
          <ScrollToTop />
          <Suspense fallback={<RouteLoader />}>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/entreprises" element={<Entreprises />} />
              <Route path="/collectivites" element={<Collectivites />} />
              <Route path="/professionnels" element={<Professionnels />} />
              <Route path="/a-propos" element={<APropos />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/cgu" element={<CGU />} />
              <Route path="/politique-de-confidentialite" element={<PolitiqueConfidentialite />} />
              <Route path="/mentions-legales" element={<MentionsLegales />} />
              <Route path="/suppression-donnees" element={<SuppressionDonnees />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
