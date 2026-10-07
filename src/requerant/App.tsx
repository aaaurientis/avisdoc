import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "./lib/supabase";
import { portalRepo } from "./lib/repo";
import Bienvenue from "./pages/Bienvenue";
import Suivi from "./pages/Suivi";

export default function RequerantApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [pret, setPret] = useState(false);

  useEffect(() => {
    let actif = true;

    // Rattachement du compte à l'inscription si on arrive via le lien (?token=).
    const rattacher = async () => {
      const token = new URLSearchParams(window.location.search).get("token");
      if (!token) return;
      try {
        await portalRepo.accepter(token);
      } catch (e) {
        console.error(e);
      } finally {
        // On retire le token de l'URL (une seule fois).
        const u = new URL(window.location.href);
        u.searchParams.delete("token");
        window.history.replaceState({}, "", u.pathname + u.search);
      }
    };

    supabase.auth.getSession().then(async ({ data }) => {
      if (!actif) return;
      if (data.session) await rattacher();
      if (!actif) return;
      setSession(data.session);
      setPret(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (event, s) => {
      if (!actif) return;
      if (event === "SIGNED_IN" && s) await rattacher();
      if (!actif) return;
      setSession(s);
      setPret(true);
    });
    return () => {
      actif = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const deconnexion = async () => {
    await portalRepo.seDeconnecter();
    setSession(null);
    toast.success("Déconnectée.");
  };

  if (!pret) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="size-8 animate-spin rounded-full border-[3px] border-border border-t-avisdoc-teal" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {session ? <Suivi onDeconnexion={() => void deconnexion()} /> : <Bienvenue />}
    </div>
  );
}
