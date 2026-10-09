// Implémentation Supabase du repository (tables admin_*).
// Activée quand VITE_ADMIN_BACKEND=supabase. Voir la migration
// supabase/migrations/0001_admin_schema.sql et docs/admin-app.md.

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
  Stage,
  Suivi,
} from "../types";
import { supabaseAdmin as sb } from "./supabaseAdmin";
import { STAGES_DEFAUT } from "../lib/ui-tokens";
import { SECTEURS } from "../lib/merx";
import type { AdminRepo, AdminSnapshot } from "./repo";

/* eslint-disable @typescript-eslint/no-explicit-any */

function toContact(r: any): NetworkContact {
  return {
    id: r.id,
    name: r.name,
    role: r.role ?? "",
    type: r.type,
    types: r.types ?? (r.type ? [r.type] : []),
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
    fhirBrut: r.fhir_brut ?? undefined,
    lat: r.lat ?? undefined,
    lng: r.lng ?? undefined,
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
    fhir_brut: c.fhirBrut ?? null,
    lat: c.lat ?? null,
    lng: c.lng ?? null,
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
    catParent: r.cat_parent ?? "",
    cat: r.cat ?? "",
    tags: r.tags ?? [],
    size: r.size ?? "",
    date: r.date_label ?? "",
    owner: r.owner ?? "",
    version: r.version ?? 1,
    storagePath: r.storage_path ?? undefined,
  };
}

const DOCS_BUCKET = "admin-documents";

export class SupabaseRepo implements AdminRepo {
  async load(): Promise<AdminSnapshot> {
    const [contactsRes, clientsRes, pcRes, pdRes, suiviRes, docsRes, typesRes, actRes, stagesRes, fieldsRes, accountsRes, pipesRes, tagsRes] =
      await Promise.all([
        sb.from("admin_network_contacts").select("*").order("created_at", { ascending: false }),
        sb.from("admin_clients").select("*").is("deleted_at", null).order("created_at", { ascending: true }),
        sb.from("admin_client_contacts").select("*"),
        sb.from("admin_client_docs").select("*"),
        sb.from("admin_suivis").select("*"),
        sb.from("admin_documents").select("*").order("created_at", { ascending: false }),
        sb.from("admin_doc_types").select("*")
          .order("position", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: true }),
        sb.from("admin_activity").select("*").order("created_at", { ascending: false }).limit(20),
        sb.from("admin_pipeline_stages").select("*").order("position", { ascending: true }),
        sb.from("admin_account_fields").select("*").order("position", { ascending: true }),
        sb.from("admin_accounts").select("*").is("deleted_at", null).order("name", { ascending: true }),
        sb.from("admin_pipelines").select("*").order("created_at", { ascending: true }),
        sb.from("admin_doc_tags").select("name").order("name", { ascending: true }),
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
      pipelineId: r.pipeline_id ?? "",
      secteur: r.secteur ?? null,
      referent: r.referent ?? null,
      ficheClientCreee: r.fiche_client_creee ?? false,
      aRepondu: r.a_repondu ?? false,
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

    // Arborescence à 2 niveaux : les lignes sans `parent` sont des catégories,
    // les autres des sous-catégories rattachées par le nom de leur parent.
    const typeRows = (typesRes.data ?? []) as any[];
    const docTree: DocCategory[] = typeRows
      .filter((r) => !r.parent)
      .map((c) => ({
        name: c.name,
        subs: typeRows.filter((r) => r.parent === c.name).map((r) => r.name),
      }));

    // Tags standardisés (tolérant tant que la migration 0055 n'est pas appliquée).
    const docTags: string[] = tagsRes.error ? [] : (tagsRes.data ?? []).map((r: any) => r.name);

    return {
      contacts: (contactsRes.data ?? []).map(toContact),
      clients,
      docs: (docsRes.data ?? []).map(toDoc),
      docTree,
      docTags,
      activity: (actRes.data ?? []).map(
        (r: any): ActivityItem => ({ id: r.id, dot: r.dot, text: r.text, when: r.when_label ?? "" }),
      ),
      // Tant que la migration 0023 n'est pas appliquée, on affiche les colonnes de départ.
      stages: stagesRes.error || !stagesRes.data?.length
        ? structuredClone(STAGES_DEFAUT)
        : stagesRes.data.map((r: any): PipelineStage => ({
            id: r.id, label: r.label, position: r.position, tone: r.tone, pipelineId: r.pipeline_id ?? "",
          })),
      // La migration 0050 peut ne pas être appliquée : il n'y a alors aucun pipeline,
      // et l'écran retombe sur le tableau unique d'avant.
      pipelines: pipesRes.error
        ? []
        : (pipesRes.data ?? []).map((r: any): Pipeline => ({ id: r.id, nom: r.nom, assigneA: r.assigne_a ?? null })),
      // La migration 0024 peut ne pas être appliquée : le fichier client est alors vide.
      accountFields: fieldsRes.error
        ? []
        : (fieldsRes.data ?? []).map((r: any): AccountField => ({
            id: r.id, key: r.key, label: r.label, type: r.type, position: r.position, protege: r.protege,
          })),
      accounts: accountsRes.error
        ? []
        : (accountsRes.data ?? []).map((r: any): Account => ({
            id: r.id, name: r.name, signedOn: r.signed_on, sector: r.sector, data: r.data ?? {}, clientId: r.client_id,
          })),
    };
  }

  private assert(error: unknown) {
    if (error) throw error;
  }

  async createContact(c: NetworkContact): Promise<void> {
    const { error } = await sb.from("admin_network_contacts").insert({
      id: c.id, name: c.name, role: c.role, statut: c.statut,
      type: c.types?.[0] ?? c.type, types: c.types?.length ? c.types : [c.type],
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

  async setContactGeo(id: string, lat: number, lng: number): Promise<void> {
    const { error } = await sb.from("admin_network_contacts").update({ lat, lng }).eq("id", id);
    this.assert(error);
  }

  async updateContact(c: NetworkContact): Promise<void> {
    const { error } = await sb.from("admin_network_contacts").update({
      name: c.name, role: c.role, statut: c.statut,
      type: c.types?.[0] ?? c.type, types: c.types?.length ? c.types : [c.type],
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
      effectif: c.effectif, stage: c.stage, pipeline_id: c.pipelineId || undefined,
      secteur: c.secteur ?? null, jours: c.jours, tarif: c.tarif,
      depistes: c.depistes, orientes: c.orientes, resultat: c.resultat, statut_propo: c.statutPropo,
      // Posée seulement quand elle vaut : une création ordinaire ne dépend pas de la 0065.
      ...(c.aRepondu ? { a_repondu: true } : {}),
    });
    this.assert(error);
    for (const pc of c.contacts) await this.addProjectContact(c.id, pc);
    for (const pd of c.docs) await this.addProjectDoc(c.id, pd);
    for (const sv of c.suivis) await this.addSuivi(c.id, sv);
  }

  async updateClientFields(id: string, fields: Partial<Client>): Promise<void> {
    const row: Record<string, unknown> = {};
    const map: Record<string, string> = { statutPropo: "statut_propo", codePostal: "code_postal", ficheClientCreee: "fiche_client_creee", pipelineId: "pipeline_id", aRepondu: "a_repondu" };
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

  async createDoc(doc: DocItem, file: File): Promise<void> {
    const path = doc.storagePath!;
    const up = await sb.storage
      .from(DOCS_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type || undefined });
    if (up.error) throw up.error;
    const { error } = await sb.from("admin_documents").insert({
      id: doc.id,
      name: doc.name,
      ext: doc.ext,
      cat: doc.cat,
      cat_parent: doc.catParent,
      tags: doc.tags,
      size: doc.size,
      date_label: doc.date,
      owner: doc.owner,
      version: doc.version,
      storage_path: path,
    });
    this.assert(error);
  }

  async newDocVersion(doc: DocItem, file: File): Promise<void> {
    const path = doc.storagePath!;
    const up = await sb.storage
      .from(DOCS_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type || undefined });
    if (up.error) throw up.error;
    const { error } = await sb
      .from("admin_documents")
      .update({
        version: doc.version,
        date_label: doc.date,
        owner: doc.owner,
        size: doc.size,
        ext: doc.ext,
        storage_path: path,
      })
      .eq("id", doc.id);
    this.assert(error);
  }

  async docUrl(doc: DocItem, download = true): Promise<string | null> {
    if (!doc.storagePath) return null;
    // download:true → téléchargement forcé ; sinon URL affichable en ligne (aperçu).
    const options = download ? { download: doc.name } : {};
    const { data, error } = await sb.storage
      .from(DOCS_BUCKET)
      .createSignedUrl(doc.storagePath, 3600, options);
    this.assert(error);
    return data?.signedUrl ?? null;
  }

  async setDocCat(id: string, parent: string, sub: string): Promise<void> {
    const { error } = await sb
      .from("admin_documents")
      .update({ cat: sub, cat_parent: parent })
      .eq("id", id);
    this.assert(error);
  }

  async deleteDoc(id: string, storagePath?: string): Promise<void> {
    if (storagePath) {
      await sb.storage.from(DOCS_BUCKET).remove([storagePath]);
    }
    const { error } = await sb.from("admin_documents").delete().eq("id", id);
    this.assert(error);
  }

  // ── Fichier client (migration 0024) ──────────────────────────────────
  async secteurDuProspect(clientId: string): Promise<string | null> {
    const { data } = await sb
      .from("admin_prospects")
      .select("sector, activity")
      .eq("converted_client_id", clientId)
      .maybeSingle();
    if (!data) return null;
    // Le secteur porte le métier, écrit tel quel. Les fiches d'avant portent encore un
    // identifiant (« btp », « espaces_verts ») : on leur rend leur libellé.
    const ancien = SECTEURS.find((x) => x.id === data.sector);
    if (ancien) return ancien.id === "autre" ? (data.activity ?? null) : ancien.label;
    return (data.sector as string | null)?.trim() || data.activity || null;
  }

  async createAccount(a: Account): Promise<void> {
    const { error } = await sb.from("admin_accounts").insert({
      id: a.id, name: a.name, signed_on: a.signedOn, sector: a.sector, data: a.data, client_id: a.clientId,
    });
    this.assert(error);
  }

  async updateAccount(a: Account): Promise<void> {
    const { error } = await sb
      .from("admin_accounts")
      .update({ name: a.name, signed_on: a.signedOn, sector: a.sector, data: a.data })
      .eq("id", a.id);
    this.assert(error);
  }

  async deleteAccount(id: string): Promise<void> {
    const { error } = await sb.from("admin_accounts").delete().eq("id", id);
    this.assert(error);
  }

  async createField(f: AccountField): Promise<void> {
    const { error } = await sb.from("admin_account_fields").insert({
      id: f.id, key: f.key, label: f.label, type: f.type, position: f.position, protege: f.protege,
    });
    this.assert(error);
  }

  async renameField(id: string, label: string): Promise<void> {
    const { error } = await sb.from("admin_account_fields").update({ label }).eq("id", id);
    this.assert(error);
  }

  async moveField(ordre: { id: string; position: number }[]): Promise<void> {
    for (const { id, position } of ordre) {
      const { error } = await sb.from("admin_account_fields").update({ position }).eq("id", id);
      this.assert(error);
    }
  }

  /** La colonne part avec ses valeurs : sinon elles resteraient invisibles dans `data`. */
  async deleteField(id: string, key: string): Promise<void> {
    const { error } = await sb.from("admin_account_fields").delete().eq("id", id);
    this.assert(error);
    const { data } = await sb.from("admin_accounts").select("id, data");
    for (const row of data ?? []) {
      const d = { ...((row as any).data ?? {}) };
      if (key in d) {
        delete d[key];
        await sb.from("admin_accounts").update({ data: d }).eq("id", (row as any).id);
      }
    }
  }

  // ── Colonnes du pipeline (migration 0023) ────────────────────────────
  async createStage(stage: PipelineStage): Promise<void> {
    const { error } = await sb
      .from("admin_pipeline_stages")
      .insert({ id: stage.id, label: stage.label, position: stage.position, tone: stage.tone, pipeline_id: stage.pipelineId });
    this.assert(error);
  }

  /** Renommer une colonne renomme aussi l'étape des fiches qui la citent. */
  async renameStage(id: string, ancien: string, nouveau: string, pipelineId: string): Promise<void> {
    const { error } = await sb.from("admin_pipeline_stages").update({ label: nouveau }).eq("id", id);
    this.assert(error);
    // Bornée au tableau : deux pipelines peuvent avoir chacun leur « Proposition ».
    const { error: e2 } = await sb
      .from("admin_clients").update({ stage: nouveau }).eq("stage", ancien).eq("pipeline_id", pipelineId);
    this.assert(e2);
  }

  async setStageTone(id: string, tone: PipelineStage["tone"]): Promise<void> {
    const { error } = await sb.from("admin_pipeline_stages").update({ tone }).eq("id", id);
    this.assert(error);
  }

  /** Les fiches sont déplacées AVANT la suppression : aucune ne reste sans colonne. */
  async deleteStage(id: string, label: string, versLabel: string | null, pipelineId: string): Promise<void> {
    if (versLabel) {
      const { error } = await sb
        .from("admin_clients").update({ stage: versLabel }).eq("stage", label).eq("pipeline_id", pipelineId);
      this.assert(error);
    }
    const { error } = await sb.from("admin_pipeline_stages").delete().eq("id", id);
    this.assert(error);
  }

  // ── Les pipelines (migration 0050) ───────────────────────────────────
  /** Un pipeline naît avec ses colonnes : un tableau sans colonne n'affiche rien. */
  async createPipeline(p: Pipeline, colonnes: PipelineStage[]): Promise<void> {
    const { error } = await sb.from("admin_pipelines").insert({ id: p.id, nom: p.nom, assigne_a: p.assigneA });
    this.assert(error);
    if (colonnes.length === 0) return;
    const { error: e2 } = await sb.from("admin_pipeline_stages").insert(
      colonnes.map((c) => ({ id: c.id, label: c.label, position: c.position, tone: c.tone, pipeline_id: p.id })),
    );
    // Un tableau sans colonne n'affiche rien et ne se répare pas tout seul : si ses
    // colonnes sont refusées, le pipeline ne doit pas rester. C'est arrivé une fois,
    // sur un UNIQUE (label) qui datait du tableau unique (migration 0051).
    if (e2) {
      await sb.from("admin_pipelines").delete().eq("id", p.id);
      this.assert(e2);
    }
  }

  async updatePipeline(id: string, champs: Partial<Pipeline>): Promise<void> {
    const row: Record<string, unknown> = {};
    if (champs.nom !== undefined) row.nom = champs.nom;
    if (champs.assigneA !== undefined) row.assigne_a = champs.assigneA;
    if (Object.keys(row).length === 0) return;
    const { error } = await sb.from("admin_pipelines").update(row).eq("id", id);
    this.assert(error);
  }

  /** Les colonnes partent avec (cascade). Les affaires, elles, sont déplacées avant. */
  async deletePipeline(id: string): Promise<void> {
    const { error } = await sb.from("admin_pipelines").delete().eq("id", id);
    this.assert(error);
  }

  async reorderStages(ordre: { id: string; position: number }[]): Promise<void> {
    for (const { id, position } of ordre) {
      const { error } = await sb.from("admin_pipeline_stages").update({ position }).eq("id", id);
      this.assert(error);
    }
  }

  async addCategory(name: string): Promise<void> {
    const { error } = await sb.from("admin_doc_types").insert({ name, parent: null });
    this.assert(error);
  }

  async removeCategory(name: string): Promise<void> {
    // Supprime d'abord les sous-catégories, puis la catégorie elle-même.
    const subs = await sb.from("admin_doc_types").delete().eq("parent", name);
    this.assert(subs.error);
    const cat = await sb.from("admin_doc_types").delete().eq("name", name).is("parent", null);
    this.assert(cat.error);
  }

  async addSubType(parent: string, name: string): Promise<void> {
    const { error } = await sb.from("admin_doc_types").insert({ name, parent });
    this.assert(error);
  }

  async removeSubType(parent: string, name: string): Promise<void> {
    const { error } = await sb
      .from("admin_doc_types")
      .delete()
      .eq("parent", parent)
      .eq("name", name);
    this.assert(error);
  }

  async renameCategory(oldName: string, newName: string): Promise<void> {
    const { error } = await sb.rpc("renommer_doc_categorie", { p_old: oldName, p_new: newName });
    this.assert(error);
  }

  async renameSubType(parent: string, oldName: string, newName: string): Promise<void> {
    const { error } = await sb.rpc("renommer_doc_sous_categorie", {
      p_parent: parent, p_old: oldName, p_new: newName,
    });
    this.assert(error);
  }

  async reorderCategories(names: string[]): Promise<void> {
    const { error } = await sb.rpc("reordonner_doc_types", { p_parent: null, p_names: names });
    this.assert(error);
  }

  async reorderSubTypes(parent: string, names: string[]): Promise<void> {
    const { error } = await sb.rpc("reordonner_doc_types", { p_parent: parent, p_names: names });
    this.assert(error);
  }

  async setDocTags(id: string, tags: string[]): Promise<void> {
    const { error } = await sb.from("admin_documents").update({ tags }).eq("id", id);
    this.assert(error);
  }

  async addTag(name: string): Promise<void> {
    const { error } = await sb.from("admin_doc_tags").insert({ name });
    this.assert(error);
  }

  async removeTag(name: string): Promise<void> {
    // Retire le tag des documents qui le portaient PUIS de la liste gérée
    // (fonction SQL atomique — voir migration 0055).
    const { error } = await sb.rpc("retirer_doc_tag", { p_name: name });
    this.assert(error);
  }
}
