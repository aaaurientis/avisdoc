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
  ActivityItem,
  Client,
  ContactType,
  DocItem,
  NetworkContact,
  Stage,
  Suivi,
} from "../types";
import { extFromName, todayLabel, uid } from "../lib/format";
import { ADMIN_BACKEND } from "../lib/config";
import { MockRepo, type AdminRepo } from "./repo";
import { SupabaseRepo } from "./supabaseRepo";
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

  addContact: (input: { name: string; email: string; type: ContactType }) => void;
  updateContact: (contact: NetworkContact) => void;

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

  deleteDoc: (id: string) => void;
  bumpDocVersion: (id: string) => void;

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

  // Chargement quand l'utilisateur est authentifié.
  useEffect(() => {
    if (status !== "authenticated") return;
    let active = true;
    setLoading(true);
    repo
      .load()
      .then((snap) => {
        if (!active) return;
        setContacts(snap.contacts);
        setClients(snap.clients);
        setDocs(snap.docs);
        setDocTypes(snap.docTypes);
        setActivity(snap.activity);
      })
      .catch((e) => {
        console.error(e);
        toast.error("Impossible de charger les données.");
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [status, repo]);

  // Persistance best-effort : notifie en cas d'échec, sans rollback (optimiste).
  const persist = useCallback((op: () => Promise<void>) => {
    op().catch((e) => {
      console.error(e);
      toast.error("La modification n'a pas pu être enregistrée.");
    });
  }, []);

  const getClient = useCallback(
    (id: string) => clients.find((c) => c.id === id),
    [clients],
  );

  // --- Annuaire ---
  const addContact: DataValue["addContact"] = useCallback(
    ({ name, email, type }) => {
      const contact: NetworkContact = {
        id: uid(),
        name: name.trim() || "Nouveau contact",
        role: "",
        type,
        statut: "En attente",
        ville: "",
        adresse: "",
        email: email.trim(),
        tel: "",
        last: todayLabel(),
        notes: "",
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
      setDocs((prev) => prev.filter((d) => d.id !== id));
      persist(() => repo.deleteDoc(id));
    },
    [persist, repo],
  );

  const bumpDocVersion: DataValue["bumpDocVersion"] = useCallback(
    (id) => {
      const owner = user?.name ?? "—";
      const date = todayLong();
      let version = 1;
      setDocs((prev) =>
        prev.map((d) => {
          if (d.id !== id) return d;
          version = d.version + 1;
          return { ...d, version, date, owner };
        }),
      );
      persist(() => repo.bumpDocVersion(id, version, date, owner));
    },
    [persist, repo, user],
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
      deleteDoc,
      bumpDocVersion,
      addDocType,
      removeDocType,
    }),
    [
      loading, contacts, clients, docs, docTypes, activity, getClient,
      addContact, updateContact, addClient, updateClientFields, deleteClient,
      addProjectContact, removeProjectContact, addProjectDoc, removeProjectDoc,
      addSuivi, toggleSuivi, removeSuivi, deleteDoc, bumpDocVersion,
      addDocType, removeDocType,
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
