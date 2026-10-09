// Le résumé des notes du commercial, en tête de l'onglet Identité.
//
// « Fais un résumé des notes en première page. » — Olivier, 09/10, en automatique.
// Les notes entières restent dans l'Historique ; ici, quelques lignes pour reprendre
// le fil d'un coup d'œil. Merx refait le résumé à l'ouverture de la fiche quand une
// note est plus récente que lui : personne n'a de bouton à penser à cliquer.

import { useEffect, useRef, useState } from "react";
import { Loader2, NotebookPen } from "lucide-react";
import { supabaseAdmin } from "../data/supabaseAdmin";
import type { ClesFiche } from "../lib/echanges";

export interface ResumeDesNotes {
  points: string[];
  nb: number;
  derniere: string;
  au: string;
}

const leJour = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

export default function ResumeNotes({ cles }: { cles: ClesFiche }) {
  const [resume, setResume] = useState<ResumeDesNotes | null>(null);
  const [notes, setNotes] = useState<{ nb: number; derniere: string | null } | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const lance = useRef(false);
  const { prospectId, clientId, accountId } = cles;

  // Combien de notes, la plus récente, et le résumé déjà fait : c'est ce qui dit s'il
  // est à refaire. Il se range sur la fiche la plus avancée (comme côté Merx).
  useEffect(() => {
    const ou = [
      prospectId ? `prospect_id.eq.${prospectId}` : "",
      clientId ? `client_id.eq.${clientId}` : "",
      accountId ? `account_id.eq.${accountId}` : "",
    ].filter(Boolean);
    if (ou.length === 0) return;
    const [table, id] = accountId ? ["admin_accounts", accountId] : clientId ? ["admin_clients", clientId] : ["admin_prospects", prospectId!];
    let vivant = true;
    void Promise.all([
      supabaseAdmin.from("admin_echanges").select("created_at, detail").or(ou.join(",")).eq("kind", "note"),
      supabaseAdmin.from(table).select("resume_notes").eq("id", id).maybeSingle(),
    ]).then(([{ data }, { data: fiche }]) => {
      if (!vivant) return;
      const lues = (data ?? []).filter((n) => String(n.detail ?? "").trim());
      setResume(((fiche as { resume_notes?: ResumeDesNotes | null } | null)?.resume_notes ?? null));
      setNotes({ nb: lues.length, derniere: lues.map((n) => String(n.created_at)).sort().at(-1) ?? null });
    });
    return () => {
      vivant = false;
    };
  }, [prospectId, clientId, accountId]);

  const aJour = Boolean(
    resume && notes && resume.nb === notes.nb && notes.derniere && new Date(resume.derniere).getTime() >= new Date(notes.derniere).getTime(),
  );

  useEffect(() => {
    if (!notes || notes.nb === 0 || aJour || lance.current) return;
    lance.current = true;
    setEnCours(true);
    void supabaseAdmin.functions
      .invoke("merx", { body: { action: "resumer_notes", prospectId, clientId, accountId } })
      .then(({ data, error }) => {
        const r = data as { resume?: ResumeDesNotes | null; error?: string } | null;
        if (error || r?.error) setErreur(r?.error ?? "Le résumé n’a pas pu être fait. Il sera retenté à la prochaine ouverture.");
        else setResume(r?.resume ?? null);
      })
      .finally(() => setEnCours(false));
  }, [notes, aJour, prospectId, clientId, accountId]);

  if (!notes || notes.nb === 0) return null;

  return (
    <div className="mb-4 rounded-2xl bg-amber-50 px-4 py-3 text-amber-800">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] font-bold">
        <span className="inline-flex items-center gap-1.5">
          <NotebookPen className="size-4" /> Résumé des notes
        </span>
        <span className="font-semibold">
          {notes.nb} note{notes.nb > 1 ? "s" : ""}
          {notes.derniere ? ` · dernière le ${leJour(notes.derniere)}` : ""}
        </span>
      </div>
      {resume?.points.length ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] leading-snug">
          {resume.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
      {enCours && (
        <p className="mt-2 inline-flex items-center gap-1.5 text-[12.5px]">
          <Loader2 className="size-3.5 animate-spin" /> Merx {resume ? "met le résumé à jour" : "résume les notes"}…
        </p>
      )}
      {erreur && !enCours && <p className="mt-2 text-[12.5px]">{erreur}</p>}
      <p className="mt-2 text-[12px]">Texte complet dans l’onglet Historique.</p>
    </div>
  );
}
