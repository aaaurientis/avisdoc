// Fiche d’un prospect trouvé par Merx : pourquoi c’est une cible, la note détaillée, les coordonnées,
// et les pages réellement consultées. « Approfondir » va chercher le registre officiel et le site.

import { useCallback, useMemo, useState } from "react";
import { ArrowRightCircle, Check, ExternalLink, Loader2, Mail, PenLine, Phone, Search, X } from "lucide-react";
import type { Client } from "../../types";
import { useAdminData } from "../../data/AdminDataContext";
import { Badge, Card, SectionLabel } from "../../components/ui";
import ChoixReferent from "../../components/ChoixReferent";
import { CATEGORIES, CRITERES, effectifLabel, tonNote, type Prospect } from "../../lib/merx";
import { clientDepuisProspect, contactDepuisProspect, dejaAuPipeline } from "../../lib/conversion";
import { euroDollar } from "../../lib/couts";
import NoteDetaillee from "./NoteDetaillee";
import FicheEntreprise from "../../components/FicheEntreprise";
import type { EtapeParcours } from "../../components/ParcoursFiche";
import Onglets, { type Onglet } from "../../components/Onglets";
import FilEchanges from "../../components/FilEchanges";
import DossierCommercial, { dossierRempli } from "../../components/DossierCommercial";
import type { Jalon } from "../../lib/echanges";
import { cn } from "@/lib/utils";

export interface Brouillon {
  id: string;
  objet: string;
  corps: string;
  ecritLe: string | null;
}

function Ligne({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2">
      <div className="w-40 shrink-0 text-[12.5px] text-muted-foreground">{label}</div>
      <div className="min-w-0 flex-1 text-[13px] text-avisdoc-ink">{children}</div>
    </div>
  );
}

/** Un montant en euros, lisible : « 4,7 Md € », « 167 M € », « 850 k € ». */
const euros = (n: number): string =>
  n >= 1e9 ? `${(n / 1e9).toFixed(1).replace(".", ",")} Md €`
  : n >= 1e6 ? `${Math.round(n / 1e6)} M €`
  : n >= 1e3 ? `${Math.round(n / 1e3)} k €`
  : `${n} €`;

export default function ProspectFiche({
  prospect,
  onClose,
  onApprofondir,
  onEcarter,
  onMettreAuPipeline,
  onRedigerEmail,
  couts,
  demandeOrigine,
  brouillons,
  onRouvrirBrouillon,
}: {
  prospect: Prospect;
  onClose: () => void;
  onApprofondir: (p: Prospect) => Promise<void>;
  onEcarter: (p: Prospect) => Promise<void>;
  /** Crée l'affaire dans le Pipeline et garde le lien sur la fiche. */
  onMettreAuPipeline: (p: Prospect, clientId: string) => Promise<void>;
  /** Demande à Merx un brouillon de premier contact. */
  onRedigerEmail: (p: Prospect) => Promise<void>;
  /** Ce que coûte chaque bouton, mesuré ou estimé tant qu'aucune demande n'a eu lieu. */
  couts: { approfondissement: { montant: number; mesure: boolean }; email: { montant: number; mesure: boolean } };
  /** La recherche qui a fait apparaître cette fiche. */
  demandeOrigine: string | null;
  /** Les brouillons d’e-mail déjà écrits pour cette fiche, du plus récent au plus ancien. */
  brouillons: Brouillon[];
  onRouvrirBrouillon: (b: Brouillon) => void;
}) {
  const { stages, clients, addClient, addProjectContact } = useAdminData();
  const [enCours, setEnCours] = useState<"approfondir" | "ecarter" | "pipeline" | "email" | null>(null);
  const [choixEtape, setChoixEtape] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [onglet, setOnglet] = useState("identite");
  const [nbEchanges, setNbEchanges] = useState<number | null>(null);
  const compter = useCallback((n: number) => setNbEchanges(n), []);

  /** Ce qui est vrai, ce qu’on va faire, ce qui s’est passé. */
  const onglets: Onglet[] = [
    { cle: "identite", label: "Identité" },
    { cle: "approche", label: "Approche", compte: brouillons.length },
    { cle: "suivi", label: "Historique", compte: nbEchanges },
  ];
  const p = prospect;
  const siege = p.head_office;
  /**
   * Toutes les adresses et tous les numéros, d'où qu'ils viennent, sans doublon.
   *
   * Ils étaient éparpillés : l'adresse principale dans un bouton sous la fiche, celles
   * du site officiel nulle part, celles des personnes trouvées dans leur ligne. Le
   * commercial les cherchait aux quatre coins de l'écran.
   */
  const adressesConnues = useMemo(
    () => [...new Set([p.contact_email, ...(p.site_contacts?.emails ?? []), ...(p.personnes ?? []).map((q) => q.email)].filter(Boolean) as string[])],
    [p.contact_email, p.site_contacts, p.personnes],
  );
  const numerosConnus = useMemo(
    () =>
      [...new Set(
        [p.contact_phone, ...(p.site_contacts?.phones ?? []), ...(p.personnes ?? []).flatMap((q) => [q.telephone, q.mobile])].filter(Boolean) as string[],
      )],
    [p.contact_phone, p.site_contacts, p.personnes],
  );

  /** Le dernier exercice publié : le chiffre d'affaires dit la taille mieux qu'une tranche. */
  const dernierExercice = useMemo(() => {
    const f = p.registre?.finances;
    if (!f) return null;
    const annee = Object.keys(f).sort().at(-1);
    const ca = annee ? f[annee]?.ca : undefined;
    return annee && typeof ca === "number" ? { annee, ca, resultat: f[annee]?.resultat_net ?? null } : null;
  }, [p.registre]);
  const effectif = effectifLabel(p.headcount_band);

  /** Le prospect devient une affaire : on reprend ce que Merx a trouvé, sans rien réinventer. */
  const versLePipeline = async (etape: string) => {
    if (enCours) return;
    setEnCours("pipeline");
    setChoixEtape(false);
    try {
      const existante = dejaAuPipeline(p, clients);
      if (existante) throw new Error(`${existante.company} est déjà dans le Pipeline, à l’étape « ${existante.stage} ».`);
      const client = clientDepuisProspect(p, etape);
      const id = client.id;
      // On attend que l'affaire existe vraiment : le prospect va pointer dessus.
      if (!(await addClient(client))) throw new Error("L’affaire n’a pas pu être créée dans le Pipeline.");
      const contact = contactDepuisProspect(p);
      if (contact) addProjectContact(id, contact);
      await onMettreAuPipeline(p, id);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Le passage au Pipeline a échoué.");
    } finally {
      setEnCours(null);
    }
  };

  const lancer = async (quoi: "approfondir" | "ecarter" | "email") => {
    if (enCours) return;
    setEnCours(quoi);
    setErreur(null);
    try {
      if (quoi === "approfondir") await onApprofondir(p);
      else if (quoi === "ecarter") await onEcarter(p);
      else await onRedigerEmail(p);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Merx n’a pas répondu.");
    } finally {
      setEnCours(null);
    }
  };

  /**
   * Le parcours d’un prospect s’arrête au Pipeline : dès qu’on l’a contacté, l’affaire
   * se suit là-bas. « Contactée » n’est donc pas une étape d’avant le Pipeline.
   */
  const parcours = useMemo<EtapeParcours[]>(
    () => [
      { label: "Trouvée", au: p.created_at, tone: "slate" },
      { label: "Approfondie", au: p.enriched_at, tone: "teal" },
      { label: "Au Pipeline", au: p.converted_at, tone: "emerald" },
    ],
    [p.created_at, p.enriched_at, p.converted_at],
  );

  /** Les jalons ne sont pas stockés : ce sont les dates que la fiche porte déjà. */
  const jalons = useMemo<Jalon[]>(
    () =>
      ([
        { libelle: "Trouvée par Merx", detail: demandeOrigine ? `« ${demandeOrigine} »` : undefined, au: p.created_at },
        p.enriched_at ? { libelle: "Fiche approfondie", au: p.enriched_at } : null,
        p.converted_at ? { libelle: "Passée au Pipeline", au: p.converted_at } : null,
      ] as (Jalon | null)[]).filter((j): j is Jalon => j !== null),
    [demandeOrigine, p.created_at, p.enriched_at, p.converted_at],
  );

  // Ce qui a été constaté : les critères qui ont rapporté des points, avec leur justification.
  const constats = CATEGORIES.flatMap((cat) =>
    cat.criteres
      .map((id) => ({ label: CRITERES[id].label, justification: p.score?.[id]?.justification ?? "", points: p.score?.[id]?.points ?? null }))
      .filter((c) => c.points !== null && c.justification),
  );


  return (
    <FicheEntreprise
      titre={p.name}
      sousTitre={[p.activity, p.city].filter(Boolean).join(" · ") || "—"}
      badge={<Badge className={tonNote(p.score_total)}>{p.score_total ?? "—"} / 100</Badge>}
      referent={<ChoixReferent quoi="prospect" id={p.id} />}
      identite={
        <>
          {p.siren && (
            <div className="text-[12.5px] text-muted-foreground">
              SIREN {p.siren}
              {p.legal_name ? ` · ${p.legal_name}` : ""} —{" "}
              <span className="font-bold text-avisdoc-teal">annuaire des entreprises ✓</span>
            </div>
          )}
          {siege && (siege.address || siege.city) && (
            <div className="mt-0.5 text-[12.5px] text-muted-foreground">
              {[siege.address, siege.city].filter(Boolean).join(", ")}
            </div>
          )}
        </>
      }
      actions={
        <>
              {p.converted_client_id ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-4 py-2.5 text-sm font-bold text-emerald-700">
                  <Check className="size-4" /> Dans le Pipeline
                </span>
              ) : choixEtape ? (
                <div className="flex w-full flex-wrap items-center gap-2 rounded-2xl border border-border p-2.5">
                  <span className="text-[12.5px] font-semibold text-avisdoc-ink">À quelle étape ?</span>
                  {stages.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => void versLePipeline(s.label)}
                      className="rounded-full border border-border bg-card px-3.5 py-1.5 text-[12.5px] font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal"
                    >
                      {s.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setChoixEtape(false)}
                    className="text-[12.5px] font-semibold text-muted-foreground hover:text-avisdoc-ink"
                  >
                    Annuler
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setChoixEtape(true)}
                  disabled={enCours !== null}
                  className={cn(
                    "ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60",
                  )}
                >
                  {enCours === "pipeline" ? <Loader2 className="size-4 animate-spin" /> : <ArrowRightCircle className="size-4" />}
                  Mettre dans le Pipeline
                </button>
              )}
              <button
                type="button"
                onClick={() => void lancer("approfondir")}
                disabled={enCours !== null}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal disabled:opacity-60"
              >
                {enCours === "approfondir" ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                {p.enriched_at ? "Approfondir à nouveau" : "Approfondir"}
              </button>
              <button
                type="button"
                onClick={() => void lancer("email")}
                disabled={enCours !== null}
                title="Merx rédige un brouillon à partir de cette fiche. Rien n'est envoyé."
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal disabled:opacity-60"
              >
                {enCours === "email" ? <Loader2 className="size-4 animate-spin" /> : <PenLine className="size-4" />}
                Écrire un e-mail personnalisé
              </button>
              <button
                type="button"
                onClick={() => void lancer("ecarter")}
                disabled={enCours !== null}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-5 py-2.5 text-sm font-bold text-muted-foreground hover:border-rose-300 hover:text-rose-700 disabled:opacity-60"
              >
                {enCours === "ecarter" ? <Loader2 className="size-4 animate-spin" /> : null}
                {p.status === "ecarte" ? "Restaurer" : "Supprimer"}
              </button>
        </>
      }
      message={
        erreur ? (
          <p className="mt-2 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-rose-700">{erreur}</p>
        ) : (
          <p className="mt-2 text-[12px] text-muted-foreground">
            {couts.approfondissement.mesure ? "Coût mesuré" : "Coût estimé"} — approfondir :{" "}
            {euroDollar(couts.approfondissement.montant)} · écrire un e-mail : {euroDollar(couts.email.montant)}.
          </p>
        )
      }
      parcours={parcours}
      onglets={onglets}
      actif={onglet}
      onOnglet={setOnglet}
      onClose={onClose}
    >
      <div>
          {onglet === "identite" && (
            <>
            {/* Ce qu'on sait d'elle. Tout ce qui est connu s'affiche, approfondie ou
                non : la recherche ramène désormais le dirigeant, l'effectif, l'adresse
                et le chiffre d'affaires, et il n'y a aucune raison de les cacher
                derrière un bouton. Ce qui manque est dit à la fin, sans masquer le reste. */}
            <div className="mb-5 rounded-2xl border border-border">
              <div className="border-b border-border px-4 py-2.5">
                <SectionLabel>Ce qu’on sait d’elle</SectionLabel>
              </div>
              <div className="divide-y divide-border px-4 py-1">
                {p.legal_name && <Ligne label="Raison sociale">{p.legal_name}</Ligne>}
                {p.siren && <Ligne label="SIREN">{p.siren}</Ligne>}
                {p.registre?.siret && <Ligne label="SIRET du siège">{p.registre.siret}</Ligne>}
                {effectif && (
                  <Ligne label="Effectif">
                    {effectif}
                    {p.headcount_year ? <span className="text-muted-foreground"> (donnée {p.headcount_year})</span> : null}
                  </Ligne>
                )}
                {p.open_establishments !== null && <Ligne label="Établissements ouverts">{p.open_establishments}</Ligne>}
                {siege && (siege.address || siege.city) && (
                  <Ligne label="Siège">{[siege.address, siege.city].filter(Boolean).join(", ")}</Ligne>
                )}
                {p.contact_name && (
                  <Ligne label="Interlocuteur">
                    {p.contact_name}
                    {p.contact_role ? <span className="text-muted-foreground"> — {p.contact_role}</span> : null}
                  </Ligne>
                )}
                {p.leaders && p.leaders.length > 0 && (
                  <Ligne label="Dirigeants">
                    {p.leaders.map((l) => (l.role ? `${l.name} (${l.role})` : l.name)).join(", ")}
                  </Ligne>
                )}
                {dernierExercice && (
                  <Ligne label={`Chiffre d’affaires ${dernierExercice.annee}`}>
                    {euros(dernierExercice.ca)}
                    {dernierExercice.resultat !== null ? (
                      <span className="text-muted-foreground"> · résultat net {euros(dernierExercice.resultat)}</span>
                    ) : null}
                  </Ligne>
                )}
                {p.registre?.categorie && (
                  <Ligne label="Catégorie">
                    {({ GE: "Grande entreprise", ETI: "Entreprise de taille intermédiaire", PME: "PME" } as Record<string, string>)[
                      p.registre.categorie
                    ] ?? p.registre.categorie}
                  </Ligne>
                )}
                {p.registre?.dateCreation && (
                  <Ligne label="Créée le">
                    {new Date(p.registre.dateCreation).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}
                  </Ligne>
                )}
                {p.registre?.tva && <Ligne label="Numéro de TVA">{p.registre.tva}</Ligne>}
                {p.approach && <Ligne label="Angle d’approche">{p.approach}</Ligne>}
                {demandeOrigine && <Ligne label="Demande">« {demandeOrigine} »</Ligne>}
                {/* Toutes les adresses et tous les numéros connus, d'où qu'ils
                    viennent : la fiche, le site officiel, les personnes trouvées. Le
                    commercial ne doit pas avoir à les chercher ailleurs dans l'écran. */}
                {adressesConnues.length > 0 && (
                  <Ligne label={adressesConnues.length > 1 ? "Adresses e-mail" : "E-mail"}>
                    {adressesConnues.map((a) => (
                      <a key={a} href={`mailto:${a}`} className="block text-avisdoc-teal underline-offset-2 hover:underline">
                        {a}
                      </a>
                    ))}
                  </Ligne>
                )}
                {numerosConnus.length > 0 && (
                  <Ligne label={numerosConnus.length > 1 ? "Téléphones" : "Téléphone"}>
                    {numerosConnus.map((n) => (
                      <a key={n} href={`tel:${n.replace(/\s/g, "")}`} className="block text-avisdoc-teal underline-offset-2 hover:underline">
                        {n}
                      </a>
                    ))}
                  </Ligne>
                )}
                {p.website && (
                  <Ligne label="Site">
                    <a href={p.website} target="_blank" rel="noreferrer" className="text-avisdoc-teal underline-offset-2 hover:underline">
                      {p.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                    </a>
                  </Ligne>
                )}
                {/* Toutes les personnes connues, chacune avec ce qu'on a d'elle. Une
                    personne dont la source ne fait pas foi reste une piste : on la
                    garde, on dit d'où elle vient, et le commercial décide. */}
                {p.personnes?.length
                  ? p.personnes.map((q) => (
                      <Ligne key={`${q.nom}-${q.fonction ?? ""}`} label={q.fonction || "Personne"}>
                        <span className="block">
                          <span className="font-semibold text-avisdoc-ink">{q.nom}</span>
                          {!q.sur && <span className="ml-2 text-[11.5px] text-amber-700">à confirmer</span>}
                        </span>
                        {(q.email || q.telephone || q.mobile) && (
                          <span className="block text-[12.5px]">
                            {[q.email, q.telephone, q.mobile && `mobile ${q.mobile}`].filter(Boolean).join(" · ")}
                          </span>
                        )}
                        {q.source && (
                          <a
                            href={q.source}
                            target="_blank"
                            rel="noreferrer"
                            className="block text-[11.5px] text-avisdoc-teal underline-offset-2 hover:underline"
                          >
                            {(() => {
                              try {
                                return new URL(q.source).hostname.replace(/^www\./, "");
                              } catch {
                                return q.source;
                              }
                            })()}
                          </a>
                        )}
                      </Ligne>
                    ))
                  : null}
                {p.reliability !== null && p.reliability_detail?.length ? (
                  <Ligne label={`Fiabilité ${p.reliability}/10`}>
                    <span className="block space-y-0.5">
                      {p.reliability_detail.map((d) => (
                        <span key={d.quoi} className="flex items-baseline justify-between gap-3">
                          <span className={d.sur === 0 ? "text-muted-foreground" : ""}>{d.quoi}</span>
                          <span
                            className={
                              d.sur === 2 ? "text-right text-emerald-700" : d.sur === 1 ? "text-right text-amber-700" : "text-right text-muted-foreground"
                            }
                          >
                            {d.dit}
                          </span>
                        </span>
                      ))}
                    </span>
                  </Ligne>
                ) : null}
                {!p.enriched_at && (
                  <div className="py-3 text-[13px] text-muted-foreground">
                    Ce qui manque encore — l’interlocuteur du service concerné, son e-mail, la politique santé-sécurité —
                    se trouve sur le site de l’entreprise. « Approfondir » va l’y chercher.
                  </div>
                )}
              </div>
            </div>
            {/* Coordonnées */}
            {(p.contact_email || p.contact_phone || p.website) && (
              <div className="mb-5 flex flex-wrap gap-2">
                {p.contact_email && (
                  <a
                    href={`mailto:${p.contact_email}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[13px] font-semibold text-avisdoc-ink hover:border-avisdoc-teal"
                  >
                    <Mail className="size-4" /> {p.contact_email}
                  </a>
                )}
                {p.contact_phone && (
                  <a
                    href={`tel:${p.contact_phone.replace(/\s/g, "")}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[13px] font-semibold text-avisdoc-ink hover:border-avisdoc-teal"
                  >
                    <Phone className="size-4" /> {p.contact_phone}
                  </a>
                )}
                {p.website && (
                  <a
                    href={p.website}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[13px] font-semibold text-avisdoc-ink hover:border-avisdoc-teal"
                  >
                    <ExternalLink className="size-4" /> Site officiel
                  </a>
                )}
              </div>
            )}
            {/* Pages consultées */}
            {p.sources?.length > 0 && (
              <div className="mb-6">
                <SectionLabel>Pages consultées</SectionLabel>
                <ul className="mt-1.5 space-y-1">
                  {p.sources.slice(0, 8).map((s) => (
                    <li key={s}>
                      <a href={s} target="_blank" rel="noreferrer" className="text-[12.5px] text-avisdoc-teal underline-offset-2 hover:underline">
                        {(() => {
                          try {
                            return new URL(s).hostname.replace(/^www\./, "");
                          } catch {
                            return s;
                          }
                        })()}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            </>
          )}

          {onglet === "approche" && (
            <>
            {/* Le dossier de Merx d’abord : c’est avec lui qu’on décroche le téléphone. */}
            {dossierRempli(p.dossier) && <DossierCommercial dossier={p.dossier} />}
            {/* Pourquoi c’est une cible : la phrase, les faits constatés, puis l’angle d’approche. */}
            {(p.rationale || constats.length > 0 || p.approach) && (
              <div className="mb-5 rounded-2xl border border-l-4 border-border border-l-avisdoc-teal p-4">
                <SectionLabel>Pourquoi c’est un bon prospect</SectionLabel>
                {p.rationale && <p className="mt-1.5 text-[13.5px] leading-relaxed text-avisdoc-ink">{p.rationale}</p>}
                {constats.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {constats.map((c) => (
                      <li key={c.label} className="flex gap-2 text-[13px] leading-snug text-avisdoc-ink">
                        <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-avisdoc-teal" />
                        <span>
                          <span className="font-semibold">{c.label}</span> : {c.justification}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {p.approach && (
                  <p className="mt-3 text-[13.5px] leading-relaxed text-avisdoc-ink">
                    <span className="font-semibold">Angle d’approche : </span>
                    {p.approach}
                  </p>
                )}
              </div>
            )}
            {/* La note, telle qu’elle a été gagnée */}
            <div className="mb-5">
              <SectionLabel>La note, critère par critère</SectionLabel>
              <div className="mt-2">
                <NoteDetaillee total={p.score_total} score={p.score ?? {}} />
              </div>
            </div>
              {brouillons.length > 0 && (
                <div className="mt-5">
                  <SectionLabel>Brouillons d’e-mail</SectionLabel>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    Écrits par Merx. Rien n’a été envoyé : l’envoi se fait depuis votre messagerie.
                  </p>
                  <div className="mt-2 space-y-2">
                    {brouillons.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => onRouvrirBrouillon(b)}
                        className="block w-full rounded-xl border border-border px-3.5 py-2.5 text-left transition-colors hover:border-avisdoc-teal"
                      >
                        <span className="block text-[13px] font-semibold text-avisdoc-ink">{b.objet}</span>
                        <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
                          {b.ecritLe ? `écrit le ${new Date(b.ecritLe).toLocaleDateString("fr-FR")}` : "brouillon"} · non envoyé
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {onglet === "suivi" && (
            <FilEchanges
              cles={{ prospectId: p.converted_client_id ? null : p.id, clientId: p.converted_client_id }}
              jalons={jalons}
              onCompte={compter}
            />
          )}
      </div>
    </FicheEntreprise>
  );
}
