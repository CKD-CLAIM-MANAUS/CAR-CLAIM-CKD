// ── packList.js ───────────────────────────────────────────────
// Importa a pack list (.xlsx) para duas colecções:
//   partsDB/{partNo} → { partNo, partName, model }   (nome fixo da peça)
//   lotsDB/{lotNo}   → { lotNo, orderNo, model }      (lote → pedido manual)
import { db, fb } from './firebase.js';

// Sanitiza um valor para usar como ID de documento Firestore
function sid(s) {
  return String(s || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

// Chave normalizada do lote: lotes só-dígitos ignoram zeros à esquerda
// (a pack list traz "0010266174" e o QR traz "10266174" — mesmo lote).
function lotKey(lot) {
  let s = String(lot || '').trim();
  if (/^\d+$/.test(s)) s = s.replace(/^0+/, '') || '0';
  return s.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export async function importPackList({ file, model, orderNoOverride }, onProgress) {
  if (!model) throw new Error('Preencha o modelo primeiro.');
  if (!file)  throw new Error('Seleccione o ficheiro Pack List.');

  onProgress('A ler ficheiro...');

  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' }); // XLSX é global

  // Detecta as abas de dados
  let dataSheets = wb.SheetNames.filter(name =>
    name.match(/^\d{2}[A-Z]{2}-[A-Z0-9]+-\d+$/) || name.match(/^25[A-Z]{2}/)
  );
  if (dataSheets.length === 0) dataSheets = wb.SheetNames.filter(n => !n.includes('毛') && !n.includes('汇'));
  if (dataSheets.length === 0) dataSheets = wb.SheetNames;

  onProgress(`Encontradas ${dataSheets.length} abas. A processar...`);

  const modelUp  = model.toUpperCase();
  const partsMap = {};   // sid(partNo) → dados da peça
  const lotsMap  = {};   // sid(lotNo)  → dados do lote
  let totalRows  = 0;

  for (const sheetName of dataSheets) {
    const ws      = wb.Sheets[sheetName];
    const rows    = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const orderNo = orderNoOverride || sheetName.trim();

    for (let i = 1; i < rows.length; i++) {
      const row      = rows[i];
      const partNo   = String(row[12] || '').trim(); // Col M
      const partName = String(row[13] || '').trim(); // Col N
      const lotNo    = String(row[16] || '').trim(); // Col Q

      if (!partNo || !partName || partNo === 'PartNo.') continue;

      // Peça → nome + modelo (uma entrada por código, sem cópias)
      partsMap[sid(partNo)] = {
        partNo,
        partName: partName.toUpperCase(),
        model:    modelUp,
        updatedAt: Date.now(),
      };

      // Lote → pedido manual (uma entrada por lote)
      if (lotNo) {
        lotsMap[lotKey(lotNo)] = {
          lotNo,
          orderNo,
          model:      modelUp,
          importedAt: Date.now(),
          source:     file.name,
        };
      }
      totalRows++;
    }
  }

  // Junta as operações das duas colecções e grava em lotes de 500
  const ops = [
    ...Object.entries(partsMap).map(([id, data]) => ['partsDB', id, data]),
    ...Object.entries(lotsMap).map(([id, data]) => ['lotsDB', id, data]),
  ];

  const nParts = Object.keys(partsMap).length;
  const nLots  = Object.keys(lotsMap).length;
  onProgress(`A guardar ${nParts} peças e ${nLots} lotes...`);

  const BATCH_LIMIT = 500;
  let done = 0;
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const chunk = ops.slice(i, i + BATCH_LIMIT);
    const batch = fb.writeBatch(db);
    for (const [col, id, data] of chunk) batch.set(fb.doc(db, col, id), data);
    await batch.commit();
    done += chunk.length;
    onProgress(`Guardando... ${done}/${ops.length}`);
  }

  return { parts: nParts, lots: nLots };
}

// ── Migração: formato antigo (partsDB/{partNo_lotNo}) → novo ───
// Lê todas as entradas, cria partsDB/{partNo} e lotsDB/{lotNo},
// e apaga as entradas antigas (chave com partNo_lotNo).
export async function migratePartsDB(onProgress) {
  onProgress('A ler base de peças actual...');
  const snap = await fb.getDocs(fb.collection(db, 'partsDB'));

  const partsMap = {};
  const lotsMap  = {};
  const oldKeys  = [];

  snap.docs.forEach(d => {
    const data = d.data();
    if (!data.partNo) return;

    const newPartId = sid(data.partNo);
    partsMap[newPartId] = {
      partNo:   data.partNo,
      partName: data.partName || '',
      model:    data.model    || '',
      updatedAt: Date.now(),
    };

    if (data.lotNo) {
      lotsMap[lotKey(data.lotNo)] = {
        lotNo:   data.lotNo,
        orderNo: data.orderNo || '',
        model:   data.model   || '',
        importedAt: data.importedAt || Date.now(),
        source:  data.source || 'migração',
      };
    }

    // Entrada antiga = chave diferente da nova (tinha partNo_lotNo)
    if (d.id !== newPartId) oldKeys.push(d.id);
  });

  const ops = [
    ...Object.entries(partsMap).map(([id, data]) => ['set', 'partsDB', id, data]),
    ...Object.entries(lotsMap).map(([id, data]) => ['set', 'lotsDB', id, data]),
    ...oldKeys.map(id => ['del', 'partsDB', id, null]),
  ];

  onProgress(`A migrar: ${Object.keys(partsMap).length} peças, ${Object.keys(lotsMap).length} lotes, ${oldKeys.length} antigas a remover...`);

  const BATCH_LIMIT = 500;
  let done = 0;
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const chunk = ops.slice(i, i + BATCH_LIMIT);
    const batch = fb.writeBatch(db);
    for (const [action, col, id, data] of chunk) {
      if (action === 'set') batch.set(fb.doc(db, col, id), data);
      else                  batch.delete(fb.doc(db, col, id));
    }
    await batch.commit();
    done += chunk.length;
    onProgress(`A migrar... ${done}/${ops.length}`);
  }

  return { parts: Object.keys(partsMap).length, lots: Object.keys(lotsMap).length, removed: oldKeys.length };
}

// ── Verificação de colisões de ID antes de migrar ───────────────
// sid() troca qualquer caractere fora de [a-zA-Z0-9_-] por "_", então
// partNo diferentes (ex: "ABC/123" vs "ABC.123") podem gerar o mesmo
// ID e a migração guardaria só um deles, apagando o outro em silêncio.
// Corre antes de migratePartsDB para detectar esses casos.
export async function checkPartsDBCollisions(onProgress) {
  onProgress('A ler base de peças actual...');
  const snap = await fb.getDocs(fb.collection(db, 'partsDB'));

  const groups = {}; // sid(partNo) → Set de partNo originais distintos

  snap.docs.forEach(d => {
    const partNo = d.data().partNo;
    if (!partNo) return;
    const key = sid(partNo);
    if (!groups[key]) groups[key] = new Set();
    groups[key].add(partNo);
  });

  return Object.entries(groups)
    .filter(([, set]) => set.size > 1)
    .map(([key, set]) => ({ key, partNos: [...set] }));
}
