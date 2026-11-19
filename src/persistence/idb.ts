/** Wrapper mínimo y tipado de IndexedDB (sin dependencias). */
export const DB_NAME = 'sonora-studio';
export const DB_VERSION = 1;
export type StoreName = 'projects' | 'assets';

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('Este navegador no permite almacenamiento local (IndexedDB).'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) {
        const s = db.createObjectStore('projects', { keyPath: 'id' });
        s.createIndex('updatedAt', 'updatedAt');
      }
      if (!db.objectStoreNames.contains('assets')) {
        const s = db.createObjectStore('assets', { keyPath: 'id' });
        s.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    req.onerror = () => { dbPromise = null; reject(req.error ?? new Error('No se pudo abrir la base de datos')); };
    req.onblocked = () => console.warn('[sonora] IndexedDB bloqueada por otra pestaña');
  });
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export async function idbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await openDb();
  return wrap(db.transaction(store, 'readonly').objectStore(store).get(key)) as Promise<T | undefined>;
}

export async function idbGetAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  return wrap(db.transaction(store, 'readonly').objectStore(store).getAll()) as Promise<T[]>;
}

export async function idbPut<T>(store: StoreName, value: T): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  await txDone(tx);
}

export async function idbDelete(store: StoreName, keys: string | string[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  for (const k of Array.isArray(keys) ? keys : [keys]) tx.objectStore(store).delete(k);
  await txDone(tx);
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error ?? new Error('Transacción abortada (¿sin espacio?)'));
  });
}

/** Solo para pruebas. */
export function _resetDbConnection() { dbPromise = null; }
