// Prospects — ce que Merx a trouvé, rangé par secteur.
// Les fiches sont communes à l’équipe (comme le fichier CRM) ; une fiche supprimée part à la corbeille
// sans jamais être supprimée.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Mail, Pencil, Phone, Plus, Search, Trash2 } from "lucide-react";
import { supabaseAdmin } from "../data/supabaseAdmin";
import { useAuth } from "../auth/AuthContext";
import { Badge, PageHeader, SectionLabel } from "../components/ui";
import { SECTEURS, secteurDe, tonNote, type Prospect } from "../lib/merx";
import { COLONNE_KANBAN, TONES } from "../lib/ui-tokens";
import BarreSelection from "../components/BarreSelection";
import CaseFiche, { CaseColonne } from "../components/CaseFiche";
import { cn } from "@/lib/utils";
import ProspectFiche from "./prospects/ProspectFiche";
import BrouillonEmail from "./prospects/BrouillonEmail";
import NouveauProspect from "./prospects/NouveauProspect";
import FiltresProspects, { FILTRES_VIDES, retenue, type Filtres } from "./prospects/FiltresProspects";
import { coutMoyen, type Consommation } from "../lib/couts";
import { jeter, JOURS_DE_GARDE } from "../lib/corbeille";
import { clientDepuisProspect, contactDepuisProspect, dejaAuPipeline } from "../lib/conversion";
import { useAdminData } from "../data/AdminDataContext";

/** Une demande passée à Merx : ce qu’elle a coûté, et pour un e-mail, ce qu’elle a écrit. */
interface Demande {
  id: string;
  kind: string;
  request: string;
  usage: Consommation | null;
  prospect_id: string | null;
  objet: string | null;
  corps: string | null;
  finished_at: string | null;
}

function Carte({
  p,
  onOuvrir,
  onModifier,
  onSupprimer,
  cochee,
  onCocher,
  selectionEnCours,
}: {
  p: Prospect;
  onOuvrir: () => void;
  onModifier: () => void;
  onSupprimer: () => void;
  cochee: boolean;
  onCocher: () => void;
  selectionEnCours: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOuvrir}
      onKeyDown={(e) => e.key === "Enter" && onOuvrir()}
      className={cn(
        "ad-card-clickable group w-full cursor-pointer rounded-xl border bg-card p-3 text-left transition-colors",
        cochee ? "border-avisdoc-teal ring-1 ring-avisdoc-teal/40" : "border-border hover:border-avisdoc-teal",
      )}
    >
      {!p.opened_at && (
        <Badge className="mb-1.5 bg-amber-100 uppercase tracking-wide text-amber-800">Nouveau</Badge>
      )}
      <div className="flex items-start gap-2">
        <CaseFiche cochee={cochee} onBascule={onCocher} libelle={p.name} visible={selectionEnCours} />
        <div className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-avisdoc-ink">{p.name}</div>
        <Badge className={`${tonNote(p.score_total)} shrink-0`}>{p.score_total ?? "—"}</Badge>
        <div
          className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onModifier}
            aria-label={`Modifier ${p.name}`}
            title="Modifier"
            className="rounded-lg p-1 text-muted-foreground hover:text-avisdoc-teal"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onSupprimer}
            aria-label={`Supprimer ${p.name}`}
            title="Supprimer"
            className="rounded-lg p-1 text-muted-foreground hover:text-rose-700"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
        {[p.activity, p.city].filter(Boolean).join(" · ") || "—"}
      </div>
      {p.rationale && <p className="mt-2 line-clamp-2 text-[12px] leading-snug text-muted-foreground">{p.rationale}</p>}
      {(p.contact_email || p.contact_phone) && (
        <div className="mt-2 flex items-center gap-2 text-muted-foreground">
          {p.contact_email && <Mail className="size-3.5" />}
          {p.contact_phone && <Phone className="size-3.5" />}
          <span className="truncate text-[11px]">{p.contact_name ?? p.contact_email ?? p.contact_phone}</span>
        </div>
      )}
    </div>
  );
}

/** Une table absente veut dire « migration pas encore appliquée » : on le dit en français. */
function messageErreur(brut: string): string {
  // Uniquement la table absente : une colonne manquante est un vrai défaut, qu'il faut voir.
  return /Could not find the table .* in the schema cache/i.test(brut)
    ? "Cet écran attend sa migration : le SQL n’a pas encore été exécuté sur la base."
    : brut;
}

export default function Prospects() {
  const { user } = useAuth();
  const nomDuCommercial = user?.name ?? user?.email ?? "";
  const { stages, clients, addClient, addProjectContact } = useAdminData();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [filtres, setFiltres] = useState<Filtres>(FILTRES_VIDES);
  const [recherche, setRecherche] = useState("");
  const [ajout, setAjout] = useState(false);
  const [aModifier, setAModifier] = useState<Prospect | null>(null);
  const [coches, setCoches] = useState<Set<string>>(new Set());

  const cocher = (id: string) =>
    setCoches((prev) => {
      const suivant = new Set(prev);
      if (suivant.has(id)) suivant.delete(id);
      else suivant.add(id);
      return suivant;
    });

  const selectionnees = useMemo(() => prospects.filter((p) => coches.has(p.id)), [coches, prospects]);
  const adresses = useMemo(
    () => [...new Set(selectionnees.map((p) => p.contact_email).filter((e): e is string => Boolean(e)))],
    [selectionnees],
  );

  /** Un seul message à plusieurs : les destinataires sont en copie cachée. */
  const ecrireAuxCoches = () => {
    if (adresses.length === 0) return;
    window.location.href = `mailto:?bcc=${encodeURIComponent(adresses.join(","))}`;
  };

  /** Supprimer une fiche depuis sa carte, sans passer par la sélection. */
  const supprimerUne = async (p: Prospect) => {
    if (!window.confirm(`Supprimer ${p.name} ? Vous la retrouverez ${JOURS_DE_GARDE} jours dans la corbeille.`)) return;
    try {
      await jeter("prospect", [p.id]);
      await charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "La suppression a échoué.");
    }
  };

  /**
   * Supprimer met à la corbeille : la fiche sort du tableau mais se retrouve et se
   * restaure. Une recherche a coûté quelque chose — on ne détruit pas ce travail d'un clic.
   */
  const supprimerLesCoches = async () => {
    const n = selectionnees.length;
    if (n === 0) return;
    if (!window.confirm(`Supprimer ${n} fiche${n > 1 ? "s" : ""} ? Vous les retrouverez ${JOURS_DE_GARDE} jours dans la corbeille.`))
      return;
    try {
      await jeter("prospect", [...coches]);
      setCoches(new Set());
      await charger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "La suppression a échoué.");
    }
  };
  const [demandes, setDemandes] = useState<Demande[]>([]);
  const [brouillon, setBrouillon] = useState<{
    prospect: Prospect;
    objet: string;
    corps: string;
    destinataire: string | null;
  } | null>(null);

  /** Les brouillons d’e-mail déjà écrits pour la fiche ouverte, du plus récent au plus ancien. */
  const brouillonsDeLaFiche = useMemo(
    () =>
      demandes
        .filter((d) => d.kind === "email" && d.prospect_id === ouverte && d.objet)
        .sort((a, b) => (b.finished_at ?? "").localeCompare(a.finished_at ?? ""))
        .map((d) => ({ id: d.id, objet: d.objet as string, corps: d.corps ?? "", ecritLe: d.finished_at })),
    [demandes, ouverte],
  );

  const charger = useCallback(async () => {
    setErreur(null);
    const { data, error } = await supabaseAdmin
      .from("admin_prospects")
      .select("*")
      .is("deleted_at", null)
      .order("score_total", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
    if (error) setErreur(messageErreur(error.message));
    else setProspects((data ?? []) as Prospect[]);
    const { data: passees } = await supabaseAdmin
      .from("admin_merx_demandes")
      .select("id, kind, request, usage, prospect_id, objet, corps, finished_at")
      .eq("status", "terminee");
    setDemandes((passees ?? []) as Demande[]);
    setChargement(false);
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  /** Les fiches de l’onglet courant, avant que les filtres ne s’en mêlent. */
  const duVivier = useMemo(
    () => prospects.filter((p) => !p.converted_client_id),
    [prospects],
  );

  const visibles = useMemo(
    () => duVivier.filter((p) => retenue(p, filtres, recherche)),
    [duVivier, filtres, recherche],
  );

  /** Une fiche jamais ouverte porte la pastille « Nouveau ». */
  const nouvelles = useMemo(() => prospects.filter((p) => !p.converted_client_id && !p.opened_at).length, [prospects]);

  /** Les départements réellement présents : on ne propose pas un filtre qui ne rendrait rien. */
  const departements = useMemo(
    () => [...new Set(prospects.map((p) => p.department).filter((d): d is string => Boolean(d)))].sort(),
    [prospects],
  );

  /** Ouvrir une fiche la marque comme vue — une seule fois. */
  const ouvrir = useCallback(
    async (p: Prospect) => {
      setOuverte(p.id);
      if (p.opened_at) return;
      await supabaseAdmin.from("admin_prospects").update({ opened_at: new Date().toISOString() }).eq("id", p.id);
      setProspects((prev) => prev.map((x) => (x.id === p.id ? { ...x, opened_at: new Date().toISOString() } : x)));
    },
    [],
  );
  /** Parties au Pipeline : on dit où elles sont allées plutôt que de les laisser disparaître sans un mot. */
  const auPipeline = useMemo(
    () => prospects.filter((p) => p.converted_client_id).length,
    [prospects],
  );
  const fiche = useMemo(() => prospects.find((p) => p.id === ouverte) ?? null, [prospects, ouverte]);

  const couts = useMemo(
    () => ({
      approfondissement: coutMoyen(demandes, "approfondissement"),
      email: coutMoyen(demandes, "email"),
    }),
    [demandes],
  );

  const redigerEmail = useCallback(
    async (p: Prospect) => {
      const { data, error } = await supabaseAdmin.functions.invoke("merx", {
        body: { action: "email", prospectId: p.id, signature: nomDuCommercial },
      });
      if (error) throw new Error(error.message);
      const r = data as { objet?: string; corps?: string; destinataire?: string | null; error?: string };
      if (r.error) throw new Error(r.error);
      setBrouillon({ prospect: p, objet: r.objet ?? "", corps: r.corps ?? "", destinataire: r.destinataire ?? null });
      await charger();
    },
    [charger, nomDuCommercial],
  );

  const approfondir = useCallback(
    async (p: Prospect) => {
      const { data, error } = await supabaseAdmin.functions.invoke("merx", { body: { action: "approfondir", prospectId: p.id } });
      if (error) throw new Error(error.message);
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      await charger();
    },
    [charger],
  );

  /** Le lien est gardé sur la fiche : un prospect ne devient une affaire qu'une fois. */
  const mettreAuPipeline = useCallback(
    async (p: Prospect, clientId: string) => {
      const { error } = await supabaseAdmin
        .from("admin_prospects")
        .update({ converted_client_id: clientId, converted_at: new Date().toISOString(), status: "a_contacter" })
        .eq("id", p.id);
      if (error) throw new Error(error.message);
      setOuverte(null);
      await charger();
    },
    [charger],
  );

  const ecarter = useCallback(
    async (p: Prospect) => {
      const { error } = await supabaseAdmin
        .from("admin_prospects")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", p.id);
      if (error) throw new Error(error.message);
      setOuverte(null);
      await charger();
    },
    [charger],
  );

  return (
    <div>
      <PageHeader
        action={
          <button
            type="button"
            onClick={() => setAjout(true)}
            className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white"
          >
            <Plus className="size-4" /> Ajouter un prospect
          </button>
        }
        title="Prospection"
        subtitle={
          chargement
            ? "Chargement…"
            : [
                `${visibles.length} fiche${visibles.length > 1 ? "s" : ""}`,
                nouvelles > 0 ? `${nouvelles} nouvelle${nouvelles > 1 ? "s" : ""}` : "",
                "trouvées par Merx",
                auPipeline > 0 ? `${auPipeline} passée${auPipeline > 1 ? "s" : ""} au Pipeline` : "",
              ]
                .filter(Boolean)
                .join(" · ")
        }
      />

      {erreur && <div className="mb-4 rounded-2xl bg-rose-50 px-4 py-3 text-[13px] font-semibold text-rose-700">{erreur}</div>}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] max-w-sm flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher une entreprise, une ville…"
            className="ad-input w-full rounded-full border border-border bg-card py-2 pl-10 pr-4 text-[13px] outline-none transition-colors focus:border-avisdoc-teal"
          />
        </div>
        <FiltresProspects filtres={filtres} onChange={setFiltres} departements={departements} />
      </div>

      {chargement ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Chargement des fiches…
        </div>
      ) : duVivier.length === 0 ? (
        <div className="rounded-2xl bg-muted/60 p-8 text-center">
          <SectionLabel>Aucune fiche pour l’instant</SectionLabel>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            Demandez une recherche à Merx : les entreprises qu’il trouve arrivent ici, rangées par secteur.
          </p>
        </div>
      ) : (
        <div
          className="ad-kanban grid gap-3 overflow-x-auto overscroll-x-contain pb-1"
          style={{ gridTemplateColumns: `repeat(${SECTEURS.length}, minmax(300px, 380px))` }}
        >
          {SECTEURS.map((s) => {
            const liste = visibles.filter((p) => secteurDe(p) === s.id);
            return (
              <div key={s.id} className={COLONNE_KANBAN}>
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <div className="text-xs font-bold uppercase tracking-[0.05em] text-muted-foreground">{s.label}</div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold text-white ${TONES[s.tone].dot}`}>
                    {liste.length}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  {liste.map((p) => (
                    <Carte
                      key={p.id}
                      p={p}
                      onOuvrir={() => void ouvrir(p)}
                      onModifier={() => setAModifier(p)}
                      onSupprimer={() => void supprimerUne(p)}
                      cochee={coches.has(p.id)}
                      onCocher={() => cocher(p.id)}
                      selectionEnCours={coches.size > 0}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <BarreSelection
        nombre={selectionnees.length}
        total={visibles.length}
        onTout={() => setCoches(new Set(visibles.map((p) => p.id)))}
        avecEmail={adresses.length}
        libelleSuppression="Supprimer"
        onEmail={ecrireAuxCoches}
        onSupprimer={() => void supprimerLesCoches()}
        onEffacer={() => setCoches(new Set())}
      />

      {(ajout || aModifier) && (
        <NouveauProspect
          fiche={aModifier ?? undefined}
          onClose={() => {
            setAjout(false);
            setAModifier(null);
          }}
          onCree={charger}
        />
      )}

      {brouillon && (
        <BrouillonEmail
          nom={brouillon.prospect.name}
          objet={brouillon.objet}
          corps={brouillon.corps}
          destinataire={brouillon.destinataire}
          onClose={() => setBrouillon(null)}
          // Une fiche déjà partie au Pipeline ne se repropose pas.
          stages={brouillon.prospect.converted_client_id ? undefined : stages}
          onMettreAuPipeline={
            brouillon.prospect.converted_client_id
              ? undefined
              : async (etape) => {
                  const existante = dejaAuPipeline(brouillon.prospect, clients);
                  if (existante) throw new Error(`${existante.company} est déjà dans le Pipeline, à l’étape « ${existante.stage} ».`);
                  const client = clientDepuisProspect(brouillon.prospect, etape);
                  if (!(await addClient(client))) throw new Error("L’affaire n’a pas pu être créée dans le Pipeline.");
                  const contact = contactDepuisProspect(brouillon.prospect);
                  if (contact) addProjectContact(client.id, contact);
                  await mettreAuPipeline(brouillon.prospect, client.id);
                }
          }
        />
      )}

      {fiche && (
        <ProspectFiche
          prospect={fiche}
          onClose={() => setOuverte(null)}
          onApprofondir={approfondir}
          onEcarter={ecarter}
          onMettreAuPipeline={mettreAuPipeline}
          onRedigerEmail={redigerEmail}
          couts={couts}
          demandeOrigine={demandes.find((d) => d.id === fiche.found_by)?.request ?? null}
          brouillons={brouillonsDeLaFiche}
          onRouvrirBrouillon={(b) =>
            setBrouillon({ prospect: fiche, objet: b.objet, corps: b.corps, destinataire: fiche.contact_email ?? null })
          }
        />
      )}
    </div>
  );
}
