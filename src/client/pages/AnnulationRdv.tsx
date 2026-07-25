// Page publique d'annulation d'un rendez-vous (sans compte), via lien à jeton.
// client.avisdoc.fr/annuler/<journeeToken>?a=<annul_token>
// Annulation sur clic explicite (jamais au chargement : un scanner d'e-mail
// pourrait sinon annuler le rendez-vous en pré-visualisant le lien).
import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import AvisdocLogo from "@/components/AvisdocLogo";

const URL =
  (import.meta.env.VITE_ADMIN_SUPABASE_URL as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_URL as string);
const KEY =
  (import.meta.env.VITE_ADMIN_SUPABASE_ANON_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string);

export function AnnulationRdv() {
  const { token = "" } = useParams();
  const [params] = useSearchParams();
  const annul = params.get("a") ?? "";
  const [etat, setEtat] = useState<"pret" | "envoi" | "ok" | "erreur">("pret");
  const [err, setErr] = useState<string | null>(null);

  async function annuler() {
    setEtat("envoi"); setErr(null);
    try {
      const r = await fetch(`${URL}/functions/v1/rdv`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: KEY, Authorization: `Bearer ${KEY}` },
        body: JSON.stringify({ action: "annuler", token, annul }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Annulation impossible.");
      setEtat("ok");
    } catch (e: any) {
      setErr(e.message); setEtat("erreur");
    }
  }

  return (
    <div className="surface-hero grid min-h-screen place-items-center p-4">
      <div className="w-[440px] max-w-full rounded-3xl bg-card px-9 py-9 text-center shadow-floating">
        <AvisdocLogo className="mx-auto h-14 w-auto" />
        {etat === "ok" ? (
          <>
            <h1 className="mt-6 font-display text-2xl font-semibold text-avisdoc-ink">Rendez-vous annulé</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Votre créneau a été libéré. Vous pouvez en réserver un autre à tout moment via votre lien d'inscription.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-6 font-display text-2xl font-semibold text-avisdoc-ink">Annuler le rendez-vous</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Confirmez l'annulation de votre rendez-vous de dépistage. Le créneau sera de nouveau disponible.
            </p>
            {err && <p className="mt-4 rounded-xl bg-orange-50 px-4 py-2.5 text-[13px] text-orange-700">{err}</p>}
            <button
              onClick={annuler}
              disabled={etat === "envoi" || !annul}
              className="mt-6 w-full rounded-full bg-avisdoc-ink px-5 py-3 text-[15px] font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
            >
              {etat === "envoi" ? "Annulation…" : "Confirmer l'annulation"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
