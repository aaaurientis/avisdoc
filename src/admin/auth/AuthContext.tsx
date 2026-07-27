// Authentification du back-office.
//
// - Mode démo (défaut) : connexion simulée (~700 ms), session en localStorage.
//   Permet de développer/valider l'UI sans backend.
// - Mode supabase : vrai SSO Google restreint au domaine @avisdoc.fr.
//   La restriction est imposée ici ET côté serveur (RLS + hook — voir docs).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AdminUser } from "../types";
import { ADMIN_AUTH, ALLOWED_DOMAIN, isAllowedEmail } from "../lib/config";
import { supabaseAdmin } from "../data/supabaseAdmin";

type Status = "loading" | "authenticated" | "unauthenticated";

interface AuthValue {
  status: Status;
  user: AdminUser | null;
  error: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);
const DEMO_KEY = "avisdoc-admin-user";

const DEMO_USER: AdminUser = {
  name: "Dr Sarah Benali",
  email: "s.benali@avisdoc.fr",
};

function nameFromEmail(email: string): string {
  const local = email.split("@")[0];
  return local
    .split(/[.\-_]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [user, setUser] = useState<AdminUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Hydratation initiale.
  useEffect(() => {
    let active = true;

    if (ADMIN_AUTH === "demo") {
      try {
        const raw = localStorage.getItem(DEMO_KEY);
        if (raw) {
          setUser(JSON.parse(raw));
          setStatus("authenticated");
          return;
        }
      } catch {
        /* ignore */
      }
      setStatus("unauthenticated");
      return;
    }

    // Mode supabase
    const applySession = (session: { user?: { email?: string; user_metadata?: Record<string, unknown> } } | null) => {
      if (!active) return;
      const email = session?.user?.email;
      if (!email) {
        setUser(null);
        setStatus("unauthenticated");
        return;
      }
      if (!isAllowedEmail(email)) {
        setError(`Accès réservé aux adresses @${ALLOWED_DOMAIN}.`);
        void supabaseAdmin.auth.signOut();
        setUser(null);
        setStatus("unauthenticated");
        return;
      }
      const meta = session?.user?.user_metadata ?? {};
      setUser({
        name: (meta.full_name as string) || (meta.name as string) || nameFromEmail(email),
        email,
      });
      setStatus("authenticated");
    };

    supabaseAdmin.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: sub } = supabaseAdmin.auth.onAuthStateChange((_e, session) =>
      applySession(session),
    );
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async () => {
    setError(null);
    if (ADMIN_AUTH === "demo") {
      // On garde le statut « unauthenticated » pendant l'attente : la page de
      // connexion reste montée et affiche son propre état de chargement.
      await new Promise((r) => setTimeout(r, 700));
      localStorage.setItem(DEMO_KEY, JSON.stringify(DEMO_USER));
      setUser(DEMO_USER);
      setStatus("authenticated");
      return;
    }
    // Google OAuth — le paramètre hd suggère le domaine (à durcir côté serveur).
    const { error: err } = await supabaseAdmin.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin + "/admin.html",
        queryParams: { hd: ALLOWED_DOMAIN, prompt: "select_account" },
      },
    });
    if (err) setError(err.message);
  }, []);

  const signOut = useCallback(async () => {
    if (ADMIN_AUTH === "demo") {
      localStorage.removeItem(DEMO_KEY);
    } else {
      await supabaseAdmin.auth.signOut();
    }
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ status, user, error, signIn, signOut }),
    [status, user, error, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans <AuthProvider>");
  return ctx;
}
