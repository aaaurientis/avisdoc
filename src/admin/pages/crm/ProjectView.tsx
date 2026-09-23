import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, ChevronDown, Loader2, Lock, Minus, Pencil, Plus, Search, UserPlus, X } from "lucide-react";
import type { Client, Stage } from "../../types";
import { euro, frDate, initials, todayISO, splitAdresse, joinAdresse } from "../../lib/format";
import { DOC_EXT, PROPO_STATUTS, TONES, stageMeta, stageRank } from "../../lib/ui-tokens";
import { useAdminData } from "../../data/AdminDataContext";
import { Avatar, Card } from "../../components/ui";
import EspaceClientCard from "../../espace/EspaceClientCard";
import RendezVousCard from "../../espace/RendezVousCard";
import DangerZone from "../../espace/DangerZone";
import DevisQonto from "../../espace/DevisQonto";
import QontoTag from "../../espace/QontoTag";
import JournalCard from "../../espace/JournalCard";
import ParcoursBanner from "../../espace/ParcoursBanner";
import { useAuth } from "../../auth/AuthContext";
import { supabaseAdmin } from "../../data/supabaseAdmin";
import NoteDetaillee from "../prospects/NoteDetaillee";
import BrouillonEmail from "../prospects/BrouillonEmail";
import FilEchanges from "../../components/FilEchanges";
import ActionsFiche from "../../components/ActionsFiche";
import DossierCommercial, { dossierRempli } from "../../components/DossierCommercial";
import type { Jalon } from "../../lib/echanges";
import type { Prospect } from "../../lib/merx";
import { approfondirProspect, redigerEmailProspect, type BrouillonRendu } from "../../lib/merx-appels";
import Onglets from "../../components/Onglets";
import { cn } from "@/lib/utils";
import { confirmer } from "../../components/Confirmation";

const inputCls =
  "ad-input w-full rounded-xl border border-border bg-muted/50 px-3.5 py-2.5 text-[13px] outline-none transition-colors focus:border-avisdoc-teal";

/** Ce qu'une étape retient encore, dit une seule fois. */
function Verrouille({ etape, fonctions }: { etape: string; fonctions: string }) {
  return (
    <section className="mt-5 flex items-center gap-2.5 rounded-2xl border border-border px-4 py-3.5 first:mt-0">
      <Lock className="size-4 shrink-0 text-muted-foreground/60" />
      <p className="text-[13px] text-muted-foreground">
        {fonctions} se débloquent à l’étape <span className="font-semibold text-avisdoc-ink">{etape}</span>.
      </p>
    </section>
  );
}

/** Un bloc à l'intérieur d'un onglet : plusieurs fonctions tiennent dans le même. */
function Bloc({ titre, verrou, children }: { titre?: string; verrou?: string | null; children: ReactNode }) {
  return (
    <section className="mt-5 first:mt-0">
      {titre && <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">{titre}</div>}
      {verrou ? (
        <div className="flex items-center gap-2 rounded-2xl border border-border px-4 py-3 text-[13px] text-muted-foreground">
          <Lock className="size-4 shrink-0 text-muted-foreground/60" /> {verrou}
        </div>
      ) : (
        children
      )}
    </section>
  );
}

// Section repliable pleine largeur (accordéon de la fiche projet).
// `locked` : étape non atteinte → en-tête grisé, cadenas, contenu masqué.
function Section({
  titre,
  compte,
  defaultOpen = true,
  actions,
  fermer,
  children,
  locked = false,
  lockedHint,
}: {
  titre: string;
  compte?: number;
  defaultOpen?: boolean;
  actions?: ReactNode;
  /** Fermer la fiche. Séparé des actions : sur un téléphone il reste sur la ligne
      du titre, là où on le cherche, pendant que les actions passent en dessous. */
  fermer?: () => void;
  children: ReactNode;
  locked?: boolean;
  lockedHint?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (locked) {
    return (
      <Card className="overflow-hidden opacity-60">
        <div className="flex items-center gap-3 px-5 py-3.5">
          <Lock className="size-4 shrink-0 text-muted-foreground/60" />
          <span className="truncate font-display text-[15px] font-semibold text-muted-foreground">{titre}</span>
          {lockedHint && (
            <span className="ml-auto shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              {lockedHint}
            </span>
          )}
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      {/* Sur un téléphone : le nom et la croix sur la première ligne, les actions
          rangées en dessous, alignées à gauche. Tout sur une seule ligne, « Modifier »,
          « Supprimer » et la croix prenaient les 375 pixels et le nom de l'entreprise
          disparaissait ; en les renvoyant simplement à la ligne, elles s'empilaient en
          escalier à droite et la croix se perdait au bout.
          L'ordre du DOM garde la croix en dernier : sur grand écran, rien ne bouge. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="order-1 flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <ChevronDown
            className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          />
          <span className="truncate font-display text-[15px] font-semibold text-avisdoc-ink">{titre}</span>
          {compte != null && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
              {compte}
            </span>
          )}
        </button>
        {actions && (
          <div className="order-3 flex shrink-0 flex-wrap items-center gap-2 max-sm:w-full sm:order-2">{actions}</div>
        )}
        {fermer && (
          <button
            type="button"
            onClick={fermer}
            title="Fermer la fiche"
            aria-label="Fermer la fiche"
            className="order-2 shrink-0 rounded-lg p-1 text-muted-foreground transition-colors hover:text-avisdoc-ink sm:order-3"
          >
            <X className="size-5" />
          </button>
        )}
      </div>
      {open && <div className="border-t border-border px-5 pb-5 pt-4">{children}</div>}
    </Card>
  );
}

export default function ProjectView({
  client,
  onClose,
}: {
  client: Client;
  onClose: () => void;
}) {
  const {
    updateClientFields,
    addProjectContact,
    removeProjectContact,
    addProjectDoc,
    removeProjectDoc,
    addSuivi,
    toggleSuivi,
    removeSuivi,
    stages,
    accounts,
    addAccount,
    setClientStage,
  } = useAdminData();
  const { user } = useAuth();

  // « ?modifier=1 » : le crayon d'une carte ouvre la fiche prête à être corrigée.
  const [chercheur] = useSearchParams();
  const [editing, setEditing] = useState(chercheur.get("modifier") === "1");
  const [draft, setDraft] = useState({ company: "", siren: "", naf: "", rue: "", cp: "", ville: "" });
  const [nc, setNc] = useState({ prenom: "", nom: "", role: "", email: "" });
  const [ndName, setNdName] = useState("");
  const [ns, setNs] = useState({ text: "", deadline: "" });

  const today = todayISO();
  const total = client.jours * client.tarif;

  // Déblocage par étape : une fonction verrouillée tant que l'étape minimale
  // requise n'est pas atteinte.
  // Rang d'une étape dans le parcours, d'après les colonnes de l'équipe.
  // Une colonne supprimée ou renommée rend -1 : on ne verrouille alors rien.
  const ficheClient = accounts.find((a) => a.clientId === client.id);
  const cur = stageRank(client.stage, stages);
  const verrou = (min: Stage) => {
    const rang = stageRank(min, stages);
    return rang >= 0 && cur >= 0 && cur < rang;
  };

  const [origine, setOrigine] = useState<Prospect | null>(null);
  const [nbEchanges, setNbEchanges] = useState<number | null>(null);
  const compter = useCallback((n: number) => setNbEchanges(n), []);
  const [merxEnCours, setMerxEnCours] = useState<"approfondir" | "email" | null>(null);
  const [merxErreur, setMerxErreur] = useState<string | null>(null);
  const [brouillon, setBrouillon] = useState<BrouillonRendu | null>(null);
  /** Change de valeur après une action : l'historique se relit. */
  const [relire, setRelire] = useState(0);

  // Onglets des fonctions, dans l'ordre du parcours.
  // Quatre onglets, les mêmes que sur les autres fiches : ce qui est vrai, ce qu'on
  // pense, ce qu'on fait, ce qui s'est passé. Leurs fonctions se rangent dedans.
  const TABS: { key: string; label: string; compte?: number }[] = [
    { key: "identite", label: "Identité", compte: client.contacts.length + client.docs.length },
    { key: "approche", label: "Approche" },
    { key: "action", label: "Action" },
    { key: "historique", label: "Historique", compte: (nbEchanges ?? 0) + client.suivis.length },
  ];

  const [tab, setTab] = useState("identite");

  /** Le prospect d’où vient l’affaire : il porte la note et l’angle d’approche. */
  const chargerOrigine = useCallback(async () => {
    const { data } = await supabaseAdmin.from("admin_prospects").select("*").eq("converted_client_id", client.id).maybeSingle();
    setOrigine((data as Prospect) ?? null);
  }, [client.id]);

  useEffect(() => {
    void chargerOrigine();
  }, [chargerOrigine]);

  const jalons = useMemo<Jalon[]>(
    () =>
      ([
        origine ? { libelle: "Trouvée par Merx", au: origine.created_at } : null,
        origine?.enriched_at ? { libelle: "Fiche approfondie", au: origine.enriched_at } : null,
        origine?.converted_at ? { libelle: "Passée au Pipeline", au: origine.converted_at } : null,
      ] as (Jalon | null)[]).filter((j): j is Jalon => j !== null),
    [origine],
  );

  /**
   * Une affaire saisie à la main n'a pas de fiche chez Merx : on lui en ouvre une,
   * rattachée à l'affaire, puis on lance l'approfondissement. Merx travaille alors
   * dessus comme sur n'importe quelle entreprise qu'il aurait trouvée lui-même.
   */
  const confierAMerx = async () => {
    if (merxEnCours) return;
    setMerxEnCours("approfondir");
    setMerxErreur(null);
    try {
      // Merx connaît peut-être déjà cette entreprise : on regarde AVANT d'insérer,
      // plutôt que de deviner à partir d'une erreur de contrainte.
      const { data: connue } = await supabaseAdmin
        .from("admin_prospects")
        .select("id, converted_client_id, deleted_at, city")
        .ilike("name", client.company.trim())
        .maybeSingle();

      let prospectId: string;

      if (connue) {
        const dejaAilleurs = connue.converted_client_id && connue.converted_client_id !== client.id;
        if (dejaAilleurs) {
          throw new Error(
            "Merx a déjà une fiche pour cette entreprise, rattachée à une autre affaire du Pipeline. " +
              "Il s’agit probablement d’un doublon : gardez celle qui porte la fiche et supprimez l’autre.",
          );
        }
        // Libre, ou déjà à nous : on la reprend, et on la sort de la corbeille au besoin.
        const { error } = await supabaseAdmin
          .from("admin_prospects")
          .update({ converted_client_id: client.id, converted_at: new Date().toISOString(), deleted_at: null })
          .eq("id", connue.id);
        if (error) throw new Error(error.message);
        prospectId = connue.id as string;
      } else {
        const { data, error } = await supabaseAdmin
          .from("admin_prospects")
          .insert({
            owner_email: user?.email ?? "",
            name: client.company,
            city: client.ville || null,
            department: (client.codePostal ?? "").slice(0, 2) || null,
            siren: client.siren || null,
            converted_client_id: client.id,
            converted_at: new Date().toISOString(),
            status: "a_contacter",
          })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        prospectId = data.id as string;
      }

      await approfondirProspect(prospectId);
      await chargerOrigine();
    } catch (e) {
      setMerxErreur(e instanceof Error ? e.message : "Merx n’a pas répondu.");
    } finally {
      setMerxEnCours(null);
    }
  };

  const demanderAMerx = async (quoi: "approfondir" | "email") => {
    if (!origine || merxEnCours) return;
    setMerxEnCours(quoi);
    setMerxErreur(null);
    try {
      if (quoi === "approfondir") {
        await approfondirProspect(origine.id);
        await chargerOrigine();
      } else {
        setBrouillon(await redigerEmailProspect(origine.id, user?.name ?? user?.email ?? ""));
      }
    } catch (e) {
      setMerxErreur(e instanceof Error ? e.message : "Merx n’a pas répondu.");
    } finally {
      setMerxEnCours(null);
    }
  };

  // Arriver par le crayon d'une carte ouvre le formulaire : il doit être rempli.
  useEffect(() => {
    if (chercheur.get("modifier") === "1") startEdit();
    // Une seule fois, à l'ouverture de la fiche.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.id]);

  const startEdit = () => {
    // Prérempli : CP / ville depuis les colonnes dédiées, à défaut découpage de l'adresse.
    const p = splitAdresse(client.adresse);
    setDraft({
      company: client.company, siren: client.siren, naf: client.naf,
      rue: p.rue, cp: client.codePostal || p.cp, ville: client.ville || p.ville,
    });
    setEditing(true);
  };
  const saveEdit = () => {
    updateClientFields(client.id, {
      company: draft.company, siren: draft.siren, naf: draft.naf,
      adresse: joinAdresse(draft.rue, draft.cp, draft.ville),
      codePostal: draft.cp.trim(), ville: draft.ville.trim(),
    });
    setEditing(false);
  };

  const submitContact = () => {
    if (!nc.prenom.trim() && !nc.nom.trim()) return;
    addProjectContact(client.id, nc);
    setNc({ prenom: "", nom: "", role: "", email: "" });
  };
  const submitDoc = () => {
    if (!ndName.trim()) return;
    addProjectDoc(client.id, ndName);
    setNdName("");
  };
  const submitSuivi = () => {
    if (!ns.text.trim()) return;
    addSuivi(client.id, { text: ns.text, deadline: ns.deadline || null });
    setNs({ text: "", deadline: "" });
  };

  const btnOutline =
    "ad-btn-outline inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-border px-4 py-2 text-[12.5px] font-bold text-avisdoc-ink transition-colors";
  const btnAccent = "ad-btn-accent rounded-full bg-avisdoc-teal text-[12.5px] font-bold text-white";

  return (
    <div onClick={onClose} className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-avisdoc-ink/45 p-4 sm:p-6">
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-5xl min-w-0 flex-col gap-3 rounded-3xl bg-card p-5 shadow-floating sm:p-6"
      >
        {/* 1. Nom de la société et infos */}
        <Section
          titre={client.company}
          actions={
            <>
              <QontoTag clientId={client.id} />
              {editing ? (
                <>
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="ad-btn-outline rounded-full border-[1.5px] border-border px-4 py-2 text-[12.5px] font-bold text-muted-foreground transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={saveEdit}
                    className={btnAccent}
                    style={{ paddingLeft: 18, paddingRight: 18, paddingTop: 8, paddingBottom: 8 }}
                  >
                    Enregistrer
                  </button>
                </>
              ) : (
                <>
                  <button type="button" onClick={startEdit} className={btnOutline}>
                    <Pencil className="size-3.5" /> Modifier
                  </button>
                  <DangerZone compact clientId={client.id} clientName={client.company} onDeleted={onClose} />
                </>
              )}
            </>
          }
          fermer={onClose}
        >
          {editing ? (
            <div className="flex flex-col gap-2">
              <input
                className={cn(inputCls, "font-semibold")}
                placeholder="Raison sociale"
                value={draft.company}
                onChange={(e) => setDraft({ ...draft, company: e.target.value })}
              />
              <div className="flex flex-wrap gap-2">
                <input
                  className={cn(inputCls, "w-[130px]")}
                  placeholder="SIREN"
                  value={draft.siren}
                  onChange={(e) => setDraft({ ...draft, siren: e.target.value })}
                />
                <input
                  className={cn(inputCls, "min-w-0 flex-1")}
                  placeholder="Activité (NAF)"
                  value={draft.naf}
                  onChange={(e) => setDraft({ ...draft, naf: e.target.value })}
                />
              </div>
              <input
                className={inputCls}
                placeholder="Adresse (n° et voie)"
                value={draft.rue}
                onChange={(e) => setDraft({ ...draft, rue: e.target.value })}
              />
              <div className="flex flex-wrap gap-2">
                <input
                  className={cn(inputCls, "w-[110px]")}
                  placeholder="Code postal"
                  value={draft.cp}
                  onChange={(e) => setDraft({ ...draft, cp: e.target.value })}
                />
                <input
                  className={cn(inputCls, "min-w-0 flex-1")}
                  placeholder="Ville"
                  value={draft.ville}
                  onChange={(e) => setDraft({ ...draft, ville: e.target.value })}
                />
              </div>
            </div>
          ) : (
            <div>
              <div className="text-[12.5px] text-muted-foreground">
                SIREN {client.siren} · {client.naf} —{" "}
                <span className="font-bold text-blue-700">données Pappers ✓</span>
              </div>
              <div className="mt-0.5 text-[12.5px] text-muted-foreground">{client.adresse}</div>
            </div>
          )}

        </Section>

        {/* Bandeau d'avancement : dates de passage + durées entre étapes */}
        <ParcoursBanner
          clientId={client.id}
          currentStage={client.stage}
          // Comme en prospection : la fiche se referme et on voit la carte arriver
          // dans sa nouvelle colonne.
          onEtape={(s) => {
            setClientStage(client.id, s);
            onClose();
          }}
        />

        {/* Onglets des fonctions (sous le bandeau) */}
        <Card className="overflow-hidden">
          <Onglets onglets={TABS.map((t) => ({ cle: t.key, label: t.label, compte: t.compte }))} actif={tab} onChange={setTab} />

          <div className="px-5 pb-5 pt-4">
            {tab === "identite" && (
              <>
                <Bloc titre="Interlocuteurs">{ContactsTab()}</Bloc>
                <Bloc titre="Documents">{DocumentsTab()}</Bloc>
              </>
            )}

            {tab === "approche" && ApprocheTab()}

            {tab === "action" && (
              <>
                <Bloc titre="Agir maintenant">
                  <ActionsFiche
                    cles={{ clientId: client.id }}
                    onFait={() => setRelire((n) => n + 1)}
                    relire={relire}
                    onEcrireAvecMerx={origine ? () => demanderAMerx("email") : undefined}
                  />
                </Bloc>

                <Bloc titre="Relances à faire">{SuivisTab()}</Bloc>

                {/* Un palier verrouillé se dit une fois, avec ce qu'il retient. */}
                {verrou("Proposition") ? (
                  <Verrouille etape="Proposition" fonctions="La proposition et le devis Qonto" />
                ) : (
                  <>
                    <Bloc titre="Proposition">{PropositionTab()}</Bloc>
                    <Bloc>
                      <DevisQonto clientId={client.id} />
                    </Bloc>
                  </>
                )}

                {verrou("Signé") ? (
                  <Verrouille etape="Signé" fonctions="L’espace client et les rendez-vous" />
                ) : (
                  <>
                    <Bloc>
                      <EspaceClientCard bare clientId={client.id} clientName={client.company} />
                    </Bloc>
                    <Bloc>
                      <RendezVousCard bare clientId={client.id} />
                    </Bloc>
                  </>
                )}
              </>
            )}

            {tab === "historique" && (
              <>
                <p className="mb-3 text-[12.5px] text-muted-foreground">
                  Ce qui s’est passé, dans l’ordre. Rien ne s’y modifie : les actions se prennent dans l’onglet Action.
                </p>
                <FilEchanges cles={{ clientId: client.id }} jalons={jalons} onCompte={compter} rafraichir={relire} />
              </>
            )}
          </div>
        </Card>
      </div>

      {brouillon && (
        <BrouillonEmail
          nom={client.company}
          objet={brouillon.objet}
          corps={brouillon.corps}
          destinataire={brouillon.destinataire}
          onClose={() => setBrouillon(null)}
        />
      )}
    </div>
  );

  /** Ce que Merx avait trouvé, et ce qu’on peut encore lui demander. */
  function ApprocheTab() {
    if (!origine) {
      return (
        <div className="py-2">
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Cette affaire n’est pas venue de Merx : elle n’a ni note ni angle d’approche. Vous pouvez la lui confier
            — il ira chercher le registre officiel, les coordonnées publiées, et dira comment aborder l’entreprise.
          </p>
          <button
            type="button"
            onClick={() => void confierAMerx()}
            disabled={merxEnCours !== null}
            className="ad-btn-accent mt-3 inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {merxEnCours ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            Confier cette fiche à Merx
          </button>
          <p className="mt-2 text-[12px] text-muted-foreground">
            Cela prend une trentaine de secondes. Les sources consultées sont gratuites.
          </p>
          {merxErreur && (
            <p className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-rose-700">{merxErreur}</p>
          )}
        </div>
      );
    }
    return (
      <div>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void demanderAMerx("approfondir")}
            disabled={merxEnCours !== null}
            className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[12.5px] font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal disabled:opacity-60"
          >
            {merxEnCours === "approfondir" ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            {origine.enriched_at ? "Approfondir à nouveau" : "Approfondir"}
          </button>
        </div>

        {merxErreur && (
          <p className="mb-4 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-rose-700">{merxErreur}</p>
        )}

        {/* Le dossier d'abord : c'est avec lui qu'on décroche son téléphone, que la
            fiche soit encore en prospection ou déjà au Pipeline. */}
        {dossierRempli(origine.dossier) && <DossierCommercial dossier={origine.dossier} />}

        {origine.rationale && (
          <div className="mb-4 rounded-2xl border border-l-4 border-border border-l-avisdoc-teal p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
              Pourquoi c’était un bon prospect
            </div>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-avisdoc-ink">{origine.rationale}</p>
            {origine.approach && (
              <p className="mt-3 text-[13.5px] leading-relaxed text-avisdoc-ink">
                <span className="font-semibold">Angle d’approche : </span>
                {origine.approach}
              </p>
            )}
          </div>
        )}

        <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
          La note, critère par critère
        </div>
        <div className="mt-2">
          <NoteDetaillee total={origine.score_total} score={origine.score ?? {}} />
        </div>
      </div>
    );
  }

  // ---- Contenus d'onglets (fermetures sur l'état du composant) ----

  function ContactsTab() {
    return (
      <>
          <div className="flex flex-col">
            {client.contacts.map((pc) => {
              const tel = pc.tel && pc.tel !== "—" ? pc.tel : "";
              const email = pc.email && pc.email !== "—" ? pc.email : "";
              const contactLine = [email, tel].filter(Boolean).join(" · ");
              return (
                <div key={pc.id} className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-b-0">
                  <Avatar initials={initials(pc.name || "?")} className="bg-sky-100 text-sky-700" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-semibold text-avisdoc-ink">{pc.name}</div>
                    <div className="truncate text-[11.5px] text-muted-foreground">{pc.role}</div>
                    {contactLine && (
                      <div className="truncate text-[11.5px] text-muted-foreground/80">{contactLine}</div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeProjectContact(client.id, pc.id)}
                    className="ad-x shrink-0 px-1 text-muted-foreground/60 transition-colors"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="mt-3.5 flex flex-wrap gap-2">
            <input
              className={cn(inputCls, "min-w-[90px] flex-1 rounded-full py-2.5")}
              placeholder="Prénom"
              value={nc.prenom}
              onChange={(e) => setNc({ ...nc, prenom: e.target.value })}
            />
            <input
              className={cn(inputCls, "min-w-[90px] flex-1 rounded-full py-2.5")}
              placeholder="Nom"
              value={nc.nom}
              onChange={(e) => setNc({ ...nc, nom: e.target.value })}
            />
            <input
              className={cn(inputCls, "min-w-[90px] flex-1 rounded-full py-2.5")}
              placeholder="Fonction"
              value={nc.role}
              onChange={(e) => setNc({ ...nc, role: e.target.value })}
            />
            <input
              className={cn(inputCls, "min-w-[110px] flex-[1.2] rounded-full py-2.5")}
              placeholder="Email"
              value={nc.email}
              onChange={(e) => setNc({ ...nc, email: e.target.value })}
            />
            <button type="button" onClick={submitContact} className={btnAccent} style={{ padding: "10px 18px" }}>
              Ajouter
            </button>
          </div>
      </>
    );
  }

  function SuivisTab() {
    return (
      <>
          <div className="flex flex-col">
            {client.suivis.map((ev) => {
              const overdue = ev.deadline && !ev.done && ev.deadline < today;
              const badgeCls = ev.done
                ? "bg-emerald-100 text-emerald-700"
                : overdue
                  ? "bg-rose-100 text-rose-700"
                  : ev.deadline
                    ? "bg-amber-100 text-amber-700"
                    : "bg-muted text-muted-foreground";
              const label = ev.deadline ? frDate(ev.deadline) : ev.when || "Sans échéance";
              return (
                <div key={ev.id} className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-b-0">
                  <button
                    type="button"
                    onClick={() => toggleSuivi(client.id, ev.id)}
                    className={cn(
                      "flex size-[18px] shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                      ev.done ? "border-emerald-500 bg-emerald-500 text-white" : "border-border",
                    )}
                  >
                    {ev.done && <Check className="size-3" strokeWidth={3} />}
                  </button>
                  <div
                    className={cn(
                      "min-w-0 flex-1 text-[13px] leading-snug",
                      ev.done ? "text-muted-foreground/70 line-through" : "text-avisdoc-ink",
                    )}
                  >
                    {ev.text}
                  </div>
                  <span
                    className={cn("shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold", badgeCls)}
                  >
                    {label}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeSuivi(client.id, ev.id)}
                    className="ad-x px-1 text-muted-foreground/60 transition-colors"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="mt-3.5 flex flex-wrap gap-2">
            <input
              className={cn(inputCls, "min-w-[160px] flex-[2] rounded-full")}
              placeholder="Nouvelle action de suivi…"
              value={ns.text}
              onChange={(e) => setNs({ ...ns, text: e.target.value })}
            />
            <input
              type="date"
              className={cn(inputCls, "rounded-full text-muted-foreground")}
              value={ns.deadline}
              onChange={(e) => setNs({ ...ns, deadline: e.target.value })}
            />
            <button type="button" onClick={submitSuivi} className={btnAccent} style={{ padding: "10px 18px" }}>
              Ajouter
            </button>
          </div>
      </>
    );
  }

  function DocumentsTab() {
    return (
      <>
          <div className="flex flex-col">
            {client.docs.map((d) => (
              <div key={d.id} className="flex items-center gap-3 border-b border-border/60 py-2.5 last:border-b-0">
                <span
                  className={cn(
                    "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-[9.5px] font-bold text-white",
                    DOC_EXT[d.ext],
                  )}
                >
                  {d.ext}
                </span>
                <div className="min-w-0 flex-1 truncate text-[13px] font-semibold text-avisdoc-ink">{d.name}</div>
                <div className="shrink-0 text-[11.5px] text-muted-foreground/80">{d.date}</div>
                <button
                  type="button"
                  onClick={() => removeProjectDoc(client.id, d.id)}
                  className="ad-x px-1 text-muted-foreground/60 transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3.5 flex flex-wrap gap-2">
            <input
              className={cn(inputCls, "min-w-[140px] flex-1 rounded-full")}
              placeholder="Nom du document (ex. Devis DEP-2026-042.pdf)"
              value={ndName}
              onChange={(e) => setNdName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitDoc()}
            />
            <button type="button" onClick={submitDoc} className={btnAccent} style={{ padding: "10px 18px" }}>
              Partager
            </button>
          </div>
      </>
    );
  }

  function PropositionTab() {
    return (
      <>
          <div className="rounded-2xl bg-avisdoc-ink p-6 text-white">
            <div className="font-display text-[32px] font-bold text-avisdoc-coral">{euro(total)}</div>
            <div className="mt-1 break-words text-[13px] text-white/60">
              {client.jours} {client.jours > 1 ? "journées" : "journée"} × {euro(client.tarif)} / jour
            </div>
            <div className="mt-4 flex flex-col gap-2.5">
              <Stepper
                label="Journées"
                value={String(client.jours)}
                onMinus={() => updateClientFields(client.id, { jours: Math.max(1, client.jours - 1) })}
                onPlus={() => updateClientFields(client.id, { jours: client.jours + 1 })}
              />
              <Stepper
                label="Tarif / journée"
                value={euro(client.tarif)}
                onMinus={() => updateClientFields(client.id, { tarif: Math.max(0, client.tarif - 50) })}
                onPlus={() => updateClientFields(client.id, { tarif: client.tarif + 50 })}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {PROPO_STATUTS.map((st) => {
                const active = client.statutPropo === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => updateClientFields(client.id, { statutPropo: st })}
                    className={cn(
                      "rounded-full px-3.5 py-1.5 text-[11.5px] font-bold transition-colors",
                      active ? "bg-avisdoc-coral text-avisdoc-ink" : "bg-white/10 text-white/60 hover:bg-white/20",
                    )}
                  >
                    {st}
                  </button>
                );
              })}
            </div>

            {(client.tarif > 0 || client.statutPropo !== "Brouillon") && (
              <button
                type="button"
                onClick={async () => {
                  if (!(await confirmer({ titre: "Retirer la proposition ?", message: "Les journées et le tarif repartent à zéro.", action: "Retirer" }))) return;
                  updateClientFields(client.id, { jours: 1, tarif: 0, statutPropo: "Brouillon" });
                }}
                className="mt-3 text-[11.5px] font-semibold text-white/60 underline-offset-2 hover:text-white hover:underline"
              >
                Retirer la proposition
              </button>
            )}
          </div>

          {/* Résultat de campagne */}
          <div className="mt-4 rounded-2xl border border-border p-5">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Résultat</div>
            {client.resultat ? (
              <>
                <div className="mb-2.5 flex gap-3.5">
                  <div>
                    <div className="font-display text-2xl font-bold text-avisdoc-ink">{client.depistes}</div>
                    <div className="text-[11px] text-muted-foreground/80">dépistés</div>
                  </div>
                  <div>
                    <div className="font-display text-2xl font-bold text-avisdoc-coral">{client.orientes}</div>
                    <div className="text-[11px] text-muted-foreground/80">orientés</div>
                  </div>
                </div>
                <p className="text-[13px] leading-relaxed text-foreground/80">{client.resultat}</p>
              </>
            ) : (
              <p className="text-[13px] italic text-muted-foreground">
                Campagne non réalisée — résultats disponibles après les journées de dépistage.
              </p>
            )}
          </div>
      </>
    );
  }
}

function Stepper({
  label,
  value,
  onMinus,
  onPlus,
}: {
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span className="min-w-[110px] text-[12.5px] text-white/60">{label}</span>
      <button
        type="button"
        onClick={onMinus}
        className="ad-stepper flex size-7 items-center justify-center rounded-full bg-white/10 transition-colors"
      >
        <Minus className="size-3.5" />
      </button>
      <span className="min-w-[64px] text-center text-sm font-bold">{value}</span>
      <button
        type="button"
        onClick={onPlus}
        className="ad-stepper flex size-7 items-center justify-center rounded-full bg-white/10 transition-colors"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}
