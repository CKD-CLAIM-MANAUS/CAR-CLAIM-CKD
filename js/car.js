// ── car.js ────────────────────────────────────────────────────
import { auth } from './firebase.js';

const CAR_SERVER_URL = 'https://web-production-6bff6.up.railway.app';

export async function generateCAR(inc, carNum) {
  // Obtém o token Firebase do utilizador autenticado
  if (!auth.currentUser) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }
  const token = await auth.currentUser.getIdToken(/* forceRefresh */ false);

  const issueDate = inc.createdAt
    ? new Date(inc.createdAt).toLocaleDateString('pt-BR')
    : new Date().toLocaleDateString('pt-BR');

  const payload = {
    carNum,
    partName:    inc.partName    || '',
    partNo:      inc.partNo      || '',
    model:       inc.model       || '',
    orderNo:     inc.orderNo     || '',
    lotNo:       inc.lotNo       || '',
    ngQty:       inc.ngQty       || 1,
    defect:      inc.defect      || '',
    detected:    inc.detected    || '',
    user:        inc.user        || '',
    replacement: inc.replacement || 'NEED',
    issueDate,
    photos:      (inc.photos || []).map(p => p.url || p)
  };

  const res = await fetch(CAR_SERVER_URL + '/generate-car', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  if (res.status === 401) {
    throw new Error('Sessão expirada. Faça login novamente.');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.status }));
    throw new Error('Erro no servidor: ' + (err.error || res.status));
  }

  return res.blob();
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function getMissingFields(inc) {
  const missing = [];
  if (!inc.partNo)  missing.push('Código da Peça');
  if (!inc.model)   missing.push('Modelo');
  if (!inc.orderNo) missing.push('Nº Pedido');
  if (!inc.lotNo)   missing.push('Lote');
  if (!inc.ngQty)   missing.push('Qtd. Defeituosa');
  return missing;
}
