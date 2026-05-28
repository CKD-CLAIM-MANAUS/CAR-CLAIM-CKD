// ── stock.js ──────────────────────────────────────────────────
import { db, fb } from './firebase.js';

const STOCK_COL = 'stock';
const MOVE_COL  = 'stockMovements';

// Sanitiza o partNo para usar como ID do documento Firestore
function stockId(partNo) {
  return (partNo || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
}

// ── Carrega todos os itens de stock ──────────────────────────
export async function loadStock() {
  const snap = await fb.getDocs(fb.collection(db, STOCK_COL));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.partName || '').localeCompare(b.partName || ''));
}

// ── Lê um item de stock por partNo ───────────────────────────
export async function getStockItem(partNo) {
  if (!partNo) return null;
  const snap = await fb.getDoc(fb.doc(db, STOCK_COL, stockId(partNo)));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// ── Regista um movimento e actualiza a quantidade ─────────────
// type: 'in' | 'out' | 'adjust'
// qty:  positivo = entrada, negativo = saída
export async function recordStockMovement({
  partNo, partName, type, qty,
  incidentId = null, carNum = null,
  user = '', note = ''
}) {
  if (!partNo) return;

  const docRef = fb.doc(db, STOCK_COL, stockId(partNo));
  const snap   = await fb.getDoc(docRef);
  const qtyBefore = snap.exists() ? (snap.data().qty || 0) : 0;
  const qtyAfter  = qtyBefore + qty;

  // Cria ou actualiza o documento de stock
  await fb.setDoc(docRef, {
    partNo,
    partName:  partName  || '',
    qty:       qtyAfter,
    updatedAt: Date.now(),
    updatedBy: user || '',
  }, { merge: true });

  // Regista o movimento no histórico
  await fb.addDoc(fb.collection(db, MOVE_COL), {
    partNo,
    partName:   partName   || '',
    type,
    qty,
    qtyBefore,
    qtyAfter,
    incidentId: incidentId || null,
    carNum:     carNum     || null,
    date:       Date.now(),
    user:       user       || '',
    note:       note       || '',
  });

  return qtyAfter;
}

// ── Histórico de movimentos de uma peça ──────────────────────
// Ordenação feita no cliente para evitar índice composto no Firestore
export async function getStockHistory(partNo) {
  if (!partNo) return [];
  const q = fb.query(
    fb.collection(db, MOVE_COL),
    fb.where('partNo', '==', partNo)
  );
  const snap = await fb.getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.date || 0) - (a.date || 0));
}
