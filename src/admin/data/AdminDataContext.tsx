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
  Account,
  AccountField,
  ActiviteContact,
  ActivityItem,
  Client,
  ContactType,
  DocItem,
  FieldType,
  NetworkContact,
  PipelineStage,
  Stage,
  StageTone,
  Suivi,
} from "../types";
import { docStoragePath, extFromName, humanSize, todayLabel, uid } from "../lib/format";
import { ADMIN_BACKEND } from "../lib/config";
import { etapeQuiSigne, STAGES_DEFAUT } from "../lib/ui-tokens";
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
  /** Mémorise les coordonnées géocodées d'un contact (cache carte). */
  setContactGeo: (id: string, lat: number, lng: number) => void;

  addClient: (client: Client) => void;
  updateClientFields: (id: string, fields: Partial<Client>) => void;
  /** Change l'étape d'une affaire. Entrer dans la dernière colonne vaut signature. */
  setClientStage: (id: string, stage: Stage) => void;
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

  // Colonnes du pipeline (migration 0023)
  stages: PipelineStage[];
  addStage: (label: string, tone: StageTone) => void;
  renameStage: (id: string, nouveau: string) => void;
  setStageTone: (id: string, tone: StageTone) => void;
  /** Supprime une colonne ; ses fiches partent vers `versLabel` (obligatoire si elle n'est pas vide). */
  deleteStage: (id: string, versLabel: string | null) => void;
  moveStage: (id: string, sens: -1 | 1) => void;

  // Fichier client (migration 0024)
  accounts: Account[];
  accountFields: AccountField[];
  addAccount: (fiche: { name: string; signedOn: string | null; sector: string | null; data: Record<string, string>; clientId?: string | null }) => void;
  /** Écrit une case : `key` est celle de la colonne (les trois du socle ont leur champ propre). */
  setAccountCell: (id: string, key: string, value: string) => void;
  /** Enregistre une fiche entière (formulaire de modification), en une seule écriture. */
  saveAccount: (id: string, valeurs: { name: string; signedOn: string | null; sector: string | null; data: Record<string, string> }) => void;
  deleteAccount: (id: string) => void;
  addManyAccounts: (fiches: { name: string; signedOn: string | null; sector: string | null; data: Record<string, string> }[]) => void;
  addField: (label: string, type: FieldType) => void;
  renameField: (id: string, label: string) => void;
  moveField: (id: string, sens: -1 | 1) => void;
  deleteField: (id: string) => void;
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
  const [stages, setStages] = useState<PipelineStage[]>(STAGES_DEFAUT);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountFields, setAccountFields] = useState<AccountField[]>([]);

  const applySnapshot = useCallback((snap: AdminSnapshot) => {
    setContacts(snap.contacts);
    setClients(snap.clients);
    setDocs(snap.docs);
    setDocTypes(snap.docTypes);
    setActivity(snap.activity);
    setStages(snap.stages);
    setAccounts(snap.accounts);
    setAccountFields(snap.accountFields);
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

  const setContactGeo: DataValue["setContactGeo"] = useCallback(
    (id, lat, lng) => {
      setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, lat, lng } : c)));
      persist(() => repo.setContactGeo(id, lat, lng));
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


  // ── Colonnes du pipeline ────────────────────────────────────────────────
  // L'état applicatif change tout de suite (mutation optimiste), le repository suit.

  const addStage: DataValue["addStage"] = useCallback(
    (label, tone) => {
      const propre = label.trim();
      if (!propre) return;
      setStages((prev) => {
        if (prev.some((s) => s.label.toLowerCase() === propre.toLowerCase())) {
          toast.error("Une colonne porte déjà ce nom.");
          return prev;
        }
        const stage: PipelineStage = {
          id: crypto.randomUUID(),
          label: propre,
          position: (prev.at(-1)?.position ?? 0) + 1,
          tone,
        };
        persist(() => repo.createStage(stage));
        return [...prev, stage];
      });
    },
    [persist, repo],
  );

  const renameStage: DataValue["renameStage"] = useCallback(
    (id, nouveau) => {
      const propre = nouveau.trim();
      if (!propre) return;
      setStages((prev) => {
        const stage = prev.find((s) => s.id === id);
        if (!stage || stage.label === propre) return prev;
        if (prev.some((s) => s.id !== id && s.label.toLowerCase() === propre.toLowerCase())) {
          toast.error("Une colonne porte déjà ce nom.");
          return prev;
        }
        const ancien = stage.label;
        // Les fiches suivent le renommage, sinon elles n'auraient plus de colonne.
        setClients((cs) => cs.map((c) => (c.stage === ancien ? { ...c, stage: propre } : c)));
        persist(() => repo.renameStage(id, ancien, propre));
        return prev.map((s) => (s.id === id ? { ...s, label: propre } : s));
      });
    },
    [persist, repo],
  );

  const setStageTone: DataValue["setStageTone"] = useCallback(
    (id, tone) => {
      setStages((prev) => prev.map((s) => (s.id === id ? { ...s, tone } : s)));
      persist(() => repo.setStageTone(id, tone));
    },
    [persist, repo],
  );

  const deleteStage: DataValue["deleteStage"] = useCallback(
    (id, versLabel) => {
      setStages((prev) => {
        const stage = prev.find((s) => s.id === id);
        if (!stage) return prev;
        if (prev.length <= 1) {
          toast.error("Le pipeline garde au moins une colonne.");
          return prev;
        }
        setClients((cs) => (versLabel ? cs.map((c) => (c.stage === stage.label ? { ...c, stage: versLabel } : c)) : cs));
        persist(() => repo.deleteStage(id, stage.label, versLabel));
        return prev.filter((s) => s.id !== id);
      });
    },
    [persist, repo],
  );

  const moveStage: DataValue["moveStage"] = useCallback(
    (id, sens) => {
      setStages((prev) => {
        const i = prev.findIndex((s) => s.id === id);
        const j = i + sens;
        if (i < 0 || j < 0 || j >= prev.length) return prev;
        const suite = [...prev];
        [suite[i], suite[j]] = [suite[j], suite[i]];
        const ordonne = suite.map((s, k) => ({ ...s, position: k + 1 }));
        persist(() => repo.reorderStages(ordonne.map((s) => ({ id: s.id, position: s.position }))));
        return ordonne;
      });
    },
    [persist, repo],
  );


  // ── Fichier client ──────────────────────────────────────────────────────

  const addAccount: DataValue["addAccount"] = useCallback(
    (saisie) => {
      const propre = saisie.name.trim();
      if (!propre) return;
      const fiche: Account = {
        id: crypto.randomUUID(),
        name: propre,
        signedOn: saisie.signedOn,
        sector: saisie.sector,
        data: saisie.data,
        clientId: saisie.clientId ?? null,
      };
      setAccounts((prev) => [...prev, fiche]);
      persist(() => repo.createAccount(fiche));
    },
    [persist, repo],
  );

  /**
   * Changer d'étape. Le changement est immédiat — il n'y a rien à enregistrer — mais
   * il se voyait à peine : on le dit. La fiche client suit toute seule (règle plus bas).
   */
  const setClientStage: DataValue["setClientStage"] = useCallback(
    (id, stage) => {
      updateClientFields(id, { stage });
      toast.success(`Étape : ${stage}`);
    },
    [updateClientFields],
  );

  /**
   * Signé vaut client : toute affaire arrivée à l'étape qui signe a sa fiche au
   * fichier client. On le vérifie à chaque chargement, et pas seulement au moment du
   * clic — une étape changée ailleurs, ou avant que la règle existe, est rattrapée.
   */
  useEffect(() => {
    const signe = etapeQuiSigne(stages);
    if (!signe || clients.length === 0) return;
    // Une fiche importée d'Excel n'est reliée à aucune affaire : on la reconnaît à son
    // nom, sinon la signature en créerait un double.
    const nom = (t: string) => t.trim().toLowerCase();
    const manquantes = clients.filter(
      (c) =>
        c.stage === signe &&
        !accounts.some((a) => a.clientId === c.id || nom(a.name) === nom(c.company)),
    );
    if (manquantes.length === 0) return;
    for (const c of manquantes) {
      void repo
        .secteurDuProspect(c.id)
        .catch(() => null)
        .then((secteur) =>
          addAccount({
            name: c.company,
            signedOn: new Date().toISOString().slice(0, 10),
            sector: secteur,
            data: {},
            clientId: c.id,
          }),
        );
    }
  }, [accounts, addAccount, clients, repo, stages]);

  const addManyAccounts: DataValue["addManyAccounts"] = useCallback(
    (fiches) => {
      const nouvelles: Account[] = fiches
        .filter((f) => f.name.trim())
        .map((f) => ({ id: crypto.randomUUID(), name: f.name.trim(), signedOn: f.signedOn, sector: f.sector, data: f.data, clientId: null }));
      if (!nouvelles.length) return;
      setAccounts((prev) => [...prev, ...nouvelles]);
      persist(async () => {
        for (const f of nouvelles) await repo.createAccount(f);
      });
    },
    [persist, repo],
  );

  const setAccountCell: DataValue["setAccountCell"] = useCallback(
    (id, key, value) => {
      setAccounts((prev) => {
        const fiche = prev.find((a) => a.id === id);
        if (!fiche) return prev;
        // Les trois colonnes du socle ont leur champ ; les autres vivent dans `data`.
        const maj: Account =
          key === "etablissement"
            ? { ...fiche, name: value }
            : key === "date_client"
              ? { ...fiche, signedOn: value || null }
              : key === "secteur"
                ? { ...fiche, sector: value || null }
                : { ...fiche, data: { ...fiche.data, [key]: value } };
        persist(() => repo.updateAccount(maj));
        return prev.map((a) => (a.id === id ? maj : a));
      });
    },
    [persist, repo],
  );

  const saveAccount: DataValue["saveAccount"] = useCallback(
    (id, valeurs) => {
      const propre = valeurs.name.trim();
      if (!propre) return;
      setAccounts((prev) => {
        const fiche = prev.find((a) => a.id === id);
        if (!fiche) return prev;
        const maj: Account = { ...fiche, name: propre, signedOn: valeurs.signedOn, sector: valeurs.sector, data: valeurs.data };
        persist(() => repo.updateAccount(maj));
        return prev.map((a) => (a.id === id ? maj : a));
      });
    },
    [persist, repo],
  );

  const deleteAccount: DataValue["deleteAccount"] = useCallback(
    (id) => {
      setAccounts((prev) => prev.filter((a) => a.id !== id));
      persist(() => repo.deleteAccount(id));
    },
    [persist, repo],
  );

  const addField: DataValue["addField"] = useCallback(
    (label, type) => {
      const propre = label.trim();
      if (!propre) return;
      setAccountFields((prev) => {
        if (prev.some((f) => f.label.toLowerCase() === propre.toLowerCase())) {
          toast.error("Une colonne porte déjà ce nom.");
          return prev;
        }
        // Clé technique dérivée du nom : stable même si la colonne est renommée ensuite.
        const base = propre.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "colonne";
        let key = base;
        let n = 2;
        while (prev.some((f) => f.key === key)) key = `${base}_${n++}`;
        const champ: AccountField = { id: crypto.randomUUID(), key, label: propre, type, position: (prev.at(-1)?.position ?? 0) + 1, protege: false };
        persist(() => repo.createField(champ));
        return [...prev, champ];
      });
    },
    [persist, repo],
  );

  const renameField: DataValue["renameField"] = useCallback(
    (id, label) => {
      const propre = label.trim();
      if (!propre) return;
      setAccountFields((prev) => {
        if (prev.some((f) => f.id !== id && f.label.toLowerCase() === propre.toLowerCase())) {
          toast.error("Une colonne porte déjà ce nom.");
          return prev;
        }
        persist(() => repo.renameField(id, propre));
        return prev.map((f) => (f.id === id ? { ...f, label: propre } : f));
      });
    },
    [persist, repo],
  );

  const moveField: DataValue["moveField"] = useCallback(
    (id, sens) => {
      setAccountFields((prev) => {
        const i = prev.findIndex((f) => f.id === id);
        const j = i + sens;
        if (i < 0 || j < 0 || j >= prev.length) return prev;
        const suite = [...prev];
        [suite[i], suite[j]] = [suite[j], suite[i]];
        const ordonne = suite.map((f, k) => ({ ...f, position: k + 1 }));
        persist(() => repo.moveField(ordonne.map((f) => ({ id: f.id, position: f.position }))));
        return ordonne;
      });
    },
    [persist, repo],
  );

  const deleteField: DataValue["deleteField"] = useCallback(
    (id) => {
      setAccountFields((prev) => {
        const champ = prev.find((f) => f.id === id);
        if (!champ || champ.protege) return prev;
        // Les valeurs de la colonne disparaissent avec elle, sinon elles resteraient invisibles.
        setAccounts((as) =>
          as.map((a) => {
            if (!(champ.key in a.data)) return a;
            const data = { ...a.data };
            delete data[champ.key];
            return { ...a, data };
          }),
        );
        persist(() => repo.deleteField(id, champ.key));
        return prev.filter((f) => f.id !== id);
      });
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
      setContactGeo,
      addClient,
      updateClientFields,
      stages, addStage, renameStage, setStageTone, deleteStage, moveStage,
      accounts, accountFields, addAccount, addManyAccounts, setAccountCell, saveAccount, deleteAccount, setClientStage,
      addField, renameField, moveField, deleteField,
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
      addContact, updateContact, deleteContact, setContactGeo, addClient, updateClientFields, deleteClient,
      stages, addStage, renameStage, setStageTone, deleteStage, moveStage,
      accounts, accountFields, addAccount, addManyAccounts, setAccountCell, saveAccount, deleteAccount, setClientStage,
      addField, renameField, moveField, deleteField,
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
