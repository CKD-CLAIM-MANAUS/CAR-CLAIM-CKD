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
