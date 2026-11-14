import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Loader2, UserSearch } from "lucide-react";
import type { ContactType } from "../types";
import { useAuth } from "../auth/AuthContext";
import { useAdminData } from "../data/AdminDataContext";
import { useExpertises } from "../data/journeesStore";
import { delais, enJournee, parMois, type Expertise } from "../lib/expertises";
import { todayISO } from "../lib/format";
import { TYPE_DOT, typesDe } from "../lib/ui-tokens";
import { Card, PageHeader, SectionLabel } from "../components/ui";
import EncartJournees from "./journees/EncartTableauDeBord";
import {
  DEPARTEMENTS,
  ETAT_DEPARTEMENT_BADGE,
  ETAT_DEPARTEMENT_LABEL,
  POPULATION_LIBELLE,
  POPULATION_PLURIEL,
  POPULATIONS,
} from "../reseau/libelles";
import { reseauRepo, type StatistiquesReseau } from "../reseau/reseauRepo";
import { cn } from "@/lib/utils";

const TYPE_LABELS: { type: ContactType; label: string }[] = [
  { type: "Requis", label: "Requis" },
  { type: "Réseau d'Aval", label: "Réseau d'Aval" },
];

/** Objectif d'AvisDoc : un avis sous 96 heures. */
const OBJECTIF_H = 96;

const moisDe = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const libelleMois = (m: string, format: "long" | "short" = "long") => {
  const [a, mo] = m.split("-").map(Number);
  const s = new Date(a, mo - 1, 1).toLocaleDateString("fr-FR", { month: format, ...(format === "long" ? { year: "numeric" } : {}) });
  return s.charAt(0).toUpperCase() + s.slice(1).replace(".", "");
};
const heures = (h: number | null) => (h === null ? "—" : h < 48 ? `${Math.round(h)} h` : `${Math.round(h)} h (${(h / 24).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} j)`);
const pourcent = (n: number, total: number) => (total ? `${Math.round((100 * n) / total)} %` : "—");

export default function Dashboard() {
  // Le tableau de bord est visible par tous ; ses widgets suivent les modules
  // autorisés (journée → avis, sante → réseau, commercial → relances).
  const { peut } = useAuth();
  const { contacts, clients, activity } = useAdminData();
  const today = todayISO();

  const typeStats = useMemo(
    () =>
      TYPE_LABELS.map(({ type, label }) => {
        const list = contacts.filter((c) => typesDe(c).includes(type));
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

  const contactBreakdown = typeStats.map((t) => `${t.count} ${t.label.toLowerCase()}`).join(" · ");

  const relances = useMemo(() => {
    const open = clients.flatMap((c) => c.suivis.filter((s) => !s.done && s.deadline));
    const overdue = open.filter((s) => (s.deadline as string) < today);
    return { total: open.length, overdue: overdue.length };
  }, [clients, today]);

  const moisCourant = libelleMois(moisDe(new Date()));

  return (
    <div>
      <PageHeader title="Tableau de bord" subtitle={`Vue d'ensemble de l'activité — ${moisCourant}`} />

      <div className="ad-kpi-grid mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {peut("journee") ? <KpisAvis /> : (
          <>
            <Kpi label="Avis ce mois" value="—" foot="Réservé au droit « Statistiques »" />
            <Kpi label="Délai médian d'avis" value="—" foot={`Objectif : ${OBJECTIF_H} h`} />
          </>
        )}
        {peut("sante") && <Kpi label="Contacts actifs" value={String(contacts.length)} foot={contactBreakdown} />}
        {peut("commercial") && (
          <Kpi label="Relances à traiter" value={String(relances.total)} inverted foot={`${relances.overdue} en retard`} />
        )}
      </div>

      {/* Journées de dépistage du jour et de la semaine : seulement pour qui a le droit « Journée ». */}
      {peut("journee") && <EncartJournees />}
      {peut("journee") && <AvisParMois />}
      {peut("sante") && <BlocReseauAval />}

      <div className={peut("sante") ? "grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_340px]" : "grid grid-cols-1 items-start gap-5"}>
        <Card className="p-[22px]">
          <h2 className="mb-4 font-display text-lg font-semibold text-avisdoc-ink">Activité récente</h2>
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

        {peut("sante") && (
          <Card className="p-[22px]">
            <h2 className="mb-4 font-display text-lg font-semibold text-avisdoc-ink">Répartition du réseau</h2>
            <div className="flex flex-col gap-4">
              {typeStats.map((t) => (
                <div key={t.type} className="flex items-center gap-3">
                  <span className={`size-2.5 shrink-0 rounded-[3px] ${TYPE_DOT[t.type]}`} />
                  <div className="flex-1">
                    <div className="text-[13.5px] font-semibold text-avisdoc-ink">{t.label}</div>
                    <div className="text-[11.5px] text-muted-foreground/80">{t.acc} acceptés · {t.att} en attente</div>
                  </div>
                  <div className="font-display text-[22px] font-bold text-avisdoc-ink">{t.count}</div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ── Avis : extraction des expertises (Statistiques) ─────────────────────────

/** Volume du mois et délai médian sur 30 jours, tirés de l'extraction des expertises. */
function KpisAvis() {
  const { statut, expertises, source } = useExpertises();
  const s = useMemo(() => {
    const maintenant = new Date();
    const ce = moisDe(maintenant);
    const avant = moisDe(new Date(maintenant.getFullYear(), maintenant.getMonth() - 1, 1));
    const duMois = expertises.filter((e) => e.envoi.startsWith(ce));
    const moisPrecedent = expertises.filter((e) => e.envoi.startsWith(avant)).length;
    // Le mois en cours n'est pas fini : on le compare au mois précédent À LA MÊME DATE.
    const jour = String(maintenant.getDate()).padStart(2, "0");
    const aDate = expertises.filter((e) => e.envoi.startsWith(avant) && e.envoi.slice(8, 10) <= jour).length;
    const depuis = new Date(maintenant.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
    const recents = expertises.filter((e) => e.envoi.slice(0, 10) >= depuis);
    return { duMois, moisPrecedent, aDate, enJournee: duMois.filter(enJournee).length, d: delais(recents) };
  }, [expertises]);

  if (statut !== "pret" && !source) {
    return (
      <>
        <Kpi label="Avis ce mois" value="…" foot="Lecture de l'extraction…" />
        <Kpi label="Délai médian d'avis" value="…" foot={`Objectif : ${OBJECTIF_H} h`} />
      </>
    );
  }
  if (!source) {
    return (
      <>
        <Kpi label="Avis ce mois" value="—" foot="Extraction des expertises indisponible" />
        <Kpi label="Délai médian d'avis" value="—" foot={`Objectif : ${OBJECTIF_H} h`} />
      </>
    );
  }
  const ecart = s.duMois.length - s.aDate;
  const tenu = s.d.mediane !== null && s.d.mediane <= OBJECTIF_H;
  return (
    <>
      <Kpi
        label="Avis ce mois"
        value={String(s.duMois.length)}
        foot={`${ecart >= 0 ? "+" : ""}${ecart} par rapport à la même date le mois dernier (${s.moisPrecedent} sur le mois) · ${s.enJournee} en journée`}
      />
      <Kpi
        label="Délai médian d'avis"
        value={s.d.mediane === null ? "—" : `${Math.round(s.d.mediane)} h`}
        valueClass={s.d.mediane === null ? undefined : tenu ? "text-emerald-700" : "text-avisdoc-coral"}
        foot={s.d.mesures
          ? `30 derniers jours · objectif ${OBJECTIF_H} h · ${pourcent(s.d.sous48h, s.d.mesures)} sous 48 h · ${s.d.mesures} mesurés`
          : `Aucun délai mesuré sur 30 jours · objectif ${OBJECTIF_H} h`}
      />
    </>
  );
}

/** Histogramme des avis par mois, sur les 6 derniers mois (une série : pas de légende, le titre la nomme). */
function AvisParMois() {
  const { expertises, source } = useExpertises();
  const [survol, setSurvol] = useState<string | null>(null);
  const donnees = useMemo(() => {
    const parM = new Map(parMois(expertises).map((m) => [m.mois, m]));
    const auj = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const m = moisDe(new Date(auj.getFullYear(), auj.getMonth() - 5 + i, 1));
      return parM.get(m) ?? { mois: m, total: 0, enJournee: 0 };
    });
  }, [expertises]);
  const delaisParMois = useMemo(() => {
    const out = new Map<string, number | null>();
    for (const d of donnees) out.set(d.mois, delais(expertises.filter((e: Expertise) => e.envoi.startsWith(d.mois))).mediane);
    return out;
  }, [donnees, expertises]);
  if (!source) return null;
  const max = Math.max(1, ...donnees.map((d) => d.total));
  const total = donnees.reduce((t, d) => t + d.total, 0);

  return (
    <Card className="mb-6 p-[22px]">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-avisdoc-ink">Avis par mois</h2>
        <span className="text-[12.5px] text-muted-foreground">{total} sur 6 mois · <Link to="/journees/expertises" className="font-semibold text-avisdoc-teal hover:underline">Voir les expertises</Link></span>
      </div>
      <div className="relative">
        {/* Ligne de base et barres fines, ancrées en bas, coins arrondis en haut seulement */}
        <div className="flex h-36 items-end gap-3 border-b border-border/70 px-1" role="img" aria-label="Nombre d'avis par mois sur les six derniers mois">
          {donnees.map((d, i) => {
            const dernier = i === donnees.length - 1;
            return (
              <div key={d.mois} className="relative flex h-full flex-1 items-end justify-center"
                onMouseEnter={() => setSurvol(d.mois)} onMouseLeave={() => setSurvol(null)}>
                {(dernier || survol === d.mois) && (
                  <span className={cn("absolute z-10 mb-1 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold",
                    survol === d.mois ? "bg-avisdoc-ink text-white shadow-soft" : "text-avisdoc-ink")}
                    style={{ bottom: `${(100 * d.total) / max}%` }}>
                    {survol === d.mois ? `${libelleMois(d.mois)} : ${d.total} avis · ${d.enJournee} en journée · délai médian ${heures(delaisParMois.get(d.mois) ?? null)}` : `${d.total}`}
                  </span>
                )}
                <div className={cn("w-full max-w-10 rounded-t-[4px] transition-colors", survol && survol !== d.mois ? "bg-avisdoc-teal/45" : "bg-avisdoc-teal")}
                  style={{ height: `${Math.max(d.total ? 2 : 0, (100 * d.total) / max)}%` }} />
              </div>
            );
          })}
        </div>
        <div className="mt-1.5 flex gap-3 px-1">
          {donnees.map((d) => <div key={d.mois} className="flex-1 text-center text-[11px] text-muted-foreground">{libelleMois(d.mois, "short")}</div>)}
        </div>
      </div>
      {/* Les mêmes chiffres en tableau, pour les lecteurs d'écran */}
      <table className="sr-only">
        <caption>Avis par mois</caption>
        <thead><tr><th>Mois</th><th>Avis</th><th>En journée</th><th>Délai médian (h)</th></tr></thead>
        <tbody>{donnees.map((d) => <tr key={d.mois}><td>{libelleMois(d.mois)}</td><td>{d.total}</td><td>{d.enJournee}</td><td>{delaisParMois.get(d.mois) != null ? Math.round(delaisParMois.get(d.mois)!) : "—"}</td></tr>)}</tbody>
      </table>
    </Card>
  );
}

// ── Réseau d'aval : candidats, couverture, ce qui attend une action ─────────

function BlocReseauAval() {
  const [s, setS] = useState<StatistiquesReseau | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  useEffect(() => {
    reseauRepo.statistiques().then(setS).catch((e) => setErreur(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <Card className="mb-6 p-[22px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-avisdoc-ink">
          <UserSearch className="size-5 text-avisdoc-teal" strokeWidth={2.2} /> Réseau d'aval en construction
        </h2>
        <Link to="/reseau-aval" className="inline-flex items-center gap-1 text-[13px] font-semibold text-avisdoc-teal hover:underline">
          Trouver des médecins <ArrowRight className="size-3.5" />
        </Link>
      </div>

      {erreur && <p className="text-sm text-muted-foreground">Chiffres du réseau d'aval indisponibles : {erreur}</p>}
      {!s && !erreur && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Chargement…</p>}
      {s && s.candidats === 0 && s.departements.length === 0 && (
        <p className="text-sm text-muted-foreground">Aucun département ouvert. Ajoutez-en un dans « Trouver des médecins » pour commencer.</p>
      )}

      {s && (s.candidats > 0 || s.departements.length > 0) && (() => {
        const google = (s.google.confirmee ?? 0) + (s.google.trouvee_auto ?? 0);
        const doctolib = (s.doctolib.confirme ?? 0) + (s.doctolib.trouve_auto ?? 0);
        const aConfirmer = (s.google.a_confirmer ?? 0) + (s.google.trouvee_auto ?? 0) + (s.doctolib.a_confirmer ?? 0) + (s.doctolib.trouve_auto ?? 0);
        const enDiscussion = (s.parEtat.contacte ?? 0) + (s.parEtat.en_discussion ?? 0);
        return (
          <>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <MiniKpi label="Médecins candidats" value={s.candidats}
                foot={POPULATIONS.filter((p) => s.parPopulation[p]).map((p) => {
                  const n = s.parPopulation[p] ?? 0;
                  return `${n} ${n > 1 ? POPULATION_PLURIEL[p] : p === "ORL" ? "ORL" : POPULATION_LIBELLE[p].toLowerCase()}`;
                }).join(" · ") || "—"} />
              <MiniKpi label="Accords" value={s.parEtat.accord ?? 0} foot={`${enDiscussion} en contact · ${s.parEtat.refus ?? 0} refus${(s.parEtat.accord ?? 0) === 0 ? " · contact au lot 3" : ""}`} />
              <MiniKpi label="Fiches Google" value={pourcent(google, s.candidats)} foot={`${google} sur ${s.candidats} · ${s.google.a_chercher ?? 0} à chercher`} />
              <MiniKpi label="Liens Doctolib" value={pourcent(doctolib, s.candidats)} foot={`${doctolib} sur ${s.candidats} · ${s.doctolib.a_chercher ?? 0} à chercher`} />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-[12.5px]">
              <SectionLabel className="mr-1">À traiter</SectionLabel>
              <ATraiter n={s.propositionsAValider} texte="propositions de l'IA à valider" />
              <ATraiter n={aConfirmer} texte="fiches Google ou Doctolib à vérifier" />
              {s.recherchesEnCours > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 font-semibold text-sky-800">
                  <Loader2 className="size-3 animate-spin" /> {s.recherchesEnCours} recherche{s.recherchesEnCours > 1 ? "s" : ""} en cours
                </span>
              )}
              {s.propositionsAValider === 0 && aConfirmer === 0 && s.recherchesEnCours === 0 && <span className="text-muted-foreground">Rien en attente.</span>}
            </div>

            {s.departements.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2 text-[12.5px]">
                <SectionLabel className="mr-1">Départements</SectionLabel>
                {[...s.departements].sort((a, b) => a.code.localeCompare(b.code)).map((d) => (
                  <Link key={d.code} to={`/reseau-aval/${d.code}`}
                    className={cn("rounded-full px-3 py-1 font-semibold hover:opacity-80", ETAT_DEPARTEMENT_BADGE[d.etat])}>
                    {d.code} · {DEPARTEMENTS[d.code]} · {ETAT_DEPARTEMENT_LABEL[d.etat].toLowerCase()}
                  </Link>
                ))}
              </div>
            )}
          </>
        );
      })()}
    </Card>
  );
}

function ATraiter({ n, texte }: { n: number; texte: string }) {
  if (!n) return null;
  return (
    <Link to="/reseau-aval" className="rounded-full bg-violet-50 px-3 py-1 font-semibold text-violet-800 hover:bg-violet-100">
      {n} {texte}
    </Link>
  );
}

function MiniKpi({ label, value, foot }: { label: string; value: number | string; foot: string }) {
  return (
    <div className="rounded-xl bg-muted/50 px-4 py-3">
      <SectionLabel>{label}</SectionLabel>
      <div className="mt-1 font-display text-[26px] font-bold text-avisdoc-ink">{value}</div>
      <div className="mt-0.5 text-[12px] text-muted-foreground">{foot}</div>
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
      <div className={`mt-2 font-display text-[34px] font-bold ${valueClass ?? "text-avisdoc-ink"}`}>{value}</div>
      <div className={`mt-1 text-[12.5px] ${footClass ?? "text-muted-foreground"}`}>{foot}</div>
    </Card>
  );
}
