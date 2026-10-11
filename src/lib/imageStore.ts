/**
 * Device-local storage for photos attached to chat messages, keyed by message id.
 * Photos are too large for localStorage and are never synced to the cloud, so they live in IndexedDB.
 * Every call fails soft (private mode, blocked storage): photos then simply aren't restored after a reload.
 */
const DB_NAME = 'aura_images';
const STORE = 'message_images';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  try {
    const db = await openDb();
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    }).finally(() => db.close());
  } catch {
    return undefined;
  }
}

export async function saveMessageImages(messageId: string, images: string[]): Promise<void> {
  if (!images.length) return;
  await run('readwrite', (s) => s.put(images, messageId));
}

/** All stored photos as { messageId: dataUrls[] }. */
export async function loadAllMessageImages(): Promise<Record<string, string[]>> {
  const out: Record<string, string[]> = {};
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return resolve();
        out[String(cursor.key)] = cursor.value as string[];
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    }).finally(() => db.close());
  } catch {
    /* ignore */
  }
  return out;
}

export async function deleteMessageImages(messageIds: string[]): Promise<void> {
  for (const id of messageIds) await run('readwrite', (s) => s.delete(id));
}

export async function clearMessageImages(): Promise<void> {
  await run('readwrite', (s) => s.clear());
}
