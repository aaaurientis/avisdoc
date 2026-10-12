// La fenêtre d'une action, au-dessus de la fiche — reprise du hub Onetip (12/10).
//
// Ce qu'on fait d'une action :
//  · programmer — elle va dans « Actions à venir » et au Planning ;
//  · fait — son compte rendu, parce qu'elle a eu lieu ;
//  · note — juste un texte ;
//  · revoir — une action déjà notée, rouverte : ce qui a eu lieu ne se réécrit pas,
//    on ajoute une précision et on programme la suite.

import { useState } from "react";
import { Loader2, PenLine, X } from "lucide-react";
import { useAuth } from "../../auth/AuthContext";
import { Modal } from "../ui";
import BoutonMicro from "../BoutonMicro";
import { confirmer } from "../Confirmation";
import {
  ajouterEchange,
  ajouterPrecision,
  libelleGenre,
  marquerTraitee,
  modifierEchange,
  supprimerEchange,
  type ClesFiche,
  type Echange,
  type GenreEchange,
  type ModeRdv,
  estColonneRdv,
  rdvEncorePrevu,
  seDeplacer,
} from "../../lib/echanges";
import {
  INVITE,
  RESULTATS,
  SUITES,
  colonneDEntree,
  colonneRdvSiAvance,
  etapeProposee,
  faitEntrerAuPipeline,
  heureISO,
  instant,
  jourISO,
  lienValide,
  prenomDe,
  quandCourt,
} from "../../lib/actions-fiche";
import { cn } from "@/lib/utils";

type Mode = "programmer" | "fait" | "note" | "revoir";

/** Où en est la fiche dans le Pipeline. `null` : une fiche client, hors Pipeline. */
export interface EtapeFiche {
  /** La colonne actuelle ; null pour un prospect pas encore au Pipeline. */
  actuelle: string | null;
  /** Les colonnes de son pipeline, dans l'ordre. */
  colonnes: string[];
}

const champ =
  "ad-input w-full min-w-0 rounded-xl border border-border bg-background px-3.5 py-2.5 text-[13px] outline-none transition-colors focus:border-avisdoc-teal";
const petitChamp =
  "ad-input h-9 w-auto min-w-0 rounded-xl border border-border bg-background px-2.5 text-[13px] outline-none focus:border-avisdoc-teal";
const sousTitre = "mb-1.5 mt-4 text-[12px] font-bold text-muted-foreground";

function Pastille({ actif, onClick, children }: { actif: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-8 rounded-full px-3.5 text-[13px] font-semibold transition-colors",
        actif ? "bg-avisdoc-teal text-white" : "border border-border text-muted-foreground hover:border-avisdoc-teal hover:text-avisdoc-ink",
      )}
    >
      {children}
    </button>
  );
}

/** L'heure ronde qui vient : on propose, on ne fait pas saisir. */
const prochaineHeure = () => {
  const d = new Date(Date.now() + 3_600_000);
  return `${heureISO(d).slice(0, 2)}:00`;
};

/** En visio, sur place ou chez le client, et le lien de la visio. Le rappel en dépend. */
function ChoixRdv({ mode, setMode, lien, setLien }: { mode: ModeRdv | null; setMode: (m: ModeRdv) => void; lien: string; setLien: (l: string) => void }) {
  return (
    <>
      <div className={sousTitre}>Le rendez-vous</div>
      <div className="flex flex-wrap gap-1.5">
        <Pastille actif={mode === "visio"} onClick={() => setMode("visio")}>En visio</Pastille>
        <Pastille actif={mode === "sur_place"} onClick={() => setMode("sur_place")}>Sur place</Pastille>
        <Pastille actif={mode === "chez_client"} onClick={() => setMode("chez_client")}>Chez le client</Pastille>
      </div>
      {mode === "visio" && (
        <input value={lien} onChange={(e) => setLien(e.target.value)} placeholder="Lien de la visio — https://meet.google.com/…" className={cn(champ, "mt-2")} />
      )}
      {mode && (
        <p className="mt-1.5 text-[12px] text-muted-foreground">
          Rappel par mail {seDeplacer(mode) ? "2 heures avant, pour le trajet" : "15 minutes avant"}.
        </p>
      )}
    </>
  );
}

export default function CompteRendu({
  genre,
  cles,
  personnes,
  cible,
  etape,
  intitule,
  existante,
  depuisPrevue,
  entrer,
  avancer,
  onEcrireAvecMerx,
  onFermer,
  onEnregistre,
}: {
  genre: GenreEchange;
  cles: ClesFiche;
  /** Les interlocuteurs de la fiche, le principal d'abord. */
  personnes: string[];
  /** L'interlocuteur proposé par défaut. */
  cible: string;
  etape: EtapeFiche | null;
  /** Un intitulé déjà choisi : une proposition faite à un client, par exemple. */
  intitule?: string;
  /** L'action déjà notée qu'on rouvre. */
  existante?: Echange | null;
  /** L'action programmée dont on fait le compte rendu. */
  depuisPrevue?: Echange | null;
  /** Prospect hors Pipeline : l'y fait entrer, à cette colonne, et rend ses nouvelles clés. */
  entrer?: (colonne: string) => Promise<ClesFiche>;
  /** Affaire : la passe à cette colonne. */
  avancer?: (colonne: string) => Promise<void>;
  /** Merx rédige un e-mail ; reçoit ce qu'on veut dire. */
  onEcrireAvecMerx?: (intention: string) => Promise<void> | void;
  onFermer: () => void;
  onEnregistre: () => void;
}) {
  const { user } = useAuth();
  const replanifie = Boolean(existante?.prevu && !existante.traite_le);
  const [mode, setMode] = useState<Mode>(
    existante ? (replanifie ? "programmer" : "revoir") : depuisPrevue ? "fait" : genre === "note" ? "note" : "programmer",
  );
  const quoi: GenreEchange = existante?.kind ?? depuisPrevue?.kind ?? genre;
  const resultats = mode === "fait" ? (RESULTATS[quoi] ?? null) : null;
  const [resultat, setResultat] = useState<string | null>(null);
  const [contenu, setContenu] = useState(replanifie ? (existante?.detail ?? "") : intitule ?? "");
  const [avec, setAvec] = useState(existante ? (existante.avec ?? "") : (depuisPrevue?.avec ?? cible));
  const debut = existante ? new Date(existante.au) : new Date();
  const [jour, setJour] = useState(replanifie ? jourISO(debut) : mode === "fait" ? jourISO(new Date()) : jourISO(new Date()));
  const [heure, setHeure] = useState(replanifie ? heureISO(debut) : mode === "fait" ? heureISO(new Date()) : prochaineHeure());
  const [rdvMode, setRdvMode] = useState<ModeRdv | null>(replanifie ? (existante?.rdv_mode ?? null) : null);
  const [rdvLien, setRdvLien] = useState(replanifie ? (existante?.rdv_lien ?? "") : "");
  const [suite, setSuite] = useState<GenreEchange | null>(null);
  const [suiteMode, setSuiteMode] = useState<ModeRdv | null>(null);
  const [suiteLien, setSuiteLien] = useState("");
  const [suiteLe, setSuiteLe] = useState("");
  const [suiteHeure, setSuiteHeure] = useState(prochaineHeure);
  const [etapeOk, setEtapeOk] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [ecriture, setEcriture] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const changerMode = (m: Mode) => {
    setMode(m);
    setErreur(null);
    setJour(jourISO(new Date()));
    setHeure(m === "fait" ? heureISO(new Date()) : prochaineHeure());
  };

  const aujourdhui = jourISO(new Date());
  const auPipeline = Boolean(etape?.actuelle);
  const propose = mode === "fait" && etape ? etapeProposee(quoi, resultat, suite, etape.actuelle, etape.colonnes) : null;
  // Un rendez-vous pris (programmé, à suivre, fait ou reporté) : la fiche passe en « RDV », sans demander.
  const rdvPris =
    (mode === "programmer" && quoi === "rdv" && !replanifie) ||
    ((mode === "fait" || mode === "revoir") && suite === "rdv") ||
    (mode === "fait" && quoi === "rdv" && (resultat === "Fait" || resultat === "Reporté"));
  const versRdv = rdvPris && etape ? colonneRdvSiAvance(etape.actuelle, etape.colonnes) : null;
  const proposee = propose === versRdv ? null : propose;
  // Hors Pipeline, mettre une action sur le prospect l'y fait entrer.
  const entree = Boolean(entrer) && !auPipeline && (mode === "fait" || mode === "programmer") && !existante && faitEntrerAuPipeline(quoi);
  const colonneEntree = versRdv ?? (etape ? colonneDEntree(mode === "fait", etape.colonnes) : "Contacté");
  const aProposer = proposee && !(entree && proposee === colonneEntree) ? proposee : null;
  // Rendez-vous annulé : la fiche retournera dans sa colonne d'avant (s'il n'en reste pas d'autre).
  const retourSiAnnule =
    depuisPrevue?.kind === "rdv" && resultat === "Annulé" && suite !== "rdv" && estColonneRdv(etape?.actuelle) ? depuisPrevue.colonne_avant : null;
  const avecQui = (mode === "programmer" || mode === "fait") && personnes.length > 0;
  const par = user?.email ?? "";

  const enregistrer = async () => {
    if (envoi) return;
    if (mode === "note" && !contenu.trim()) return setErreur("Écrivez la note.");
    if (mode === "revoir" && !contenu.trim() && !suite) return setErreur("Ajoutez une précision ou programmez une action.");
    if ((mode === "programmer" || mode === "fait") && !jour) return setErreur("Choisissez le jour.");
    if (mode === "programmer" && !heure) return setErreur("Choisissez l’heure : le rappel par mail en dépend.");
    if (mode === "programmer" && !replanifie && jour < aujourdhui) return setErreur("Une action programmée est pour aujourd’hui ou plus tard.");
    if (mode === "fait" && jour > aujourdhui) return setErreur("Une action faite ne peut pas être dans le futur : programmez-la plutôt.");
    if (resultats && !resultat) return setErreur("Choisissez ce que ça a donné.");
    if (mode === "fait" && !resultats && quoi !== "email" && !contenu.trim()) return setErreur("Dites ce qui s’est passé.");
    if (suite && !suiteLe) return setErreur("Choisissez le jour de l’action suivante.");
    if (suite && !suiteHeure) return setErreur("Choisissez l’heure de l’action suivante.");
    if (mode === "programmer" && quoi === "rdv" && !rdvMode) return setErreur("En visio, sur place ou chez le client ?");
    if (suite === "rdv" && !suiteMode) return setErreur("Le rendez-vous suivant : en visio, sur place ou chez le client ?");
    if (!lienValide(rdvLien) || !lienValide(suiteLien)) return setErreur("Le lien de la visio doit commencer par https://");

    setEnvoi(true);
    setErreur(null);
    try {
      const destinataire = avecQui ? avec : null;
      // Le rendez-vous qui fait passer la fiche en « RDV » retient d'où elle venait.
      const colonneAvant = versRdv ? (etape?.actuelle ?? etape?.colonnes[0] ?? null) : null;
      const programmerSuite = async (c: ClesFiche) => {
        if (!suite) return;
        await ajouterEchange(c, {
          kind: suite,
          titre: `${libelleGenre(suite)} prévu`,
          detail: "",
          au: instant(suiteLe, suiteHeure),
          par,
          prevu: true,
          avec: destinataire,
          rdvMode: suite === "rdv" ? suiteMode : null,
          rdvLien: suite === "rdv" ? suiteLien : null,
          colonneAvant: suite === "rdv" ? colonneAvant : null,
        });
      };

      if (existante) {
        if (replanifie) {
          await modifierEchange(existante.id, {
            titre: existante.titre,
            detail: contenu,
            au: instant(jour, heure),
            avec: destinataire,
            ...(quoi === "rdv" ? { rdvMode, rdvLien } : {}),
          });
        } else {
          if (contenu.trim()) await ajouterPrecision(existante, contenu, prenomDe(par) || par);
          await programmerSuite(cles);
          if (versRdv && avancer) await avancer(versRdv);
        }
        onEnregistre();
        return;
      }

      // Le prospect entre d'abord au Pipeline : l'action se range sur l'affaire.
      let c = cles;
      if (entree && entrer) c = await entrer(!versRdv && aProposer && etapeOk && mode === "fait" ? aProposer : colonneEntree);

      if (mode === "programmer") {
        await ajouterEchange(c, {
          kind: quoi,
          titre: intitule?.trim() || `${libelleGenre(quoi)} prévu`,
          detail: contenu,
          au: instant(jour, heure),
          par,
          prevu: true,
          avec: destinataire,
          rdvMode: quoi === "rdv" ? rdvMode : null,
          rdvLien: quoi === "rdv" ? rdvLien : null,
          colonneAvant,
        });
        if (!entree && versRdv && avancer) await avancer(versRdv);
        onEnregistre();
        return;
      }

      await ajouterEchange(c, {
        kind: quoi,
        titre: mode === "note" ? "Note" : intitule?.trim() || libelleGenre(quoi),
        detail: contenu,
        au: mode === "note" ? new Date().toISOString() : instant(jour, heure),
        par,
        prevu: false,
        resultat,
        avec: destinataire,
      });
      if (depuisPrevue) await marquerTraitee(depuisPrevue.id);
      await programmerSuite(c);
      if (!entree && avancer) {
        if (versRdv) await avancer(versRdv);
        else if (aProposer && etapeOk) await avancer(aProposer);
      }
      // Le rendez-vous est annulé : la fiche repart dans sa colonne d'avant. Le compte
      // rendu « Annulé », lui, reste dans l'historique (Olivier, 12/10).
      const avant = depuisPrevue?.colonne_avant;
      if (
        depuisPrevue?.kind === "rdv" && resultat === "Annulé" && avant && avancer &&
        c.clientId && estColonneRdv(etape?.actuelle) && !(await rdvEncorePrevu(c.clientId))
      )
        await avancer(avant);
      onEnregistre();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "L’enregistrement a échoué.");
    } finally {
      setEnvoi(false);
    }
  };

  const supprimer = async () => {
    if (!existante || envoi) return;
    if (!(await confirmer({ titre: `Supprimer cette action (${libelleGenre(quoi)} prévu) ?`, message:
          quoi === "rdv" && estColonneRdv(etape?.actuelle)
            ? "Elle disparaît de la fiche et du Planning, et la fiche retourne dans la colonne où elle était."
            : "Elle disparaît de la fiche et du Planning.",
      }))
    )
      return;
    setEnvoi(true);
    try {
      const retour = await supprimerEchange(existante.id);
      // Le rendez-vous retiré, l'affaire retourne dans la colonne où elle était.
      if (retour && avancer && estColonneRdv(etape?.actuelle)) await avancer(retour.colonne);
      onEnregistre();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "La suppression a échoué.");
      setEnvoi(false);
    }
  };

  const titre = existante
    ? replanifie
      ? `${libelleGenre(quoi)} prévu`
      : libelleGenre(quoi)
    : depuisPrevue
      ? `${libelleGenre(quoi)} — compte rendu`
      : libelleGenre(quoi);

  return (
    <Modal onClose={onFermer} width={760}>
      <div className="flex items-center gap-3 border-b border-border pb-3">
        <h2 className="flex-1 font-display text-xl font-semibold text-avisdoc-ink">{titre}</h2>
        <button type="button" onClick={onFermer} aria-label="Fermer" className="rounded-lg p-1.5 text-muted-foreground hover:text-avisdoc-ink">
          <X className="size-5" />
        </button>
      </div>

      {!existante && !depuisPrevue && mode !== "note" && (
        <div className="mt-3 flex gap-1.5">
          <Pastille actif={mode === "programmer"} onClick={() => changerMode("programmer")}>À programmer</Pastille>
          <Pastille actif={mode === "fait"} onClick={() => changerMode("fait")}>Déjà fait</Pastille>
        </div>
      )}

      {/* Une action notée, rouverte : ce qui a eu lieu, en lecture. */}
      {mode === "revoir" && existante && (
        <div className="mt-3 rounded-2xl bg-muted/60 px-4 py-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-avisdoc-ink">
            <span>
              <strong>{existante.kind === "note" ? "Écrite le" : "Fait le"}</strong> {quandCourt(existante.au)} · {heureISO(new Date(existante.au))}
            </span>
            {existante.resultat && (
              <span>
                <strong>Résultat</strong> {existante.resultat}
              </span>
            )}
            {existante.avec && (
              <span>
                <strong>Avec</strong> {existante.avec}
              </span>
            )}
            {existante.par && <span className="text-muted-foreground">par {prenomDe(existante.par)}</span>}
          </div>
          {existante.titre && existante.titre !== libelleGenre(existante.kind) && existante.titre !== "Note" && (
            <p className="mt-2 text-[13.5px] font-semibold text-avisdoc-ink">{existante.titre}</p>
          )}
          <p className={cn("mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed", existante.detail ? "text-avisdoc-ink" : "text-muted-foreground")}>
            {existante.detail || "Pas de compte rendu écrit."}
          </p>
          <p className="mt-2 text-[11.5px] text-muted-foreground">Enregistré : ce texte ne se modifie pas. Ajoutez une précision en dessous.</p>
        </div>
      )}

      {(mode === "programmer" || mode === "fait") && (
        <>
          <div className={sousTitre}>{mode === "programmer" ? "Prévu le" : "Fait le"}</div>
          <div className="flex flex-wrap gap-1.5">
            <input
              type="date"
              value={jour}
              min={mode === "programmer" && !replanifie ? aujourdhui : undefined}
              max={mode === "fait" ? aujourdhui : undefined}
              onChange={(e) => setJour(e.target.value)}
              aria-label="Jour"
              className={petitChamp}
            />
            <input type="time" value={heure} onChange={(e) => setHeure(e.target.value)} aria-label="Heure" className={petitChamp} />
          </div>
        </>
      )}

      {mode === "programmer" && quoi === "rdv" && <ChoixRdv mode={rdvMode} setMode={setRdvMode} lien={rdvLien} setLien={setRdvLien} />}

      {/* Un mail pas encore écrit : Merx le rédige, on l'envoie, puis on note l'envoi. */}
      {quoi === "email" && !existante && onEcrireAvecMerx && (
        <button
          type="button"
          disabled={ecriture}
          onClick={async () => {
            if (ecriture) return;
            setEcriture(true);
            try {
              await onEcrireAvecMerx(contenu.trim());
            } finally {
              setEcriture(false);
            }
          }}
          className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-[12.5px] font-bold text-avisdoc-ink transition-colors hover:border-avisdoc-teal disabled:cursor-wait disabled:opacity-60"
        >
          {ecriture ? <Loader2 className="size-3.5 animate-spin" /> : <PenLine className="size-3.5" />}
          {ecriture ? "Merx écrit… une trentaine de secondes" : "Écrire un e-mail personnalisé avec Merx"}
        </button>
      )}

      {avecQui && (
        <>
          <div className={sousTitre}>Avec qui</div>
          <select value={avec} onChange={(e) => setAvec(e.target.value)} className={cn(champ, "h-10 py-0")}>
            <option value="">—</option>
            {personnes.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
            {avec && !personnes.includes(avec) && <option value={avec}>{avec}</option>}
          </select>
        </>
      )}

      {resultats && (
        <>
          <div className={sousTitre}>Ça a donné quoi ?</div>
          <div className="flex flex-wrap gap-1.5">
            {resultats.map((x) => (
              <Pastille
                key={x}
                actif={resultat === x}
                onClick={() => {
                  setResultat(x);
                  setErreur(null);
                }}
              >
                {x}
              </Pastille>
            ))}
          </div>
        </>
      )}

      <div className={cn(sousTitre, "flex items-center gap-2")}>
        <span className="flex-1">
          {mode === "note"
            ? "La note"
            : mode === "programmer"
              ? "À préparer, à dire (facultatif)"
              : mode === "revoir"
                ? "Ajouter une précision"
                : "Compte rendu — ce qui s’est dit"}
        </span>
        <BoutonMicro onTexte={(t) => setContenu((c) => (c.trim() ? `${c.trim()} ${t}` : t))} />
      </div>
      <textarea
        value={contenu}
        onChange={(e) => setContenu(e.target.value)}
        rows={7}
        placeholder={mode === "programmer" ? "Rappeler pour la présentation, apporter les tarifs…" : (INVITE[quoi] ?? "Ce qui s’est passé…")}
        className={cn(champ, "resize-y leading-relaxed")}
      />

      {(mode === "fait" || mode === "revoir") && (
        <>
          <div className={sousTitre}>Et après ? Programmer une action</div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Pastille actif={suite === null} onClick={() => setSuite(null)}>Rien</Pastille>
            {SUITES.map((t) => (
              <Pastille key={t} actif={suite === t} onClick={() => setSuite(t)}>
                {libelleGenre(t)}
              </Pastille>
            ))}
          </div>
          {suite && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <input type="date" value={suiteLe} min={aujourdhui} onChange={(e) => setSuiteLe(e.target.value)} aria-label="Jour prévu" className={petitChamp} />
              <input type="time" value={suiteHeure} onChange={(e) => setSuiteHeure(e.target.value)} aria-label="Heure prévue" className={petitChamp} />
            </div>
          )}
          {suite === "rdv" && <ChoixRdv mode={suiteMode} setMode={setSuiteMode} lien={suiteLien} setLien={setSuiteLien} />}
        </>
      )}

      {(entree || aProposer || versRdv || retourSiAnnule) && (
        <div className="mt-4 rounded-xl bg-muted/60 px-3 py-2.5 text-[12.5px] leading-snug text-muted-foreground">
          {entree && <div>La fiche entrera au Pipeline{!versRdv && aProposer && etapeOk ? "" : `, en « ${colonneEntree} »`}.</div>}
          {!entree && versRdv && <div className="font-semibold text-avisdoc-ink">Rendez-vous pris : la fiche passera en « {versRdv} ».</div>}
          {retourSiAnnule && (
            <div className="font-semibold text-avisdoc-ink">
              Rendez-vous annulé : la fiche retournera en « {retourSiAnnule} ». L’annulation reste dans l’historique.
            </div>
          )}
          {aProposer && (
            <label className={cn("flex cursor-pointer items-center gap-2 font-semibold text-avisdoc-ink", entree && "mt-1.5")}>
              <input type="checkbox" checked={etapeOk} onChange={(e) => setEtapeOk(e.target.checked)} className="size-4 accent-avisdoc-teal" />
              Passer la fiche en « {aProposer} »
            </label>
          )}
        </div>
      )}

      {mode === "programmer" && <p className="mt-3 text-[12px] text-muted-foreground">Elle apparaîtra aussi dans le Planning, au jour prévu.</p>}

      {erreur && <p className="mt-3 rounded-xl bg-rose-50 px-3.5 py-2.5 text-[12.5px] font-semibold text-rose-700">{erreur}</p>}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => void enregistrer()}
          disabled={envoi}
          className="ad-btn-accent inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-avisdoc-teal text-[14px] font-bold text-white disabled:opacity-60"
        >
          {envoi && <Loader2 className="size-4 animate-spin" />}
          {mode === "programmer" && !existante ? "Programmer" : "Enregistrer"}
        </button>
        {replanifie && (
          <button
            type="button"
            onClick={() => void supprimer()}
            disabled={envoi}
            className="h-11 rounded-full border border-rose-200 px-5 text-[13.5px] font-bold text-rose-700 transition-colors hover:border-rose-400 disabled:opacity-60"
          >
            Supprimer
          </button>
        )}
      </div>
    </Modal>
  );
}
