// Éléments partagés par les pages Journée (Statistiques, Calendrier) et l'encart du tableau de bord.
import { useState, type ReactNode } from "react";
import { Check, ChevronRight, Download, Loader2, RefreshCw } from "lucide-react";
import { Card, PageHeader } from "../../components/ui";
import { chargerJournees, choisirExtraction, useExpertisesStats, useJournees, useRegles } from "../../data/journeesStore";
import { useAuth } from "../../auth/AuthContext";
import { dateDuFichier, telechargerExtraction } from "../../data/journeesRepo";
import { aujourdhuiISO, blocsJournees, datesRegroupement, estPassee, etatDe, manques, type JourneeDepistage } from "../../lib/journees";
import { cleJournee } from "../../lib/expertises";
import { exigences } from "../../lib/typologies";
import ExpertisesJournee, { useAvisDeLaJournee } from "./ExpertisesJournee";
import { cn } from "@/lib/utils";
import NomPro, { nomPro } from "../../components/NomPro";
import { affichageStats } from "../../lib/masquage";

/** Dans une liste déroulante, le flou n'est pas possible : on masque le nom. */
const nomAffichable = (n: string) => (affichageStats().noms === "flou" ? "••••••" : nomPro(n));

export const jour = (iso: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) =>
  iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("fr-FR", opts) : "—";
export const nombre = (n: number) => n.toLocaleString("fr-FR");
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
export const capitale = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const boutonCls =
  "inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-[13px] font-semibold text-avisdoc-ink transition-colors hover:border-avisdoc-ink disabled:opacity-60";
export const selectCls = "min-w-0 max-w-[260px] rounded-full border border-border bg-card px-3 py-1.5 text-[13px] text-avisdoc-ink";

export function Choix({ valeur, changer, options, tous, noms = false }: { valeur: string; changer: (v: string) => void; options: string[]; tous: string; noms?: boolean }) {
  return (
    <select value={valeur} onChange={(e) => changer(e.target.value)} className={selectCls} aria-label={tous}>
      <option value="">{tous}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {noms ? nomAffichable(o) : o}
        </option>
      ))}
    </select>
  );
}

/**
 * En-tête commun : titre, extraction en cours, boutons Importer / Actualiser, et les messages
 * (S3 pas branché, erreur, colonnes absentes). `children` = le contenu, affiché une fois l'extraction lue.
 */
export function CadreJournees({ titre, children }: { titre: string; children: ReactNode }) {
  const { statut, source, extraction, s3, s3Info, erreur } = useJournees();
  const { user } = useAuth();
  const chargement = statut !== "pret";

  return (
    <div>
      <PageHeader
        title={titre}
        subtitle={
          source
            ? `Journées de dépistage — extraction du ${jour(source.date)} (${source.origine} · ${source.nom})`
            : "Journées de dépistage"
        }
        action={
          <div className="flex flex-wrap gap-2">
            {source && (
              <button
                type="button"
                onClick={() => telechargerExtraction(source, user?.email ?? "")}
                className={boutonCls}
                title={`Télécharger ${source.nom}`}
              >
                <Download className="size-4" /> Télécharger le CSV
              </button>
            )}
            {s3 && (
              <button type="button" onClick={() => void chargerJournees()} disabled={chargement} className={boutonCls}>
                {chargement ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Actualiser
              </button>
            )}
            {s3 && s3.fichiers.length > 1 && source && (
              <select
                value={s3.fichiers.find((f) => f.key.endsWith(source.nom))?.key ?? ""}
                onChange={(e) => {
                  const f = s3.fichiers.find((x) => x.key === e.target.value);
                  if (f) void choisirExtraction(f);
                }}
                className={selectCls}
                aria-label="Extraction"
              >
                {s3.fichiers.map((f) => (
                  <option key={f.key} value={f.key}>
                    Extraction du {jour(dateDuFichier(f))}
                  </option>
                ))}
              </select>
            )}
          </div>
        }
      />

      {/* S3 injoignable, pas configuré ou vide : on dit pourquoi. */}
      {s3Info && !source && (
        <Card className="mb-6 p-5 text-sm">
          <div className="font-semibold text-avisdoc-ink">
            {s3Info.nonConfigure ? "Le bucket S3 n'est pas encore branché." : "Les extractions S3 n'ont pas pu être lues."}
          </div>
          <div className="mt-1 text-muted-foreground">{s3Info.message}</div>
          {s3Info.nonConfigure && (
            <div className="mt-3 text-muted-foreground">
              À renseigner dans Supabase → Edge Functions → Secrets : AWS_ACCESS_KEY_ID et AWS_SECRET_ACCESS_KEY.
            </div>
          )}
        </Card>
      )}

      {erreur && <Card className="mb-6 border-avisdoc-coral/40 p-5 text-sm text-avisdoc-ink">{erreur}</Card>}

      {chargement && !source && (
        <Card className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Lecture de l'extraction…
        </Card>
      )}

      {extraction && extraction.colonnesManquantes.length > 0 && (
        <Card className="mb-6 p-4 text-[13px] text-muted-foreground">
          Colonnes absentes de ce fichier (l'export a-t-il changé ?) : {extraction.colonnesManquantes.join(", ")}.
        </Card>
      )}

      {source && children}
    </div>
  );
}

/** Passée, confirmée, ou ce qui reste à confirmer. Toujours un texte : la couleur n'est pas seule à parler. */
export function PastilleEtat({ j, court = false }: { j: JourneeDepistage; court?: boolean }) {
  const { reglesDe } = useRegles();
  const regles = reglesDe(j);
  const etat = etatDe(j, undefined, regles);
  if (etat === "passee") return <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-[11.5px] font-semibold text-muted-foreground">Passée</span>;
  if (etat === "prete")
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-avisdoc-teal-soft px-2.5 py-0.5 text-[11.5px] font-semibold text-avisdoc-ink">
        <Check className="size-3.5" /> Confirmée
      </span>
    );
  return (
    <span className="shrink-0 rounded-full bg-avisdoc-coral-soft px-2.5 py-0.5 text-[11.5px] font-semibold text-avisdoc-ink">
      {court ? "À confirmer" : `À confirmer : ${manques(j, regles).join(", ")}`}
    </span>
  );
}

/** Une journée dans une liste ; un clic déplie son détail. */
export function LigneJournee({
  j,
  ouverte,
  basculer,
  avecDate = true,
  dansGroupe = false,
}: {
  j: JourneeDepistage;
  ouverte: boolean;
  basculer: () => void;
  avecDate?: boolean;
  /** Affichée sous la ligne de sa journée regroupée : en retrait, sans le rappel du regroupement. */
  dansGroupe?: boolean;
}) {
  const { reglesDe, typologieDe } = useRegles();
  const regles = reglesDe(j);
  const etat = etatDe(j, undefined, regles);
  const typologie = typologieDe(j.client);
  const { avis } = useAvisDeLaJournee(j);
  return (
    <div className="border-b border-border last:border-b-0">
      <button type="button" onClick={basculer}
        className={cn("flex w-full items-center gap-3 py-3 pr-5 text-left text-[13px] transition-colors hover:bg-accent", dansGroupe ? "border-l-2 border-avisdoc-ink/25 bg-background/60 pl-11" : "pl-5")}>
        <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", ouverte && "rotate-90")} />
        {avecDate && <span className="w-24 shrink-0 font-semibold text-avisdoc-ink">{jour(j.date)}</span>}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-avisdoc-ink">
            {j.client}
            {!dansGroupe && (j.groupeTaille ?? 1) > 1 && (
              <span className="ml-1.5 inline-flex items-center rounded-full bg-avisdoc-ink/10 px-1.5 text-[11px] font-semibold text-avisdoc-ink"
                title="Même client, même ville, jours consécutifs : comptés comme une seule journée">
                jour {j.groupeRang}/{j.groupeTaille} · une seule journée
              </span>
            )}
            {j.numero !== null && (
              <span className="ml-1.5 font-normal text-muted-foreground">
                · journée {j.numero}
                {j.commandees ? `/${j.commandees}` : ""}
              </span>
            )}
          </span>
          <span className="block truncate text-[12px] text-muted-foreground">
            {j.lieu || "lieu non renseigné"} · {j.requis || "requis non renseigné"}
          </span>
        </span>
        {avis.length > 0 && (
          <span className="hidden shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-[11.5px] font-semibold text-avisdoc-ink md:inline">
            {avis.length} avis
          </span>
        )}
        <span className="hidden sm:inline">
          <PastilleEtat j={j} />
        </span>
      </button>
      {ouverte && (
        <div className="grid grid-cols-1 gap-x-8 gap-y-2 border-t border-border bg-background px-5 py-4 text-[12.5px] sm:grid-cols-2 lg:grid-cols-3">
          <Info label="État" valeur={etat === "a-confirmer" ? `À confirmer : ${manques(j, regles).join(", ")}` : etat === "prete" ? "Confirmée" : "Passée"} />
          <Info
            label="Typologie du client"
            valeur={`${typologie?.nom ?? "Règle par défaut"} — exige : ${exigences(regles).join(", ") || "rien"}`}
          />
          <Info label="Devis" valeur={j.devis} />
          <Info label="Requérant" valeur={j.requerant} nom />
          <Info label="Requis" valeur={j.requis} nom />
          <Info label="Contact" valeur={[j.contactNom, j.contactTel, j.contactEmail].filter(Boolean).join(" · ")} />
          <Info label="Salle" valeur={j.salle} />
          <Info label="Accès" valeur={j.acces} />
          <Info label="Confirmations" valeur={`client ${oui(j.confClient)} · consentements ${oui(j.confConsentements)} · requérant ${oui(j.confRequerant)}`} />
          <Info label="Dermatoscope — envoi" valeur={j.envoiDermatoscope ? `n° ${j.envoiDermatoscope} · ${jour(j.dateEnvoiDermatoscope)}` : ""} />
          <Info label="Dermatoscope — retour" valeur={j.retourDermatoscope ? `n° ${j.retourDermatoscope} · ${jour(j.dateRetourDermatoscope)}` : ""} />
          <Info label="Date de facture" valeur={j.dateFacture ? jour(j.dateFacture) : ""} />
          <Info label="Autres informations" valeur={j.autres} />
          <div className="col-span-full mt-2 border-t border-border pt-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">Expertises de la journée</div>
            <ExpertisesJournee j={j} />
          </div>
        </div>
      )}
    </div>
  );
}

const oui = (v: boolean) => (v ? "oui" : "non");

/** Une liste de journées, les journées regroupées (même client, même ville) sous une ligne principale. */
export function ListeJourneesGroupees({ liste, avecDate = true }: { liste: JourneeDepistage[]; avecDate?: boolean }) {
  const [ouverte, setOuverte] = useState<number | null>(null);
  const [groupesOuverts, setGroupesOuverts] = useState<Set<string>>(new Set());
  const ligne = (j: JourneeDepistage, dansGroupe = false) => (
    <LigneJournee key={j.id} j={j} avecDate={avecDate} dansGroupe={dansGroupe} ouverte={ouverte === j.id} basculer={() => setOuverte((o) => (o === j.id ? null : j.id))} />
  );
  return (
    <div>
      {blocsJournees(liste).map((b) =>
        b.journees.length === 1 ? (
          ligne(b.journees[0])
        ) : (
          <LigneGroupe
            key={b.groupe}
            journees={b.journees}
            avecDate={avecDate}
            ouvert={groupesOuverts.has(b.groupe)}
            basculer={() =>
              setGroupesOuverts((s) => {
                const n = new Set(s);
                if (n.has(b.groupe)) n.delete(b.groupe);
                else n.add(b.groupe);
                return n;
              })
            }
          >
            {b.journees.map((j) => ligne(j, true))}
          </LigneGroupe>
        ),
      )}
    </div>
  );
}

/** La journée principale (fictive) d'un regroupement : ce qui est commun, et le total des avis. */
function LigneGroupe({
  journees,
  avecDate,
  ouvert,
  basculer,
  children,
}: {
  journees: JourneeDepistage[];
  avecDate: boolean;
  ouvert: boolean;
  basculer: () => void;
  children: ReactNode;
}) {
  const { index } = useExpertisesStats();
  const premiere = journees[0];
  const ids = new Set<string>();
  for (const j of journees) for (const e of index.get(cleJournee(j)) ?? []) ids.add(e.id);
  const dates = journees.map((j) => j.date);
  const nbJours = new Set(dates).size;
  const requis = [...new Set(journees.map((j) => j.requis).filter(Boolean))];
  const lieux = [...new Set(journees.map((j) => j.lieu).filter(Boolean))];
  const numeros = [...new Set(journees.map((j) => j.numero).filter((n): n is number => n !== null))].sort((a, b) => a - b);
  const auj = aujourdhuiISO();
  const aVenir = journees.find((j) => !estPassee(j, auj));
  return (
    <div className="border-b border-border last:border-b-0">
      <button type="button" onClick={basculer} className="flex w-full items-center gap-3 px-5 py-3 text-left text-[13px] transition-colors hover:bg-accent">
        <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", ouvert && "rotate-90")} />
        {avecDate && <span className="w-24 shrink-0 font-semibold text-avisdoc-ink">{datesRegroupement(dates)}</span>}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-avisdoc-ink">
            {premiere.client}
            <span className="ml-1.5 inline-flex items-center rounded-full bg-avisdoc-ink px-2 text-[11px] font-semibold text-white"
              title="Même client, même ville, même jour : une seule journée">
              1 journée · {journees.length} créneaux{nbJours > 1 ? ` sur ${nbJours} jours` : ""}
            </span>
            {numeros.length > 0 && (
              <span className="ml-1.5 font-normal text-muted-foreground">
                · {numeros.length > 1 ? "journées" : "journée"} {numeros.join(", ")}
                {premiere.commandees ? `/${premiere.commandees}` : ""}
              </span>
            )}
          </span>
          <span className="block truncate text-[12px] text-muted-foreground">
            {lieux.length > 1 ? `${lieux[0]} (+${lieux.length - 1} lieu${lieux.length > 2 ? "x" : ""})` : lieux[0] || "lieu non renseigné"} ·{" "}
            {requis.length
              ? requis.map((r, i) => (
                  <span key={r}>
                    {i > 0 && ", "}
                    <NomPro nom={r} vide="" />
                  </span>
                ))
              : "requis non renseigné"}
          </span>
        </span>
        {ids.size > 0 && (
          <span className="hidden shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-[11.5px] font-semibold text-avisdoc-ink md:inline">{ids.size} avis</span>
        )}
        <span className="hidden sm:inline">
          <PastilleEtat j={aVenir ?? journees[journees.length - 1]} court />
        </span>
      </button>
      {ouvert && <div className="border-t border-border">{children}</div>}
    </div>
  );
}

function Info({ label, valeur, nom = false }: { label: string; valeur: string; nom?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">{label}</div>
      <div className="break-words text-avisdoc-ink">{nom ? <NomPro nom={valeur} /> : valeur || "—"}</div>
    </div>
  );
}

/**
 * Axe des mois sous un graphique en barres : une étiquette par barre, centrée dessous.
 * Au-delà de 18 mois, les étiquettes passent en biais pour tenir sans se chevaucher.
 * `actif` : le mois survolé, mis en avant.
 */
export function AxeMois({ etiquettes, actif = null }: { etiquettes: string[]; actif?: number | null }) {
  const biais = etiquettes.length > 18;
  return (
    <div className={cn("mt-1.5 flex gap-[2px] text-[10.5px] text-muted-foreground", biais ? "h-10" : "h-4")}>
      {etiquettes.map((e, i) => (
        <div key={i} className="relative min-w-0 flex-1">
          <span
            className={cn(
              "absolute top-0 whitespace-nowrap",
              biais ? "right-1/2 origin-top-right -rotate-45" : "left-1/2 -translate-x-1/2",
              actif === i && "font-semibold text-avisdoc-ink",
            )}
          >
            {e}
          </span>
        </div>
      ))}
    </div>
  );
}
