// Miroir des tables Supabase (voir platform/supabase/migrations).

export type StatutCrm = "prospect" | "en_cours" | "signe" | "clos";
export type NiveauAcces = "public" | "client" | "hds";
export type PhaseCampagne =
  | "cadrage" | "annonce" | "relance" | "preparation" | "jour-j" | "bilan";
export type StatutJob = "en_attente" | "en_cours" | "termine" | "echec";
export type TypeJob = "creation_espace" | "maj_logo";

export interface Client {
  id: string;
  nom: string;
  statut_crm: StatutCrm;
  signe_le: string | null;
  logo_path: string | null;
  logo_sha256: string | null;
  cree_le: string;
  maj_le: string;
}

export interface Domaine {
  id: string;
  client_id: string;
  domaine: string;
  cree_le: string;
}

export interface UtilisateurClient {
  id: string;
  client_id: string;
  auth_user_id: string | null;
  email: string;
  role: string;
  invite_le: string;
  premiere_connexion_le: string | null;
}

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
  logo_sha256: string;
  genere_le: string;
}

export interface GenerationJob {
  id: string;
  client_id: string;
  type: TypeJob;
  statut: StatutJob;
  erreur: string | null;
  cree_le: string;
  demarre_le: string | null;
  fini_le: string | null;
}

export const STATUTS_CRM: { valeur: StatutCrm; libelle: string }[] = [
  { valeur: "prospect", libelle: "Prospect" },
  { valeur: "en_cours", libelle: "En cours" },
  { valeur: "signe", libelle: "Signé" },
  { valeur: "clos", libelle: "Clos" },
];
