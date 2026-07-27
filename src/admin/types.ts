// Modèles de données du back-office AvisDoc.
// Les identifiants sont des chaînes (uuid côté Supabase, uuid généré côté mock)
// pour que la couche mock et la couche Supabase soient interchangeables.

export type ContactType = "Requérant" | "Expert" | "Réseau d'Aval";
export type ContactStatut = "Accepté" | "En attente" | "Refusé";

/** Annuaire du réseau (requérants, experts, réseau d'aval). */
export interface NetworkContact {
  id: string;
  name: string;
  role: string;
  type: ContactType;
  statut: ContactStatut;
  ville: string;
  adresse: string;
  email: string;
  tel: string;
  last: string; // dernier contact, libellé fr ("12 juil.")
  notes: string;
}

export type Stage = "Nouveau" | "Qualifié" | "Proposition" | "Signé";
export type PropoStatut = "Brouillon" | "Envoyée" | "Acceptée" | "Refusée";
export type DocExt = "PDF" | "DOC" | "XLS";

/** Contact rattaché à un projet CRM. */
export interface ProjectContact {
  id: string;
  /** Nom d'affichage complet (« prénom nom ») — conservé pour compat. */
  name: string;
  prenom: string;
  nom: string;
  role: string;
  email: string;
  tel: string;
}

/** Document partagé au sein d'un projet CRM. */
export interface ProjectDoc {
  id: string;
  name: string;
  ext: DocExt;
  date: string; // libellé fr
}

/** Action de suivi avec échéance. */
export interface Suivi {
  id: string;
  text: string;
  deadline: string | null; // ISO "2026-07-23" ou null
  done: boolean;
  when?: string; // libellé historique quand pas d'échéance
}

/** Projet CRM = une entreprise cliente. */
export interface Client {
  id: string;
  company: string;
  siren: string;
  naf: string;
  adresse: string;
  effectif: string;
  stage: Stage;
  jours: number;
  tarif: number;
  depistes: number;
  orientes: number;
  resultat: string | null;
  statutPropo: PropoStatut;
  contacts: ProjectContact[];
  docs: ProjectDoc[];
  suivis: Suivi[];
}

/** Document dans la gestion documentaire globale. */
export interface DocItem {
  id: string;
  name: string;
  ext: DocExt;
  cat: string;
  size: string;
  date: string;
  owner: string;
  version: number;
}

export interface ActivityItem {
  id: string;
  dot: string; // classe Tailwind du point coloré
  text: string;
  when: string;
}

/** Utilisateur authentifié via Google SSO (@avisdoc.fr). */
export interface AdminUser {
  name: string;
  email: string;
}

/** Résultat d'une recherche entreprise via l'API Pappers. */
export interface PappersResult {
  company: string;
  siren: string;
  naf: string;
  adresse: string;
  effectif: string;
  dirigeant: string;
}
