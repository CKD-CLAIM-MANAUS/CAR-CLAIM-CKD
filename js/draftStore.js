// ── draftStore.js — rascunho do formulário em IndexedDB ───────
// localStorage tem ~5MB e não guarda blobs. IndexedDB aguenta centenas
// de MB e guarda Blobs nativamente (structured clone) — por isso as fotos
// já tiradas, mesmo sem upload concluído, sobrevivem ao fecho do app.

const DB_NAME    = 'carDraftDB';
const STORE_NAME = 'drafts';
const DRAFT_KEY  = 'current';
const DB_VERSION = 1;

let _dbPromise = null;

function _openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
  return _dbPromise;
}

// Guarda o objecto draft (campos + fotos com blobs) sob a chave 'current'
export async function saveDraftDB(draft) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(draft, DRAFT_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

// Lê o draft guardado (ou null)
export async function loadDraftDB() {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(DRAFT_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror   = () => reject(req.error);
  });
}

// Apaga o draft
export async function clearDraftDB() {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(DRAFT_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}
