import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

interface AuthState {
  session: Session | null;
  estAdmin: boolean;
  chargement: boolean;
}

const AuthContext = createContext<AuthState>({
  session: null,
  estAdmin: false,
  chargement: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [estAdmin, setEstAdmin] = useState(false);
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    let actif = true;

    async function verifierAdmin(s: Session | null) {
      if (!s) {
        if (actif) { setEstAdmin(false); setChargement(false); }
        return;
      }
      // La RLS ne renvoie une ligne admins que si l'utilisateur EST admin.
      const { data } = await supabase
        .from("admins")
        .select("auth_user_id")
        .eq("auth_user_id", s.user.id)
        .maybeSingle();
      if (actif) { setEstAdmin(!!data); setChargement(false); }
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!actif) return;
      setSession(data.session);
      verifierAdmin(data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setChargement(true);
      verifierAdmin(s);
    });
    return () => { actif = false; sub.subscription.unsubscribe(); };
  }, []);

  return (
    <AuthContext.Provider value={{ session, estAdmin, chargement }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
