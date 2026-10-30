// Une publication trouvée par Vigile, telle qu'elle s'affiche dans un rapport ou « En direct » :
// qui, quoi, ce que ça change pour AvisDoc, la source, et pour une entreprise à démarcher, de quoi
// la confier à un commercial.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Archive, ArrowRight, Copy, ExternalLink, Loader2, RotateCcw, Send, Trash2, X } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { Modal } from "../../components/ui";
import { confirmer } from "../../components/Confirmation";
import { chargerMembres, nomLisible } from "../../lib/membres";
import { confierArticle, dateCourte, dateEtHeure, NATURES, nomDeSource, retirerArticle, supprimerArticle, type Article, type StatutEntreprise } from "../../lib/veille";
import { cn } from "@/lib/utils";

const IMPORTANCE: Record<number, { label: string; cls: string }> = {
  3: { label: "À lire", cls: "bg-avisdoc-orange/15 text-avisdoc-orange" },
  2: { label: "Utile", cls: "bg-avisdoc-teal/10 text-avisdoc-teal" },
  1: { label: "Pour mémoire", cls: "bg-muted text-muted-foreground" },
};

/** Le site refuse les robots : la page s'ouvre d'ordinaire, mais on donne de quoi la retrouver par Google. */
function LienProtege({ url }: { url: string }) {
  const copier = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Lien copié. Collez-le dans Google si la page ne s'ouvre pas.");
    } catch {
      toast.error("Le lien n'a pas pu être copié.");
    }
  };
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
      <span>Site protégé : si la page ne s'ouvre pas, collez le lien dans Google.</span>
      <button type="button" onClick={copier} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 font-bold text-avisdoc-ink hover:border-avisdoc-teal hover:text-avisdoc-teal">
        <Copy className="size-3.5" /> Copier le lien
      </button>
    </div>
  );
}

/** Ce qui arrive à une publication qu'on retire : archivée (récupérable), supprimée pour de bon, ou remise. */
export type Retrait = "archivee" | "supprimee" | "remise";

export default function CarteArticle({
  a, noms, demarcher, statut, nouveau, archivee, onConfie, onRetrait,
}: {
  a: Article;
  noms: Map<string, string>;
  /** Une entreprise à démarcher : on peut la confier à un commercial. */
  demarcher: boolean;
  /** Où elle en est chez AvisDoc : déjà cliente, au Pipeline, en Prospection. */
  statut?: StatutEntreprise;
  nouveau?: boolean;
  /** Dans l'onglet « Archivés » : on la remet ou on la supprime. */
  archivee?: boolean;
  onConfie: (prospectId: string, referent: string) => void;
  /** La liste l'enlève (archivée, supprimée) ou la remet (remise). */
  onRetrait: (a: Article, quoi: Retrait) => void;
}) {
  const navigate = useNavigate();
  const [fenetre, setFenetre] = useState(false);
  const [choix, setChoix] = useState(false);
  const [retrait, setRetrait] = useState<null | "archiver" | "supprimer" | "remettre">(null);
  const titre = a.titre_fr || a.titre;
  const archiver = async () => {
    setRetrait("archiver");
    try {
      await retirerArticle(a.id, true);
      setChoix(false);
      onRetrait(a, "archivee");
      toast.success("Publication archivée pour tout le monde. Elle est dans Veille › Archivés.", {
        action: {
          label: "Annuler",
          onClick: () => retirerArticle(a.id, false).then(() => onRetrait(a, "remise"), () => toast.error("Elle n'a pas pu être remise.")),
        },
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "L'archivage a échoué.");
    } finally {
      setRetrait(null);
    }
  };
  const supprimer = async () => {
    setChoix(false);
    const ok = await confirmer({
      titre: `Supprimer définitivement « ${titre} » ?`,
      message: "Elle est effacée pour tout le monde et ne pourra pas être remise. Vigile ne la ramènera plus.",
      action: "Supprimer définitivement",
      definitif: true,
    });
    if (!ok) return;
    setRetrait("supprimer");
    try {
      await supprimerArticle(a.id);
      onRetrait(a, "supprimee");
      toast.success("Publication supprimée définitivement.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "La suppression a échoué.");
      setRetrait(null);
    }
  };
  const remettre = async () => {
    setRetrait("remettre");
    try {
      await retirerArticle(a.id, false);
      onRetrait(a, "remise");
      toast.success("Publication remise dans sa case.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Elle n'a pas pu être remise.");
      setRetrait(null);
    }
  };
  const petitBouton = "inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-[11px] font-bold text-muted-foreground disabled:opacity-50";
  return (
    <li className="px-5 py-4">
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        {a.urgent && <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">À ne pas rater</span>}
        {nouveau && <span className="rounded-full bg-avisdoc-orange px-2 py-0.5 text-[11px] font-bold text-white">Nouveau</span>}
        {a.importance && <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", IMPORTANCE[a.importance]?.cls)}>{IMPORTANCE[a.importance]?.label}</span>}
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">{NATURES[a.nature] ?? a.nature}</span>
        {archivee ? (
          <span className="ml-auto flex gap-1.5">
            <button type="button" onClick={remettre} disabled={retrait !== null} title="Elle revient dans sa case, pour tout le monde." className={cn(petitBouton, "hover:border-avisdoc-teal hover:text-avisdoc-teal")}>
              {retrait === "remettre" ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />} Remettre
            </button>
            <button type="button" onClick={supprimer} disabled={retrait !== null} title="Effacée pour de bon, pour tout le monde." className={cn(petitBouton, "hover:border-red-400 hover:text-red-600")}>
              {retrait === "supprimer" ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />} Supprimer
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setChoix(true)}
            disabled={retrait !== null}
            title="Lue et sans intérêt : l'archiver ou la supprimer, pour tout le monde."
            className={cn(petitBouton, "ml-auto hover:border-red-400 hover:text-red-600")}
          >
            {retrait ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />} Retirer
          </button>
        )}
      </div>
      {a.urgent && a.urgence && <p className="mb-1 text-[13px] font-bold text-red-700 dark:text-red-400">{a.urgence}</p>}
      {a.entreprise && <p className="mb-0.5 text-[12px] font-bold text-avisdoc-teal">{a.entreprise}{a.ville ? ` · ${a.ville}` : ""}</p>}
      <a href={a.url} target="_blank" rel="noreferrer" className="group inline text-[15px] font-bold leading-snug text-avisdoc-ink hover:text-avisdoc-teal">
        {a.titre_fr || a.titre} <ExternalLink className="inline size-3.5 align-baseline text-muted-foreground group-hover:text-avisdoc-teal" />
      </a>
      {a.titre_fr && a.titre_fr !== a.titre && <p className="mt-0.5 text-[12px] italic text-muted-foreground">{a.titre}</p>}
      {a.resume && <p className="mt-1.5 text-[13px] leading-relaxed text-avisdoc-ink">{a.resume}</p>}
      {a.pour_avisdoc && (
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          <span className="font-bold text-avisdoc-ink">Pour AvisDoc :</span> {a.pour_avisdoc}
        </p>
      )}
      <p className="mt-1.5 text-[12px] text-muted-foreground">
        {nomDeSource(a, noms)}{a.publie_le ? ` · publié le ${dateCourte(a.publie_le)}` : ""}
        {a.trie_le && <> · <span className="font-bold text-avisdoc-ink">arrivé dans Vigile le {dateEtHeure(a.trie_le)}</span></>}
      </p>
      {a.lien_protege && <LienProtege url={a.url} />}
      {a.entreprise && statut && <Bandeau statut={statut} onOuvrir={() => navigate(statut.lien)} />}
      {/* Confier seulement une entreprise que personne ne suit encore. */}
      {demarcher && a.entreprise && (!statut || (statut.type === "prospection" && !statut.referent)) && (
        <div className="mt-2.5">
          <button type="button" onClick={() => setFenetre(true)} className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-3.5 py-1.5 text-[12px] font-bold text-white">
            <Send className="size-3.5" /> Confier à un commercial
          </button>
        </div>
      )}
      {choix && (
        <Modal onClose={() => !retrait && setChoix(false)} width={480}>
          <h2 className="mb-1 font-display text-xl font-semibold leading-snug text-avisdoc-ink">Retirer « {titre} » ?</h2>
          <p className="mb-5 text-[13px] leading-relaxed text-muted-foreground">
            Elle disparaît pour tout le monde : écrans, prochains rapports, alertes et réponses de Vigile.
            <br /><b className="text-avisdoc-ink">Archiver</b> : elle part dans l'onglet « Archivés », d'où on la remet d'un clic.
            <br /><b className="text-avisdoc-ink">Supprimer</b> : effacée pour de bon, Vigile ne la ramènera plus.
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" autoFocus disabled={retrait !== null} onClick={() => setChoix(false)} className="rounded-full border border-border px-5 py-2.5 text-sm font-bold text-avisdoc-ink hover:border-avisdoc-ink disabled:opacity-50">Annuler</button>
            <button type="button" disabled={retrait !== null} onClick={archiver} className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
              {retrait === "archiver" ? <Loader2 className="size-4 animate-spin" /> : <Archive className="size-4" />} Archiver
            </button>
            <button type="button" disabled={retrait !== null} onClick={supprimer} className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-rose-700 disabled:opacity-50">
              <Trash2 className="size-4" /> Supprimer
            </button>
          </div>
        </Modal>
      )}
      {fenetre && <FenetreConfier a={a} onFermer={() => setFenetre(false)} onConfie={(id, referent) => { setFenetre(false); onConfie(id, referent); }} />}
    </li>
  );
}

const quand = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "Europe/Paris" });

/**
 * Où en est l'entreprise chez AvisDoc, en gros : déjà cliente ou au Pipeline (on peut communiquer tout de suite
 * sur ce qu'elle a publié), dans Prospection (confiée à qui). Un clic ouvre sa fiche.
 */
function Bandeau({ statut, onOuvrir }: { statut: StatutEntreprise; onOuvrir: () => void }) {
  const suivi = statut.referent ? `suivie par ${nomLisible(statut.referent)}` : "à attribuer";
  const texte =
    statut.type === "client" ? `Déjà cliente d'AvisDoc · ${suivi}`
    : statut.type === "pipeline" ? `Présente dans le Pipeline · ${suivi}`
    : statut.confiee ? `Présente dans Prospection · confiée à ${nomLisible(statut.confiee.referent)} le ${quand(statut.confiee.le)}`
    : `Présente dans Prospection · ${suivi}`;
  const appel = statut.type === "prospection" ? null : "Elle a communiqué sur la santé de ses salariés : une occasion de reprendre contact.";
  return (
    <button
      type="button"
      onClick={onOuvrir}
      className={cn(
        "mt-2.5 flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-colors",
        statut.type === "prospection" ? "border-avisdoc-teal/40 bg-avisdoc-teal/10 hover:bg-avisdoc-teal/15" : "border-avisdoc-orange/50 bg-avisdoc-orange/10 hover:bg-avisdoc-orange/15",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className={cn("block text-[13px] font-bold", statut.type === "prospection" ? "text-avisdoc-teal" : "text-avisdoc-orange")}>{texte}</span>
        {appel && <span className="block text-[12px] text-avisdoc-ink">{appel}</span>}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-bold text-avisdoc-ink">Voir la fiche <ArrowRight className="size-3.5" /></span>
    </button>
  );
}

/** Choisir le commercial : la fiche prospect est créée (ou retrouvée) et il reçoit un mail avec son lien. */
function FenetreConfier({ a, onFermer, onConfie }: { a: Article; onFermer: () => void; onConfie: (prospectId: string, referent: string) => void }) {
  const { user } = useAuth();
  const [membres, setMembres] = useState<string[] | null>(null);
  const [choix, setChoix] = useState(user?.email?.toLowerCase() ?? "");
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    // Si l'on n'est pas soi-même dans la liste, on part du premier commercial : sinon « Confier » resterait grisé.
    chargerMembres().then((l) => {
      setMembres(l);
      setChoix((c) => (l.some((m) => m.toLowerCase() === c) ? c : l[0]?.toLowerCase() ?? ""));
    }).catch(() => setMembres([]));
  }, []);

  const valider = async () => {
    if (!choix || envoi) return;
    setEnvoi(true);
    try {
      const r = await confierArticle(a.id, choix);
      toast.success(
        r.mail === "deja"
          ? `${nomLisible(choix)} suivait déjà cette fiche : pas de nouveau mail.`
          : `${a.entreprise} est confiée à ${nomLisible(choix)}, qui a reçu un mail avec le lien de la fiche.`,
      );
      onConfie(r.prospectId, choix);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "L'envoi a échoué.");
      setEnvoi(false);
    }
  };

  return (
    <Modal onClose={() => !envoi && onFermer()} width={460}>
      <h2 className="mb-1 font-display text-xl font-semibold text-avisdoc-ink">Confier {a.entreprise}</h2>
      <p className="mb-4 text-[13px] text-muted-foreground">
        Vigile crée sa fiche dans Prospection (ou la retrouve si elle existe), la met au nom du commercial choisi, et lui envoie un mail avec le lien.
      </p>
      <label className="block">
        <span className="mb-1.5 block text-[12px] font-bold text-avisdoc-ink">Suivi par</span>
        {membres === null ? (
          <div className="flex items-center gap-2 text-[13px] text-muted-foreground"><Loader2 className="size-4 animate-spin text-avisdoc-teal" /> Chargement…</div>
        ) : (
          <select value={choix} onChange={(e) => setChoix(e.target.value)} className="ad-input w-full min-w-0 rounded-xl border border-border bg-background px-3.5 py-2.5 text-[13px] outline-none focus:border-avisdoc-teal">
            {membres.map((m) => <option key={m} value={m.toLowerCase()}>{nomLisible(m)}</option>)}
          </select>
        )}
      </label>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" disabled={envoi} onClick={onFermer} className="rounded-full px-5 py-2.5 text-sm font-bold text-muted-foreground hover:bg-muted">Annuler</button>
        <button type="button" disabled={!choix || envoi || membres === null || !membres.some((m) => m.toLowerCase() === choix)} onClick={valider} className="ad-btn-accent inline-flex items-center gap-1.5 rounded-full bg-avisdoc-teal px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">
          {envoi ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Confier
        </button>
      </div>
    </Modal>
  );
}
