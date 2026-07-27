// Vue « Rendez-vous » de l'espace client : l'employeur voit ses journées de
// dépistage, le remplissage et la liste des inscrits. Lecture seule (RLS espace).
import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { Badge, Card, PageHeader } from "../../admin/components/ui";

const CLIENT_APP_URL = "https://client.avisdoc.fr";
const H = (t: string) => t.slice(0, 5);

interface Inscrit { id: string; creneau: string; nom: string; email: string; telephone: string }
interface Journee {
  id: string; date: string; lieu: string; heure_debut: string; heure_fin: string;
  duree_min: number; actif: boolean; token: string; admin_rdv: Inscrit[];
}

export function RendezVous() {
  const [journees, setJournees] = useState<Journee[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [copie, setCopie] = useState<string | null>(null);
  const [ouvert, setOuvert] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("admin_journees")
      .select("id, date, lieu, heure_debut, heure_fin, duree_min, actif, token, admin_rdv(id, creneau, nom, email, telephone)")
      .order("date", { ascending: false })
      .then(({ data, error }) => {
        if (error) setErr(error.message);
        else setJournees((data ?? []) as Journee[]);
      });
  }, []);

  const total = useMemo(() => journees.reduce((n, j) => n + (j.admin_rdv?.length ?? 0), 0), [journees]);

  async function copier(token: string) {
    await navigator.clipboard.writeText(`${CLIENT_APP_URL}/rdv/${token}`);
    setCopie(token);
    setTimeout(() => setCopie((c) => (c === token ? null : c)), 1800);
  }

  const dateLisible = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div>
      <PageHeader
        title="Rendez-vous"
        subtitle={`${total} inscription${total > 1 ? "s" : ""} sur ${journees.length} journée${journees.length > 1 ? "s" : ""}`}
      />

      {err && <p className="mb-4 rounded-xl border border-orange-400/40 bg-orange-50 px-3.5 py-2 text-sm text-orange-700">{err}</p>}

      <div className="space-y-3">
        {journees.map((j) => {
          const inscrits = [...(j.admin_rdv ?? [])].sort((a, b) => a.creneau.localeCompare(b.creneau));
          return (
            <Card key={j.id} className="p-5">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold capitalize text-avisdoc-ink">
                    {dateLisible(j.date)}{j.lieu ? <span className="normal-case"> · {j.lieu}</span> : null}
                    {!j.actif && <span className="ml-2 text-[11px] font-normal text-orange-600">(inscriptions fermées)</span>}
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">{H(j.heure_debut)}–{H(j.heure_fin)} · créneaux de {j.duree_min} min</p>
                </div>
                <Badge className="bg-avisdoc-teal/15 text-avisdoc-teal">{inscrits.length} inscrit{inscrits.length > 1 ? "s" : ""}</Badge>
                <button onClick={() => copier(j.token)}
                  className="rounded-xl border border-border px-3 py-1.5 text-[13px] text-muted-foreground hover:border-avisdoc-ink">
                  {copie === j.token ? "Lien copié ✓" : "Copier le lien"}
                </button>
                <button onClick={() => setOuvert((o) => (o === j.id ? null : j.id))}
                  className="rounded-xl border border-border px-3 py-1.5 text-[13px] text-muted-foreground hover:border-avisdoc-ink">
                  {ouvert === j.id ? "Masquer" : "Voir les inscrits"}
                </button>
              </div>

              {ouvert === j.id && (
                <ul className="mt-3 divide-y divide-border border-t border-border">
                  {inscrits.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 py-2 text-[13px]">
                      <span className="w-14 shrink-0 font-semibold text-avisdoc-ink">{H(i.creneau)}</span>
                      <span className="min-w-0 flex-1 truncate">{i.nom}</span>
                      <span className="hidden min-w-0 flex-1 truncate text-muted-foreground sm:block">{i.email}</span>
                      <span className="hidden shrink-0 text-muted-foreground md:block">{i.telephone}</span>
                    </li>
                  ))}
                  {inscrits.length === 0 && <li className="py-2 text-[13px] text-muted-foreground">Aucune inscription pour le moment.</li>}
                </ul>
              )}
            </Card>
          );
        })}
        {journees.length === 0 && !err && (
          <Card className="px-4 py-10 text-center text-muted-foreground">
            Aucune journée de dépistage programmée pour le moment.
          </Card>
        )}
      </div>
    </div>
  );
}
