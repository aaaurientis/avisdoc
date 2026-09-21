// Prospects — ce que Merx a trouvé, rangé par secteur.
// Les fiches sont communes à l’équipe (comme le fichier CRM) ; une fiche écartée sort du tableau
// sans jamais être supprimée.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Mail, Phone, RefreshCw } from "lucide-react";
import { supabaseAdmin } from "../data/supabaseAdmin";
import { Badge, PageHeader, SectionLabel } from "../components/ui";
import { SECTEURS, secteurDe, tonNote, type Prospect } from "../lib/merx";
import ProspectFiche from "./prospects/ProspectFiche";

function Carte({ p, onOuvrir }: { p: Prospect; onOuvrir: () => void }) {
  return (
    <button
      type="button"
      onClick={onOuvrir}
      className="ad-card-clickable w-full rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-avisdoc-teal"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-[13px] font-semibold leading-snug text-avisdoc-ink">{p.name}</div>
        <Badge className={`${tonNote(p.score_total)} shrink-0`}>{p.score_total ?? "—"}</Badge>
      </div>
      <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
        {[p.activity, p.city].filter(Boolean).join(" · ") || "—"}
      </div>
      {p.rationale && <p className="mt-2 line-clamp-2 text-[12px] leading-snug text-muted-foreground">{p.rationale}</p>}
      {(p.contact_email || p.contact_phone) && (
        <div className="mt-2 flex items-center gap-2 text-muted-foreground">
          {p.contact_email && <Mail className="size-3.5" />}
          {p.contact_phone && <Phone className="size-3.5" />}
          <span className="truncate text-[11px]">{p.contact_name ?? p.contact_email ?? p.contact_phone}</span>
        </div>
      )}
    </button>
  );
}

/** Une table absente veut dire « migration pas encore appliquée » : on le dit en français. */
function messageErreur(brut: string): string {
  return /Could not find the table|does not exist/i.test(brut)
    ? "Cet écran attend sa migration : le SQL n’a pas encore été exécuté sur la base."
    : brut;
}

export default function Prospects() {
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [voirEcartees, setVoirEcartees] = useState(false);

  const charger = useCallback(async () => {
    setErreur(null);
    const { data, error } = await supabaseAdmin
      .from("admin_prospects")
      .select("*")
      .order("score_total", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) setErreur(messageErreur(error.message));
    else setProspects((data ?? []) as Prospect[]);
    setChargement(false);
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const visibles = useMemo(
    () => prospects.filter((p) => (voirEcartees ? p.status === "ecarte" : p.status !== "ecarte")),
    [prospects, voirEcartees],
  );
  const ecartees = useMemo(() => prospects.filter((p) => p.status === "ecarte").length, [prospects]);
  const fiche = useMemo(() => prospects.find((p) => p.id === ouverte) ?? null, [prospects, ouverte]);

  const approfondir = useCallback(
    async (p: Prospect) => {
      const { data, error } = await supabaseAdmin.functions.invoke("merx", { body: { action: "approfondir", prospectId: p.id } });
      if (error) throw new Error(error.message);
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      await charger();
    },
    [charger],
  );

  const ecarter = useCallback(
    async (p: Prospect) => {
      const { error } = await supabaseAdmin.from("admin_prospects").update({ status: "ecarte" }).eq("id", p.id);
      if (error) throw new Error(error.message);
      setOuverte(null);
      await charger();
    },
    [charger],
  );

  return (
    <div>
      <PageHeader
        title="Prospection"
        subtitle={
          chargement
            ? "Chargement…"
            : `${visibles.length} fiche${visibles.length > 1 ? "s" : ""}${voirEcartees ? " écartée" + (visibles.length > 1 ? "s" : "") : ""} — trouvées par Merx`
        }
        action={
          <button
            type="button"
            onClick={() => void charger()}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-bold text-avisdoc-ink hover:border-avisdoc-teal"
          >
            <RefreshCw className="size-4" /> Actualiser
          </button>
        }
      />

      {erreur && <div className="mb-4 rounded-2xl bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700">{erreur}</div>}

      {chargement ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Chargement des fiches…
        </div>
      ) : visibles.length === 0 ? (
        <div className="rounded-2xl bg-muted/60 p-8 text-center">
          <SectionLabel>{voirEcartees ? "Aucune fiche écartée" : "Aucune fiche pour l’instant"}</SectionLabel>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            {voirEcartees
              ? "Les fiches que vous écartez restent ici, elles ne sont jamais supprimées."
              : "Demandez une recherche à Merx : les entreprises qu’il trouve arrivent ici, rangées par secteur."}
          </p>
        </div>
      ) : (
        <div className="ad-kanban grid grid-cols-2 gap-3 lg:grid-cols-5">
          {SECTEURS.map((s) => {
            const liste = visibles.filter((p) => secteurDe(p) === s.id);
            return (
              <div key={s.id} className="min-h-[260px] rounded-xl bg-muted/60 p-3">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <div className="text-xs font-bold uppercase tracking-[0.05em] text-muted-foreground">{s.label}</div>
                  <span className="shrink-0 rounded-full bg-card px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                    {liste.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {liste.map((p) => (
                    <Carte key={p.id} p={p} onOuvrir={() => setOuverte(p.id)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(ecartees > 0 || voirEcartees) && (
        <button
          type="button"
          onClick={() => setVoirEcartees((v) => !v)}
          className="mt-4 text-[13px] font-semibold text-muted-foreground underline-offset-2 hover:text-avisdoc-ink hover:underline"
        >
          {voirEcartees ? "Revenir aux fiches actives" : `Voir les fiches écartées (${ecartees})`}
        </button>
      )}

      {fiche && (
        <ProspectFiche
          prospect={fiche}
          onClose={() => setOuverte(null)}
          onApprofondir={approfondir}
          onEcarter={ecarter}
        />
      )}
    </div>
  );
}
