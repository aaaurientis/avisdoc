// Sous-ensemble des tables Supabase utile à l'espace client.

export type NiveauAcces = "public" | "client" | "hds";
export type PhaseCampagne =
  | "cadrage" | "annonce" | "relance" | "preparation" | "jour-j" | "bilan";

export interface DocumentGenere {
  id: string;
  client_id: string;
  doc_catalogue_id: string;
  titre: string;
  acces: NiveauAcces;
  logo_client: boolean;
  phase: PhaseCampagne;
  format: string;
  version: string;
  storage_bucket: string;
  storage_path: string;
  octets: number | null;
  genere_le: string;
}

export const PHASES: { valeur: PhaseCampagne; libelle: string }[] = [
  { valeur: "cadrage", libelle: "Cadrage" },
  { valeur: "annonce", libelle: "Annonce" },
  { valeur: "relance", libelle: "Relance" },
  { valeur: "preparation", libelle: "Préparation" },
  { valeur: "jour-j", libelle: "Jour J" },
  { valeur: "bilan", libelle: "Bilan" },
];
