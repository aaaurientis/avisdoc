// À quel point ce qu'on affiche a été vérifié.
//
// Deux notes valent mieux qu'une, parce qu'elles répondent à deux questions que rien
// ne relie : « est-ce un bon client ? » et « est-ce que ce que je lis est vrai ? ».
// Une entreprise de mille salariés au profil parfait dont l'adresse vient d'une page
// mal lue est un excellent prospect sur une information fausse.
//
// Une première version notait l'ORIGINE des informations. Toutes les fiches du
// registre avaient la même origine : toutes sortaient à dix sur dix. Une note que
// chacun obtient ne dit rien à personne.
//
// Ce qui distingue vraiment deux fiches, c'est le degré de VÉRIFICATION :
//
//   2 — confirmé pour ce site : l'établissement est ouvert aujourd'hui, l'effectif est
//       celui de ce site, l'interlocuteur est nommé sur le site de l'entreprise ;
//   1 — officiel mais extrapolé : l'effectif du groupe appliqué à une agence, le
//       dirigeant du siège donné comme interlocuteur, une page tierce, une adresse
//       qu'on n'a pas revérifiée. Rien de faux, rien de confirmé non plus ;
//   0 — rien ne l'appuie.
//
// La note est la moyenne des informations PRÉSENTES, sur dix. Elle ne mesure pas la
// complétude : qu'une fiche dise peu se lit dans « Approfondie ». Une fiche brute du
// registre tourne autour de sept ; il faut avoir vérifié pour dépasser.

/** Le degré de vérification d'une information. */
export type Niveau = "confirme" | "extrapole" | "sans_source";

const POINTS: Record<Niveau, number> = { confirme: 2, extrapole: 1, sans_source: 0 };

/** Une information affichée, ce qu'on en sait, et d'où on le tient. */
export interface Renseignement {
  /** Ce que c'est, en clair : « Implantation », « Effectif », « Interlocuteur »… */
  quoi: string;
  niveau: Niveau;
  /** Pourquoi ce degré, en quelques mots — c'est ce que le commercial lira. */
  dit: string;
}

export interface Fiabilite {
  /** Sur dix. */
  note: number;
  details: { quoi: string; dit: string; sur: number }[];
}

/**
 * La note des informations présentes. Rien de renseigné : pas de note, plutôt qu'un zéro
 * qui laisserait croire qu'on a vérifié et trouvé faux.
 */
export function fiabilite(rens: Renseignement[]): Fiabilite | null {
  const vrais = rens.filter((r) => r.quoi.trim());
  if (vrais.length === 0) return null;
  const somme = vrais.reduce((t, r) => t + POINTS[r.niveau], 0);
  return {
    note: Math.round((10 * somme) / (2 * vrais.length)),
    details: vrais.map((r) => ({ quoi: r.quoi, dit: r.dit, sur: POINTS[r.niveau] })),
  };
}

/**
 * Ce qu'une fiche sortie du registre avance, et à quel point c'est vérifié.
 *
 * L'identité et l'activité sont des faits légaux : confirmés. L'implantation l'est
 * depuis qu'on écarte les établissements fermés — mais seulement quand un établissement
 * de la zone a répondu ; à défaut on affiche le siège, et le commercial doit le savoir.
 * L'effectif est le point faible : l'annuaire ne le publie par site que pour une fiche
 * sur trois, et le reste est l'effectif du groupe. Une agence de huit personnes dans une
 * société de deux mille ne vaut pas deux mille.
 */
export function duRegistre(p: {
  siren: string | null;
  activityCode: string | null;
  /** Un établissement OUVERT de la zone demandée a répondu (et non le siège par défaut). */
  siteLocalOuvert: boolean;
  city: string | null;
  /** Tranche de ce site précis, « NN » ou vide quand l'annuaire ne la publie pas. */
  bandeDuSite: string | null;
  /** Tranche de l'entreprise entière. */
  bandeEntreprise: string | null;
}): Renseignement[] {
  const r: Renseignement[] = [
    p.siren
      ? { quoi: "Identité", niveau: "confirme", dit: "SIREN au registre officiel" }
      : { quoi: "Identité", niveau: "sans_source", dit: "nom seul, sans identifiant légal" },
  ];

  if (p.city) {
    r.push(
      p.siteLocalOuvert
        ? { quoi: "Implantation", niveau: "confirme", dit: "établissement ouvert, vérifié ce jour" }
        : { quoi: "Implantation", niveau: "extrapole", dit: "siège de l’entreprise, site local non confirmé" },
    );
  }

  if (p.activityCode) r.push({ quoi: "Activité", niveau: "confirme", dit: "code d’activité officiel" });

  const duSite = p.bandeDuSite && p.bandeDuSite !== "NN";
  if (duSite) r.push({ quoi: "Effectif", niveau: "confirme", dit: "effectif publié pour ce site" });
  else if (p.bandeEntreprise) r.push({ quoi: "Effectif", niveau: "extrapole", dit: "effectif du groupe, site non publié" });

  // Ce qu'une fiche non approfondie n'a pas : on le dit, plutôt que de laisser croire
  // qu'on a cherché. Sans ces deux lignes, une fiche brute du registre sortirait à dix.
  r.push({ quoi: "Interlocuteur", niveau: "sans_source", dit: "non recherché — fiche non approfondie" });
  r.push({ quoi: "Moyen de contact", niveau: "sans_source", dit: "non recherché — fiche non approfondie" });
  return r;
}
