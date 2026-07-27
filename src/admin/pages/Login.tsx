import { useState } from "react";
import AvisdocLogo from "@/components/AvisdocLogo";
import { useAuth } from "../auth/AuthContext";
import { ADMIN_AUTH } from "../lib/config";

export default function Login() {
  const { signIn, error } = useAuth();
  const [connecting, setConnecting] = useState(false);

  const handleSignIn = async () => {
    if (connecting) return;
    setConnecting(true);
    try {
      await signIn();
    } finally {
      // En mode démo, le composant est démonté à l'authentification ; en mode
      // supabase, on repasse la main (redirection OAuth) ou on réactive le bouton.
      setConnecting(false);
    }
  };

  return (
    <div className="surface-hero flex min-h-screen items-center justify-center p-4">
      <div className="flex w-[420px] max-w-full flex-col items-center rounded-3xl bg-card px-11 pb-10 pt-12 shadow-floating">
        <AvisdocLogo className="h-[110px] w-auto" />

        <div className="mt-3.5 text-xs uppercase tracking-[0.12em] text-muted-foreground">
          Espace d'administration
        </div>

        <h1 className="mb-2 mt-7 text-center font-display text-[28px] font-semibold leading-tight text-avisdoc-ink">
          La dermatologie <em className="not-italic text-avisdoc-teal">n'attend pas.</em>
        </h1>

        <p className="mb-7 text-center text-sm leading-relaxed text-muted-foreground">
          Connectez-vous avec votre compte Google professionnel pour accéder au
          back-office.
        </p>

        <button
          type="button"
          onClick={handleSignIn}
          disabled={connecting}
          className="flex w-full items-center justify-center gap-3 rounded-full border-[1.5px] border-border bg-card px-5 py-3.5 text-[15px] font-semibold text-avisdoc-ink transition-all hover:border-avisdoc-teal hover:shadow-[0_4px_14px_rgba(43,160,216,0.18)] disabled:opacity-70"
        >
          <span className="inline-flex size-[22px] items-center justify-center rounded-full border border-border bg-white text-[13px] font-bold text-[#4285F4]">
            G
          </span>
          <span>{connecting ? "Connexion en cours…" : "Se connecter avec Google"}</span>
        </button>

        {error && (
          <div className="mt-4 w-full rounded-xl bg-rose-50 px-4 py-2.5 text-center text-[12.5px] font-medium text-rose-700">
            {error}
          </div>
        )}

        <div className="mt-[18px] flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-[12.5px] text-muted-foreground">
          <span className="inline-block size-[7px] rounded-full bg-avisdoc-coral" />
          Accès réservé aux adresses{" "}
          <strong className="text-avisdoc-ink">@avisdoc.fr</strong>
        </div>

        <div className="mt-[34px] text-center text-[11.5px] text-muted-foreground/80">
          Hébergement de données de santé agréé · Conforme RGPD
        </div>

        {ADMIN_AUTH === "demo" && (
          <div className="mt-3 text-center text-[10.5px] uppercase tracking-wide text-muted-foreground/60">
            Mode démonstration — SSO simulé
          </div>
        )}
      </div>
    </div>
  );
}
