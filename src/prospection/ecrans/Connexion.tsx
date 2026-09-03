import { useState } from "react";
import AvisdocLogo from "@/components/AvisdocLogo";
import { cn } from "@/lib/utils";
import { useAuth } from "../auth/AuthContext";
import { L } from "../i18n/libelles";
import { CIBLE } from "../composants/ui";

export default function Connexion() {
  const { connecter, erreur } = useAuth();
  const [enCours, setEnCours] = useState(false);

  const cliquer = async () => {
    if (enCours) return;
    setEnCours(true);
    try { await connecter(); } finally { setEnCours(false); }
  };

  return (
    <div className="surface-hero flex min-h-screen items-center justify-center p-4">
      <div className="flex w-[420px] max-w-full flex-col items-center rounded-3xl bg-card px-11 pb-10 pt-12 shadow-floating">
        <AvisdocLogo className="h-[110px] w-auto" />
        <div className="mt-3.5 text-xs uppercase tracking-[0.12em] text-muted-foreground">{L.connexion.eyebrow}</div>
        <h1 className="mb-2 mt-7 text-center font-display text-[28px] font-semibold leading-tight text-avisdoc-ink">{L.connexion.titre}</h1>
        <p className="mb-7 text-center text-sm leading-relaxed text-muted-foreground">{L.connexion.texte}</p>

        <button
          type="button"
          onClick={() => void cliquer()}
          disabled={enCours}
          className={cn(CIBLE, "flex w-full items-center justify-center gap-3 rounded-full border-[1.5px] border-border bg-card px-5 py-3.5 text-[15px] font-semibold text-avisdoc-ink transition-all hover:border-avisdoc-teal disabled:opacity-70")}
        >
          <span className="inline-flex size-[22px] items-center justify-center rounded-full border border-border bg-white text-[13px] font-bold text-[#4285F4]" aria-hidden>G</span>
          <span>{enCours ? L.connexion.boutonEnCours : L.connexion.bouton}</span>
        </button>

        {erreur && (
          <div role="alert" className="mt-4 w-full rounded-xl bg-rose-50 px-4 py-2.5 text-center text-[12.5px] font-medium text-rose-700">{erreur}</div>
        )}

        <div className="mt-[18px] flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-[12.5px] text-muted-foreground">
          <span className="inline-block size-[7px] rounded-full bg-avisdoc-coral" aria-hidden />
          {L.connexion.reserve} <strong className="text-avisdoc-ink">{L.connexion.domaine}</strong>
        </div>
        <div className="mt-[34px] text-center text-[11.5px] text-muted-foreground/80">{L.connexion.pied}</div>
      </div>
    </div>
  );
}
