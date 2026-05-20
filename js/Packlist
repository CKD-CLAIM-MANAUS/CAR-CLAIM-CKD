// ── packList.js ───────────────────────────────────────────────
import { db, fb } from './firebase.js';

export async function importPackList({ file, model, orderNoOverride }, onProgress) {
  if (!model) throw new Error('Preencha o modelo primeiro.');
  if (!file)  throw new Error('Seleccione o ficheiro Pack List.');

  onProgress('A ler ficheiro...');

  const buffer = await file.arrayBuffer();
  // XLSX must be loaded globally
  const wb = XLSX.read(buffer, { type: 'array' });

  // Detect data sheets
  let dataSheets = wb.SheetNames.filter(name =>
    name.match(/^\d{2}[A-Z]{2}-[A-Z0-9]+-\d+$/) || name.match(/^25[A-Z]{2}/)
  );

  if (dataSheets.length === 0) {
    dataSheets = wb.SheetNames.filter(n => !n.includes('毛') && !n.includes('汇'));
  }

  if (dataSheets.length === 0) {
    dataSheets = wb.SheetNames;
  }

  onProgress(`Encontradas ${dataSheets.length} abas. A processar...`);

  let batchData = {};
  let totalParts = 0;

  for (const sheetName of dataSheets) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const orderNo = orderNoOverride || sheetName.trim();
    let sheetParts = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const partNo   = String(row[12] || '').trim(); // Col M
      const partName = String(row[13] || '').trim(); // Col N
      const lotNo    = String(row[16] || '').trim(); // Col Q
      const qty      = row[15] || '';                // Col P

      if (!partNo || !partName || partNo === 'PartNo.') continue;

      const key = (partNo + '_' + lotNo).replace(/[^a-zA-Z0-9_-]/g, '_');
      batchData[key] = {
        partNo,
        partName: partName.toUpperCase(),
        lotNo,
        orderNo,
        model: model.toUpperCase(),
        qty: String(qty),
        importedAt: Date.now(),
        source: file.name
      };
      sheetParts++;
    }

    totalParts += sheetParts;
    const idx = dataSheets.indexOf(sheetName) + 1;
    onProgress(`Processadas ${idx}/${dataSheets.length} abas... (${totalParts} peças)`);
  }

  const total = Object.keys(batchData).length;
  onProgress(`A guardar ${total} peças no Firebase...`);

  let saved = 0;
  for (const [key, data] of Object.entries(batchData)) {
    await fb.setDoc(fb.doc(db, 'partsDB', key), data);
    saved++;
    if (saved % 50 === 0) onProgress(`Guardando... ${saved}/${total}`);
  }

  return saved;
}
