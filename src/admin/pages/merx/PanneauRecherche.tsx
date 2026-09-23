// Composer une recherche sans la rédiger.
//
// Les « pistes à explorer » proposaient des croisements que personne n'avait demandés :
// on les lisait, on ne les lançait jamais. Ce panneau fait l'inverse — c'est le
// commercial qui dit ce qu'il cherche, en quatre clics, sans formuler de phrase.
//
// Deux natures d'éléments, et la distinction est le cœur du sujet :
//
//   • les MENUS restreignent : un métier, une zone, une taille. Ils partent au
//     registre officiel et décident qui entre dans la liste.
//
//   • les MARQUEURS ne restreignent RIEN. Une entreprise qui ne publie pas de
//     démarche RSE mais remplit tout le reste doit apparaître : le marqueur dit
//     seulement ce qu'on préfère, pour l'ordre et pour l'approfondissement. Une
//     préférence qui exclut n'est plus une préférence, c'est un filtre déguisé.

import { useState } from "react";
import { Loader2, Plus, Search, X } from "lucide-react";
import { SectionLabel } from "../../components/ui";
import { cn } from "@/lib/utils";

/**
 * Les secteurs d'activité.
 *
 * Pas des métiers : « couvreur » ou « terrassier » sont trop fins, il y en a des
 * centaines et on ne s'y retrouve pas dans un menu. Un secteur suffit à lancer, et
 * la liste se filtre ensuite sur l'activité précise, colonne par colonne.
 *
 * Les secteurs qu'AvisDoc démarche le plus sont en tête ; les autres suivent, car
 * rien n'interdit de chercher ailleurs.
 */
const SECTEURS: { groupe: string; valeurs: string[] }[] = [
  {
    groupe: "Travail en extérieur",
    valeurs: [
      "Travaux publics et BTP",
      "Terrassement et gros œuvre",
      "Couverture et étanchéité",
      "Bâtiment second œuvre",
      "Espaces verts et paysagistes",
      "Voirie et assainissement",
      "Collectivités et administrations",
    ],
  },
  {
    groupe: "Agriculture et forêt",
    valeurs: [
      "Agriculture et grandes cultures",
      "Viticulture et arboriculture",
      "Maraîchage et horticulture",
      "Élevage",
      "Exploitation forestière et sylviculture",
      "Coopératives et services agricoles",
      "Pêche et aquaculture",
    ],
  },
  {
    groupe: "Santé et beauté",
    valeurs: [
      "Instituts de beauté et spas",
      "Coiffure",
      "Pharmacies et parapharmacies",
      "Cabinets médicaux et dermatologie",
      "Laboratoires d’analyses",
      "Cliniques et hôpitaux",
      "Maisons de retraite et EHPAD",
      "Fabrication de matériel médical",
      "Industrie pharmaceutique et cosmétique",
      "Salles de sport et bien-être",
    ],
  },
  {
    groupe: "Industrie et énergie",
    valeurs: [
      "Industrie et fabrication",
      "Agroalimentaire",
      "Métallurgie et travail des métaux",
      "Automobile et équipementiers",
      "Bois, papier et ameublement",
      "Plastique, caoutchouc et chimie",
      "Énergie, eau et déchets",
      "Industries extractives et carrières",
    ],
  },
  {
    groupe: "Commerce et transport",
    valeurs: [
      "Commerce de gros",
      "Commerce de détail",
      "Garages et concessions",
      "Transport de marchandises",
      "Transport de voyageurs",
      "Logistique et entreposage",
      "Hôtellerie et restauration",
    ],
  },
  {
    groupe: "Services",
    valeurs: [
      "Services aux entreprises",
      "Nettoyage et propreté",
      "Sécurité et gardiennage",
      "Intérim et recrutement",
      "Banque et assurance",
      "Immobilier",
      "Informatique et numérique",
      "Enseignement et formation",
      "Arts, sport et loisirs",
      "Services à la personne",
    ],
  },
];

/** Les zones proposées en suggestion : le champ reste libre, rien n'y est imposé. */
const ZONES = [
  "toute la France",
  "Alsace", "Aquitaine", "Auvergne", "Bourgogne", "Bretagne", "Centre-Val de Loire",
  "Grand Est", "Hauts-de-France", "Île-de-France", "Normandie", "Nouvelle-Aquitaine",
  "Occitanie", "Pays de la Loire", "Provence-Alpes-Côte d'Azur", "Auvergne-Rhône-Alpes",
  "Gironde", "Bas-Rhin", "Haut-Rhin", "Hérault", "Bouches-du-Rhône", "Haute-Garonne",
];

/** Les tailles, dites comme un commercial les dit — l'effectif suit entre parenthèses. */
const TAILLES: { valeur: string; label: string; phrase: string }[] = [
  { valeur: "", label: "Toutes tailles", phrase: "" },
  { valeur: "tpe", label: "TPE — moins de 10 salariés", phrase: "de moins de 10 salariés" },
  { valeur: "pme50", label: "PME — 10 à 49 salariés", phrase: "de 10 à 49 salariés" },
  { valeur: "pme", label: "PME — 50 à 249 salariés", phrase: "de plus de 50 salariés" },
  { valeur: "eti", label: "ETI — 250 à 4 999 salariés", phrase: "de plus de 250 salariés" },
  { valeur: "ge", label: "Grande entreprise — 5 000 et plus", phrase: "de plus de 5 000 salariés" },
];

/**
 * Les marqueurs. Ils ne filtrent jamais : ils s'ajoutent à la demande comme une
 * préférence, et servent surtout à l'approfondissement — c'est là qu'on lit le site
 * et qu'on peut savoir si une démarche existe.
 */
const MARQUEURS: { id: string; label: string; phrase: string }[] = [
  { id: "plein_air", label: "Salariés en extérieur", phrase: "dont les salariés travaillent dehors" },
  { id: "peau", label: "Métier de la peau", phrase: "dont le métier touche la peau ou la prévention" },
  { id: "rse", label: "Démarche RSE", phrase: "en privilégiant celles qui publient une démarche RSE" },
  { id: "sse", label: "Politique santé-sécurité", phrase: "en privilégiant celles qui ont une politique santé-sécurité affichée" },
  { id: "multi_sites", label: "Plusieurs sites", phrase: "en privilégiant celles qui ont plusieurs établissements" },
];

/** Qui viser : n'entre pas dans la recherche, oriente le dossier commercial. */
const POSTES: { valeur: string; label: string }[] = [
  { valeur: "", label: "Peu importe" },
  { valeur: "drh", label: "Ressources humaines" },
  { valeur: "qse", label: "QSE / HSE / prévention" },
  { valeur: "rse", label: "RSE / développement durable" },
  { valeur: "dg", label: "Direction générale" },
];

/**
 * Les marqueurs que le commercial ajoute lui-même.
 *
 * La liste livrée ne peut pas tout prévoir : « certifiées MASE », « avec un service
 * de santé interne », « adhérentes à la fédération ». Chacun garde les siens.
 *
 * Gardés sur l'appareil, pas en base : c'est un réglage personnel, il n'a pas à
 * traverser l'équipe ni à attendre une migration. Un navigateur vidé les oublie, et
 * ce n'est pas grave — on les retape en cinq secondes.
 */
const CLE_PERSOS = "avisdoc.merx.marqueurs";

function lirePersos(): { id: string; label: string; phrase: string }[] {
  try {
    const brut = localStorage.getItem(CLE_PERSOS);
    return brut ? (JSON.parse(brut) as { id: string; label: string; phrase: string }[]) : [];
  } catch {
    return [];
  }
}

function ecrirePersos(liste: { id: string; label: string; phrase: string }[]) {
  try {
    localStorage.setItem(CLE_PERSOS, JSON.stringify(liste));
  } catch {
    /* navigation privée, stockage plein : le panneau marche quand même */
  }
}

const champCls =
  "ad-input w-full rounded-xl border border-border bg-background px-3 py-2 text-[12.5px] outline-none transition-colors focus:border-avisdoc-teal";

export default function PanneauRecherche({
  occupe,
  onChercher,
}: {
  occupe: boolean;
  /** Reçoit la demande rédigée : le reste du chemin ne change pas. */
  onChercher: (demande: string) => void;
}) {
  const [secteur, setSecteur] = useState("");
  const [secteurLibre, setSecteurLibre] = useState("");
  const [ou, setOu] = useState("");
  const [taille, setTaille] = useState("");
  const [poste, setPoste] = useState("");
  const [marqueurs, setMarqueurs] = useState<Set<string>>(new Set());
  const [persos, setPersos] = useState(lirePersos);
  const [nouveau, setNouveau] = useState<string | null>(null);

  const tousLesMarqueurs = [...MARQUEURS, ...persos];

  const ajouterMarqueur = () => {
    const texte = (nouveau ?? "").trim();
    if (!texte) {
      setNouveau(null);
      return;
    }
    const ajout = { id: `perso-${Date.now()}`, label: texte, phrase: `en privilégiant : ${texte}` };
    const liste = [...persos, ajout];
    setPersos(liste);
    ecrirePersos(liste);
    setMarqueurs((avant) => new Set(avant).add(ajout.id));
    setNouveau(null);
  };

  const retirerMarqueur = (id: string) => {
    const liste = persos.filter((m) => m.id !== id);
    setPersos(liste);
    ecrirePersos(liste);
    setMarqueurs((avant) => {
      const apres = new Set(avant);
      apres.delete(id);
      return apres;
    });
  };

  const basculer = (id: string) =>
    setMarqueurs((avant) => {
      const apres = new Set(avant);
      if (apres.has(id)) apres.delete(id);
      else apres.add(id);
      return apres;
    });

  const quoi = (secteur === "autre" ? secteurLibre : secteur).trim();
  const pret = quoi.length > 1 && !occupe;

  /** La demande, écrite comme le commercial l'aurait dite. */
  const rediger = (): string => {
    const morceaux = [`Entreprises du secteur ${quoi}`];
    if (ou.trim()) morceaux.push(`en ${ou.trim()}`);
    else morceaux.push("dans toute la France");
    const t = TAILLES.find((x) => x.valeur === taille)?.phrase;
    if (t) morceaux.push(t);
    for (const m of tousLesMarqueurs) if (marqueurs.has(m.id)) morceaux.push(m.phrase);
    const p = POSTES.find((x) => x.valeur === poste);
    if (p?.valeur) morceaux.push(`— interlocuteur à viser : ${p.label.toLowerCase()}`);
    return morceaux.join(" ") + ".";
  };

  const vider = () => {
    setSecteur("");
    setSecteurLibre("");
    setOu("");
    setTaille("");
    setPoste("");
    setMarqueurs(new Set());
  };

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div>
        <SectionLabel>Ce que vous cherchez</SectionLabel>
        <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
          Les menus décident qui entre dans la liste. Les boutons font seulement remonter ce que
          vous préférez — ils n’écartent personne.
        </p>
      </div>

      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
          Secteur d’activité
        </span>
        <select value={secteur} onChange={(e) => setSecteur(e.target.value)} className={cn(champCls, "mt-1")}>
          <option value="">Choisissez un secteur…</option>
          {SECTEURS.map((g) => (
            <optgroup key={g.groupe} label={g.groupe}>
              {g.valeurs.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </optgroup>
          ))}
          <option value="autre">Autre — je précise</option>
        </select>
      </label>

      {secteur === "autre" && (
        <input
          value={secteurLibre}
          onChange={(e) => setSecteurLibre(e.target.value)}
          autoFocus
          placeholder="Fabricants de feux d’artifice, scieries, garages…"
          className={champCls}
        />
      )}

      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
          Où — tapez ou choisissez
        </span>
        <input
          value={ou}
          onChange={(e) => setOu(e.target.value)}
          list="zones-merx"
          placeholder="Région, département, ville… vide = toute la France"
          className={cn(champCls, "mt-1")}
        />
        <datalist id="zones-merx">
          {ZONES.map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
      </label>

      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">Taille</span>
        <select value={taille} onChange={(e) => setTaille(e.target.value)} className={cn(champCls, "mt-1")}>
          {TAILLES.map((t) => (
            <option key={t.valeur} value={t.valeur}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
          Interlocuteur à viser
        </span>
        <select value={poste} onChange={(e) => setPoste(e.target.value)} className={cn(champCls, "mt-1")}>
          {POSTES.map((p) => (
            <option key={p.valeur} value={p.valeur}>
              {p.label}
            </option>
          ))}
        </select>
      </label>

      <div>
        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
          Ce qu’on préfère
        </span>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {tousLesMarqueurs.map((m) => {
            const actif = marqueurs.has(m.id);
            const perso = m.id.startsWith("perso-");
            return (
              <span key={m.id} className="inline-flex items-center">
                <button
                  type="button"
                  onClick={() => basculer(m.id)}
                  aria-pressed={actif}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[11.5px] font-bold transition-colors",
                    actif
                      ? "border-avisdoc-teal bg-avisdoc-teal text-white"
                      : "border-border text-muted-foreground hover:border-avisdoc-teal hover:text-avisdoc-ink",
                    perso && "rounded-r-none border-r-0",
                  )}
                >
                  {m.label}
                </button>
                {perso && (
                  <button
                    type="button"
                    onClick={() => retirerMarqueur(m.id)}
                    aria-label={`Retirer « ${m.label} »`}
                    title="Retirer ce bouton"
                    className={cn(
                      "rounded-full rounded-l-none border border-l-0 py-1.5 pl-1 pr-2.5 transition-colors",
                      actif
                        ? "border-avisdoc-teal bg-avisdoc-teal text-white/80 hover:text-white"
                        : "border-border text-muted-foreground hover:text-rose-600",
                    )}
                  >
                    <X className="size-3" />
                  </button>
                )}
              </span>
            );
          })}

          {nouveau === null ? (
            <button
              type="button"
              onClick={() => setNouveau("")}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-[11.5px] font-bold text-muted-foreground transition-colors hover:border-avisdoc-teal hover:text-avisdoc-ink"
            >
              <Plus className="size-3" /> Ajouter
            </button>
          ) : (
            <input
              value={nouveau}
              onChange={(e) => setNouveau(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") ajouterMarqueur();
                if (e.key === "Escape") setNouveau(null);
              }}
              onBlur={ajouterMarqueur}
              autoFocus
              placeholder="Certifiées MASE, service de santé interne…"
              className="rounded-full border border-avisdoc-teal bg-background px-3 py-1.5 text-[11.5px] outline-none"
            />
          )}
        </div>
      </div>

      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          onClick={() => pret && onChercher(rediger())}
          disabled={!pret}
          className="ad-btn-accent inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-avisdoc-teal px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
        >
          {occupe ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          Chercher
        </button>
        {(quoi || ou || taille || poste || marqueurs.size > 0) && (
          <button
            type="button"
            onClick={vider}
            title="Tout effacer"
            className="rounded-full border border-border p-2 text-muted-foreground transition-colors hover:border-avisdoc-ink hover:text-avisdoc-ink"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {quoi && (
        <p className="rounded-xl bg-muted/60 px-3 py-2 text-[11.5px] leading-snug text-muted-foreground">
          {rediger()}
        </p>
      )}
    </div>
  );
}
