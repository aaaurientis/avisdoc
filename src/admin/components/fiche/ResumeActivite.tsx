// « ✦ Où on en est » : ce qui a été fait sur la fiche, résumé par Merx.
//
// Repris du hub Onetip (12/10). Gardé en base, il ne se refait que si une action a
// été notée, précisée, déplacée ou faite depuis. Ouvert à toute l'équipe.

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabaseAdmin } from "../../data/supabaseAdmin";
import type { ClesFiche, Echange } from "../../lib/echanges";

export interface ResumeActiviteStocke {
  texte: string;
  empreinte: string;
  au: string;
}

/** Ce sur quoi le résumé a été fait : une précision ajoutée ne crée pas de ligne, mais change l'empreinte. */
export const empreinteDe = (actions: Echange[]) =>
  [...actions]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((a) => `${a.id}:${a.detail?.length ?? 0}:${a.au}:${a.traite_le ?? ""}:${a.resultat ?? ""}`)
    .join("|");

/** La fiche où le résumé se range : la plus avancée. */
const tableDe = (c: ClesFiche): [string, string] | null =>
  c.accountId ? ["admin_accounts", c.accountId] : c.clientId ? ["admin_clients", c.clientId] : c.prospectId ? ["admin_prospects", c.prospectId] : null;

export default function ResumeActivite({ cles, actions }: { cles: ClesFiche; actions: Echange[] }) {
  const [resume, setResume] = useState<ResumeActiviteStocke | null>(null);
  const [lu, setLu] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const demande = useRef<string | null>(null);
  const empreinte = empreinteDe(actions);
  const cible = tableDe(cles);
  const { prospectId, clientId, accountId } = cles;

  useEffect(() => {
    if (!cible) return;
    let vivant = true;
    setLu(false);
    void supabaseAdmin
      .from(cible[0])
      .select("resume_activite")
      .eq("id", cible[1])
      .maybeSingle()
      .then(({ data }) => {
        if (!vivant) return;
        setResume(((data as { resume_activite?: ResumeActiviteStocke | null } | null)?.resume_activite ?? null));
        setLu(true);
      });
    return () => {
      vivant = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cible?.[0], cible?.[1]]);

  const aJour = Boolean(resume && resume.empreinte === empreinte);

  useEffect(() => {
    if (!lu || actions.length === 0 || aJour || demande.current === empreinte) return;
    demande.current = empreinte;
    setEnCours(true);
    setErreur(null);
    void supabaseAdmin.functions
      .invoke("merx", { body: { action: "resumer_activite", prospectId, clientId, accountId, empreinte } })
      .then(({ data, error }) => {
        const r = data as { resume?: ResumeActiviteStocke | null; error?: string } | null;
        if (error || r?.error) setErreur(r?.error ?? "Le résumé n’a pas pu être fait. Il sera retenté à la prochaine ouverture.");
        else setResume(r?.resume ?? null);
      })
      .finally(() => setEnCours(false));
  }, [lu, actions.length, aJour, empreinte, prospectId, clientId, accountId]);

  if (actions.length === 0) return null;

  return (
    <section className="mb-5 rounded-2xl bg-muted/60 px-4 py-3.5">
      <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-[0.09em] text-muted-foreground">✦ Où on en est</div>
      {enCours && !resume ? (
        <p className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Merx résume ce qui a été fait…
        </p>
      ) : resume ? (
        <p className={`text-[14px] leading-relaxed text-avisdoc-ink ${enCours ? "opacity-60" : ""}`}>{resume.texte}</p>
      ) : null}
      {erreur && !enCours && <p className="mt-1.5 text-[12.5px] text-rose-700">{erreur}</p>}
    </section>
  );
}
