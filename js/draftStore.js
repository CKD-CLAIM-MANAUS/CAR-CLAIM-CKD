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
    let req;
    try { req = indexedDB.open(DB_NAME, DB_VERSION); }
    catch (e) { reject(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB bloqueado por outra aba'));
  });
  // Não deixa um promise rejeitado em cache — permite nova tentativa na próxima chamada
  _dbPromise.catch(() => { _dbPromise = null; });
  return _dbPromise;
}

// ── Armazenamento persistente ─────────────────────────────────
// Pede ao navegador para NÃO despejar o IndexedDB. Sem isto, navegadores
// modernos podem apagar os rascunhos quando o app fecha (sobretudo em
// PWA/telemóvel sob pressão de armazenamento). Best-effort, sem prompt no
// Chrome (decide por heurística de uso); idempotente.
export async function requestPersistentStorage() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
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
