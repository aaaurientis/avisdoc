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
import { logAudit } from "../lib/audit";

type Status = "loading" | "authenticated" | "unauthenticated";

interface AuthValue {
  status: Status;
  user: AdminUser | null;
  error: string | null;
  /** true si le compte connecté peut consulter le journal d'audit. */
  isSuperAdmin: boolean;
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
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // Hydratation initiale.
  useEffect(() => {
    let active = true;

    if (ADMIN_AUTH === "demo") {
      try {
        const raw = localStorage.getItem(DEMO_KEY);
        if (raw) {
          setUser(JSON.parse(raw));
          setIsSuperAdmin(true); // en démo, l'écran d'audit est explorable
          setStatus("authenticated");
          return;
        }
      } catch {
        /* ignore */
      }
      setStatus("unauthenticated");
      return;
    }

    // Mode supabase. `isSignIn` = vrai à une connexion effective (≠ rechargement
    // de page ou rafraîchissement de jeton) → sert à ne journaliser qu'une fois.
    const applySession = async (
      session: { user?: { email?: string; user_metadata?: Record<string, unknown> } } | null,
      isSignIn: boolean,
    ) => {
      if (!active) return;
      const email = session?.user?.email;
      if (!email) {
        setUser(null);
        setIsSuperAdmin(false);
        setStatus("unauthenticated");
        return;
      }
      if (!isAllowedEmail(email)) {
        // Tentative refusée : on trace AVANT la déconnexion (le JWT est encore
        // valide), puis on déconnecte.
        await logAudit({
          actorEmail: email,
          category: "auth",
          action: "login_refused",
          success: false,
          detail: { reason: `domaine non autorisé (@${ALLOWED_DOMAIN} requis)` },
        });
        setError(`Accès réservé aux adresses @${ALLOWED_DOMAIN}.`);
        void supabaseAdmin.auth.signOut();
        setUser(null);
        setIsSuperAdmin(false);
        setStatus("unauthenticated");
        return;
      }
      const meta = session?.user?.user_metadata ?? {};
      setUser({
        name: (meta.full_name as string) || (meta.name as string) || nameFromEmail(email),
        email,
      });
      setStatus("authenticated");
      if (isSignIn) {
        void logAudit({ actorEmail: email, category: "auth", action: "login", success: true });
      }
      // Statut super-admin (RLS : chacun ne voit que sa propre ligne).
      supabaseAdmin
        .from("admin_superadmins")
        .select("email")
        .eq("email", email)
        .maybeSingle()
        .then(({ data }) => {
          if (active) setIsSuperAdmin(!!data);
        });
    };

    supabaseAdmin.auth.getSession().then(({ data }) => void applySession(data.session, false));
    const { data: sub } = supabaseAdmin.auth.onAuthStateChange((event, session) =>
      void applySession(session, event === "SIGNED_IN"),
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
      // Trace la déconnexion tant que le JWT est valide, puis déconnecte.
      if (user?.email) {
        await logAudit({ actorEmail: user.email, category: "auth", action: "logout", success: true });
      }
      await supabaseAdmin.auth.signOut();
    }
    setUser(null);
    setIsSuperAdmin(false);
    setStatus("unauthenticated");
  }, [user]);

  const value = useMemo<AuthValue>(
    () => ({ status, user, error, isSuperAdmin, signIn, signOut }),
    [status, user, error, isSuperAdmin, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans <AuthProvider>");
  return ctx;
}
