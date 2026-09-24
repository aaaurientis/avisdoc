// La note de fiabilité : peut-on croire ce qui est écrit sur la fiche ?
//
// Elle ne juge pas l'entreprise — c'est le rôle de la note sur cent. Elle juge ce que
// la fiche avance, et les deux ne se compensent jamais.
//
// Trois versions ont échoué dans la même journée, pour la même raison : on notait des
// fiches vides. Une fiche sans interlocuteur, sans téléphone et sans site sortait à dix
// sur dix parce que son code d'activité était confirmé — et personne ne lit cela
// autrement que « cette fiche est parfaite ».
//
// Le barème n'a donc de sens que depuis que la recherche remplit vraiment la fiche :
// le registre pour l'identité et les dirigeants, Pappers pour le site et le téléphone,
// Google pour le standard. Huit informations, notées présentes OU ABSENTES :
//
//   2 points — deux sources indépendantes disent la même chose
//   1 point  — une seule source sérieuse le dit
//   0 point  — rien ne l'appuie, ou l'information manque
//
// Et surtout : pas de note du tout quand il n'y a rien à noter. Une fiche sans identité
// ni activité n'obtient pas une mauvaise note, elle n'en obtient aucune.

export type Degre = 0 | 1 | 2;

export interface Ligne {
  /** Ce que c'est, en clair : « Identité », « Téléphone »… */
  quoi: string;
  sur: Degre;
  /** D'où ça vient, ou pourquoi ça manque — c'est ce que le commercial lira. */
  dit: string;
}

export interface Fiabilite {
  note: number;
  details: Ligne[];
}

/** Les huit informations attendues d'une fiche exploitable. */
export function fiabilite(lignes: Ligne[]): Fiabilite | null {
  // Rien d'établi : pas de note. Noter le vide, c'est inventer.
  if (lignes.every((l) => l.sur === 0)) return null;
  return {
    note: Math.round((10 * lignes.reduce((t, l) => t + l.sur, 0)) / (2 * lignes.length)),
    details: lignes,
  };
}

/** Ce qu'une fiche issue de la recherche peut avancer, et avec quelle assurance. */
export function deLaRecherche(f: {
  siren: string | null;
  villeConfirmee: boolean;
  activite: string | null;
  effectifDuSite: boolean;
  effectif: string | null;
  site: string | null;
  siteRecoupe: boolean;
  dirigeant: string | null;
  dirigeantRecoupe: boolean;
  email: string | null;
  telephone: string | null;
  telephoneRecoupe: boolean;
}): Ligne[] {
  const manque = "non trouvé — l’approfondissement ira le chercher";
  return [
    f.siren
      ? { quoi: "Identité", sur: 2, dit: "SIREN au registre officiel de l’État" }
      : { quoi: "Identité", sur: 0, dit: "aucun identifiant légal" },
    f.villeConfirmee
      ? { quoi: "Implantation", sur: 2, dit: "établissement ouvert, vérifié au registre ce jour" }
      : { quoi: "Implantation", sur: 1, dit: "siège de l’entreprise, site local non confirmé" },
    f.activite
      ? { quoi: "Activité", sur: 2, dit: "code d’activité officiel" }
      : { quoi: "Activité", sur: 0, dit: "activité inconnue" },
    f.effectifDuSite
      ? { quoi: "Effectif", sur: 2, dit: "publié pour ce site précis" }
      : f.effectif
        ? { quoi: "Effectif", sur: 1, dit: "effectif de l’entreprise entière — celui du site n’est pas publié" }
        : { quoi: "Effectif", sur: 0, dit: "effectif non publié" },
    f.site
      ? { quoi: "Site web", sur: f.siteRecoupe ? 2 : 1, dit: f.siteRecoupe ? "deux sources concordent" : "une seule source" }
      : { quoi: "Site web", sur: 0, dit: manque },
    f.dirigeant
      ? {
          quoi: "Interlocuteur",
          sur: f.dirigeantRecoupe ? 2 : 1,
          dit: f.dirigeantRecoupe
            ? "dirigeant confirmé par deux sources — reste à trouver le service concerné"
            : "dirigeant au registre — il décide, mais il faudra qu’il transmette",
        }
      : { quoi: "Interlocuteur", sur: 0, dit: manque },
    f.email
      ? { quoi: "E-mail", sur: 1, dit: "adresse publiée, non recoupée" }
      : { quoi: "E-mail", sur: 0, dit: manque },
    f.telephone
      ? {
          quoi: "Téléphone",
          sur: f.telephoneRecoupe ? 2 : 1,
          dit: f.telephoneRecoupe ? "deux sources donnent le même numéro" : "une seule source",
        }
      : { quoi: "Téléphone", sur: 0, dit: manque },
  ];
}
