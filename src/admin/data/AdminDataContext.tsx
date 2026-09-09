// État applicatif du back-office : contacts, projets CRM, documents, réglages.
// L'état vit ici (transitions optimistes) ; la persistance passe par le repo
// (mock ou Supabase selon la config). Les erreurs de persistance sont notifiées
// via toast sans bloquer l'UI.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { espaceRepo } from "../espace/espaceRepo";
import type {
  ActiviteContact,
  ActivityItem,
  Client,
  ContactType,
  DocItem,
  NetworkContact,
  Stage,
  Suivi,
} from "../types";
import { docStoragePath, extFromName, humanSize, todayLabel, uid } from "../lib/format";
import { ADMIN_BACKEND } from "../lib/config";
import { logAudit } from "../lib/audit";
import { MockRepo, type AdminRepo, type AdminSnapshot } from "./repo";
import { SupabaseRepo } from "./supabaseRepo";
import { supabaseAdmin } from "./supabaseAdmin";
import { useAuth } from "../auth/AuthContext";

function makeRepo(): AdminRepo {
  return ADMIN_BACKEND === "supabase" ? new SupabaseRepo() : new MockRepo();
}

function todayLong(): string {
  return new Date().toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface DataValue {
  loading: boolean;
  contacts: NetworkContact[];
  clients: Client[];
  docs: DocItem[];
  docTypes: string[];
  activity: ActivityItem[];

  getClient: (id: string) => Client | undefined;

  addContact: (input: {
    name: string; email: string; type: ContactType; types?: ContactType[];
    role?: string; ville?: string; adresse?: string; tel?: string; notes?: string;
    prenom?: string; nom?: string; rpps?: string; profession?: string;
    specialite?: string; structure?: string; codePostal?: string; source?: string;
    savoirFaire?: string[]; diplomes?: string[]; activites?: ActiviteContact[];
    fhirBrut?: unknown;
  }) => void;
  updateContact: (contact: NetworkContact) => void;
  deleteContact: (id: string) => void;

  addClient: (client: Client) => void;
  updateClientFields: (id: string, fields: Partial<Client>) => void;
  deleteClient: (id: string) => Promise<void>;
  addProjectContact: (clientId: string, input: { prenom: string; nom: string; role: string; email: string }) => void;
  removeProjectContact: (clientId: string, contactId: string) => void;
  addProjectDoc: (clientId: string, name: string) => void;
  removeProjectDoc: (clientId: string, docId: string) => void;
  addSuivi: (clientId: string, input: { text: string; deadline: string | null }) => void;
  toggleSuivi: (clientId: string, suiviId: string) => void;
  removeSuivi: (clientId: string, suiviId: string) => void;

  importDoc: (file: File, cat: string) => Promise<void>;
  newDocVersion: (id: string, file: File) => Promise<void>;
  downloadDoc: (id: string) => Promise<void>;
  /** URL signée d'un document : download=false pour l'aperçu en ligne. */
  documentUrl: (id: string, download?: boolean) => Promise<string | null>;
  setDocCategory: (id: string, cat: string) => void;
  deleteDoc: (id: string) => void;

  addDocType: (name: string) => void;
  removeDocType: (name: string) => void;
}

const DataContext = createContext<DataValue | null>(null);

export function AdminDataProvider({ children }: { children: ReactNode }) {
  const { user, status } = useAuth();
  const repoRef = useRef<AdminRepo>(makeRepo());
  const repo = repoRef.current;

  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<NetworkContact[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [docTypes, setDocTypes] = useState<string[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  const applySnapshot = useCallback((snap: AdminSnapshot) => {
    setContacts(snap.contacts);
    setClients(snap.clients);
    setDocs(snap.docs);
    setDocTypes(snap.docTypes);
    setActivity(snap.activity);
  }, []);

  // Recharge silencieuse (utilisée par le temps réel).
  const reload = useCallback(async () => {
    try {
      applySnapshot(await repo.load());
    } catch (e) {
      console.error(e);
    }
  }, [repo, applySnapshot]);

  // Chargement initial quand l'utilisateur est authentifié.
  useEffect(() => {
    if (status !== "authenticated") return;
    let active = true;
    setLoading(true);
    repo
      .load()
      .then((snap) => active && applySnapshot(snap))
      .catch((e) => {
        console.error(e);
        toast.error("Impossible de charger les données.");
        void logAudit({
          actorEmail: user?.email ?? "",
          category: "error",
          action: "load_error",
          success: false,
          detail: { message: String((e as Error)?.message ?? e).slice(0, 300) },
        });
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [status, repo, applySnapshot, user]);

  // Temps réel (Supabase) : dès qu'un collègue ajoute/modifie/supprime une
  // donnée, on recharge (débounce) — la RLS n'expose que les @avisdoc.fr.
  useEffect(() => {
    if (status !== "authenticated" || ADMIN_BACKEND !== "supabase") return;
    const tables = [
      "admin_network_contacts", "admin_clients", "admin_client_contacts",
      "admin_client_docs", "admin_suivis", "admin_documents",
      "admin_doc_types", "admin_activity",
    ];
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bump = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void reload(), 400);
    };
    let channel = supabaseAdmin.channel("admin-db-changes");
    for (const table of tables) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        bump,
      );
    }
    channel.subscribe();
    return () => {
      clearTimeout(timer);
      void supabaseAdmin.removeChannel(channel);
    };
  }, [status, reload]);

  // Persistance best-effort : notifie en cas d'échec, sans rollback (optimiste).
  const persist = useCallback((op: () => Promise<void>) => {
    op().catch((e) => {
      console.error(e);
      toast.error("La modification n'a pas pu être enregistrée.");
      void logAudit({
        actorEmail: user?.email ?? "",
        category: "error",
        action: "persist_error",
        success: false,
        detail: { message: String((e as Error)?.message ?? e).slice(0, 300) },
      });
    });
  }, [user]);

  const getClient = useCallback(
    (id: string) => clients.find((c) => c.id === id),
    [clients],
  );

  // --- Annuaire ---
  const addContact: DataValue["addContact"] = useCallback(
    ({ name, email, type, types, role, ville, adresse, tel, notes, ...structure }) => {
      const roles = types?.length ? types : [type];
      const contact: NetworkContact = {
        id: uid(),
        name: name.trim() || "Nouveau contact",
        role: role?.trim() ?? "",
        type: roles[0],
        types: roles,
        statut: "En attente",
        ville: ville?.trim() ?? "",
        adresse: adresse?.trim() ?? "",
        email: email.trim(),
        tel: tel?.trim() ?? "",
        last: todayLabel(),
        notes: notes?.trim() ?? "",
        ...structure,
      };
      setContacts((prev) => [contact, ...prev]);
      persist(() => repo.createContact(contact));
    },
    [persist, repo],
  );

  const updateContact: DataValue["updateContact"] = useCallback(
    (contact) => {
      setContacts((prev) => prev.map((c) => (c.id === contact.id ? contact : c)));
      persist(() => repo.updateContact(contact));
    },
    [persist, repo],
  );

  const deleteContact: DataValue["deleteContact"] = useCallback(
    (id) => {
      setContacts((prev) => prev.filter((c) => c.id !== id));
      persist(() => repo.deleteContact(id));
    },
    [persist, repo],
  );

  // --- Projets CRM ---
  const addClient: DataValue["addClient"] = useCallback(
    (client) => {
      setClients((prev) => [...prev, client]);
      persist(() => repo.createClient(client));
    },
    [persist, repo],
  );

  const updateClientFields: DataValue["updateClientFields"] = useCallback(
    (id, fields) => {
      setClients((prev) => prev.map((c) => (c.id === id ? { ...c, ...fields } : c)));
      persist(() => repo.updateClientFields(id, fields));
    },
    [persist, repo],
  );

  const addProjectContact: DataValue["addProjectContact"] = useCallback(
    (clientId, input) => {
      const prenom = input.prenom.trim();
      const nom = input.nom.trim();
      const pc = {
        id: uid(),
        name: [prenom, nom].filter(Boolean).join(" "),
        prenom,
        nom,
        role: input.role.trim() || "Contact",
        email: input.email.trim() || "—",
        tel: "—",
      };
      setClients((prev) =>
        prev.map((c) => (c.id === clientId ? { ...c, contacts: [...c.contacts, pc] } : c)),
      );
      persist(() => repo.addProjectContact(clientId, pc));
    },
    [persist, repo],
  );

  const removeProjectContact: DataValue["removeProjectContact"] = useCallback(
    (clientId, contactId) => {
      setClients((prev) =>
        prev.map((c) =>
          c.id === clientId
            ? { ...c, contacts: c.contacts.filter((x) => x.id !== contactId) }
            : c,
        ),
      );
      persist(() => repo.removeProjectContact(clientId, contactId));
    },
    [persist, repo],
  );

  const addProjectDoc: DataValue["addProjectDoc"] = useCallback(
    (clientId, name) => {
      const doc = { id: uid(), name: name.trim(), ext: extFromName(name), date: todayLabel() };
      setClients((prev) =>
        prev.map((c) => (c.id === clientId ? { ...c, docs: [...c.docs, doc] } : c)),
      );
      persist(() => repo.addProjectDoc(clientId, doc));
    },
    [persist, repo],
  );

  const removeProjectDoc: DataValue["removeProjectDoc"] = useCallback(
    (clientId, docId) => {
      setClients((prev) =>
        prev.map((c) =>
          c.id === clientId ? { ...c, docs: c.docs.filter((x) => x.id !== docId) } : c,
        ),
      );
      persist(() => repo.removeProjectDoc(clientId, docId));
    },
    [persist, repo],
  );

  const addSuivi: DataValue["addSuivi"] = useCallback(
    (clientId, input) => {
      const suivi: Suivi = {
        id: uid(),
        text: input.text.trim(),
        deadline: input.deadline || null,
        done: false,
      };
      setClients((prev) =>
        prev.map((c) => (c.id === clientId ? { ...c, suivis: [suivi, ...c.suivis] } : c)),
      );
      persist(() => repo.addSuivi(clientId, suivi));
    },
    [persist, repo],
  );

  const toggleSuivi: DataValue["toggleSuivi"] = useCallback(
    (clientId, suiviId) => {
      let nextDone = false;
      setClients((prev) =>
        prev.map((c) => {
          if (c.id !== clientId) return c;
          return {
            ...c,
            suivis: c.suivis.map((s) => {
              if (s.id !== suiviId) return s;
              nextDone = !s.done;
              return { ...s, done: nextDone };
            }),
          };
        }),
      );
      persist(() => repo.updateSuivi(clientId, suiviId, nextDone));
    },
    [persist, repo],
  );

  const removeSuivi: DataValue["removeSuivi"] = useCallback(
    (clientId, suiviId) => {
      setClients((prev) =>
        prev.map((c) =>
          c.id === clientId ? { ...c, suivis: c.suivis.filter((s) => s.id !== suiviId) } : c,
        ),
      );
      persist(() => repo.removeSuivi(clientId, suiviId));
    },
    [persist, repo],
  );

  // Suppression complète (Storage + cascade base, via Edge Function service_role).
  // On attend le succès avant de retirer de l'état : geste destructif, pas d'optimisme.
  const deleteClient: DataValue["deleteClient"] = useCallback(async (id) => {
    await espaceRepo.supprimerClient(id);
    setClients((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // --- Documents ---
  const deleteDoc: DataValue["deleteDoc"] = useCallback(
    (id) => {
      const storagePath = docs.find((d) => d.id === id)?.storagePath;
      setDocs((prev) => prev.filter((d) => d.id !== id));
      persist(() => repo.deleteDoc(id, storagePath));
    },
    [persist, repo, docs],
  );

  /** Import d'un vrai fichier → upload Storage + enregistrement. */
  const importDoc: DataValue["importDoc"] = useCallback(
    async (file, cat) => {
      const id = uid();
      const version = 1;
      const doc: DocItem = {
        id,
        name: file.name,
        ext: extFromName(file.name),
        cat,
        size: humanSize(file.size),
        date: todayLong(),
        owner: user?.name ?? "—",
        version,
        storagePath: docStoragePath(id, version, file.name),
      };
      setDocs((prev) => [doc, ...prev]);
      try {
        await repo.createDoc(doc, file);
      } catch (e) {
        console.error(e);
        setDocs((prev) => prev.filter((d) => d.id !== id)); // rollback
        toast.error("L'import du document a échoué.");
        throw e;
      }
    },
    [repo, user],
  );

  /** Nouvelle version : remplace le fichier stocké et incrémente la version. */
  const newDocVersion: DataValue["newDocVersion"] = useCallback(
    async (id, file) => {
      const current = docs.find((d) => d.id === id);
      if (!current) return;
      const version = current.version + 1;
      const updated: DocItem = {
        ...current,
        version,
        date: todayLong(),
        owner: user?.name ?? "—",
        ext: extFromName(file.name),
        size: humanSize(file.size),
        storagePath: docStoragePath(id, version, file.name),
      };
      setDocs((prev) => prev.map((d) => (d.id === id ? updated : d)));
      try {
        await repo.newDocVersion(updated, file);
      } catch (e) {
        console.error(e);
        setDocs((prev) => prev.map((d) => (d.id === id ? current : d))); // rollback
        toast.error("L'ajout de version a échoué.");
        throw e;
      }
    },
    [repo, user, docs],
  );

  /** URL signée d'un document (aperçu en ligne si download=false). */
  const documentUrl: DataValue["documentUrl"] = useCallback(
    async (id, download = true) => {
      const doc = docs.find((d) => d.id === id);
      if (!doc) return null;
      try {
        return await repo.docUrl(doc, download);
      } catch (e) {
        console.error(e);
        toast.error("Lien du document indisponible.");
        return null;
      }
    },
    [repo, docs],
  );

  /** Change la catégorie d'un document sans le ré-uploader. */
  const setDocCategory: DataValue["setDocCategory"] = useCallback(
    (id, cat) => {
      setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, cat } : d)));
      persist(() => repo.setDocCat(id, cat));
    },
    [persist, repo],
  );

  /** Télécharge un document via une URL signée (backend Supabase). */
  const downloadDoc: DataValue["downloadDoc"] = useCallback(
    async (id) => {
      const doc = docs.find((d) => d.id === id);
      if (!doc) return;
      try {
        const url = await repo.docUrl(doc);
        if (!url) {
          toast.info("Fichier non disponible (mode démo).");
          return;
        }
        window.open(url, "_blank", "noopener");
      } catch (e) {
        console.error(e);
        toast.error("Le téléchargement a échoué.");
      }
    },
    [repo, docs],
  );

  // --- Réglages ---
  const addDocType: DataValue["addDocType"] = useCallback(
    (name) => {
      const n = name.trim();
      if (!n) return;
      let added = false;
      setDocTypes((prev) => {
        if (prev.includes(n)) return prev;
        added = true;
        return [...prev, n];
      });
      if (added) persist(() => repo.addDocType(n));
    },
    [persist, repo],
  );

  const removeDocType: DataValue["removeDocType"] = useCallback(
    (name) => {
      setDocTypes((prev) => prev.filter((t) => t !== name));
      persist(() => repo.removeDocType(name));
    },
    [persist, repo],
  );

  const value = useMemo<DataValue>(
    () => ({
      loading,
      contacts,
      clients,
      docs,
      docTypes,
      activity,
      getClient,
      addContact,
      updateContact,
      deleteContact,
      addClient,
      updateClientFields,
      deleteClient,
      addProjectContact,
      removeProjectContact,
      addProjectDoc,
      removeProjectDoc,
      addSuivi,
      toggleSuivi,
      removeSuivi,
      importDoc,
      newDocVersion,
      downloadDoc,
      documentUrl,
      setDocCategory,
      deleteDoc,
      addDocType,
      removeDocType,
    }),
    [
      loading, contacts, clients, docs, docTypes, activity, getClient,
      addContact, updateContact, deleteContact, addClient, updateClientFields, deleteClient,
      addProjectContact, removeProjectContact, addProjectDoc, removeProjectDoc,
      addSuivi, toggleSuivi, removeSuivi, importDoc, newDocVersion, downloadDoc, documentUrl,
      setDocCategory, deleteDoc, addDocType, removeDocType,
    ],
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useAdminData(): DataValue {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useAdminData doit être utilisé dans <AdminDataProvider>");
  return ctx;
}

/** Stages utilisés par le pipeline (réexport pratique). */
export const CRM_STAGES: Stage[] = ["Nouveau", "Qualifié", "Proposition", "Signé"];
