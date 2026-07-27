// Espace professionnel (pro.avisdoc.fr) — v1 : connexion Pro Santé Connect.
//
// Le flux OIDC est entièrement géré par l'Edge Function `psc-auth`
// (client_secret côté serveur). L'app :
//   1. redirige vers  <fonction>?action=login  au clic ;
//   2. au retour, récupère `#jeton=…` (session signée HMAC), le stocke ;
//   3. vérifie le jeton auprès de la fonction et affiche l'identité.
import { useEffect, useState } from "react";
import AvisdocLogo from "@/components/AvisdocLogo";

const SUPABASE_URL = (import.meta.env.VITE_ADMIN_SUPABASE_URL ??
  import.meta.env.VITE_SUPABASE_URL) as string;
const FN = `${SUPABASE_URL}/functions/v1/psc-auth`;
const CLE_SESSION = "avisdoc-pro-session";

interface Identite {
  prenom?: string;
  nom?: string;
  idnat?: string; // identifiant national (RPPS préfixé)
}

export default function ProApp() {
  const [jeton, setJeton] = useState<string | null>(null);
  const [identite, setIdentite] = useState<Identite | null>(null);
  const [statut, setStatut] = useState<"chargement" | "anonyme" | "connecte">("chargement");
  const [err, setErr] = useState<string | null>(null);

  // Récupère le jeton : retour PSC (#jeton=…) prioritaire, sinon stockage local.
  useEffect(() => {
    const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const recu = h.get("jeton");
    const erreur = h.get("erreur");
    if (erreur) setErr(decodeURIComponent(erreur));
    if (recu) {
      localStorage.setItem(CLE_SESSION, recu);
      history.replaceState(null, "", window.location.pathname); // nettoie l'URL
    }
    const j = recu ?? localStorage.getItem(CLE_SESSION);
    if (!j) { setStatut("anonyme"); return; }
    setJeton(j);
    // Vérification serveur du jeton (signature + expiration).
    fetch(FN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verifier", jeton: j }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d?.ok) { setIdentite(d.identite); setStatut("connecte"); }
        else { localStorage.removeItem(CLE_SESSION); setStatut("anonyme"); }
      })
      .catch(() => { setStatut("anonyme"); });
  }, []);

  const seConnecter = () => {
    window.location.href = `${FN}?action=login`;
  };
  const seDeconnecter = () => {
    localStorage.removeItem(CLE_SESSION);
    setJeton(null);
    setIdentite(null);
    setStatut("anonyme");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-[420px] rounded-3xl border border-border bg-card p-8 shadow-lg">
        <AvisdocLogo className="mx-auto h-14 w-auto" />
        <h1 className="mt-4 text-center font-display text-[22px] font-semibold text-avisdoc-ink">
          Espace professionnel
        </h1>

        {statut === "chargement" && (
          <p className="mt-6 text-center text-[13.5px] text-muted-foreground">Chargement…</p>
        )}

        {statut === "anonyme" && (
          <>
            <p className="mt-2 text-center text-[13.5px] leading-relaxed text-muted-foreground">
              Réservé aux professionnels de santé. Identifiez-vous avec votre
              carte e-CPS via Pro Santé Connect.
            </p>
            {err && (
              <p className="mt-4 break-words rounded-xl border border-orange-400/40 bg-orange-50 px-3.5 py-2 text-[12.5px] text-orange-700">
                {err}
              </p>
            )}
            {/* Bouton Pro Santé Connect (charte : fond bleu foncé) */}
            <button
              type="button"
              onClick={seConnecter}
              className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-2xl bg-[#000091] px-4 py-3.5 text-[14px] font-bold text-white transition-opacity hover:opacity-90"
            >
              <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="currentColor" aria-hidden>
                <path d="M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
              </svg>
              S'identifier avec Pro Santé Connect
            </button>
            <p className="mt-3 text-center text-[11.5px] text-muted-foreground/80">
              Service d'identification de l'Agence du Numérique en Santé.
            </p>
          </>
        )}

        {statut === "connecte" && identite && (
          <>
            <div className="mt-6 rounded-2xl border border-avisdoc-teal/30 bg-avisdoc-teal/5 p-5 text-center">
              <div className="text-[12px] font-bold uppercase tracking-[0.06em] text-avisdoc-teal">
                Connecté via Pro Santé Connect ✓
              </div>
              <div className="mt-2 font-display text-lg font-semibold text-avisdoc-ink">
                {[identite.prenom, identite.nom].filter(Boolean).join(" ") || "Professionnel de santé"}
              </div>
              {identite.idnat && (
                <div className="mt-1 text-[12.5px] text-muted-foreground">
                  Identifiant national : {identite.idnat}
                </div>
              )}
            </div>
            <p className="mt-4 text-center text-[13px] text-muted-foreground">
              Les fonctionnalités de l'espace professionnel arrivent bientôt.
            </p>
            <button
              type="button"
              onClick={seDeconnecter}
              className="mt-5 w-full rounded-2xl border-[1.5px] border-border py-3 text-[13.5px] font-bold text-muted-foreground transition-colors hover:border-avisdoc-ink hover:text-avisdoc-ink"
            >
              Se déconnecter
            </button>
          </>
        )}
      </div>
    </div>
  );
}
