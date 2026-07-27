import { useState } from "react";
import AvisdocLogo from "@/components/AvisdocLogo";
import { supabase } from "../lib/supabase";

export function Login() {
  const [email, setEmail] = useState("");
  const [envoye, setEnvoye] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function envoyer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setEnvoi(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: false },
    });
    setEnvoi(false);
    if (error) setErreur(error.message);
    else setEnvoye(true);
  }

  return (
    <div className="surface-hero flex min-h-screen items-center justify-center p-4">
      <div className="flex w-[420px] max-w-full flex-col items-center rounded-3xl bg-card px-11 pb-10 pt-12 shadow-floating">
        <AvisdocLogo className="h-[110px] w-auto" />

        <div className="mt-3.5 text-xs uppercase tracking-[0.12em] text-muted-foreground">
          Espace client
        </div>

        <h1 className="mb-2 mt-7 text-center font-display text-[28px] font-semibold leading-tight text-avisdoc-ink">
          Vos documents de campagne, <em className="not-italic text-avisdoc-teal">au même endroit.</em>
        </h1>

        <p className="mb-7 text-center text-sm leading-relaxed text-muted-foreground">
          Connexion par lien sécurisé envoyé à votre adresse professionnelle.
        </p>

        {envoye ? (
          <div className="w-full rounded-2xl border border-avisdoc-teal/30 bg-avisdoc-teal/10 px-4 py-4 text-center text-sm leading-relaxed">
            Si <strong>{email}</strong> est déclarée pour votre entreprise, un lien
            de connexion vient de vous être envoyé. Pensez à vérifier vos
            indésirables.
          </div>
        ) : (
          <form onSubmit={envoyer} className="w-full space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="prenom@entreprise.fr"
              className="w-full rounded-xl border border-border bg-muted/50 px-3.5 py-3 text-sm outline-none transition-colors focus:border-avisdoc-teal"
            />
            <button
              disabled={envoi}
              className="w-full rounded-full bg-avisdoc-ink px-5 py-3.5 text-[15px] font-semibold text-white transition-all hover:opacity-90 disabled:opacity-70"
            >
              {envoi ? "Envoi en cours…" : "Recevoir le lien de connexion"}
            </button>
            {erreur && (
              <div className="rounded-xl bg-rose-50 px-4 py-2.5 text-center text-[12.5px] font-medium text-rose-700">
                {erreur}
              </div>
            )}
          </form>
        )}

        <div className="mt-[18px] flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-[12.5px] text-muted-foreground">
          <span className="inline-block size-[7px] rounded-full bg-avisdoc-coral" />
          Réservé aux adresses déclarées par votre entreprise
        </div>

        <div className="mt-[34px] text-center text-[11.5px] text-muted-foreground/80">
          Hébergement de données de santé agréé · Conforme RGPD
        </div>
      </div>
    </div>
  );
}
