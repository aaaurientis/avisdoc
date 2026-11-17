// Éléments partagés par les pages Journée (Statistiques, Calendrier) et l'encart du tableau de bord.
import { type ReactNode } from "react";
import { Check, ChevronRight, Download, Loader2, RefreshCw } from "lucide-react";
import { Card, PageHeader } from "../../components/ui";
import { chargerJournees, choisirExtraction, useJournees, useRegles } from "../../data/journeesStore";
import { useAuth } from "../../auth/AuthContext";
import { dateDuFichier, telechargerExtraction } from "../../data/journeesRepo";
import { etatDe, manques, type JourneeDepistage } from "../../lib/journees";
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
}: {
  j: JourneeDepistage;
  ouverte: boolean;
  basculer: () => void;
  avecDate?: boolean;
}) {
  const { reglesDe, typologieDe } = useRegles();
  const regles = reglesDe(j);
  const etat = etatDe(j, undefined, regles);
  const typologie = typologieDe(j.client);
  const { avis } = useAvisDeLaJournee(j);
  return (
    <div className="border-b border-border last:border-b-0">
      <button type="button" onClick={basculer} className="flex w-full items-center gap-3 px-5 py-3 text-left text-[13px] transition-colors hover:bg-accent">
        <ChevronRight className={cn("size-4 shrink-0 text-muted-foreground transition-transform", ouverte && "rotate-90")} />
        {avecDate && <span className="w-24 shrink-0 font-semibold text-avisdoc-ink">{jour(j.date)}</span>}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-avisdoc-ink">
            {j.client}
            {(j.groupeTaille ?? 1) > 1 && (
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
