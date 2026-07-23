import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";

export function Layout({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  return (
    <div className="min-h-screen">
      <header className="bg-marine text-creme">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/" className="font-serif text-lg">
            AvisDoc <span className="text-cyan">· Administration</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-filet/80">{session?.user.email}</span>
            <button
              onClick={() => supabase.auth.signOut()}
              className="rounded border border-filet/30 px-3 py-1 hover:bg-white/10"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
