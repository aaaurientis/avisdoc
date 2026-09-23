// CAP — le coût d'acquisition par prospect.
//
// L'écran listait des DÉPENSES : une ligne par appel au modèle. On voyait passer l'argent
// sans jamais savoir ce qu'avait coûté une entreprise donnée. Il montre maintenant une ligne
// par entreprise, qu'on déplie pour voir le détail.
//
// Rien n'est estimé : chaque montant vient de la consommation réellement mesurée par la
// fonction (jetons lus, jetons écrits, recherches web), multipliée par les tarifs relevés.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, Loader2, Search, X } from "lucide-react";
import { supabaseAdmin } from "../data/supabaseAdmin";
import { Card, PageHeader, SectionLabel } from "../components/ui";
import { coutDe, euroDollar, MODELES_ACTUELS, MODELE_PAR_DEFAUT, NOM_MODELE, TARIFS_MODELE, TARIF_RECHERCHE_WEB, type Consommation } from "../lib/couts";
import { calculerCap, type DemandeBrute, type FicheBrute } from "../lib/cap";
import { useActualisation } from "../lib/actualisation";
import { cn } from "@/lib/utils";

interface Demande {
  id: string;
  kind: "recherche" | "approfondissement" | "email";
  request: string;
  requested_by: string;
  status: string;
  found_count: number | null;
  usage: Consommation | null;
  /** Le modèle qui a travaillé ; absent pour les demandes d'avant le 22/09/2026. */
  model: string | null;
  prospect_id: string | null;
  account_id: string | null;
  created_at: string;
  finished_at: string | null;
}

function messageErreur(brut: string): string {
  // Uniquement la table absente : une colonne manquante est un vrai défaut, qu'il faut voir.
  return /Could not find the table .* in the schema cache/i.test(brut)
    ? "Cet écran attend sa migration : le SQL n’a pas encore été exécuté sur la base."
    : brut;
}

const quand = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const duree = (d: Demande) => {
  if (!d.finished_at) return "—";
  const s = Math.round((new Date(d.finished_at).getTime() - new Date(d.created_at).getTime()) / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
};

type Colonne = "nom" | "depenses" | "cout";

/** Un en-tête qui trie. La flèche dit la colonne active et son sens. */
function EnTete({
  colonne,
  libelle,
  tri,
  onTrier,
  className,
}: {
  colonne: Colonne;
  libelle: string;
  tri: { colonne: Colonne; sens: "asc" | "desc" };
  onTrier: (c: Colonne) => void;
  className?: string;
}) {
  const active = tri.colonne === colonne;
  return (
    <button
      type="button"
      onClick={() => onTrier(colonne)}
      className={cn(
        "flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.05em] transition-colors",
        active ? "text-avisdoc-ink" : "text-muted-foreground hover:text-avisdoc-ink",
        className,
      )}
    >
      {libelle}
      {active ? (
        tri.sens === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />
      ) : (
        <ArrowUpDown className="size-3 opacity-40" />
      )}
    </button>
  );
}

function Chiffre({ titre, valeur, precision }: { titre: string; valeur: string; precision?: string }) {
  return (
    // Plus compact sur téléphone : à pleine taille, les quatre cartes mangeaient
    // l'écran et il ne restait rien pour la liste, qui est l'essentiel.
    <Card className="p-2.5 sm:p-4">
      <SectionLabel className="text-[10px] sm:text-[11px]">{titre}</SectionLabel>
      <div className="mt-0.5 font-display text-lg font-semibold text-avisdoc-ink sm:mt-1 sm:text-2xl">{valeur}</div>
      {precision && <div className="mt-0.5 hidden text-[11.5px] text-muted-foreground sm:block">{precision}</div>}
    </Card>
  );
}

/** Ce que Merx appelle, pourquoi, et donc ce que ça coûte. L'ordre suit celui du travail. */
const USAGES: { cle: string; titre: string; modele: string; pourquoi: string }[] = [
  {
    cle: "recherche",
    titre: "Chercher des entreprises",
    modele: MODELES_ACTUELS.recherche,
    pourquoi: "Ratisser un secteur et une zone, croiser les annuaires et la presse locale, rendre jusqu’à vingt fiches. Un travail large, où la rapidité compte autant que la finesse.",
  },
  {
    cle: "approfondissement",
    titre: "Approfondir une fiche",
    modele: MODELES_ACTUELS.approfondissement,
    pourquoi: "Le modèle le plus capable, sur une seule entreprise : l’identité légale, l’interlocuteur, et le dossier commercial — accroche, arguments, objections, offre. C’est là qu’on accepte de payer plus, parce que c’est là que se gagne le rendez-vous.",
  },
  {
    cle: "chat",
    titre: "Conseiller le commercial",
    modele: MODELES_ACTUELS.chat,
    pourquoi:
      "Quoi répondre à une objection, comment aborder ce client, par où l’autre va résister. Le modèle le plus capable, là aussi : c’est ce qu’on lui dit avant d’entrer chez un client. Sans recherche web, un échange coûte quelques centimes.",
  },
  {
    cle: "email",
    titre: "Rédiger un e-mail",
    modele: MODELES_ACTUELS.email,
    pourquoi: "Un premier contact court, appuyé sur les faits de la fiche. Rien n’est envoyé : le commercial relit et envoie lui-même.",
  },
];

export default function Couts() {
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [fiches, setFiches] = useState<FicheBrute[]>([]);
  /** Les entreprises dont on a ouvert le détail. */
  const [depliees, setDepliees] = useState<Set<string>>(new Set());
  const [recherche, setRecherche] = useState("");
  /** Le tri courant. Par défaut le plus cher en tête : c'est ce qu'on vient voir. */
  const [tri, setTri] = useState<{ colonne: Colonne; sens: "asc" | "desc" }>({ colonne: "cout", sens: "desc" });
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setErreur(null);
    const [{ data, error }, { data: lesFiches }] = await Promise.all([
      supabaseAdmin
        .from("admin_merx_demandes")
        .select("id, kind, request, requested_by, status, found_count, usage, model, prospect_id, account_id, created_at, finished_at")
        .order("created_at", { ascending: false })
        .limit(400),
      // Les fiches supprimées comptent aussi : ce qu'on a dépensé pour elles a bien été dépensé.
      supabaseAdmin.from("admin_prospects").select("id, name, found_by").limit(1000),
    ]);
    if (error) setErreur(messageErreur(error.message));
    else setDemandes((data ?? []) as Demande[]);
    setFiches((lesFiches ?? []) as FicheBrute[]);
    setChargement(false);
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  // Une recherche met deux minutes : l'écran regarde où elle en est plutôt que
  // d'attendre qu'on clique.
  useActualisation(charger, demandes.some((d) => d.status === "en_cours" || d.status === "en_attente"));

  const bilan = useMemo(() => {
    const debutDuMois = new Date();
    debutDuMois.setDate(1);
    debutDuMois.setHours(0, 0, 0, 0);

    let total = 0;
    let mois = 0;
    let recherches = 0;
    let coutRecherches = 0;
    let approfondissements = 0;
    let coutApprofondissements = 0;
    let fiches = 0;

    for (const d of demandes) {
      const c = coutDe(d.usage, d.model ?? undefined).total;
      total += c;
      if (new Date(d.created_at) >= debutDuMois) mois += c;
      if (d.kind === "recherche") {
        recherches++;
        coutRecherches += c;
        fiches += d.found_count ?? 0;
      } else {
        approfondissements++;
        coutApprofondissements += c;
      }
    }
    return {
      total,
      mois,
      recherches,
      approfondissements,
      fiches,
      moyenneRecherche: recherches ? coutRecherches / recherches : 0,
      moyenneApprofondissement: approfondissements ? coutApprofondissements / approfondissements : 0,
      parFiche: fiches ? coutRecherches / fiches : 0,
    };
  }, [demandes]);

  const cap = useMemo(() => calculerCap(demandes as unknown as DemandeBrute[], fiches), [demandes, fiches]);

  /**
   * Ce qu'on affiche : la liste filtrée par la recherche, puis triée.
   * Les chiffres du bandeau restent globaux — un filtre ne change pas ce qu'on a dépensé.
   */
  const listeAffichee = useMemo(() => {
    const nu = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const q = nu(recherche);
    const filtrees = q ? cap.acquisitions.filter((a) => nu(a.nom).includes(q)) : cap.acquisitions;
    const sens = tri.sens === "asc" ? 1 : -1;
    return [...filtrees].sort((a, b) => {
      if (tri.colonne === "nom") return sens * a.nom.localeCompare(b.nom, "fr");
      if (tri.colonne === "depenses") return sens * (a.lignes.length - b.lignes.length);
      return sens * (a.total - b.total);
    });
  }, [cap.acquisitions, recherche, tri]);

  /** Un clic sur une colonne : on la trie, un second clic inverse le sens. */
  const trierPar = (colonne: Colonne) =>
    setTri((prev) =>
      prev.colonne === colonne
        ? { colonne, sens: prev.sens === "asc" ? "desc" : "asc" }
        : // Un nom se lit de A à Z ; un montant, du plus gros au plus petit.
          { colonne, sens: colonne === "nom" ? "asc" : "desc" },
    );

  const deplier = (id: string) =>
    setDepliees((prev) => {
      const suivant = new Set(prev);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });

  const tarif = TARIFS_MODELE[MODELE_PAR_DEFAUT];

  return (
    <div>
      <PageHeader
        title="CAP"
        subtitle="Coût d’acquisition par prospect — ce que chaque entreprise a réellement coûté"
      />

      {erreur && <div className="mb-4 rounded-2xl bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700">{erreur}</div>}

      {chargement ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Chargement…
        </div>
      ) : (
        <>
          {/* Les chiffres restent sous les yeux : la liste passe dessous. */}
          <div className="sticky top-0 z-20 -mx-4 mb-4 border-b border-border bg-background/95 px-4 pb-2.5 pt-1 backdrop-blur sm:-mx-6 sm:px-6 sm:pb-3">
            <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
              <Chiffre titre="Ce mois-ci" valeur={euroDollar(bilan.mois)} precision="depuis le 1er du mois" />
              <Chiffre titre="Depuis le début" valeur={euroDollar(bilan.total)} precision={`${demandes.length} demande${demandes.length > 1 ? "s" : ""}`} />
              <Chiffre
                titre="Coût moyen d’un prospect"
                valeur={euroDollar(cap.acquisitions.length ? cap.totalImpute / cap.acquisitions.length : 0)}
                precision={cap.acquisitions.length ? `sur ${cap.acquisitions.length} entreprise${cap.acquisitions.length > 1 ? "s" : ""}` : "aucune entreprise"}
              />
              <Chiffre
                titre="Le plus cher"
                valeur={euroDollar(cap.acquisitions[0]?.total ?? 0)}
                precision={cap.acquisitions[0]?.nom ?? "—"}
              />
            </div>
          </div>

          {/* Les tarifs, en clair : deux modèles, deux usages, deux prix. */}
          <Card className="mb-4 p-4">
            <SectionLabel>Les tarifs appliqués</SectionLabel>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              Merx n’utilise pas le même modèle selon ce qu’on lui demande : chercher large et creuser une
              entreprise ne demandent pas le même effort, et ne coûtent donc pas le même prix.
            </p>

            <div className="mt-3 space-y-2">
              {USAGES.map((u) => {
                const t = TARIFS_MODELE[u.modele];
                return (
                  <div key={u.cle} className="rounded-xl border border-border px-3.5 py-2.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className="text-[13.5px] font-semibold text-avisdoc-ink">{u.titre}</span>
                      <span className="text-[12.5px] font-bold text-avisdoc-teal">{NOM_MODELE[u.modele] ?? u.modele}</span>
                    </div>
                    <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">{u.pourquoi}</p>
                    <p className="mt-1 text-[12px] text-muted-foreground">
                      <span className="font-semibold text-avisdoc-ink">{t.entree} $</span> par million de jetons lus,{" "}
                      <span className="font-semibold text-avisdoc-ink">{t.sortie} $</span> par million de jetons écrits.
                    </p>
                  </div>
                );
              })}
            </div>

            <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
              Recherche web : <span className="font-semibold text-avisdoc-ink">{(TARIF_RECHERCHE_WEB * 1000).toFixed(0)} $ pour 1 000 recherches</span>,
              en plus des jetons — une recherche en erreur n’est pas facturée.
              L’annuaire des entreprises de l’État, lui, est gratuit : il ne coûte rien, quel que soit le nombre d’appels.
            </p>
            <p className="mt-2 text-[11.5px] text-muted-foreground/80">
              Tarifs relevés le 22/09/2026 sur la documentation d’Anthropic. Les demandes faites avant le 22/09/2026,
              du temps où Merx n’utilisait que {NOM_MODELE[MODELE_PAR_DEFAUT]} ({tarif.entree} $ / {tarif.sortie} $), restent
              comptées à ce tarif-là. Les coûts sont recalculés à chaque affichage : si un tarif change, corrigez-le
              dans <code className="font-mono">src/admin/lib/couts.ts</code>.
            </p>
          </Card>

          {/* Le détail */}
          {cap.acquisitions.length === 0 && cap.horsAcquisition.length === 0 ? (
            <div className="rounded-2xl bg-muted/60 p-8 text-center">
              <SectionLabel>Aucune dépense</SectionLabel>
              <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                Dès que Merx cherchera, chaque entreprise apparaîtra ici avec ce qu’elle a coûté.
              </p>
            </div>
          ) : (
            <>
              {cap.acquisitions.length > 0 && (
                <>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <div className="relative min-w-[240px] flex-1">
                      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <input
                        value={recherche}
                        onChange={(e) => setRecherche(e.target.value)}
                        placeholder="Chercher une entreprise…"
                        className="ad-input w-full rounded-full border border-border bg-card py-2.5 pl-10 pr-10 text-[13px] outline-none transition-colors focus:border-avisdoc-teal"
                      />
                      {recherche && (
                        <button
                          type="button"
                          onClick={() => setRecherche("")}
                          aria-label="Effacer la recherche"
                          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:text-avisdoc-ink"
                        >
                          <X className="size-4" />
                        </button>
                      )}
                    </div>
                    {recherche && (
                      <span className="text-[12.5px] text-muted-foreground">
                        {listeAffichee.length} sur {cap.acquisitions.length}
                      </span>
                    )}
                  </div>

                  <div className="mb-4 overflow-hidden rounded-2xl border border-border bg-card">
                    {/* En-tête : chaque colonne se trie, un second clic inverse le sens. */}
                    <div className="flex items-center gap-3 border-b border-border bg-muted/50 px-4 py-2">
                      <span className="size-4 shrink-0" />
                      <EnTete colonne="nom" libelle="Entreprise" tri={tri} onTrier={trierPar} className="min-w-0 flex-1" />
                      <EnTete colonne="depenses" libelle="Dépenses" tri={tri} onTrier={trierPar} className="w-24 justify-end text-right" />
                      <EnTete colonne="cout" libelle="Coût" tri={tri} onTrier={trierPar} className="w-24 justify-end text-right" />
                    </div>

                    {listeAffichee.length === 0 ? (
                      <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">
                        Aucune entreprise ne porte ce nom.
                      </p>
                    ) : (
                      <div className="divide-y divide-border">
                  {listeAffichee.map((a) => {
                    const ouverte = depliees.has(a.prospectId);
                    return (
                      <div key={a.prospectId}>
                        <button
                          type="button"
                          onClick={() => deplier(a.prospectId)}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                        >
                          <ChevronRight
                            className={cn("size-4 shrink-0 text-muted-foreground transition-transform", ouverte && "rotate-90")}
                          />
                          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-avisdoc-ink">
                            {a.nom}
                          </span>
                          <span className="w-24 shrink-0 text-right text-[12.5px] text-muted-foreground">
                            {a.lignes.length}
                          </span>
                          <span className="w-24 shrink-0 text-right font-display text-[15px] font-semibold text-avisdoc-ink">
                            {euroDollar(a.total)}
                          </span>
                        </button>

                        {ouverte && (
                          <div className="border-t border-border bg-muted/20 px-4 py-2">
                            {a.lignes.map((l) => (
                              <div key={l.id} className="flex items-baseline gap-3 py-1.5 text-[12.5px]">
                                <span className="w-28 shrink-0 text-muted-foreground">{quand(l.quand)}</span>
                                <span className="min-w-0 flex-1">
                                  <span className="text-avisdoc-ink">{l.quoi}</span>
                                  {l.partage && (
                                    <span className="text-muted-foreground">
                                      {" "}· partagée entre {l.partage} fiche{l.partage > 1 ? "s" : ""}
                                    </span>
                                  )}
                                  {l.status === "echec" && <span className="text-avisdoc-coral"> · échec</span>}
                                </span>
                                <span className="shrink-0 font-semibold text-avisdoc-ink">{euroDollar(l.montant)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Ce qui n'a produit aucune fiche, ou qui ne relève pas de l'acquisition :
                  on le montre à part plutôt que de le noyer dans une moyenne. */}
              {cap.horsAcquisition.length > 0 && (
                <Card className="p-4">
                  <SectionLabel>Hors acquisition — {euroDollar(cap.totalHors)}</SectionLabel>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    Recherches qui n’ont rien rendu, e-mails à des clients déjà signés, débriefs : dépensé, mais
                    rattaché à aucune fiche de prospection.
                  </p>
                  <div className="mt-2 divide-y divide-border">
                    {cap.horsAcquisition.map((l) => (
                      <div key={l.id} className="flex items-baseline gap-3 py-1.5 text-[12.5px]">
                        <span className="w-28 shrink-0 text-muted-foreground">{quand(l.quand)}</span>
                        <span className="min-w-0 flex-1 truncate text-avisdoc-ink">
                          {l.quoi}
                          {l.status === "echec" && <span className="text-avisdoc-coral"> · échec</span>}
                        </span>
                        <span className="shrink-0 font-semibold text-avisdoc-ink">{euroDollar(l.montant)}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
