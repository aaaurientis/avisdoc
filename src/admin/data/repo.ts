// Contrat de la couche d'accès aux données + implémentation « mock » (en mémoire).
//
// Le contexte React possède l'état ; les transitions optimistes y sont calculées.
// Le repository ne fait que charger (load) et persister les deltas. Cette
// séparation rend les modes mock et Supabase strictement interchangeables.

import type {
  Account,
  AccountField,
  ActivityItem,
  Client,
  DocCategory,
  DocItem,
  NetworkContact,
  Pipeline,
  PipelineStage,
  ProjectContact,
  ProjectDoc,
  Suivi,
} from "../types";
import { STAGES_DEFAUT } from "../lib/ui-tokens";
import {
  SEED_ACCOUNTS,
  SEED_ACCOUNT_FIELDS,
  SEED_ACTIVITY,
  SEED_CLIENTS,
  SEED_CONTACTS,
  SEED_DOCS,
  SEED_DOC_TAGS,
  SEED_DOC_TREE,
} from "./seed";

export interface AdminSnapshot {
  contacts: NetworkContact[];
  clients: Client[];
  docs: DocItem[];
  docTree: DocCategory[];
  docTags: string[];
  activity: ActivityItem[];
  /** Colonnes du pipeline, dans l'ordre (migration 0023). */
  stages: PipelineStage[];
  pipelines: Pipeline[];
  /** Fichier client : ses colonnes et ses fiches (migration 0024). */
  accountFields: AccountField[];
  accounts: Account[];
}

export interface AdminRepo {
  load(): Promise<AdminSnapshot>;

  // Annuaire
  createContact(c: NetworkContact): Promise<void>;
  updateContact(c: NetworkContact): Promise<void>;
  deleteContact(id: string): Promise<void>;
  /** Mémorise les coordonnées géocodées d'un contact (cache carte). */
  setContactGeo(id: string, lat: number, lng: number): Promise<void>;

  // Projets CRM
  createClient(c: Client): Promise<void>;
  updateClientFields(id: string, fields: Partial<Client>): Promise<void>;
  addProjectContact(clientId: string, contact: ProjectContact): Promise<void>;
  removeProjectContact(clientId: string, contactId: string): Promise<void>;
  addProjectDoc(clientId: string, doc: ProjectDoc): Promise<void>;
  removeProjectDoc(clientId: string, docId: string): Promise<void>;
  addSuivi(clientId: string, suivi: Suivi): Promise<void>;
  updateSuivi(clientId: string, suiviId: string, done: boolean): Promise<void>;
  removeSuivi(clientId: string, suiviId: string): Promise<void>;

  // Documents (upload réel dans le bucket Storage `admin-documents`)
  createDoc(doc: DocItem, file: File): Promise<void>;
  newDocVersion(doc: DocItem, file: File): Promise<void>;
  /** URL signée du fichier. download=true force le téléchargement,
   *  download=false renvoie une URL affichable en ligne (aperçu). */
  docUrl(doc: DocItem, download?: boolean): Promise<string | null>;
  /** Classe un document dans une sous-catégorie (parent + feuille). */
  setDocCat(id: string, parent: string, sub: string): Promise<void>;
  deleteDoc(id: string, storagePath?: string): Promise<void>;

  // Colonnes du pipeline
  createStage(stage: PipelineStage): Promise<void>;
  /** Renomme la colonne ET les fiches qui la citent : aucune fiche ne reste orpheline. */
  renameStage(id: string, ancien: string, nouveau: string, pipelineId: string): Promise<void>;
  setStageTone(id: string, tone: PipelineStage["tone"]): Promise<void>;
  /** Supprime la colonne après avoir déplacé ses fiches vers `versLabel`. */
  deleteStage(id: string, label: string, versLabel: string | null, pipelineId: string): Promise<void>;

  // ── Les pipelines eux-mêmes (migration 0050) ────────────────────────────
  createPipeline(p: Pipeline, colonnes: PipelineStage[]): Promise<void>;
  updatePipeline(id: string, champs: Partial<Pipeline>): Promise<void>;
  deletePipeline(id: string): Promise<void>;
  reorderStages(ordre: { id: string; position: number }[]): Promise<void>;

  // Fichier client
  createAccount(a: Account): Promise<void>;
  updateAccount(a: Account): Promise<void>;
  deleteAccount(id: string): Promise<void>;
  createField(f: AccountField): Promise<void>;
  renameField(id: string, label: string): Promise<void>;
  moveField(ordre: { id: string; position: number }[]): Promise<void>;
  /** Supprime la colonne ET les valeurs qu'elle portait dans les fiches. */
  deleteField(id: string, key: string): Promise<void>;

  /**
   * Le secteur du prospect d'où vient cette affaire, s'il y en a un.
   * Sert à remplir la fiche client au moment de la signature.
   */
  secteurDuProspect(clientId: string): Promise<string | null>;

  // Réglages — arborescence documentaire à 2 niveaux
  addCategory(name: string): Promise<void>;
  removeCategory(name: string): Promise<void>;
  addSubType(parent: string, name: string): Promise<void>;
  removeSubType(parent: string, name: string): Promise<void>;
  /** Renomme une catégorie EN CASCADE (sous-catégories + documents). */
  renameCategory(oldName: string, newName: string): Promise<void>;
  /** Renomme une sous-catégorie EN CASCADE (documents du même parent). */
  renameSubType(parent: string, oldName: string, newName: string): Promise<void>;
  /** Réordonne les catégories (ordre = liste de noms). */
  reorderCategories(names: string[]): Promise<void>;
  /** Réordonne les sous-catégories d'une catégorie. */
  reorderSubTypes(parent: string, names: string[]): Promise<void>;

  // Tags standardisés
  /** Remplace l'ensemble des tags d'un document. */
  setDocTags(id: string, tags: string[]): Promise<void>;
  addTag(name: string): Promise<void>;
  removeTag(name: string): Promise<void>;
}

/** Implémentation en mémoire : sert le jeu de démo, mutations en no-op persistées. */
export class MockRepo implements AdminRepo {
  async load(): Promise<AdminSnapshot> {
    // Clones profonds pour que l'état applicatif soit indépendant des seeds.
    return {
      contacts: structuredClone(SEED_CONTACTS),
      clients: structuredClone(SEED_CLIENTS),
      docs: structuredClone(SEED_DOCS),
      docTree: structuredClone(SEED_DOC_TREE),
      docTags: [...SEED_DOC_TAGS],
      activity: structuredClone(SEED_ACTIVITY),
      stages: structuredClone(STAGES_DEFAUT),
      pipelines: [],
      accountFields: structuredClone(SEED_ACCOUNT_FIELDS),
      accounts: structuredClone(SEED_ACCOUNTS),
    };
  }

  // En mode mock, l'état vit dans le contexte React ; rien à persister.
  async createContact(): Promise<void> {}
  async updateContact(): Promise<void> {}
  async deleteContact(): Promise<void> {}
  async setContactGeo(): Promise<void> {}
  async createClient(): Promise<void> {}
  async updateClientFields(): Promise<void> {}
  async addProjectContact(): Promise<void> {}
  async removeProjectContact(): Promise<void> {}
  async addProjectDoc(): Promise<void> {}
  async removeProjectDoc(): Promise<void> {}
  async addSuivi(): Promise<void> {}
  async updateSuivi(): Promise<void> {}
  async removeSuivi(): Promise<void> {}
  async createAccount(): Promise<void> {}
  async secteurDuProspect(): Promise<string | null> {
    return null;
  }
  async updateAccount(): Promise<void> {}
  async deleteAccount(): Promise<void> {}
  async createField(): Promise<void> {}
  async renameField(): Promise<void> {}
  async moveField(): Promise<void> {}
  async deleteField(): Promise<void> {}
  async createStage(): Promise<void> {}
  async renameStage(): Promise<void> {}
  async setStageTone(): Promise<void> {}
  async deleteStage(): Promise<void> {}
  async createPipeline(): Promise<void> {}
  async updatePipeline(): Promise<void> {}
  async deletePipeline(): Promise<void> {}
  async reorderStages(): Promise<void> {}
  async createDoc(): Promise<void> {}
  async newDocVersion(): Promise<void> {}
  async docUrl(): Promise<string | null> {
    return null;
  }
  async setDocCat(): Promise<void> {}
  async deleteDoc(): Promise<void> {}
  async addCategory(): Promise<void> {}
  async removeCategory(): Promise<void> {}
  async addSubType(): Promise<void> {}
  async removeSubType(): Promise<void> {}
  async renameCategory(): Promise<void> {}
  async renameSubType(): Promise<void> {}
  async reorderCategories(): Promise<void> {}
  async reorderSubTypes(): Promise<void> {}
  async setDocTags(): Promise<void> {}
  async addTag(): Promise<void> {}
  async removeTag(): Promise<void> {}
}
