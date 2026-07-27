// Implémentation Supabase du repository (tables admin_*).
// Activée quand VITE_ADMIN_BACKEND=supabase. Voir la migration
// supabase/migrations/0001_admin_schema.sql et docs/admin-app.md.

import type {
  ActivityItem,
  Client,
  DocItem,
  NetworkContact,
  ProjectContact,
  ProjectDoc,
  Stage,
  Suivi,
} from "../types";
import { supabaseAdmin as sb } from "./supabaseAdmin";
import type { AdminRepo, AdminSnapshot } from "./repo";

/* eslint-disable @typescript-eslint/no-explicit-any */

function toContact(r: any): NetworkContact {
  return {
    id: r.id,
    name: r.name,
    role: r.role ?? "",
    type: r.type,
    statut: r.statut,
    ville: r.ville ?? "",
    adresse: r.adresse ?? "",
    email: r.email ?? "",
    tel: r.tel ?? "",
    last: r.last_contact ?? "",
    notes: r.notes ?? "",
    prenom: r.prenom ?? "",
    nom: r.nom ?? "",
    rpps: r.rpps ?? "",
    profession: r.profession ?? "",
    specialite: r.specialite ?? "",
    structure: r.structure ?? "",
    codePostal: r.code_postal ?? "",
    source: r.source ?? "manuel",
    savoirFaire: r.savoir_faire ?? [],
    diplomes: r.diplomes ?? [],
    activites: r.activites ?? [],
  };
}

// Colonnes structurées d'un contact réseau (0014), en snake_case SQL.
function contactStructure(c: NetworkContact) {
  return {
    prenom: c.prenom || null,
    nom: c.nom || null,
    rpps: c.rpps || null,
    profession: c.profession || null,
    specialite: c.specialite || null,
    structure: c.structure || null,
    code_postal: c.codePostal || null,
    source: c.source || "manuel",
    savoir_faire: c.savoirFaire?.length ? c.savoirFaire : null,
    diplomes: c.diplomes?.length ? c.diplomes : null,
    activites: c.activites?.length ? c.activites : null,
  };
}

function toProjectContact(r: any): ProjectContact {
  return {
    id: r.id, name: r.name,
    prenom: r.prenom ?? "", nom: r.nom ?? "",
    role: r.role ?? "", email: r.email ?? "", tel: r.tel ?? "",
  };
}

function toProjectDoc(r: any): ProjectDoc {
  return { id: r.id, name: r.name, ext: r.ext, date: r.date_label ?? "" };
}

function toSuivi(r: any): Suivi {
  return { id: r.id, text: r.text, deadline: r.deadline, done: r.done, when: r.when_label ?? undefined };
}

function toDoc(r: any): DocItem {
  return {
    id: r.id,
    name: r.name,
    ext: r.ext,
    cat: r.cat ?? "",
    size: r.size ?? "",
    date: r.date_label ?? "",
    owner: r.owner ?? "",
    version: r.version ?? 1,
  };
}

export class SupabaseRepo implements AdminRepo {
  async load(): Promise<AdminSnapshot> {
    const [contactsRes, clientsRes, pcRes, pdRes, suiviRes, docsRes, typesRes, actRes] =
      await Promise.all([
        sb.from("admin_network_contacts").select("*").order("created_at", { ascending: false }),
        sb.from("admin_clients").select("*").order("created_at", { ascending: true }),
        sb.from("admin_client_contacts").select("*"),
        sb.from("admin_client_docs").select("*"),
        sb.from("admin_suivis").select("*"),
        sb.from("admin_documents").select("*").order("created_at", { ascending: false }),
        sb.from("admin_doc_types").select("*").order("name", { ascending: true }),
        sb.from("admin_activity").select("*").order("created_at", { ascending: false }).limit(20),
      ]);

    const firstError =
      contactsRes.error || clientsRes.error || pcRes.error || pdRes.error ||
      suiviRes.error || docsRes.error || typesRes.error || actRes.error;
    if (firstError) throw firstError;

    const byClient = <T,>(rows: any[], map: (r: any) => T) => {
      const m = new Map<string, T[]>();
      for (const r of rows) {
        const arr = m.get(r.client_id) ?? [];
        arr.push(map(r));
        m.set(r.client_id, arr);
      }
      return m;
    };
    const pcMap = byClient(pcRes.data ?? [], toProjectContact);
    const pdMap = byClient(pdRes.data ?? [], toProjectDoc);
    const svMap = byClient(suiviRes.data ?? [], toSuivi);

    const clients: Client[] = (clientsRes.data ?? []).map((r: any) => ({
      id: r.id,
      company: r.company,
      siren: r.siren ?? "",
      siret: r.siret ?? "",
      naf: r.naf ?? "",
      adresse: r.adresse ?? "",
      codePostal: r.code_postal ?? "",
      ville: r.ville ?? "",
      effectif: r.effectif ?? "",
      stage: r.stage as Stage,
      jours: r.jours ?? 1,
      tarif: r.tarif ?? 0,
      depistes: r.depistes ?? 0,
      orientes: r.orientes ?? 0,
      resultat: r.resultat,
      statutPropo: r.statut_propo,
      contacts: pcMap.get(r.id) ?? [],
      docs: pdMap.get(r.id) ?? [],
      suivis: svMap.get(r.id) ?? [],
    }));

    return {
      contacts: (contactsRes.data ?? []).map(toContact),
      clients,
      docs: (docsRes.data ?? []).map(toDoc),
      docTypes: (typesRes.data ?? []).map((r: any) => r.name),
      activity: (actRes.data ?? []).map(
        (r: any): ActivityItem => ({ id: r.id, dot: r.dot, text: r.text, when: r.when_label ?? "" }),
      ),
    };
  }

  private assert(error: unknown) {
    if (error) throw error;
  }

  async createContact(c: NetworkContact): Promise<void> {
    const { error } = await sb.from("admin_network_contacts").insert({
      id: c.id, name: c.name, role: c.role, type: c.type, statut: c.statut,
      ville: c.ville, adresse: c.adresse, email: c.email, tel: c.tel,
      last_contact: c.last, notes: c.notes,
      ...contactStructure(c),
    });
    this.assert(error);
  }

  async deleteContact(id: string): Promise<void> {
    const { error } = await sb.from("admin_network_contacts").delete().eq("id", id);
    this.assert(error);
  }

  async updateContact(c: NetworkContact): Promise<void> {
    const { error } = await sb.from("admin_network_contacts").update({
      name: c.name, role: c.role, type: c.type, statut: c.statut,
      ville: c.ville, adresse: c.adresse, email: c.email, tel: c.tel,
      last_contact: c.last, notes: c.notes,
      ...contactStructure(c),
    }).eq("id", c.id);
    this.assert(error);
  }

  async createClient(c: Client): Promise<void> {
    const { error } = await sb.from("admin_clients").insert({
      id: c.id, company: c.company, siren: c.siren, siret: c.siret || null,
      naf: c.naf, adresse: c.adresse,
      code_postal: c.codePostal || null, ville: c.ville || null,
      effectif: c.effectif, stage: c.stage, jours: c.jours, tarif: c.tarif,
      depistes: c.depistes, orientes: c.orientes, resultat: c.resultat, statut_propo: c.statutPropo,
    });
    this.assert(error);
    for (const pc of c.contacts) await this.addProjectContact(c.id, pc);
    for (const pd of c.docs) await this.addProjectDoc(c.id, pd);
    for (const sv of c.suivis) await this.addSuivi(c.id, sv);
  }

  async updateClientFields(id: string, fields: Partial<Client>): Promise<void> {
    const row: Record<string, unknown> = {};
    const map: Record<string, string> = { statutPropo: "statut_propo", codePostal: "code_postal" };
    for (const [k, v] of Object.entries(fields)) {
      if (["contacts", "docs", "suivis"].includes(k)) continue;
      row[map[k] ?? k] = v;
    }
    if (Object.keys(row).length === 0) return;
    const { error } = await sb.from("admin_clients").update(row).eq("id", id);
    this.assert(error);
  }

  async addProjectContact(clientId: string, c: ProjectContact): Promise<void> {
    const { error } = await sb.from("admin_client_contacts").insert({
      id: c.id, client_id: clientId, name: c.name,
      prenom: c.prenom || null, nom: c.nom || null,
      role: c.role, email: c.email, tel: c.tel,
    });
    this.assert(error);
  }

  async removeProjectContact(_clientId: string, contactId: string): Promise<void> {
    const { error } = await sb.from("admin_client_contacts").delete().eq("id", contactId);
    this.assert(error);
  }

  async addProjectDoc(clientId: string, d: ProjectDoc): Promise<void> {
    const { error } = await sb.from("admin_client_docs").insert({
      id: d.id, client_id: clientId, name: d.name, ext: d.ext, date_label: d.date,
    });
    this.assert(error);
  }

  async removeProjectDoc(_clientId: string, docId: string): Promise<void> {
    const { error } = await sb.from("admin_client_docs").delete().eq("id", docId);
    this.assert(error);
  }

  async addSuivi(clientId: string, s: Suivi): Promise<void> {
    const { error } = await sb.from("admin_suivis").insert({
      id: s.id, client_id: clientId, text: s.text, deadline: s.deadline, done: s.done, when_label: s.when ?? null,
    });
    this.assert(error);
  }

  async updateSuivi(_clientId: string, suiviId: string, done: boolean): Promise<void> {
    const { error } = await sb.from("admin_suivis").update({ done }).eq("id", suiviId);
    this.assert(error);
  }

  async removeSuivi(_clientId: string, suiviId: string): Promise<void> {
    const { error } = await sb.from("admin_suivis").delete().eq("id", suiviId);
    this.assert(error);
  }

  async deleteDoc(id: string): Promise<void> {
    const { error } = await sb.from("admin_documents").delete().eq("id", id);
    this.assert(error);
  }

  async bumpDocVersion(id: string, version: number, date: string, owner: string): Promise<void> {
    const { error } = await sb.from("admin_documents").update({ version, date_label: date, owner }).eq("id", id);
    this.assert(error);
  }

  async addDocType(name: string): Promise<void> {
    const { error } = await sb.from("admin_doc_types").insert({ name });
    this.assert(error);
  }

  async removeDocType(name: string): Promise<void> {
    const { error } = await sb.from("admin_doc_types").delete().eq("name", name);
    this.assert(error);
  }
}
