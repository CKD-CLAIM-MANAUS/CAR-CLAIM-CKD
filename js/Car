// ── car.js ────────────────────────────────────────────────────
const CAR_SERVER_URL = 'https://web-production-6bff6.up.railway.app';

export async function generateCAR(inc, carNum) {
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
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.status);
    throw new Error('Erro no servidor: ' + err);
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
