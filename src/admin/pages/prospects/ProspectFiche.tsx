// Fiche d’un prospect trouvé par Merx, dans le cadre commun « façon Onetip » (12/10) :
// à gauche qui il est et où il en est, à droite les onglets Actions et Dossier.
//
// Mettre une action sur un prospect le fait entrer au Pipeline : l'affaire est créée
// avec ce que Merx a trouvé, et la fiche reste ouverte.

import { useCallback, useMemo, useState } from "react";
import { Loader2, PenLine, Search, Sparkles, Trash2 } from "lucide-react";
import { useAdminData } from "../../data/AdminDataContext";
import { useAuth } from "../../auth/AuthContext";
import { supabaseAdmin } from "../../data/supabaseAdmin";
import { SectionLabel } from "../../components/ui";
import ChoixReferent from "../../components/ChoixReferent";
import type { Prospect } from "../../lib/merx";
import { clientDepuisProspect, contactDepuisProspect, dejaAuPipeline } from "../../lib/conversion";
import { euroDollar } from "../../lib/couts";
import { colonnesDe } from "../../lib/ui-tokens";
import FicheEntreprise from "../../components/FicheEntreprise";
import ColonneEntreprise, { etablissementDe } from "../../components/fiche/ColonneEntreprise";
import PlacePipeline, { pipelineParDefaut } from "../../components/fiche/PlacePipeline";
import OngletActions from "../../components/fiche/OngletActions";
import CeQuOnSait from "../../components/fiche/CeQuOnSait";
import Interlocuteurs from "../../components/fiche/Interlocuteurs";
import ApprocheEntreprise from "../../components/fiche/ApprocheEntreprise";
import LigneIdentite from "../../components/fiche/LigneIdentite";
import { notesDe, personnesDuProspect } from "../../lib/fiche";
import type { ClesFiche, Jalon } from "../../lib/echanges";
import { quandCourt } from "../../lib/actions-fiche";

export interface Brouillon {
  id: string;
  objet: string;
  corps: string;
  ecritLe: string | null;
}

const boutonDossier =
  "inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[13px] font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal disabled:opacity-60";

export default function ProspectFiche({
  prospect,
  onClose,
  onApprofondir,
  onEcarter,
  onActualiser,
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
  /** Relit la liste sans fermer la fiche : après son entrée au Pipeline, par exemple. */
  onActualiser: () => Promise<void>;
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
  const { stages, pipelines, clients, addClient, addProjectContact, setClientStage } = useAdminData();
  const { user } = useAuth();
  const p = prospect;
  const [enCours, setEnCours] = useState<"approfondir" | "ecarter" | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [onglet, setOnglet] = useState("actions");
  const [nbAVenir, setNbAVenir] = useState(0);
  const compter = useCallback((n: number) => setNbAVenir(n), []);
  /** L'affaire née de ce prospect — tout de suite après son entrée, avant que la liste ne soit relue. */
  const [affaireId, setAffaireId] = useState<string | null>(p.converted_client_id);
  const idAffaire = p.converted_client_id ?? affaireId;
  const affaire = idAffaire ? clients.find((c) => c.id === idAffaire) : undefined;
  const pipelineId = affaire?.pipelineId ?? pipelineParDefaut(pipelines, user?.email)?.id ?? null;
  const colonnes = colonnesDe(stages, pipelineId).map((s) => s.label);
  const cles = useMemo<ClesFiche>(() => ({ prospectId: p.id, clientId: idAffaire }), [p.id, idAffaire]);

  /** Le prospect entre au Pipeline : l'affaire reprend ce que Merx a trouvé, sans rien réinventer. */
  const entrer = async (colonne: string, tableau?: string): Promise<ClesFiche> => {
    if (idAffaire) return cles;
    const existante = dejaAuPipeline(p, clients);
    if (existante) throw new Error(`${existante.company} est déjà dans le Pipeline, à l’étape « ${existante.stage} ».`);
    const pid = tableau ?? pipelineId;
    if (!pid) throw new Error("Aucun pipeline où ranger l’affaire.");
    const client = clientDepuisProspect(p, colonne, pid);
    // On attend que l'affaire existe vraiment : le prospect va pointer dessus.
    if (!(await addClient(client))) throw new Error("L’affaire n’a pas pu être créée dans le Pipeline.");
    const contact = contactDepuisProspect(p);
    if (contact) addProjectContact(client.id, contact);
    const { error } = await supabaseAdmin
      .from("admin_prospects")
      .update({ converted_client_id: client.id, converted_at: new Date().toISOString(), status: "a_contacter" })
      .eq("id", p.id);
    if (error) throw new Error(error.message);
    setAffaireId(client.id);
    void onActualiser();
    return { prospectId: p.id, clientId: client.id };
  };

  const lancer = async (quoi: "approfondir" | "ecarter") => {
    if (enCours) return;
    setEnCours(quoi);
    setErreur(null);
    try {
      if (quoi === "approfondir") await onApprofondir(p);
      else await onEcarter(p);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Merx n’a pas répondu.");
    } finally {
      setEnCours(null);
    }
  };

  /** Les jalons ne sont pas stockés : ce sont les dates que la fiche porte déjà. */
  const jalons = useMemo<Jalon[]>(
    () =>
      ([
        p.found_by
          ? { libelle: "Trouvée par Merx", detail: demandeOrigine ? `« ${demandeOrigine} »` : undefined, au: p.created_at }
          : { libelle: "Fiche créée à la main", au: p.created_at },
        p.enriched_at ? { libelle: "Fiche approfondie", au: p.enriched_at } : null,
        p.converted_at ? { libelle: "Passée au Pipeline", au: p.converted_at } : null,
      ] as (Jalon | null)[]).filter((j): j is Jalon => j !== null),
    [demandeOrigine, p.found_by, p.created_at, p.enriched_at, p.converted_at],
  );

  const personnes = personnesDuProspect(p);
  const { lignes, manquants } = etablissementDe(p);

  return (
    <FicheEntreprise
      colonne={
        <ColonneEntreprise
          titre={p.name}
          sousTitre={[p.activity, [p.city, p.department ? `(${p.department})` : ""].filter(Boolean).join(" ")].filter(Boolean).join(" · ") || "—"}
          identite={<LigneIdentite prospect={p} />}
          notes={notesDe(p)}
          place={
            <PlacePipeline
              pipelines={pipelines}
              stages={stages}
              pipelineId={pipelineId}
              colonne={idAffaire ? (affaire?.stage ?? null) : null}
              onChoisir={async (c, tableau) => {
                try {
                  setErreur(null);
                  if (idAffaire) setClientStage(idAffaire, c);
                  else await entrer(c, tableau);
                } catch (e) {
                  setErreur(e instanceof Error ? e.message : "Le passage au Pipeline a échoué.");
                }
              }}
            />
          }
          referent={<ChoixReferent quoi="prospect" id={p.id} />}
          inscrite={p.found_by ? `Trouvée le ${quandCourt(p.created_at)} par Merx` : `Créée à la main le ${quandCourt(p.created_at)}`}
          interlocuteurs={<Interlocuteurs personnes={personnes} />}
          etablissement={lignes}
          manquants={manquants}
          onCompleter={onModifier ? () => onModifier(p) : undefined}
        />
      }
      onglets={[
        { cle: "actions", label: nbAVenir ? `Actions · ${nbAVenir} à venir` : "Actions" },
        { cle: "dossier", label: "Dossier", etoile: Boolean(p.enriched_at) },
      ]}
      actif={onglet}
      onOnglet={setOnglet}
      enHaut={
        <>
          {/* Une fiche saisie à la main n'est enrichie par Merx que sur demande (19/10). */}
          {!p.found_by && (
            <button
              type="button"
              onClick={() => {
                setOnglet("dossier");
                void lancer("approfondir");
              }}
              disabled={enCours !== null}
              className="inline-flex h-[34px] items-center gap-1.5 rounded-full border border-border px-3.5 text-[13px] font-semibold text-avisdoc-ink hover:border-avisdoc-teal disabled:opacity-60"
            >
              {enCours === "approfondir" ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              {enCours === "approfondir" ? "Merx enrichit…" : "Enrichir par Merx"}
            </button>
          )}
          {onModifier && (
            <button type="button" onClick={() => onModifier(p)} className="h-[34px] rounded-full border border-border px-3.5 text-[13px] font-semibold text-avisdoc-ink hover:border-avisdoc-teal">
              Modifier la fiche
            </button>
          )}
        </>
      }
      message={erreur && <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-rose-700">{erreur}</p>}
      onClose={onClose}
    >
      {/* Toujours monté : le compte des actions à venir reste juste quand on est sur Dossier. */}
      <div className={onglet === "actions" ? "" : "hidden"}>
        <OngletActions
          cles={cles}
          personnes={personnes.map((q) => q.nom)}
          etape={{ actuelle: idAffaire ? (affaire?.stage ?? null) : null, colonnes }}
          jalons={jalons}
          entrer={idAffaire ? undefined : (c) => entrer(c)}
          avancer={async (c) => {
            if (idAffaire) setClientStage(idAffaire, c);
          }}
          onEcrireAvecMerx={() => onRedigerEmail(p)}
          onCompte={compter}
        />
      </div>

      {onglet === "dossier" && (
        <div className="flex max-w-[820px] flex-col gap-5">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button type="button" onClick={() => void lancer("approfondir")} disabled={enCours !== null} className={boutonDossier}>
                {enCours === "approfondir" ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                {enCours === "approfondir" ? "Merx approfondit… une bonne minute" : p.enriched_at ? "Approfondir à nouveau" : "Approfondir la fiche"}
              </button>
              <span className="text-[12.5px] text-muted-foreground">
                {p.enriched_at ? `Approfondie le ${quandCourt(p.enriched_at)}.` : "Merx cherche le registre, le site, les interlocuteurs."}
              </span>
            </div>
            <p className="mt-1.5 text-[12px] text-muted-foreground">
              {couts.approfondissement.mesure ? "Coût mesuré" : "Coût estimé"} — approfondir : {euroDollar(couts.approfondissement.montant)} · écrire un
              e-mail : {euroDollar(couts.email.montant)}.
            </p>
          </div>

          <ApprocheEntreprise
            origine={p}
            apres={
              brouillons.length > 0 && (
                <div className="mt-5">
                  <SectionLabel>Brouillons d’e-mail</SectionLabel>
                  <p className="mt-1 text-[12px] text-muted-foreground">Écrits par Merx. Rien n’a été envoyé : l’envoi se fait depuis votre messagerie.</p>
                  <div className="mt-2 space-y-2">
                    {brouillons.map((b) => (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => onRouvrirBrouillon(b)}
                        className="block w-full rounded-xl border border-border px-3.5 py-2.5 text-left transition-colors hover:border-avisdoc-teal"
                      >
                        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-avisdoc-ink">
                          <PenLine className="size-3.5" /> {b.objet}
                        </span>
                        <span className="mt-0.5 block text-[11.5px] text-muted-foreground">
                          {b.ecritLe ? `écrit le ${new Date(b.ecritLe).toLocaleDateString("fr-FR")}` : "brouillon"} · non envoyé
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            }
          />

          <CeQuOnSait prospect={p} demandeOrigine={demandeOrigine} />

          {/* Supprimer, tout en bas du dossier : loin des boutons du quotidien, et toujours avec un « oui ». */}
          <div className="border-t border-border pt-4">
            <button
              type="button"
              onClick={() => void lancer("ecarter")}
              disabled={enCours !== null}
              className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 px-4 py-2 text-[13px] font-bold text-rose-700 transition-colors hover:border-rose-400 disabled:opacity-60"
            >
              {enCours === "ecarter" ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              Supprimer la fiche
            </button>
          </div>
        </div>
      )}
    </FicheEntreprise>
  );
}
