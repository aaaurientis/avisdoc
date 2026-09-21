// Les notes en attente d'envoi, gardées sur l'appareil.
// Une dictée prise dans un couloir sans réseau ne doit pas se perdre : on écrit l'audio ici,
// et on l'envoie dès que la connexion revient. IndexedDB, parce que le stockage local
// ordinaire ne prend pas de fichiers binaires.

const BASE = "avisdoc-dictee";
const TABLE = "en-attente";

export interface NoteEnAttente {
  id: string;
  blob: Blob;
  dureeS: number;
  creeeLe: number;
}

function ouvrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(BASE, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(TABLE)) req.result.createObjectStore(TABLE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const base = await ouvrir();
  return new Promise<T>((resolve, reject) => {
    const tx = base.transaction(TABLE, mode);
    const req = action(tx.objectStore(TABLE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => base.close();
  });
}

export async function garder(note: NoteEnAttente): Promise<void> {
  await transaction("readwrite", (s) => s.put(note) as IDBRequest<IDBValidKey>);
}

export async function listerEnAttente(): Promise<NoteEnAttente[]> {
  try {
    return (await transaction("readonly", (s) => s.getAll() as IDBRequest<NoteEnAttente[]>)) ?? [];
  } catch {
    // Navigation privée, stockage refusé : on continue sans file d'attente.
    return [];
  }
}

export async function oublier(id: string): Promise<void> {
  try {
    await transaction("readwrite", (s) => s.delete(id) as unknown as IDBRequest<undefined>);
  } catch {
    /* rien à faire : la note partira au prochain essai */
  }
}
