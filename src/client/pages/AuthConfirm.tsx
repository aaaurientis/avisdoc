// Point d'atterrissage des liens d'e-mail (invitation / magic link).
// Le lien pointe vers CE domaine (client.avisdoc.fr/auth/confirm?token_hash=…)
// et non vers *.supabase.co : le domaine du lien correspond à l'expéditeur,
// ce qui évite le classement « hameçonnage » par Microsoft/Google.
// On échange le token_hash contre une session (sans PKCE → inter-appareils OK).
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

const TYPES: EmailOtpType[] = ["magiclink", "invite", "email", "recovery", "signup", "email_change"];

export function AuthConfirm() {
  const navigate = useNavigate();
  const [erreur, setErreur] = useState<string | null>(null);
  const fait = useRef(false);

  useEffect(() => {
    if (fait.current) return; // StrictMode : une seule tentative
    fait.current = true;

    const url = new URL(window.location.href);
    const token_hash = url.searchParams.get("token_hash");
    const typeParam = (url.searchParams.get("type") ?? "magiclink") as EmailOtpType;
    const type = TYPES.includes(typeParam) ? typeParam : "magiclink";

    if (!token_hash) {
      setErreur("Lien invalide ou incomplet.");
      return;
    }

    supabase.auth.verifyOtp({ token_hash, type }).then(({ error }) => {
      if (error) setErreur(error.message);
      else navigate("/", { replace: true });
    });
  }, [navigate]);

  return (
    <div className="surface-hero grid min-h-screen place-items-center p-4">
      <div className="w-[420px] max-w-full rounded-3xl bg-card px-10 py-9 text-center shadow-floating">
        {erreur ? (
          <>
            <h1 className="font-display text-2xl font-semibold text-avisdoc-ink">Lien expiré</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{erreur}</p>
            <button
              onClick={() => navigate("/", { replace: true })}
              className="mt-6 rounded-xl bg-avisdoc-ink px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              Demander un nouveau lien
            </button>
          </>
        ) : (
          <p className="text-muted-foreground">Connexion en cours…</p>
        )}
      </div>
    </div>
  );
}
