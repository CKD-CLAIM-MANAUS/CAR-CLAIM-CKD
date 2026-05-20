// ── incidents.js ──────────────────────────────────────────────
import { db, fb } from './firebase.js';
import { uploadPhoto } from './camera.js';

export let incidents = [];

// ── Load all incidents ────────────────────────────────────────
export async function loadIncidents() {
  const q = fb.query(fb.collection(db, 'incidents'), fb.orderBy('createdAt', 'desc'));
  const snap = await fb.getDocs(q);
  incidents = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return incidents;
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
    carNum:    (formData.carNum    || '').trim(),
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
    const docRef = await fb.addDoc(fb.collection(db, 'incidents'), data);
    return docRef.id;
  }
}

// ── Mark done / pending ───────────────────────────────────────
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
export function filterIncidents(incidents, { filter = 'all', search = '' }) {
  const q = search.toLowerCase();
  return incidents.filter(inc => {
    const matchFilter = filter === 'all' || inc.status === filter;
    const matchSearch = !q
      || (inc.partNo   || '').toLowerCase().includes(q)
      || (inc.partName || '').toLowerCase().includes(q)
      || (inc.model    || '').toLowerCase().includes(q)
      || (inc.orderNo  || '').toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });
}

// ── Stats ─────────────────────────────────────────────────────
export function getStats(incidents) {
  const total   = incidents.length;
  const done    = incidents.filter(i => i.status === 'done').length;
  const pending = total - done;
  return { total, done, pending };
}
