// Admin › Réglages › Statistiques : ce que le module Statistiques montre, pour tout le monde.
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "../../components/ui";
import { useAuth } from "../../auth/AuthContext";
import { chargerAffichageStats, enregistrerAffichageStats } from "../../lib/affichageStats";
import { AFFICHAGE_DEFAUT, initialeNom, type AffichageStats, type ModeNoms } from "../../lib/masquage";
import { cn } from "@/lib/utils";

const MODES: { cle: ModeNoms; label: string }[] = [
  { cle: "clair", label: "En clair" },
  { cle: "flou", label: "Floutés" },
  { cle: "initiale", label: "Initiale du nom" },
];
const EXEMPLE = "Claire ARNOUX";

export default function ReglagesStatistiques() {
  const { user } = useAuth();
  const [a, setA] = useState<AffichageStats | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  useEffect(() => { chargerAffichageStats().then(setA).catch((e) => { setErreur(String(e?.message ?? e)); setA(AFFICHAGE_DEFAUT); }); }, []);

  const enregistrer = async (n: AffichageStats) => {
    setA(n); setEnvoi(true); setErreur(null);
    try { await enregistrerAffichageStats(n, user?.email ?? ""); toast.success("Réglage enregistré."); }
    catch (e) { setErreur(e instanceof Error ? e.message : String(e)); }
    finally { setEnvoi(false); }
  };

  if (!a) return <div className="flex items-center gap-2 text-[13px] text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Chargement…</div>;
  return (
    <Card className="max-w-2xl p-5 text-[13px]">
      <div className="font-display text-base font-semibold text-avisdoc-ink">Module Statistiques</div>
      {erreur && <div role="alert" className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-800">{erreur}</div>}

      <label className="mt-4 flex cursor-pointer items-start gap-3">
        <input type="checkbox" className="mt-0.5 size-4" checked={a.resultatsDermato} disabled={envoi}
          onChange={(e) => void enregistrer({ ...a, resultatsDermato: e.target.checked })} />
        <span>
          <span className="font-semibold text-avisdoc-ink">Afficher les résultats dermatologiques</span>
          <span className="block text-[12px] text-muted-foreground">Recommandations, taux de consultation, exérèses, urgences, délais de suivi. Décoché : masqués partout dans le module (le rapport client n'est pas concerné).</span>
        </span>
      </label>

      <div className="mt-5 font-semibold text-avisdoc-ink">Noms des professionnels de santé (requis, requérants)</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {MODES.map((m) => (
          <button key={m.cle} type="button" disabled={envoi} onClick={() => void enregistrer({ ...a, noms: m.cle })}
            className={cn("rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold disabled:opacity-50",
              a.noms === m.cle ? "border-avisdoc-teal bg-avisdoc-teal text-white" : "border-border text-avisdoc-ink hover:bg-muted")}>
            {m.label}
          </button>
        ))}
      </div>
      <div className="mt-2 text-[12px] text-muted-foreground">
        Aperçu : {a.noms === "flou" ? <span className="select-none blur-[5px]">{EXEMPLE}</span> : a.noms === "initiale" ? initialeNom(EXEMPLE) : EXEMPLE}
      </div>
      {envoi && <div className="mt-3 flex items-center gap-2 text-[12px] text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Enregistrement…</div>}
    </Card>
  );
}
