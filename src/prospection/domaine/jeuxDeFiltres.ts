// Générateur de jeux de filtres Sales Navigator, par cercle de cible.
// Les valeurs sont celles à saisir dans l'interface Sales Navigator (fonction
// native de l'outil) ; la liste obtenue s'exporte puis se dépose dans l'import.
import type { TypeCompte } from "../data/types";

export type Filtre = { champ: string; valeurs: string[] };

export type JeuDeFiltres = {
  cle: "courtiers_regionaux" | "intermediaires_qvct" | "mutuelles_grossistes" | "entreprises_exposees";
  cercle: 1 | 2 | 3;
  typeCompte: TypeCompte;
  listeSuggeree: string;
  filtres: Filtre[];
};

/** PR-70 : les jeux de filtres, la région en paramètre. */
export function pr70JeuxDeFiltres(region: string): JeuDeFiltres[] {
  const r = region.trim() || "France";
  return [
    {
      cle: "courtiers_regionaux",
      cercle: 1,
      typeCompte: "courtier",
      listeSuggeree: `Courtiers ${r}`,
      filtres: [
        { champ: "Zone géographique", valeurs: [r] },
        { champ: "Secteur", valeurs: ["Assurances", "Courtage d'assurances", "Conseil en avantages sociaux"] },
        { champ: "Effectif de l'entreprise", valeurs: ["2-10", "11-50"] },
        { champ: "Niveau hiérarchique", valeurs: ["Propriétaire", "Associé", "Directeur", "Vice-président"] },
        { champ: "Mots-clés", valeurs: ["courtier", "santé collective", "prévoyance", "protection sociale"] },
      ],
    },
    {
      cle: "intermediaires_qvct",
      cercle: 2,
      typeCompte: "qvct",
      listeSuggeree: `QVCT ${r}`,
      filtres: [
        { champ: "Zone géographique", valeurs: [r, "France"] },
        { champ: "Secteur", valeurs: ["Bien-être et santé au travail", "Services aux entreprises", "Événementiel"] },
        { champ: "Effectif de l'entreprise", valeurs: ["2-10", "11-50", "51-200"] },
        { champ: "Niveau hiérarchique", valeurs: ["Propriétaire", "Associé", "Directeur", "Responsable"] },
        { champ: "Mots-clés", valeurs: ["QVCT", "QVT", "prévention santé", "semaine de la QVCT", "événementiel d'entreprise"] },
      ],
    },
    {
      cle: "mutuelles_grossistes",
      cercle: 2,
      typeCompte: "mutuelle",
      listeSuggeree: `Mutuelles et grossistes ${r}`,
      filtres: [
        { champ: "Zone géographique", valeurs: ["France"] },
        { champ: "Secteur", valeurs: ["Assurances", "Mutuelles"] },
        { champ: "Effectif de l'entreprise", valeurs: ["51-200", "201-500", "501-1 000", "1 001-5 000"] },
        { champ: "Fonction", valeurs: ["Partenariats", "Développement", "Prévention", "Marketing"] },
        { champ: "Niveau hiérarchique", valeurs: ["Directeur", "Vice-président", "Responsable"] },
        { champ: "Mots-clés", valeurs: ["prévention", "services santé", "partenariats"] },
      ],
    },
    {
      cle: "entreprises_exposees",
      cercle: 3,
      typeCompte: "entreprise",
      listeSuggeree: `Entreprises exposées ${r}`,
      filtres: [
        { champ: "Zone géographique", valeurs: [r] },
        { champ: "Secteur", valeurs: ["BTP", "Agriculture", "Transport et logistique", "Énergie", "Industrie", "Espaces verts", "Collectivités"] },
        { champ: "Effectif de l'entreprise", valeurs: ["201-500", "501-1 000", "1 001-5 000"] },
        { champ: "Fonction", valeurs: ["Ressources humaines", "Santé, sécurité et environnement", "Qualité de vie au travail"] },
        { champ: "Niveau hiérarchique", valeurs: ["Directeur", "Responsable", "Chargé"] },
        { champ: "Ancienneté dans le poste actuel", valeurs: ["Moins d'un an"] },
        { champ: "A changé de poste", valeurs: ["Au cours des 90 derniers jours"] },
      ],
    },
  ];
}

/** PR-71 : texte à copier, une ligne par filtre. */
export function pr71TexteJeuDeFiltres(jeu: JeuDeFiltres): string {
  return jeu.filtres.map((f) => `${f.champ} : ${f.valeurs.join(", ")}`).join("\n");
}
