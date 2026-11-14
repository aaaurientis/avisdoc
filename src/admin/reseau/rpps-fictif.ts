// Jeu de données FICTIF pour les tests et la recette du réseau d'aval (lot 1).
// Noms, RPPS, structures et téléphones sont inventés : aucune personne réelle.
// Les colonnes reprennent exactement celles du fichier RPPS « personne-activite ».

import type { LigneRpps } from "../../../supabase/functions/_shared/reseau-rpps";

type Ligne = {
  rpps: string; nom: string; prenom: string; code: string; libelle: string;
  cp: string; commune: string; cc: string; structure: string; id?: string;
  mode?: string; secteur?: string; profession?: number; type?: string; tel?: string;
};

export function ligne(l: Ligne): LigneRpps {
  return {
    "Identifiant PP": Number(l.rpps), // l'API renvoie un nombre
    "Libellé civilité d'exercice": "Docteur",
    "Nom d'exercice": l.nom,
    "Prénom d'exercice": l.prenom,
    "Code profession": l.profession ?? 10,
    "Code type savoir-faire": l.type ?? "S",
    "Code savoir-faire": l.code,
    "Libellé savoir-faire": l.libelle,
    "Libellé mode exercice": l.mode ?? "Lib,indép,artis,com",
    "Raison sociale site": l.structure,
    "Identifiant technique de la structure": l.id ?? "",
    "Numéro Voie (coord. structure)": "12",
    "Libellé type de voie (coord. structure)": "Rue",
    "Libellé Voie (coord. structure)": "DES TESTS",
    "Code postal (coord. structure)": l.cp,
    "Code commune (coord. structure)": l.cc,
    "Libellé commune (coord. structure)": l.commune,
    "Téléphone (coord. structure)": l.tel ?? "",
    "Libellé secteur d'activité": l.secteur ?? "Cabinet individuel",
    "Code Département (structure)": "", // vide dans le vrai fichier
  };
}

const DERM = { code: "SM15", libelle: "Dermatologie et vénéréologie" };

/** Département 38 fictif : 4 médecins importables et 4 lignes à ignorer. */
export const LIGNES_38: LigneRpps[] = [
  // Une dermatologue sur deux lieux du 38 (cabinet + hôpital) : un seul praticien.
  ligne({ rpps: "19900000001", nom: "ARNOUX", prenom: "Claire", ...DERM, cp: "38000", commune: "Grenoble", cc: "38185", structure: "CABINET FICTIF ARNOUX", id: "S1", tel: "0400000001" }),
  ligne({ rpps: "19900000001", nom: "ARNOUX", prenom: "Claire", ...DERM, cp: "38700", commune: "La Tronche", cc: "38516", structure: "CHU FICTIF", id: "F1", mode: "Salarié", secteur: "Etablissement Public de santé" }),
  // Même lieu répété (deux lignes d'activité) : un seul lieu.
  ligne({ rpps: "19900000001", nom: "ARNOUX", prenom: "Claire", ...DERM, cp: "38000", commune: "Grenoble", cc: "38185", structure: "CABINET FICTIF ARNOUX", id: "S1" }),
  // Un ORL sous l'ancien code SM39.
  ligne({ rpps: "19900000002", nom: "BERTIN", prenom: "Paul", code: "SM39", libelle: "Oto-rhino-laryngologie", cp: "38200", commune: "Vienne", cc: "38544", structure: "CLINIQUE FICTIVE", id: "S2" }),
  // Un chirurgien plasticien, aussi qualifié en chirurgie générale : PLAST l'emporte.
  ligne({ rpps: "19900000003", nom: "CARRE", prenom: "Luc", code: "SM05", libelle: "Chirurgie générale", cp: "38300", commune: "Bourgoin-Jallieu", cc: "38053", structure: "CENTRE FICTIF", id: "S3" }),
  ligne({ rpps: "19900000003", nom: "CARRE", prenom: "Luc", code: "SM10", libelle: "Chirurgie plastique reconstructrice et esthétique", cp: "38300", commune: "Bourgoin-Jallieu", cc: "38053", structure: "CENTRE FICTIF", id: "S3" }),
  // Un dermatologue qui exerce aussi dans le 73 : la ligne du 73 n'est pas du 38.
  ligne({ rpps: "19900000004", nom: "DUMAS", prenom: "Eva", ...DERM, cp: "38500", commune: "Voiron", cc: "38563", structure: "CABINET FICTIF DUMAS" }),
  ligne({ rpps: "19900000004", nom: "DUMAS", prenom: "Eva", ...DERM, cp: "73000", commune: "Chambéry", cc: "73065", structure: "CABINET FICTIF SAVOIE" }),
  // À ignorer : chirurgie viscérale (exclue le 14/11), non-médecin, compétence (type C), RPPS invalide.
  ligne({ rpps: "19900000005", nom: "ESTEVE", prenom: "Jean", code: "SM14", libelle: "Chirurgie viscérale et digestive", cp: "38000", commune: "Grenoble", cc: "38185", structure: "CLINIQUE FICTIVE" }),
  ligne({ rpps: "19900000006", nom: "FABRE", prenom: "Anne", ...DERM, profession: 60, cp: "38000", commune: "Grenoble", cc: "38185", structure: "X" }),
  ligne({ rpps: "19900000007", nom: "GARNIER", prenom: "Marc", code: "C15", libelle: "Dermato-vénéréologie", type: "C", cp: "38000", commune: "Grenoble", cc: "38185", structure: "X" }),
  ligne({ rpps: "123", nom: "HUGO", prenom: "Léa", ...DERM, cp: "38000", commune: "Grenoble", cc: "38185", structure: "X" }),
];

/** Corse : les codes postaux 20xxx sont partagés, le code commune départage. */
export const LIGNES_CORSE: LigneRpps[] = [
  ligne({ rpps: "19900000011", nom: "INNOCENTI", prenom: "Marie", ...DERM, cp: "20000", commune: "Ajaccio", cc: "2A004", structure: "CABINET FICTIF AJACCIO" }),
  ligne({ rpps: "19900000012", nom: "JOLY", prenom: "Pierre", ...DERM, cp: "20200", commune: "Bastia", cc: "2B033", structure: "CABINET FICTIF BASTIA" }),
];
