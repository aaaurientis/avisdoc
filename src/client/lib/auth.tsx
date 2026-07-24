import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

interface AuthState {
  session: Session | null;
  clientId: string | null;
  clientNom: string | null;
  chargement: boolean;
}

const AuthContext = createContext<AuthState>({
  session: null, clientId: null, clientNom: null, chargement: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientNom, setClientNom] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    let actif = true;

    async function rattacher(s: Session | null) {
      if (!s) { if (actif) { setClientId(null); setClientNom(null); setChargement(false); } return; }
      // RLS : ne renvoie que la ligne de l'utilisateur courant.
      const { data: uc } = await supabase
        .from("admin_client_espace_users")
        .select("id, client_id, premiere_connexion_le")
        .eq("auth_user_id", s.user.id).maybeSingle();

      if (uc && !uc.premiere_connexion_le) {
        await supabase.from("admin_client_espace_users")
          .update({ premiere_connexion_le: new Date().toISOString() }).eq("id", uc.id);
      }
      let nom: string | null = null;
      if (uc?.client_id) {
        const { data: c } = await supabase
          .from("admin_clients").select("company").eq("id", uc.client_id).maybeSingle();
        nom = c?.company ?? null;
      }
      if (actif) { setClientId(uc?.client_id ?? null); setClientNom(nom); setChargement(false); }
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!actif) return;
      setSession(data.session); rattacher(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s); setChargement(true); rattacher(s);
    });
    return () => { actif = false; sub.subscription.unsubscribe(); };
  }, []);

  return (
    <AuthContext.Provider value={{ session, clientId, clientNom, chargement }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
