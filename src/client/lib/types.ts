export type NiveauAcces = "public" | "client";
export type PhaseCampagne =
  | "cadrage" | "annonce" | "relance" | "preparation" | "jour-j" | "bilan";

export interface GeneratedDoc {
  id: string;
  client_id: string;
  doc_catalogue_id: string;
  titre: string;
  acces: NiveauAcces;
  phase: PhaseCampagne;
  format: string;
  version: string;
  storage_bucket: string;
  storage_path: string;
}

export const PHASES: { valeur: PhaseCampagne; libelle: string }[] = [
  { valeur: "cadrage", libelle: "Cadrage" },
  { valeur: "annonce", libelle: "Annonce" },
  { valeur: "relance", libelle: "Relance" },
  { valeur: "preparation", libelle: "Préparation" },
  { valeur: "jour-j", libelle: "Jour J" },
  { valeur: "bilan", libelle: "Bilan" },
];
