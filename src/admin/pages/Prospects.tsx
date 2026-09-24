// Prospects — ce que Merx a trouvé, rangé par secteur.
// Les fiches sont communes à l’équipe (comme le fichier CRM) ; une fiche supprimée part à la corbeille
// sans jamais être supprimée.

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpDown, Check, Loader2, Mail, Pencil, Phone, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabaseAdmin } from "../data/supabaseAdmin";
import { useAuth } from "../auth/AuthContext";
import { Badge, PageHeader, SectionLabel } from "../components/ui";
import { decision, effectifLabel, EXPLICATION_CONSIGNE, EXPLICATION_FIABILITE, EXPLICATION_NOTE, maxEvalue, secteurLisible, tonNote, type Prospect } from "../lib/merx";
import { COLONNE_KANBAN, TONES } from "../lib/ui-tokens";
import BarreSelection from "../components/BarreSelection";
import BulleAide from "../components/BulleAide";
import CaseFiche, { CaseColonne } from "../components/CaseFiche";
import { cn } from "@/lib/utils";
import ProspectFiche from "./prospects/ProspectFiche";
import BrouillonEmail from "./prospects/BrouillonEmail";
import NouveauProspect from "./prospects/NouveauProspect";
import FiltresProspects, { FILTRES_VIDES, retenue, type Filtres } from "./prospects/FiltresProspects";
import { coutMoyen, euroDollar, type Consommation } from "../lib/couts";
import { jeter, JOURS_DE_GARDE } from "../lib/corbeille";
import { clientDepuisProspect, contactDepuisProspect, dejaAuPipeline } from "../lib/conversion";
import { useAdminData } from "../data/AdminDataContext";
import { confirmer } from "../components/Confirmation";
import { useActualisation } from "../lib/actualisation";
import FiltresRepliables from "../components/FiltresRepliables";

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

function messageErreur(brut: string): string {
  // Uniquement la table absente : une colonne manquante est un vrai défaut, qu'il faut voir.
  return /Could not find the table .* in the schema cache/i.test(brut)
    ? "Cet écran attend sa migration : le SQL n’a pas encore été exécuté sur la base."
    : brut;
}

/**
 * Quand la fiche est arrivée : la date, puis l'heure en dessous.
 *
 * Les deux, toujours. La date situe, l'heure distingue : après une recherche qui
 * rend cent cinquante fiches, elles portent toutes la même date et l'on ne retrouve
 * plus les quinze qui viennent d'arriver.
 */
function quandArrivee(iso: string): { date: string; heure: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
    heure: d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
  };
}

/** Les colonnes sur lesquelles on peut trier. */
type Colonne = "creee" | "nom" | "secteur" | "activite" | "ville" | "interlocuteur" | "salaries" | "note" | "consigne" | "fiabilite" | "approfondie";

/** L'ordre des tranches INSEE : « 250 à 499 » doit passer après « 50 à 99 », pas avant. */
const ORDRE_EFFECTIF = ["NN", "00", "01", "02", "03", "11", "12", "21", "22", "31", "32", "41", "42", "51", "52", "53"];
const rangEffectif = (band: string | null): number => {
  const i = ORDRE_EFFECTIF.indexOf(band ?? "");
  return i === -1 ? -1 : i; // effectif inconnu : en fin de liste
};

/** Un en-tête qui trie. La flèche dit la colonne active et son sens. */
function EnTete({
  colonne,
  libelle,
  tri,
  onTrier,
  className,
  aide,
}: {
  colonne: Colonne;
  libelle: string;
  tri: { colonne: Colonne; sens: "asc" | "desc" };
  onTrier: (c: Colonne) => void;
  className?: string;
  /** D'où sort la note de cette colonne, pour qui veut le savoir. */
  aide?: string;
}) {
  const active = tri.colonne === colonne;
  return (
    <th className={cn("whitespace-nowrap px-4 py-2.5 text-left", className)}>
      <button
        type="button"
        onClick={() => onTrier(colonne)}
        className={cn(
          "inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.05em] transition-colors",
          active ? "text-avisdoc-ink" : "text-muted-foreground hover:text-avisdoc-ink",
        )}
      >
        {libelle}
        <ArrowUpDown className={cn("size-3", active ? "opacity-100" : "opacity-40")} />
        {active && <span className="text-[10px]">{tri.sens === "asc" ? "▲" : "▼"}</span>}
      </button>
      {aide && <BulleAide titre={libelle} texte={aide} />}
    </th>
  );
}

export default function Prospects() {
  const { user } = useAuth();
  const nomDuCommercial = user?.name ?? user?.email ?? "";
  const { stages, clients, addClient, addProjectContact } = useAdminData();
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [chargement, setChargement] = useState(true);
  /** Une recherche de Merx est en route : les fiches vont arriver. */
  const [enRecherche, setEnRecherche] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [filtres, setFiltres] = useState<Filtres>(FILTRES_VIDES);
  const [recherche, setRecherche] = useState("");
  const [ajout, setAjout] = useState(false);
  const [aModifier, setAModifier] = useState<Prospect | null>(null);
  // Plus de kanban en Prospection : une recherche au registre rend des dizaines, voire
  // des centaines d'entreprises, et en colonnes on ne retrouve plus rien. La liste se
  // trie, se filtre et se parcourt — c'est le seul affichage qui tienne à cette échelle.
  //
  // Plus d'actions prévues non plus : une entreprise sur laquelle on a prévu quelque
  // chose est passée au Pipeline. Ce qu'on veut voir ici, c'est ce qui reste à
  // approfondir.
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
    if (!(await confirmer({ titre: `Supprimer ${p.name} ?`, message: `Vous la retrouverez ${JOURS_DE_GARDE} jours dans la corbeille.` }))) return;
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
    if (!(await confirmer({ titre: `Supprimer ${n} fiche${n > 1 ? "s" : ""} ?`, message: `Vous les retrouverez ${JOURS_DE_GARDE} jours dans la corbeille.` })))
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
    // Une demande encore en route : on repassera voir.
    const { count } = await supabaseAdmin
      .from("admin_merx_demandes")
      .select("id", { count: "exact", head: true })
      .in("status", ["en_attente", "en_cours"]);
    setEnRecherche((count ?? 0) > 0);
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

  // Tant qu'une recherche tourne, les fiches arrivent d'elles-mêmes.
  useActualisation(charger, enRecherche);

  /** Les fiches de l’onglet courant, avant que les filtres ne s’en mêlent. */
  const duVivier = useMemo(
    () => prospects.filter((p) => !p.converted_client_id),
    [prospects],
  );

  /** Le tri de la liste : une colonne, un sens. Par défaut les meilleures notes d'abord. */
  const [tri, setTri] = useState<{ colonne: Colonne; sens: "asc" | "desc" }>({ colonne: "note", sens: "desc" });

  const visibles = useMemo(() => {
    const retenues = duVivier.filter((p) => retenue(p, filtres, recherche));
    const sens = tri.sens === "asc" ? 1 : -1;
    /**
     * Comparaison de textes, les valeurs absentes toujours en fin.
     *
     * Sans cela, trier par ville en ordre croissant remontait en tête toutes les
     * fiches qui n'en ont pas : le commercial voyait d'abord ce qu'on ne sait pas.
     */
    const parTexte = (x: string | null | undefined, y: string | null | undefined): number => {
      const a = (x ?? "").trim();
      const b = (y ?? "").trim();
      if (!a && !b) return 0;
      if (!a) return 1; // « a » vide : après, quel que soit le sens
      if (!b) return -1;
      return sens * a.localeCompare(b, "fr");
    };
    const compare = (a: Prospect, b: Prospect): number => {
      switch (tri.colonne) {
        case "creee": return sens * a.created_at.localeCompare(b.created_at);
        case "nom": return sens * a.name.localeCompare(b.name, "fr");
        case "secteur": return parTexte(secteurLisible(a.sector), secteurLisible(b.sector));
        case "activite": return parTexte(a.activity, b.activity);
        case "ville": return parTexte(a.city, b.city);
        case "interlocuteur": return parTexte(a.contact_name ?? a.contact_email, b.contact_name ?? b.contact_email);
        case "salaries": return sens * (rangEffectif(a.headcount_band) - rangEffectif(b.headcount_band));
        // Les non approfondies d'abord au premier clic : c'est le travail qui reste.
        case "approfondie": return sens * ((a.enriched_at ? 1 : 0) - (b.enriched_at ? 1 : 0));
        case "consigne": {
          // La consigne ne suit pas la note brute mais sa part de ce qui a pu être
          // évalué : trier sur la note donnait « Prioritaire », deux vides, puis
          // « Prioritaire » de nouveau. Les fiches sans consigne vont à la fin.
          const part = (p: Prospect) => {
            const sur = maxEvalue(p.score ?? {});
            return sur > 0 && p.score_total !== null ? (100 * p.score_total) / sur : -1;
          };
          return sens * (part(a) - part(b));
        }
        case "fiabilite": return sens * ((a.reliability ?? -1) - (b.reliability ?? -1));
        default: return sens * ((a.score_total ?? -1) - (b.score_total ?? -1));
      }
    };
    return retenues.sort(compare);
  }, [duVivier, filtres, recherche, tri]);

  /** Un clic trie, un second inverse le sens. */
  const trierPar = (colonne: Colonne) =>
    setTri((avant) =>
      avant.colonne === colonne
        ? { colonne, sens: avant.sens === "asc" ? "desc" : "asc" }
        : { colonne, sens: colonne === "note" || colonne === "consigne" || colonne === "fiabilite" || colonne === "creee" || colonne === "salaries" ? "desc" : "asc" },
    );

  /** Toutes les fiches visibles sont-elles cochées ? */
  const toutesCochees = visibles.length > 0 && visibles.every((p) => coches.has(p.id));

  /** Une fiche jamais ouverte porte la pastille « Nouveau ». */
  const nouvelles = useMemo(() => prospects.filter((p) => !p.converted_client_id && !p.opened_at).length, [prospects]);

  /** Ce qui est réellement présent : on ne propose pas un filtre qui ne rendrait rien. */
  const departements = useMemo(
    () => [...new Set(prospects.map((p) => p.department).filter((d): d is string => Boolean(d)))].sort(),
    [prospects],
  );
  const villes = useMemo(
    () => [...new Set(prospects.map((p) => p.city).filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b, "fr")),
    [prospects],
  );
  // Par libellé et non par code : « btp » et « Construction » sont le même secteur.
  const secteurs = useMemo(
    () =>
      [...new Set(prospects.map((p) => secteurLisible(p.sector)).filter((s) => s !== "—"))].sort((a, b) =>
        a.localeCompare(b, "fr"),
      ),
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

  /** Où en est l'approfondissement de la sélection : null quand rien ne tourne. */
  const [lot, setLot] = useState<{ fait: number; total: number } | null>(null);

  /**
   * Approfondir toute une sélection, une fiche après l'autre.
   *
   * Séquentiel et non parallèle : chaque approfondissement occupe une fonction
   * pendant plus d'une minute, et les lancer ensemble les ferait tous expirer.
   *
   * Le coût et la durée sont annoncés AVANT : cocher deux cents fiches et cliquer,
   * c'est plusieurs heures et plusieurs dizaines d'euros. On ne découvre pas ça après.
   */
  const approfondirLesCoches = useCallback(async () => {
    const aFaire = selectionnees.filter((p) => !p.enriched_at);
    if (aFaire.length === 0 || lot) return;

    const minutes = Math.ceil((aFaire.length * 80) / 60);
    // Le coût moyen est mesuré sur les approfondissements déjà faits ; à défaut une
    // estimation. On l'annonce comme un ordre de grandeur, pas comme un devis.
    const unitaire = couts.approfondissement.montant;
    const cout = unitaire > 0 ? `environ ${euroDollar(unitaire * aFaire.length)}` : null;
    if (
      !(await confirmer({
        titre: `Approfondir ${aFaire.length} fiche${aFaire.length > 1 ? "s" : ""} ?`,
        message:
          `Merx va chercher pour chacune l’identité officielle, l’effectif, les dirigeants et le dossier commercial. ` +
          `Comptez ${minutes} minute${minutes > 1 ? "s" : ""}${cout ? `, ${cout}` : ""}. ` +
          `Vous pouvez continuer à travailler pendant ce temps ; les fiches se mettent à jour au fur et à mesure.`,
        action: "Approfondir",
      }))
    )
      return;

    setLot({ fait: 0, total: aFaire.length });
    let echecs = 0;
    for (const [i, p] of aFaire.entries()) {
      try {
        const { data, error } = await supabaseAdmin.functions.invoke("merx", { body: { action: "approfondir", prospectId: p.id } });
        if (error || (data as { error?: string })?.error) echecs++;
      } catch {
        echecs++;
      }
      setLot({ fait: i + 1, total: aFaire.length });
    }
    setLot(null);
    setCoches(new Set());
    await charger();
    const reussies = aFaire.length - echecs;
    if (echecs === 0) toast.success(`${reussies} fiche${reussies > 1 ? "s" : ""} approfondie${reussies > 1 ? "s" : ""}.`);
    else toast.warning(`${reussies} approfondie${reussies > 1 ? "s" : ""}, ${echecs} en échec — relancez-les depuis leur fiche.`);
  }, [selectionnees, lot, couts.approfondissement, charger]);

  /**
   * Compléter les fiches cochées sans appeler de modèle.
   *
   * Le registre, Pappers et la fiche d'établissement : deux secondes par fiche et
   * presque rien, là où un approfondissement coûte douze centimes et trente secondes.
   * C'est ce qu'il faut aux fiches d'avant, créées quand la recherche ne rendait qu'un
   * nom et une ville — elles n'ont ni dirigeant, ni téléphone, ni note de fiabilité.
   */
  const completerLot = useCallback(async () => {
    if (lot || selectionnees.length === 0) return;
    setLot({ fait: 0, total: selectionnees.length });
    let echecs = 0;
    for (const [i, p] of selectionnees.entries()) {
      try {
        const { data, error } = await supabaseAdmin.functions.invoke("merx", { body: { action: "completer", prospectId: p.id } });
        if (error || (data as { error?: string })?.error) echecs++;
      } catch {
        echecs++;
      }
      setLot({ fait: i + 1, total: selectionnees.length });
    }
    setLot(null);
    setCoches(new Set());
    await charger();
    const ok = selectionnees.length - echecs;
    if (echecs === 0) toast.success(`${ok} fiche${ok > 1 ? "s" : ""} complétée${ok > 1 ? "s" : ""}.`);
    else toast.warning(`${ok} complétée${ok > 1 ? "s" : ""}, ${echecs} en échec.`);
  }, [selectionnees, lot, charger]);

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

  // Supprimer depuis la FICHE OUVERTE. C'était le chemin oublié : la liste demandait
  // confirmation, la fiche supprimait d'un clic.
  const ecarter = useCallback(
    async (p: Prospect) => {
      if (!(await confirmer({ titre: `Supprimer ${p.name} ?`, message: `Vous la retrouverez ${JOURS_DE_GARDE} jours dans la corbeille.` }))) return;
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
        <FiltresRepliables actifs={Object.values(filtres).filter(Boolean).length}>
          <FiltresProspects
            filtres={filtres}
            onChange={setFiltres}
            secteurs={secteurs}
            villes={villes}
            departements={departements}
          />
        </FiltresRepliables>
      </div>

      {chargement ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Chargement des fiches…
        </div>
      ) : duVivier.length === 0 ? (
        <div className="rounded-2xl bg-muted/60 p-8 text-center">
          <SectionLabel>Aucune fiche pour l’instant</SectionLabel>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            Demandez une recherche à Merx : les entreprises qu’il trouve arrivent ici, les mieux notées en tête.
          </p>
        </div>
      ) : (
        /* ── Liste : toutes les fiches d'un coup, triées par note ── */
        <div className="overflow-x-auto overscroll-x-contain rounded-2xl border border-border bg-card">
          <table className="w-full min-w-[980px] border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                {/* Tout cocher d'un clic : sur une liste filtrée, cela ne prend que
                    ce qui est affiché — un secteur, un département, une recherche. */}
                <th className="w-10 px-3">
                  <CaseFiche
                    cochee={toutesCochees}
                    onBascule={() =>
                      setCoches(toutesCochees ? new Set() : new Set(visibles.map((p) => p.id)))
                    }
                    libelle={toutesCochees ? "Tout décocher" : `Tout cocher (${visibles.length})`}
                    visible
                  />
                </th>
                <EnTete colonne="creee" libelle="Créée" tri={tri} onTrier={trierPar} />
                <EnTete colonne="nom" libelle="Entreprise" tri={tri} onTrier={trierPar} />
                <EnTete colonne="secteur" libelle="Secteur" tri={tri} onTrier={trierPar} />
                <EnTete colonne="activite" libelle="Activité" tri={tri} onTrier={trierPar} />
                <EnTete colonne="ville" libelle="Ville" tri={tri} onTrier={trierPar} />
                <EnTete colonne="interlocuteur" libelle="Interlocuteur" tri={tri} onTrier={trierPar} />
                <EnTete colonne="salaries" libelle="Salariés" tri={tri} onTrier={trierPar} />
                <EnTete colonne="note" libelle="Note" tri={tri} onTrier={trierPar} aide={EXPLICATION_NOTE} />
                <EnTete colonne="consigne" libelle="Consigne" tri={tri} onTrier={trierPar} aide={EXPLICATION_CONSIGNE} />
                <EnTete colonne="fiabilite" libelle="Fiabilité" tri={tri} onTrier={trierPar} aide={EXPLICATION_FIABILITE} />
                <EnTete colonne="approfondie" libelle="Approfondie" tri={tri} onTrier={trierPar} />
                <th className="px-2" />
              </tr>
            </thead>
            <tbody>
              {visibles.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => void ouvrir(p)}
                  className={cn(
                    "group cursor-pointer border-b border-border last:border-0 hover:bg-muted/30",
                    coches.has(p.id) && "bg-avisdoc-teal/5",
                  )}
                >
                  <td className="px-3" onClick={(e) => e.stopPropagation()}>
                    <CaseFiche cochee={coches.has(p.id)} onBascule={() => cocher(p.id)} libelle={p.name} visible={coches.size > 0} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-[12.5px] text-muted-foreground">
                    <span className="block">{quandArrivee(p.created_at).date}</span>
                    <span className="block text-[11px] opacity-70">{quandArrivee(p.created_at).heure}</span>
                  </td>
                  <td className="px-4 py-2.5 text-[13px] font-semibold text-avisdoc-ink">
                    {!p.opened_at && <span className="mr-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">Nouveau</span>}
                    {p.name}
                  </td>
                  <td className="px-4 py-2.5 text-[13px] text-muted-foreground">
                    {/* Assez large pour que « Travaux publics et BTP » ou « Services
                        administratifs et de soutien » tiennent sur deux lignes : à trois,
                        la rangée se creuse pour rien. */}
                    <span className="block min-w-[10rem]">{secteurLisible(p.sector)}</span>
                  </td>
                  <td className="px-4 py-2.5 text-[13px] text-muted-foreground">
                    {/* Deux lignes au plus : une description de cinq lignes étire la rangée
                        et l'on ne balaie plus la liste. Le texte entier reste dans la fiche,
                        et s'affiche au survol. */}
                    <span className="line-clamp-2 max-w-[22rem]" title={p.activity ?? undefined}>
                      {p.activity || "—"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-[13px] text-muted-foreground">{p.city || "—"}</td>
                  <td className="px-4 py-2.5 text-[13px] text-muted-foreground">{p.contact_name || p.contact_email || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-[13px] text-muted-foreground">
                    {effectifLabel(p.headcount_band) ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge className={tonNote(p.score_total)}>{p.score_total ?? "—"}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    {/* Ce qu'il faut FAIRE. La note dit ce que vaut l'entreprise, la
                        fiabilité ce qu'on en sait ; c'est leur croisement qui se lit
                        d'un coup d'œil dans une liste de deux cents lignes. */}
                    {(() => {
                      const d = decision(p.score_total, maxEvalue(p.score ?? {}));
                      return (
                        <span title={d.action} className={cn("rounded-full px-2 py-0.5 text-[11.5px] font-bold", d.ton)}>
                          {d.libelle}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-2.5 text-[13px] text-muted-foreground">
                    {/* La note attend son barème : le premier sortait toutes les fiches
                        à dix sur dix. La colonne reste, pour dire ce qui manque encore. */}
                    {(p.reliability ?? null) === null ? "—" : `${p.reliability}/10`}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    {/* Une fiche non approfondie n'a ni dossier commercial ni effectif :
                        c'est ce qu'on regarde avant de décider par où commencer. */}
                    {p.enriched_at ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11.5px] font-bold text-emerald-700">
                        <Check className="size-3" />
                        {new Date(p.enriched_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}
                      </span>
                    ) : (
                      <span className="text-[12px] text-muted-foreground">À approfondir</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setAModifier(p)}
                      aria-label={`Modifier ${p.name}`}
                      title="Modifier"
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-avisdoc-teal"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void supprimerUne(p)}
                      aria-label={`Supprimer ${p.name}`}
                      title="Supprimer"
                      className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-rose-700"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
        completer={{ lancer: completerLot, enCours: lot !== null }}
        approfondir={{
          aFaire: selectionnees.filter((p) => !p.enriched_at).length,
          enCours: lot,
          lancer: () => void approfondirLesCoches(),
        }}
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

    </div>
  );
}
