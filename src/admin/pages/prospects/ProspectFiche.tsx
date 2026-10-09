// Fiche d’un prospect trouvé par Merx : pourquoi c’est une cible, la note détaillée, les coordonnées,
// et les pages réellement consultées. « Approfondir » va chercher le registre officiel et le site.

import { useCallback, useMemo, useState } from "react";
import { ArrowRightCircle, Check, Loader2, PenLine, Search } from "lucide-react";
import type { Client } from "../../types";
import ChoixPipeline from "./ChoixPipeline";
import { useAdminData } from "../../data/AdminDataContext";
import { SectionLabel } from "../../components/ui";
import ChoixReferent from "../../components/ChoixReferent";
import type { Prospect } from "../../lib/merx";
import { clientDepuisProspect, contactDepuisProspect, dejaAuPipeline } from "../../lib/conversion";
import { euroDollar } from "../../lib/couts";
import FicheEntreprise from "../../components/FicheEntreprise";
import ResumeNotes from "../../components/ResumeNotes";
import CeQuOnSait from "../../components/fiche/CeQuOnSait";
import Interlocuteurs from "../../components/fiche/Interlocuteurs";
import ApprocheEntreprise from "../../components/fiche/ApprocheEntreprise";
import ActionsFiche from "../../components/ActionsFiche";
import { etapesDeVie, notesDe, personnesDuProspect } from "../../lib/fiche";
import type { Onglet } from "../../components/Onglets";
import FilEchanges from "../../components/FilEchanges";
import type { Jalon } from "../../lib/echanges";
import { cn } from "@/lib/utils";

export interface Brouillon {
  id: string;
  objet: string;
  corps: string;
  ecritLe: string | null;
}

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
  onModifier,
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
  /** Ouvre la fenêtre de modification, la même que depuis la liste. */
  onModifier?: (p: Prospect) => void;
}) {
  const { stages, pipelines, clients, addClient, addProjectContact } = useAdminData();
  const [enCours, setEnCours] = useState<"approfondir" | "ecarter" | "pipeline" | "email" | null>(null);
  const [choixEtape, setChoixEtape] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [onglet, setOnglet] = useState("identite");
  const [nbEchanges, setNbEchanges] = useState<number | null>(null);
  /** Change après une action notée : l'historique se relit. */
  const [relire, setRelire] = useState(0);
  const compter = useCallback((n: number) => setNbEchanges(n), []);

  /** Ce qui est vrai, ce qu’on va faire, ce qui s’est passé. */
  const onglets: Onglet[] = [
    { cle: "identite", label: "Identité" },
    { cle: "approche", label: "Approche", compte: brouillons.length },
    { cle: "action", label: "Action" },
    { cle: "suivi", label: "Historique", compte: nbEchanges },
  ];
  const p = prospect;
  const siege = p.head_office;
  /** Le prospect devient une affaire : on reprend ce que Merx a trouvé, sans rien réinventer. */
  const versLePipeline = async (etape: string, pipelineId: string) => {
    if (enCours) return;
    setEnCours("pipeline");
    setChoixEtape(false);
    try {
      const existante = dejaAuPipeline(p, clients);
      if (existante) throw new Error(`${existante.company} est déjà dans le Pipeline, à l’étape « ${existante.stage} ».`);
      const client = clientDepuisProspect(p, etape, pipelineId);
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

  /** L'avancement de l'entreprise ; une fois au Pipeline, la colonne de son affaire. */
  const affaire = p.converted_client_id ? clients.find((c) => c.id === p.converted_client_id) : undefined;
  const avancement = etapesDeVie({
    trouveeLe: p.created_at,
    approfondieLe: p.enriched_at,
    pipeline: p.converted_client_id ? { colonne: affaire?.stage ?? "—", au: p.converted_at } : null,
    client: null,
  });
  const cles = useMemo(() => ({ prospectId: p.id, clientId: p.converted_client_id }), [p.id, p.converted_client_id]);

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


  return (
    <FicheEntreprise
      titre={p.name}
      sousTitre={[p.activity, [p.city, p.department ? `(${p.department})` : ""].filter(Boolean).join(" ")].filter(Boolean).join(" · ") || "—"}
      notes={notesDe(p)}
      enHaut={
        onModifier ? (
          <button
            type="button"
            onClick={() => onModifier(p)}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[12.5px] font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal"
          >
            <PenLine className="size-3.5" /> Modifier
          </button>
        ) : undefined
      }
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
                <ChoixPipeline
                  pipelines={pipelines}
                  stages={stages}
                  onValider={(etape, pid) => void versLePipeline(etape, pid)}
                  onAnnuler={() => setChoixEtape(false)}
                />
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
      avancement={avancement}
      onglets={onglets}
      actif={onglet}
      onOnglet={setOnglet}
      onClose={onClose}
    >
      <div>
          {onglet === "identite" && (
            <>
            <ResumeNotes cles={cles} />
            <CeQuOnSait prospect={p} demandeOrigine={demandeOrigine} />
            <Interlocuteurs personnes={personnesDuProspect(p)} />
            </>
          )}

          {onglet === "approche" && (
            <ApprocheEntreprise
              origine={p}
              apres={
                <>
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
              }
            />
          )}

          {onglet === "action" && (
            <ActionsFiche cles={cles} onFait={() => setRelire((n) => n + 1)} relire={relire} onEcrireAvecMerx={() => void lancer("email")} />
          )}

          {onglet === "suivi" && (
            <FilEchanges
              cles={cles}
              jalons={jalons}
              onCompte={compter}
              rafraichir={relire}
            />
          )}
      </div>
    </FicheEntreprise>
  );
}
