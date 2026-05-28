// ── incidents.js ──────────────────────────────────────────────
import { db, fb } from './firebase.js';
import { uploadPhoto } from './camera.js';

export let incidents = [];

// ── Status config ─────────────────────────────────────────────
export const STATUS_CONFIG = {
  pending:       { label: 'Pendente',      icon: '⏳', color: '#F59E0B', badge: 'badge-pending'  },
  sent:          { label: 'Enviado',        icon: '📤', color: '#3B82F6', badge: 'badge-sent'     },
  awaiting:      { label: 'Aguardando',     icon: '🕐', color: '#8B5CF6', badge: 'badge-awaiting' },
  eta_confirmed: { label: 'ETA Confirmado', icon: '📅', color: '#06B6D4', badge: 'badge-eta'      },
  received:      { label: 'Recebido',       icon: '📦', color: '#84CC16', badge: 'badge-received' },
  done:          { label: 'Encerrado',      icon: '✓',  color: '#22C55E', badge: 'badge-done'     },
};

export const STATUS_FLOW = ['pending', 'sent', 'awaiting', 'eta_confirmed', 'received', 'done'];

// ── Status de pintura (fluxo independente: 3 passos) ──────────
// pending → sent (na pintoria) → done (retornou + encerrado)
export const PAINT_STATUS_FLOW = ['pending', 'sent', 'done'];

export const PAINT_STATUS_CONFIG = {
  pending: { label: 'Aguardando Envio', icon: '⏳', color: '#F59E0B', badge: 'badge-pending'    },
  sent:    { label: 'Na Pintoria',      icon: '🎨', color: '#8B5CF6', badge: 'badge-paint-sent' },
  done:    { label: 'Encerrado',        icon: '✓',  color: '#22C55E', badge: 'badge-done'       },
};

// ── Load all incidents (one-shot, mantido para compatibilidade) ─
export async function loadIncidents() {
  const q = fb.query(fb.collection(db, 'incidents'), fb.orderBy('createdAt', 'desc'));
  const snap = await fb.getDocs(q);
  incidents = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return incidents;
}

// ── Listener em tempo real ────────────────────────────────────
let _unsubscribeIncidents = null;

export function subscribeToIncidents(onUpdate) {
  // Cancela subscrição anterior se existir
  if (_unsubscribeIncidents) { _unsubscribeIncidents(); _unsubscribeIncidents = null; }

  const q = fb.query(fb.collection(db, 'incidents'), fb.orderBy('createdAt', 'desc'));
  _unsubscribeIncidents = fb.onSnapshot(q,
    (snap) => {
      incidents = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      onUpdate(incidents);
    },
    (err) => console.error('Snapshot error:', err)
  );
  return _unsubscribeIncidents;
}

export function unsubscribeFromIncidents() {
  if (_unsubscribeIncidents) { _unsubscribeIncidents(); _unsubscribeIncidents = null; }
}

// ── Batch: avança direto para eta_confirmed (qualquer status) ─
export async function batchAdvanceToETA(id, user, eta, tracking) {
  const inc      = incidents.find(i => i.id === id);
  if (!inc) return;

  const now      = Date.now();
  const userName = user.displayName || user.email || '';
  const curSt    = inc.status || 'pending';
  const FLOW     = ['pending', 'sent', 'awaiting', 'eta_confirmed'];
  const curIdx   = FLOW.indexOf(curSt);
  const etaIdx   = FLOW.indexOf('eta_confirmed');

  // Cria entradas de histórico para cada passo saltado
  const newEntries = [];
  for (let i = Math.max(0, curIdx + 1); i <= etaIdx; i++) {
    const step = FLOW[i];
    newEntries.push({
      status:    step,
      timestamp: now + i,       // offset mínimo para manter ordem
      user:      userName,
      note:      step === 'eta_confirmed'
        ? `ETA confirmado em lote · ${eta} · Tracking: ${tracking}`
        : `Avançado automaticamente via envio em lote`,
    });
  }

  const updateData = {
    status:    'eta_confirmed',
    eta,
    tracking,
    updatedAt: now,
  };
  if (!inc.sentAt) updateData.sentAt = now;
  if (newEntries.length) updateData.history = fb.arrayUnion(...newEntries);

  await fb.updateDoc(fb.doc(db, 'incidents', id), updateData);

  // Actualiza estado local imediatamente
  inc.status    = 'eta_confirmed';
  inc.eta       = eta;
  inc.tracking  = tracking;
  inc.updatedAt = now;
  if (!inc.sentAt) inc.sentAt = now;
  if (!inc.history) inc.history = [];
  newEntries.forEach(h => inc.history.push(h));
}

// ── Save (create or update) ───────────────────────────────────
export async function saveIncident(formData, photos, editingId, user) {
  // Upload new photos
  const uploadedPhotos = [];
  for (const p of photos) {
    if (p.isNew && p.file) {
      const result = await uploadPhoto(p.file);
      uploadedPhotos.push({ url: result.url, publicId: result.publicId });
    } else {
      uploadedPhotos.push({ url: p.url, publicId: p.publicId || '' });
    }
  }

  const data = {
    partNo:    (formData.partNo    || '').trim(),
    partName:  (formData.partName  || '').trim(),
    model:     (formData.model     || '').trim(),
    orderNo:   (formData.orderNo   || '').trim(),
    lotNo:     (formData.lotNo     || '').trim(),
    ngQty:     (formData.ngQty     || '').toString().trim(),
    defect:    (formData.defect    || '').trim(),
    detected:  (formData.detected  || '').trim(),
    carNum:       (formData.carNum       || '').trim(),
    incidentType: (formData.incidentType || 'normal'),
    photos:    uploadedPhotos,
    user:      user.displayName || user.email,
    userId:    user.uid,
    updatedAt: Date.now(),
  };

  if (editingId) {
    await fb.updateDoc(fb.doc(db, 'incidents', editingId), data);
    return editingId;
  } else {
    data.status    = 'pending';
    data.createdAt = Date.now();
    data.history   = [{
      status: 'pending',
      timestamp: Date.now(),
      user: user.displayName || user.email || '',
      note: 'Incidente registado.',
    }];
    const docRef = await fb.addDoc(fb.collection(db, 'incidents'), data);
    return docRef.id;
  }
}

// ── Mark done / pending (mantidos para compatibilidade) ───────
export async function markDone(id) {
  await fb.updateDoc(fb.doc(db, 'incidents', id), {
    status: 'done',
    completedAt: Date.now()
  });
  const inc = incidents.find(i => i.id === id);
  if (inc) { inc.status = 'done'; inc.completedAt = Date.now(); }
}

export async function markPending(id) {
  await fb.updateDoc(fb.doc(db, 'incidents', id), { status: 'pending' });
  const inc = incidents.find(i => i.id === id);
  if (inc) { inc.status = 'pending'; delete inc.completedAt; }
}

// ── Avança status com registo no histórico ────────────────────
export async function updateIncidentStatus(id, newStatus, user, note = '', eta = null, tracking = '') {
  const historyEntry = {
    status:    newStatus,
    timestamp: Date.now(),
    user:      user.displayName || user.email || '',
    note:      note || '',
  };

  const updateData = {
    status:    newStatus,
    updatedAt: Date.now(),
    history:   fb.arrayUnion(historyEntry),
  };

  if (newStatus === 'sent')                        updateData.sentAt      = Date.now();
  if (newStatus === 'eta_confirmed' && eta)         updateData.eta         = eta;
  if (newStatus === 'eta_confirmed' && tracking)    updateData.tracking    = tracking;
  if (newStatus === 'received')                    updateData.receivedAt  = Date.now();
  if (newStatus === 'done')                        updateData.completedAt = Date.now();

  await fb.updateDoc(fb.doc(db, 'incidents', id), updateData);

  const inc = incidents.find(i => i.id === id);
  if (inc) {
    inc.status    = newStatus;
    inc.updatedAt = Date.now();
    if (!inc.history) inc.history = [];
    inc.history.push(historyEntry);
    if (newStatus === 'sent')                      inc.sentAt      = Date.now();
    if (newStatus === 'eta_confirmed' && eta)       inc.eta         = eta;
    if (newStatus === 'eta_confirmed' && tracking)  inc.tracking    = tracking;
    if (newStatus === 'received')                  inc.receivedAt  = Date.now();
    if (newStatus === 'done')                      inc.completedAt = Date.now();
  }
}

// ── Adiciona nota sem mudar status ────────────────────────────
export async function addIncidentNote(id, user, note) {
  if (!note || !note.trim()) return;
  const historyEntry = {
    status:    null,
    timestamp: Date.now(),
    user:      user.displayName || user.email || '',
    note:      note.trim(),
    isNote:    true,
  };

  await fb.updateDoc(fb.doc(db, 'incidents', id), {
    history:   fb.arrayUnion(historyEntry),
    updatedAt: Date.now(),
  });

  const inc = incidents.find(i => i.id === id);
  if (inc) {
    if (!inc.history) inc.history = [];
    inc.history.push(historyEntry);
  }
}

// ── Delete ────────────────────────────────────────────────────
export async function deleteIncident(id) {
  await fb.deleteDoc(fb.doc(db, 'incidents', id));
  incidents = incidents.filter(i => i.id !== id);
}

// ── CAR Number ───────────────────────────────────────────────
export async function getNextCARNumber() {
  const year = new Date().getFullYear().toString().slice(-2);
  const snap = await fb.getDocs(fb.collection(db, 'carNumbers'));
  const yearDocs = snap.docs.filter(d => d.data().year === year);
  const nextNum = yearDocs.length + 1;
  await fb.addDoc(fb.collection(db, 'carNumbers'), { year, num: nextNum, createdAt: Date.now() });
  return String(nextNum).padStart(3, '0') + '/' + year;
}

// ── Parts DB lookup ───────────────────────────────────────────
export async function lookupPart(partNo, lotNo) {
  if (!partNo) return null;
  try {
    const key = (partNo + '_' + (lotNo || '')).replace(/[^a-zA-Z0-9_-]/g, '_');
    const snap = await fb.getDoc(fb.doc(db, 'partsDB', key));
    if (snap.exists()) return snap.data();

    // Fallback: search by partNo only
    const allSnap = await fb.getDocs(
      fb.query(fb.collection(db, 'partsDB'), fb.orderBy('partNo'))
    );
    const match = allSnap.docs.find(d => d.data().partNo === partNo);
    return match ? match.data() : null;
  } catch {
    return null;
  }
}

// ── Filter & search ───────────────────────────────────────────
const IN_PROGRESS_STATUSES = ['sent', 'awaiting', 'eta_confirmed', 'received'];

export function filterIncidents(incidents, { filter = 'all', search = '', incidentType = null }) {
  const q = search.toLowerCase();
  return incidents.filter(inc => {
    const st = inc.status || 'pending';
    const matchFilter =
      filter === 'all'
      || filter === st
      || (filter === 'inprogress' && IN_PROGRESS_STATUSES.includes(st));
    const matchSearch = !q
      || (inc.partNo   || '').toLowerCase().includes(q)
      || (inc.partName || '').toLowerCase().includes(q)
      || (inc.model    || '').toLowerCase().includes(q)
      || (inc.orderNo  || '').toLowerCase().includes(q);
    const matchType = !incidentType || (inc.incidentType || 'normal') === incidentType;
    return matchFilter && matchSearch && matchType;
  });
}

// ── Stats ─────────────────────────────────────────────────────
export function getStats(incidents) {
  const total   = incidents.length;
  const done    = incidents.filter(i => i.status === 'done').length;
  const pending = total - done;
  return { total, done, pending };
}
