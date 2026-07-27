import { useMemo } from "react";
import type { ContactType } from "../types";
import { useAdminData } from "../data/AdminDataContext";
import { todayISO } from "../lib/format";
import { TYPE_DOT } from "../lib/ui-tokens";
import { Card, PageHeader, SectionLabel } from "../components/ui";

const TYPE_LABELS: { type: ContactType; label: string }[] = [
  { type: "Requérant", label: "Requérants" },
  { type: "Expert", label: "Experts" },
  { type: "Réseau d'Aval", label: "Réseau d'Aval" },
];

export default function Dashboard() {
  const { contacts, clients, activity } = useAdminData();
  const today = todayISO();

  const typeStats = useMemo(
    () =>
      TYPE_LABELS.map(({ type, label }) => {
        const list = contacts.filter((c) => c.type === type);
        return {
          type,
          label,
          count: list.length,
          acc: list.filter((c) => c.statut === "Accepté").length,
          att: list.filter((c) => c.statut === "En attente").length,
        };
      }),
    [contacts],
  );

  const contactBreakdown = typeStats
    .map((t) => `${t.count} ${t.label.toLowerCase()}`)
    .join(" · ");

  const relances = useMemo(() => {
    const open = clients.flatMap((c) =>
      c.suivis.filter((s) => !s.done && s.deadline),
    );
    const overdue = open.filter((s) => (s.deadline as string) < today);
    return { total: open.length, overdue: overdue.length };
  }, [clients, today]);

  return (
    <div>
      <PageHeader
        title="Tableau de bord"
        subtitle="Vue d'ensemble de l'activité — Juillet 2026"
        action={
          <span className="rounded-full border border-border bg-card px-4 py-2 text-[13px] font-semibold text-muted-foreground">
            30 derniers jours
          </span>
        }
      />

      <div className="ad-kpi-grid mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Demandes ce mois" value="214" foot="+18% vs juin" footClass="text-emerald-600" />
        <Kpi label="Délai moyen d'avis" value="68h" valueClass="text-avisdoc-teal" foot="Objectif : 96h" />
        <Kpi label="Contacts actifs" value={String(contacts.length)} foot={contactBreakdown} />
        <Kpi
          label="Relances à traiter"
          value={String(relances.total)}
          inverted
          foot={`${relances.overdue} en retard`}
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_340px]">
        <Card className="p-[22px]">
          <h2 className="mb-4 font-display text-lg font-semibold text-avisdoc-ink">
            Activité récente
          </h2>
          <div className="flex flex-col gap-3.5">
            {activity.map((a) => (
              <div key={a.id} className="flex items-start gap-3">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${a.dot}`} />
                <div>
                  <div className="text-[13px] leading-snug text-avisdoc-ink">{a.text}</div>
                  <div className="mt-0.5 text-[11.5px] text-muted-foreground/80">{a.when}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-[22px]">
          <h2 className="mb-4 font-display text-lg font-semibold text-avisdoc-ink">
            Répartition du réseau
          </h2>
          <div className="flex flex-col gap-4">
            {typeStats.map((t) => (
              <div key={t.type} className="flex items-center gap-3">
                <span className={`size-2.5 shrink-0 rounded-[3px] ${TYPE_DOT[t.type]}`} />
                <div className="flex-1">
                  <div className="text-[13.5px] font-semibold text-avisdoc-ink">{t.label}</div>
                  <div className="text-[11.5px] text-muted-foreground/80">
                    {t.acc} acceptés · {t.att} en attente
                  </div>
                </div>
                <div className="font-display text-[22px] font-bold text-avisdoc-ink">
                  {t.count}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  foot,
  footClass,
  valueClass,
  inverted,
}: {
  label: string;
  value: string;
  foot: string;
  footClass?: string;
  valueClass?: string;
  inverted?: boolean;
}) {
  if (inverted) {
    return (
      <div className="rounded-2xl bg-avisdoc-ink p-5">
        <SectionLabel className="text-white/60">{label}</SectionLabel>
        <div className="mt-2 font-display text-[34px] font-bold text-avisdoc-coral">{value}</div>
        <div className="mt-1 text-[12.5px] text-white/60">{foot}</div>
      </div>
    );
  }
  return (
    <Card className="p-5">
      <SectionLabel>{label}</SectionLabel>
      <div className={`mt-2 font-display text-[34px] font-bold ${valueClass ?? "text-avisdoc-ink"}`}>
        {value}
      </div>
      <div className={`mt-1 text-[12.5px] ${footClass ?? "text-muted-foreground"}`}>{foot}</div>
    </Card>
  );
}
