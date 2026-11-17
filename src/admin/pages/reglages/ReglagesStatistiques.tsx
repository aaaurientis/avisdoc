// Admin › Réglages › Statistiques : ce que le module Statistiques montre, pour tout le monde.
import { useEffect, useMemo, useState } from "react";
import { chargerExpertises, useExpertises } from "../../data/journeesStore";
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
  // Liste des requis : ceux de l'extraction des expertises, plus ceux déjà masqués.
  const { expertises, statut } = useExpertises();
  useEffect(() => { if (statut === "initial") void chargerExpertises(); }, [statut]);
  const lesRequis = useMemo(() => {
    const n = new Map<string, number>();
    for (const e of expertises) if (e.requis?.trim()) n.set(e.requis.trim(), (n.get(e.requis.trim()) ?? 0) + 1);
    for (const r of a?.requisMasques ?? []) if (!n.has(r)) n.set(r, 0);
    return [...n.entries()].sort((x, y) => x[0].localeCompare(y[0], "fr"));
  }, [expertises, a?.requisMasques]);

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

      <div className="mt-5 font-semibold text-avisdoc-ink">Requis dont les résultats sont masqués</div>
      <p className="text-[12px] text-muted-foreground">Leurs avis restent comptés dans les volumes ; ils sont retirés des taux, exérèses, recommandations et délais de suivi, totaux compris.</p>
      {statut !== "pret" && !lesRequis.length ? (
        <div className="mt-2 flex items-center gap-2 text-[12px] text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> Lecture des expertises…</div>
      ) : (
        <div className="mt-2 grid max-h-72 grid-cols-1 gap-x-4 gap-y-1 overflow-y-auto rounded-xl border border-border p-2 sm:grid-cols-2">
          {lesRequis.map(([nom, nb]) => {
            const masque = a.requisMasques.includes(nom);
            return (
              <label key={nom} className={cn("flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1", masque && "bg-amber-50")}>
                <input type="checkbox" className="size-4" checked={masque} disabled={envoi}
                  onChange={() => void enregistrer({ ...a, requisMasques: masque ? a.requisMasques.filter((x) => x !== nom) : [...a.requisMasques, nom] })} />
                <span className="min-w-0 flex-1 truncate text-avisdoc-ink">{nom}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{nb} avis</span>
              </label>
            );
          })}
          {!lesRequis.length && <p className="px-2 py-1 text-[12px] text-muted-foreground">Aucun requis dans l'extraction des expertises.</p>}
        </div>
      )}

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
