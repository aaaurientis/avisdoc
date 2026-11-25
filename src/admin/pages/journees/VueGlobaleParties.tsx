// Vue globale — les parties « Expertises » et « Journées et expertises », sous la partie « Journées ».
// Mêmes filtres que la page : période, client, requis.
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Loader2 } from "lucide-react";
import { Card, SectionLabel } from "../../components/ui";
import { useExpertisesStats } from "../../data/journeesStore";
import { cleJournee, enJournee, issueDe, MASQUE, MOTIF_MASQUE, resultatsVisibles, resumer, type Expertise } from "../../lib/expertises";
import { aujourdhuiISO, blocsJournees, datesRegroupement, estPassee, type JourneeDepistage, type Periode } from "../../lib/journees";
import NomPro from "../../components/NomPro";
import { pourResultats } from "../../lib/masquage";

const nombre = (n: number) => n.toLocaleString("fr-FR");
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const jour = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

/** Taux de consultation : avis qui orientent vers un dermatologue, sur les avis dont la recommandation est renseignée. */
function tauxConsultation(tous: Expertise[]): number | null {
  const liste = pourResultats(tous); // requis masqués (Admin) retirés des résultats
  if (!resultatsVisibles(liste.length)) return null; // règle de l'AIPD
  let o = 0;
  let r = 0;
  for (const e of liste) {
    const i = issueDe(e);
    if (!i) continue;
    r++;
    if (i !== "non-indispensable") o++;
  }
  return r ? pct(o, r) : null;
}

/** La période des journées, appliquée aux avis par leur date d'envoi. « À venir » et « Tout » : toute l'extraction. */
function avisDeLaPeriode(liste: Expertise[], periode: Periode): Expertise[] {
  const jours = periode === "30j" ? 30 : periode === "90j" ? 90 : periode === "12m" ? 365 : 0;
  if (!jours) return liste;
  const d = new Date();
  d.setDate(d.getDate() - jours);
  const borne = aujourdhuiISO(d);
  return liste.filter((e) => e.envoi.slice(0, 10) >= borne);
}

export function Titre({ numero, titre, action }: { numero: string; titre: string; action?: React.ReactNode }) {
  return (
    <div className={`mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-border pb-2 ${numero === "01" ? "mt-2" : "mt-10"}`}>
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-avisdoc-coral">{numero}</div>
        <h2 className="font-display text-xl font-semibold text-avisdoc-ink">{titre}</h2>
      </div>
      {action}
    </div>
  );
}

function Kpi({ label, valeur, pied }: { label: string; valeur: string; pied: string }) {
  return (
    <Card className="p-5">
      <SectionLabel>{label}</SectionLabel>
      <div className="mt-2 font-display text-[30px] font-bold text-avisdoc-ink">{valeur}</div>
      <div className="mt-1 truncate text-[12.5px] text-muted-foreground">{pied}</div>
    </Card>
  );
}

const Chargement = () => (
  <Card className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
    <Loader2 className="size-4 animate-spin" /> Lecture des expertises…
  </Card>
);

/**
 * Les avis concernés par les filtres. Avec un client choisi, seuls les avis de ses journées comptent
 * (une téléexpertise hors journée n'a pas de client dans l'export).
 */
function useAvisFiltres(periode: Periode, client: string, requis: string, journees: JourneeDepistage[]) {
  const { expertises, index } = useExpertisesStats();
  return useMemo(() => {
    const base = client ? journees.flatMap((j) => index.get(cleJournee(j)) ?? []) : avisDeLaPeriode(expertises, periode);
    return requis ? base.filter((e) => e.requis === requis) : base;
  }, [expertises, index, periode, client, requis, journees]);
}

// ── 2. Expertises ────────────────────────────────────────────────────────────
export function PartieExpertises({ periode, client, requis, journees }: { periode: Periode; client: string; requis: string; journees: JourneeDepistage[] }) {
  const { statut, source, info } = useExpertisesStats();
  const avis = useAvisFiltres(periode, client, requis, journees);
  const r = useMemo(() => resumer(avis), [avis]);
  const avisResultats = pourResultats(avis);
  const exereses = avisResultats.filter((e) => issueDe(e) === "exerese").length;
  const nbResultats = avisResultats.length;
  const urgentes = avisResultats.filter((e) => e.urgent).length;
  const taux = tauxConsultation(avis);

  return (
    <>
      <Titre
        numero="02"
        titre="Expertises"
        action={
          <Link to="/journees/expertises" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-avisdoc-teal hover:underline">
            Détail des expertises <ArrowRight className="size-4" />
          </Link>
        }
      />
      {statut !== "pret" && !source ? (
        <Chargement />
      ) : !source ? (
        <Card className="p-5 text-sm text-muted-foreground">Les expertises n'ont pas pu être lues : {info}</Card>
      ) : (
        <>
          <p className="mb-4 text-[12.5px] text-muted-foreground">
            {client
              ? `Avis rendus lors des journées de ${client} sur la période.`
              : periode === "avenir" || periode === "tout"
                ? "Tous les avis de l'extraction, en journée et hors journée."
                : "Avis envoyés sur la période, en journée et hors journée."}
          </p>
          <div className="hub-kpi-grid grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi label="Avis rendus" valeur={nombre(r.total)} pied={`${nombre(r.requerants)} requérants · ${r.requis.length} requis`} />
            <Kpi
              label="Délai médian de réponse"
              valeur={r.delais.mediane === null ? "—" : `${Math.round(r.delais.mediane)} h`}
              pied={r.delais.mesures ? `${pct(r.delais.sous24h, r.delais.mesures)} % sous 24 h · ${nombre(r.delais.mesures)} mesurés` : "non mesuré"}
            />
            <Kpi label="Taux de consultation" valeur={taux === null ? MASQUE : `${taux} %`} pied={taux === null ? MOTIF_MASQUE : "avis orientant vers un dermatologue"} />
            {resultatsVisibles(nbResultats) ? (
              <Kpi label="Exérèses indispensables" valeur={nombre(exereses)} pied={`${pct(exereses, nbResultats)} % des avis · ${urgentes} urgent${urgentes > 1 ? "s" : ""}`} />
            ) : (
              <Kpi label="Exérèses indispensables" valeur={MASQUE} pied={MOTIF_MASQUE} />
            )}
          </div>
        </>
      )}
    </>
  );
}

// ── 3. Journées et expertises ────────────────────────────────────────────────
export function PartieLien({ periode, client, requis, journees }: { periode: Periode; client: string; requis: string; journees: JourneeDepistage[] }) {
  const { statut, source, index } = useExpertisesStats();
  const avisPeriode = useAvisFiltres(periode, client, requis, journees);
  const auj = aujourdhuiISO();
  const passees = journees.filter((j) => estPassee(j, auj));
  // Une journée regroupée (même client, même ville) compte pour une : ses avis sont réunis, chacun une fois.
  const parJournee = blocsJournees(passees).map((b) => {
    const ids = new Set(b.journees.flatMap((j) => (index.get(cleJournee(j)) ?? []).filter((e) => !requis || e.requis === requis).map((e) => e.id)));
    return { j: b.journees[0], bloc: b.journees, n: ids.size };
  });
  const avecAvis = parJournee.filter((x) => x.n > 0);
  const sansAvis = parJournee.filter((x) => x.n === 0).sort((a, b) => b.j.date.localeCompare(a.j.date));
  const avisEnJournee = avecAvis.reduce((s, x) => s + x.n, 0);
  const max = avecAvis.reduce((m, x) => Math.max(m, x.n), 0);
  const enJ = avisPeriode.filter(enJournee);
  const horsJ = avisPeriode.filter((e) => !enJournee(e));
  const tauxEn = tauxConsultation(enJ);
  const tauxHors = tauxConsultation(horsJ);

  return (
    <>
      <Titre numero="03" titre="Journées et expertises" />
      {statut !== "pret" && !source ? (
        <Chargement />
      ) : !source ? null : (
        <>
          <p className="mb-4 text-[12.5px] text-muted-foreground">
            Une expertise est rattachée à sa journée par la date, le lieu et le numéro de journée. Calcul sur les {nombre(parJournee.length)} journées passées de la période (même client, même ville : une seule journée).
          </p>
          <div className="hub-kpi-grid mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Kpi
              label="Avis rendus en journée"
              valeur={nombre(avisEnJournee)}
              pied={client ? `sur ${nombre(avecAvis.length)} journées` : `${pct(enJ.length, avisPeriode.length)} % de l'activité de la période`}
            />
            <Kpi label="Moyenne par journée" valeur={avecAvis.length ? nombre(Math.round(avisEnJournee / avecAvis.length)) : "—"} pied={max ? `jusqu'à ${max} avis sur une journée` : "—"} />
            <Kpi label="Journées passées sans avis" valeur={nombre(sansAvis.length)} pied={`sur ${nombre(parJournee.length)} journées passées`} />
            <Kpi
              label="Consultation : en journée / hors"
              valeur={`${tauxEn === null ? MASQUE : `${tauxEn} %`} / ${client || tauxHors === null ? MASQUE : `${tauxHors} %`}`}
              pied={tauxEn === null || (!client && tauxHors === null) ? MOTIF_MASQUE : client ? "hors journée : sans client dans l'export" : "taux de consultation comparés"}
            />
          </div>
          {sansAvis.length > 0 && (
            <Card className="overflow-hidden">
              <div className="border-b border-border px-5 py-3.5">
                <SectionLabel>Journées passées sans avis rattaché</SectionLabel>
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                  À vérifier : la journée a-t-elle eu lieu, ou ses avis ont-ils été saisis avec une autre date, un autre lieu ou un autre numéro ?
                </p>
              </div>
              <div className="max-h-72 overflow-auto">
                <table className="w-full text-left text-[13px]">
                  <tbody>
                    {sansAvis.flatMap(({ j, bloc }) => [
                      <tr key={cleJournee(j)} className="border-t border-border first:border-t-0">
                        <td className="w-32 px-5 py-2 font-semibold text-avisdoc-ink">{bloc.length > 1 ? datesRegroupement(bloc.map((x) => x.date)) : jour(j.date)}</td>
                        <td className="px-3 py-2 text-avisdoc-ink">
                          {j.client}
                          {bloc.length > 1 ? (
                            <span className="ml-1.5 rounded-full bg-avisdoc-ink px-2 text-[11px] font-semibold text-white">1 journée · {bloc.length} créneaux</span>
                          ) : (
                            j.numero !== null && <span className="text-muted-foreground"> · journée {j.numero}{j.commandees ? `/${j.commandees}` : ""}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{j.lieu}</td>
                        <td className="px-5 py-2 text-muted-foreground">{bloc.length > 1 ? "" : <NomPro nom={j.requis} vide="requis non renseigné" />}</td>
                      </tr>,
                      ...(bloc.length > 1
                        ? bloc.map((x) => (
                            <tr key={`${cleJournee(x)}#${x.id}`} className="border-t border-border/60 text-[12.5px]">
                              <td className="w-32 py-1.5 pl-9 pr-5 text-muted-foreground">└ {jour(x.date)}</td>
                              <td className="px-3 py-1.5 text-muted-foreground">{x.numero !== null ? `journée ${x.numero}${x.commandees ? `/${x.commandees}` : ""}` : ""}</td>
                              <td className="px-3 py-1.5 text-muted-foreground">{x.lieu}</td>
                              <td className="px-5 py-1.5 text-muted-foreground"><NomPro nom={x.requis} vide="requis non renseigné" /></td>
                            </tr>
                          ))
                        : []),
                    ])}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </>
  );
}
