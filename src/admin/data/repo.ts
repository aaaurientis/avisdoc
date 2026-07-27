// Contrat de la couche d'accès aux données + implémentation « mock » (en mémoire).
//
// Le contexte React possède l'état ; les transitions optimistes y sont calculées.
// Le repository ne fait que charger (load) et persister les deltas. Cette
// séparation rend les modes mock et Supabase strictement interchangeables.

import type {
  ActivityItem,
  Client,
  DocItem,
  NetworkContact,
  ProjectContact,
  ProjectDoc,
  Suivi,
} from "../types";
import {
  SEED_ACTIVITY,
  SEED_CLIENTS,
  SEED_CONTACTS,
  SEED_DOCS,
  SEED_DOC_TYPES,
} from "./seed";

export interface AdminSnapshot {
  contacts: NetworkContact[];
  clients: Client[];
  docs: DocItem[];
  docTypes: string[];
  activity: ActivityItem[];
}

export interface AdminRepo {
  load(): Promise<AdminSnapshot>;

  // Annuaire
  createContact(c: NetworkContact): Promise<void>;
  updateContact(c: NetworkContact): Promise<void>;
  deleteContact(id: string): Promise<void>;

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

  // Documents
  deleteDoc(id: string): Promise<void>;
  bumpDocVersion(id: string, version: number, date: string, owner: string): Promise<void>;

  // Réglages
  addDocType(name: string): Promise<void>;
  removeDocType(name: string): Promise<void>;
}

/** Implémentation en mémoire : sert le jeu de démo, mutations en no-op persistées. */
export class MockRepo implements AdminRepo {
  async load(): Promise<AdminSnapshot> {
    // Clones profonds pour que l'état applicatif soit indépendant des seeds.
    return {
      contacts: structuredClone(SEED_CONTACTS),
      clients: structuredClone(SEED_CLIENTS),
      docs: structuredClone(SEED_DOCS),
      docTypes: [...SEED_DOC_TYPES],
      activity: structuredClone(SEED_ACTIVITY),
    };
  }

  // En mode mock, l'état vit dans le contexte React ; rien à persister.
  async createContact(): Promise<void> {}
  async updateContact(): Promise<void> {}
  async deleteContact(): Promise<void> {}
  async createClient(): Promise<void> {}
  async updateClientFields(): Promise<void> {}
  async addProjectContact(): Promise<void> {}
  async removeProjectContact(): Promise<void> {}
  async addProjectDoc(): Promise<void> {}
  async removeProjectDoc(): Promise<void> {}
  async addSuivi(): Promise<void> {}
  async updateSuivi(): Promise<void> {}
  async removeSuivi(): Promise<void> {}
  async deleteDoc(): Promise<void> {}
  async bumpDocVersion(): Promise<void> {}
  async addDocType(): Promise<void> {}
  async removeDocType(): Promise<void> {}
}
