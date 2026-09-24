// À quel point ce qu'on affiche est sûr.
//
// Deux notes valent mieux qu'une, parce qu'elles répondent à deux questions que rien
// ne relie : « est-ce un bon client ? » et « est-ce que ce que je lis est vrai ? ».
// Une entreprise de mille salariés au profil parfait dont l'adresse vient d'une page
// mal lue est un excellent prospect sur une information fausse.
//
// La note ne mesure PAS la complétude : une fiche qui ne dit que deux choses, mais les
// tient du registre de l'État, vaut dix sur dix. Qu'elle en dise peu se voit ailleurs —
// c'est la colonne « Approfondie ». Ici on ne juge que ce qui est écrit.
//
// Chaque information affichée porte donc son origine, et l'origine vaut des points :
// le registre et le site officiel de l'entreprise sont des sources qui engagent, une
// page web citée est un indice, une affirmation sans source ne vaut rien. La note est
// la moyenne de ces origines, ramenée sur dix.

/** D'où vient une information, du plus sûr au moins sûr. */
export type Origine =
  | "registre" // annuaire officiel de l'État : identité, siège, effectif, activité
  | "site_officiel" // le site de l'entreprise elle-même
  | "lieu" // fiche d'établissement Google : adresse et standard
  | "page_citee" // une page web que le modèle a réellement consultée
  | "sans_source"; // affirmé sans que rien ne l'appuie

const POINTS: Record<Origine, number> = {
  registre: 2,
  site_officiel: 2,
  lieu: 2,
  page_citee: 1,
  sans_source: 0,
};

const DIT: Record<Origine, string> = {
  registre: "annuaire officiel de l’État",
  site_officiel: "site officiel de l’entreprise",
  lieu: "fiche d’établissement Google",
  page_citee: "page web consultée",
  sans_source: "aucune source",
};

/** Une information affichée et son origine. */
export interface Renseignement {
  /** Ce que c'est, en clair : « Ville », « Interlocuteur », « Téléphone »… */
  quoi: string;
  origine: Origine;
}

export interface Fiabilite {
  /** Sur dix. */
  note: number;
  /** Le détail, pour que le commercial sache quoi croire, ligne par ligne. */
  details: { quoi: string; dit: string; sur: number }[];
}

/**
 * La note des informations présentes. Rien de renseigné : pas de note, plutôt qu'un zéro
 * qui laisserait croire qu'on a vérifié et trouvé faux.
 */
export function fiabilite(rens: Renseignement[]): Fiabilite | null {
  const vrais = rens.filter((r) => r.quoi.trim());
  if (vrais.length === 0) return null;
  const somme = vrais.reduce((t, r) => t + POINTS[r.origine], 0);
  return {
    note: Math.round((10 * somme) / (2 * vrais.length)),
    details: vrais.map((r) => ({ quoi: r.quoi, dit: DIT[r.origine], sur: POINTS[r.origine] })),
  };
}

/**
 * Ce qu'une fiche sortie du registre avance, et d'où elle le tient.
 *
 * Tout vient de l'annuaire de l'État : c'est une fiche courte, mais chaque ligne est
 * tenue par une source publique. Elle mérite dix sur dix tant qu'on n'y ajoute rien.
 */
export function duRegistre(p: {
  siren: string | null;
  city: string | null;
  activity: string | null;
  headcountBand: string | null;
}): Renseignement[] {
  const r: Renseignement[] = [{ quoi: "Identité", origine: p.siren ? "registre" : "sans_source" }];
  if (p.city) r.push({ quoi: "Implantation", origine: "registre" });
  if (p.activity) r.push({ quoi: "Activité", origine: "registre" });
  if (p.headcountBand) r.push({ quoi: "Effectif", origine: "registre" });
  return r;
}
