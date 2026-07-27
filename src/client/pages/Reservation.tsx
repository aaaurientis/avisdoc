// Page publique de réservation d'un créneau (sans compte).
// Accès par lien à jeton : client.avisdoc.fr/rdv/<token>. Tout passe par
// l'Edge Function `rdv` (le jeton fait foi) — aucune table exposée à anon.
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import AvisdocLogo from "@/components/AvisdocLogo";

const URL =
  (import.meta.env.VITE_ADMIN_SUPABASE_URL as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_URL as string);
const KEY =
  (import.meta.env.VITE_ADMIN_SUPABASE_ANON_KEY as string | undefined) ??
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string);

async function appelRdv(body: Record<string, unknown>) {
  const r = await fetch(`${URL}/functions/v1/rdv`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: KEY, Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "Une erreur est survenue.");
  return j;
}

interface Creneau { heure: string; libre: boolean }
interface Infos { entreprise: string; journee: { date: string; lieu: string; duree_min: number }; creneaux: Creneau[] }

export function Reservation() {
  const { token = "" } = useParams();
  const [infos, setInfos] = useState<Infos | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);
  const [choix, setChoix] = useState<string | null>(null);
  const [form, setForm] = useState({ nom: "", email: "", telephone: "" });
  const [envoi, setEnvoi] = useState(false);
  const [confirme, setConfirme] = useState<string | null>(null);

  async function charger() {
    setErr(null);
    try {
      const d = await appelRdv({ action: "infos", token });
      setInfos(d);
    } catch (e: any) { setErr(e.message); }
    finally { setChargement(false); }
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [token]);

  const dateLisible = useMemo(() => {
    if (!infos) return "";
    const d = new Date(infos.journee.date + "T00:00:00");
    return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }, [infos]);

  async function reserver(e: React.FormEvent) {
    e.preventDefault();
    if (!choix) { setErr("Choisissez un créneau."); return; }
    setEnvoi(true); setErr(null);
    try {
      await appelRdv({ action: "reserver", token, creneau: choix, ...form });
      setConfirme(choix);
    } catch (e: any) {
      setErr(e.message);
      await charger(); // rafraîchit les créneaux (peut-être pris entre-temps)
      setChoix(null);
    } finally { setEnvoi(false); }
  }

  return (
    <div className="surface-hero flex min-h-screen items-start justify-center p-4 sm:items-center">
      <div className="my-8 w-[520px] max-w-full rounded-3xl bg-card px-7 py-8 shadow-floating sm:px-10">
        <AvisdocLogo className="h-16 w-auto" />
        <div className="mt-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">
          Dépistage dermatologique
        </div>

        {chargement && <p className="mt-6 text-muted-foreground">Chargement…</p>}

        {err && !infos && (
          <p className="mt-6 rounded-xl border border-orange-400/40 bg-orange-50 px-4 py-3 text-sm text-orange-700">{err}</p>
        )}

        {confirme && infos && (
          <div className="mt-6 rounded-2xl border border-avisdoc-teal/30 bg-avisdoc-teal/10 px-5 py-6 text-center">
            <h1 className="font-display text-2xl font-semibold text-avisdoc-ink">Rendez-vous confirmé</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Vous êtes inscrit le <strong>{dateLisible}</strong> à <strong>{confirme}</strong>
              {infos.journee.lieu ? <> — {infos.journee.lieu}</> : null}.
              Un e-mail de confirmation vous a été envoyé.
            </p>
          </div>
        )}

        {infos && !confirme && (
          <>
            <h1 className="mt-6 font-display text-2xl font-semibold text-avisdoc-ink">
              Réservez votre créneau
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {infos.entreprise ? <>{infos.entreprise} · </> : null}
              <span className="capitalize">{dateLisible}</span>
              {infos.journee.lieu ? <> · {infos.journee.lieu}</> : null}
            </p>

            {/* Grille de créneaux */}
            <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {infos.creneaux.map((c) => (
                <button
                  key={c.heure}
                  type="button"
                  disabled={!c.libre}
                  onClick={() => setChoix(c.heure)}
                  className={
                    "rounded-xl border px-2 py-2 text-sm font-medium transition-colors " +
                    (!c.libre
                      ? "cursor-not-allowed border-border bg-muted/40 text-muted-foreground/40 line-through"
                      : choix === c.heure
                        ? "border-avisdoc-ink bg-avisdoc-ink text-white"
                        : "border-border hover:border-avisdoc-teal")
                  }
                >
                  {c.heure}
                </button>
              ))}
              {infos.creneaux.length === 0 && (
                <p className="col-span-full text-sm text-muted-foreground">Aucun créneau disponible.</p>
              )}
            </div>

            {/* Formulaire */}
            <form onSubmit={reserver} className="mt-6 space-y-3">
              <input required placeholder="Nom et prénom" value={form.nom}
                onChange={(e) => setForm({ ...form, nom: e.target.value })}
                className="w-full rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-sm outline-none focus:border-avisdoc-teal" />
              <div className="grid gap-3 sm:grid-cols-2">
                <input required type="email" placeholder="E-mail" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-sm outline-none focus:border-avisdoc-teal" />
                <input required type="tel" placeholder="Téléphone" value={form.telephone}
                  onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                  className="w-full rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-sm outline-none focus:border-avisdoc-teal" />
              </div>
              {err && <p className="text-sm text-orange-600">{err}</p>}
              <button disabled={envoi || !choix}
                className="w-full rounded-full bg-avisdoc-ink px-5 py-3 text-[15px] font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50">
                {envoi ? "Réservation…" : choix ? `Confirmer le rendez-vous à ${choix}` : "Choisissez un créneau"}
              </button>
              <p className="text-center text-[11.5px] text-muted-foreground/80">
                Examen de moins de 15 minutes. Votre employeur n'a accès à aucune information médicale.
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
