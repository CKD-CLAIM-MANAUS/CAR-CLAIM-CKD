// ── app.js ────────────────────────────────────────────────────
import { initAuth, login, createUser, loadUsers, logout, getUserInitials, getUserFirstName, currentUser, isAdmin } from './auth.js';
import { loadIncidents, saveIncident, markDone, markPending, deleteIncident, getNextCARNumber, lookupPart, filterIncidents, getStats, incidents } from './incidents.js';
import { openCamera, processFiles } from './camera.js';
import { openQR, closeQR, parseQRData } from './qr.js';
import { generateCAR, downloadBlob, getMissingFields } from './car.js';
import { importPackList } from './packList.js';
import { showToast, showPage, openFullscreen, closeFullscreen, openModal, closeModal, fmtDate, renderDetailRow, showAuthError, hideAuthError, setAuthLoading } from './ui.js';

// ── State ─────────────────────────────────────────────────────
let currentFilter = 'all';
let currentPhotos = [];
let editingId     = null;

// ── Auth ──────────────────────────────────────────────────────
initAuth(
  (user, admin) => {
    const initials  = getUserInitials(user);
    const firstName = getUserFirstName(user);

    document.getElementById('userAvatar').textContent     = initials;
    document.getElementById('userAvatarName').textContent = firstName;
    document.getElementById('adminBadge').style.display   = admin ? 'inline' : 'none';
    document.getElementById('modalAvatar').textContent    = initials;
    document.getElementById('modalName').textContent      = user.displayName || user.email;
    document.getElementById('modalEmail').textContent     = user.email;
    document.getElementById('modalRole').innerHTML        = admin
      ? '<span class="admin-badge">👑 ADMIN</span>'
      : '<span style="font-size:12px;color:var(--ink-300)">Utilizador</span>';

    // Mostra botão de gerir utilizadores só para admin
    const adminBtn = document.getElementById('adminUserBtn');
    if (adminBtn) adminBtn.style.display = admin ? 'block' : 'none';

    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('appScreen').classList.add('visible');
    showPage('list');
    loadAndRender();
  },
  () => {
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('appScreen').classList.remove('visible');
  }
);

// ── Login — guarda senha para restaurar sessão admin após criar user ──
window.doLogin = async () => {
  hideAuthError();
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPass').value;
  setAuthLoading('loginBtn', true, 'Entrar');
  try {
    await login(email, pass);
    sessionStorage.setItem('_ap', pass); // guarda para restaurar sessão admin
  } catch (e) {
    showAuthError(e.message);
    setAuthLoading('loginBtn', false, 'Entrar');
  }
};

window.doLogout = async () => {
  await logout();
  closeModal('userModal');
};

// ── User modal ────────────────────────────────────────────────
window.openUserModal  = () => openModal('userModal');
window.closeUserModal = (e) => {
  if (!e || e.target === document.getElementById('userModal')) closeModal('userModal');
};

// ── Users management modal ────────────────────────────────────
window.openUsersModal = async () => {
  openModal('usersModal');
  await renderUsersList();
};

window.closeUsersModal = (e) => {
  if (!e || e.target === document.getElementById('usersModal')) closeModal('usersModal');
};

async function renderUsersList() {
  const el = document.getElementById('usersList');
  if (!el) return;
  el.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';
  try {
    const users = await loadUsers();
    if (!users.length) {
      el.innerHTML = '<div style="font-size:13px;color:var(--ink-300);text-align:center;padding:16px;">Nenhum utilizador</div>';
      return;
    }
    el.innerHTML = users.map(u => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--bg-card,#0D1E35);border-radius:10px;margin-bottom:8px;border:1px solid var(--border,rgba(255,255,255,0.07));">
        <div style="width:36px;height:36px;background:var(--blue-500,#1A56CC);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:white;flex-shrink:0;">
          ${(u.name || u.email || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2)}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:600;color:var(--ink-100,rgba(255,255,255,0.88));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${u.name || '—'}</div>
          <div style="font-size:11px;color:var(--ink-300,rgba(255,255,255,0.4));white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${u.email || ''}</div>
        </div>
        <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;background:${u.role === 'admin' ? 'rgba(255,179,0,0.15)' : 'var(--blue-50,#111E38)'};color:${u.role === 'admin' ? '#FFB300' : 'var(--blue-300,#6B9BF0)'};">
          ${u.role === 'admin' ? '👑 Admin' : 'User'}
        </span>
      </div>
    `).join('');
  } catch {
    el.innerHTML = '<div style="font-size:13px;color:#FF6B6B;padding:10px;">Erro ao carregar utilizadores.</div>';
  }
}

window.doCreateUser = async () => {
  const name  = document.getElementById('newUserName').value.trim();
  const email = document.getElementById('newUserEmail').value.trim();
  const pass  = document.getElementById('newUserPass').value.trim();
  const errEl = document.getElementById('createUserError');
  const btn   = document.getElementById('createUserBtn');

  errEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = '⏳ A criar...';

  try {
    await createUser(name, email, pass);
    document.getElementById('newUserName').value  = '';
    document.getElementById('newUserEmail').value = '';
    document.getElementById('newUserPass').value  = '';
    showToast(`✅ ${name} adicionado com sucesso!`);
    await renderUsersList();
  } catch (e) {
    errEl.textContent    = e.message;
    errEl.style.display  = 'block';
  }

  btn.disabled = false;
  btn.textContent = '➕ Criar utilizador';
};

// ── Navigation ────────────────────────────────────────────────
window.goToList  = () => { showPage('list');   loadAndRender(); };
window.goToForm  = () => { clearForm(); showPage('form'); };
window.goToExcel = () => { showPage('excel');  updateExcelStats(); };

// ── Load & Render list ────────────────────────────────────────
async function loadAndRender() {
  const el = document.getElementById('incidentList');
  el.innerHTML = '<div class="loading-state"><div class="spinner"></div> A carregar...</div>';
  try {
    await loadIncidents();
    renderList();
  } catch {
    el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-title">Erro ao carregar</div></div>';
  }
}

function renderList() {
  const search = document.getElementById('searchInput')?.value || '';
  const list   = filterIncidents(incidents, { filter: currentFilter, search });
  const stats  = getStats(incidents);

  document.getElementById('statTotal').textContent   = stats.total;
  document.getElementById('statPending').textContent = stats.pending;
  document.getElementById('statDone').textContent    = stats.done;

  const el = document.getElementById('incidentList');

  if (!list.length) {
    const empty = incidents.length
      ? '<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-title">Sem resultados</div><div class="empty-state-desc">Tente outros termos de pesquisa</div></div>'
      : '<div class="empty-state"><div class="empty-state-icon">📂</div><div class="empty-state-title">Sem incidentes</div><div class="empty-state-desc">Toque em <strong>+</strong> para registar</div></div>';
    el.innerHTML = empty;
    return;
  }

  el.innerHTML = list.map(inc => {
    const firstPhoto = inc.photos && inc.photos.length ? inc.photos[0].url : null;
    const photoCount = inc.photos ? inc.photos.length : 0;
    const thumb = firstPhoto
      ? `<div class="incident-thumb">
           <img src="${firstPhoto}" loading="lazy" alt="">
           ${photoCount > 1 ? `<div class="photo-count-pill">${photoCount}</div>` : ''}
         </div>`
      : `<div class="incident-thumb-empty">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
             <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
             <circle cx="12" cy="13" r="4"/>
           </svg>
         </div>`;
    return `
    <div class="incident-card ${inc.status || 'pending'}" onclick="showDetail('${inc.id}')">
      ${thumb}
      <div class="incident-info">
        <div>
          <div class="incident-name">${inc.partName || '—'}</div>
          <div class="incident-code">${inc.partNo || ''}</div>
        </div>
        <div class="incident-footer">
          <span class="incident-meta">${inc.model || '—'} · ${fmtDate(inc.createdAt)}</span>
          <span class="badge ${inc.status === 'done' ? 'badge-done' : 'badge-pending'}">
            ${inc.status === 'done' ? '✓ Concluído' : '⏳ Pendente'}
          </span>
        </div>
      </div>
    </div>`;
  }).join('');
}

window.setFilter = (f, el) => {
  currentFilter = f;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderList();
};

window.onSearch = () => renderList();

// ── Detail view ───────────────────────────────────────────────
window.showDetail = (id) => {
  const inc = incidents.find(i => i.id === id);
  if (!inc) return;

  const photos = (inc.photos || []).map(p =>
    `<div class="photo-thumb"><img src="${p.url}" loading="lazy" onclick="openFullscreen('${p.url}')"></div>`
  ).join('');

  const missing = getMissingFields(inc);
  const carBlock = missing.length === 0
    ? `<button class="btn btn-primary" onclick="doGenerateCAR('${inc.id}')">📄 Gerar CAR Excel</button>`
    : `<div class="car-warning"><strong>Para gerar o CAR falta:</strong> ${missing.join(', ')}</div>`;

  document.getElementById('detailContent').innerHTML = `
    <button class="back-btn" onclick="goToList()">
      ${svgIcon('arrow-left')} Voltar
    </button>
    <div class="detail-header" style="border-left-color:${inc.status === 'done' ? 'var(--green-500)' : 'var(--amber-500)'}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div>
          <div class="detail-title">${inc.partName || '—'}</div>
          <div class="detail-subtitle">${inc.partNo || ''} · ${fmtDate(inc.createdAt)}</div>
        </div>
        <span class="badge ${inc.status === 'done' ? 'badge-done' : 'badge-pending'}">
          ${inc.status === 'done' ? '✓ Concluído' : '⏳ Pendente'}
        </span>
      </div>
    </div>

    <div class="form-card" style="margin-bottom:10px">
      <div class="form-card-title">${svgIcon('package')} Dados da Peça</div>
      ${renderDetailRow('Código', inc.partNo)}
      ${renderDetailRow('Modelo', inc.model)}
      ${renderDetailRow('Nº Pedido', inc.orderNo)}
      ${renderDetailRow('Lote', inc.lotNo)}
      ${renderDetailRow('Qtd. Defeituosa', inc.ngQty)}
      ${renderDetailRow('Registado por', inc.user)}
    </div>

    <div class="form-card" style="margin-bottom:10px">
      <div class="form-card-title">${svgIcon('file-text')} Descrição</div>
      <div class="detail-text">${inc.defect || '—'}</div>
      ${inc.detected ? `
        <div style="margin-top:12px;font-size:11px;font-weight:700;color:var(--ink-300);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Como detectado</div>
        <div class="detail-text">${inc.detected}</div>
      ` : ''}
    </div>

    ${photos ? `
      <div class="form-card" style="margin-bottom:10px">
        <div class="form-card-title">${svgIcon('camera')} Fotos (${inc.photos.length})</div>
        <div class="photo-grid">${photos}</div>
      </div>
    ` : ''}

    <div class="form-card" style="margin-bottom:10px">
      <div class="detail-actions">
        ${inc.status !== 'done' ? `<button class="btn btn-success" onclick="doMarkDone('${inc.id}')">✓ Concluído</button>` : ''}
        ${inc.status === 'done' ? `<button class="btn" onclick="doMarkPending('${inc.id}')">↩ Reabrir</button>` : ''}
        <button class="btn" onclick="editIncident('${inc.id}')">✏️ Editar</button>
        ${isAdmin ? `<button class="btn btn-danger" onclick="doDelete('${inc.id}')">🗑 Eliminar</button>` : ''}
      </div>
      <div style="margin-top:12px">${carBlock}</div>
    </div>
  `;

  showPage('detail');
};

window.doMarkDone = async (id) => {
  try { await markDone(id); showToast('✅ Marcado como concluído!'); window.showDetail(id); }
  catch { showToast('Erro ao actualizar.'); }
};

window.doMarkPending = async (id) => {
  try { await markPending(id); showToast('Reaberto como pendente'); window.showDetail(id); }
  catch { showToast('Erro ao actualizar.'); }
};

window.doDelete = async (id) => {
  if (!isAdmin) { showToast('⛔ Só o admin pode eliminar.'); return; }
  if (!confirm('Eliminar este incidente? Não pode ser desfeito.')) return;
  try { await deleteIncident(id); showToast('🗑 Eliminado'); goToList(); }
  catch { showToast('Erro ao eliminar.'); }
};

// ── Form ──────────────────────────────────────────────────────
function clearForm() {
  editingId = null;
  currentPhotos = [];
  ['fCarNum','fPartNo','fPartName','fModel','fOrderNo','fLotNo','fNgQty','fDefect','fDetected']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  renderPhotoGrid();
  document.getElementById('photoError')?.classList.remove('visible');
}

window.editIncident = (id) => {
  const inc = incidents.find(i => i.id === id);
  if (!inc) return;
  editingId = id;
  document.getElementById('fCarNum').value   = inc.carNum   || '';
  document.getElementById('fPartNo').value   = inc.partNo   || '';
  document.getElementById('fPartName').value = inc.partName || '';
  document.getElementById('fModel').value    = inc.model    || '';
  document.getElementById('fOrderNo').value  = inc.orderNo  || '';
  document.getElementById('fLotNo').value    = inc.lotNo    || '';
  document.getElementById('fNgQty').value    = inc.ngQty    || '';
  document.getElementById('fDefect').value   = inc.defect   || '';
  document.getElementById('fDetected').value = inc.detected || '';
  currentPhotos = (inc.photos || []).map(p => ({ url: p.url, publicId: p.publicId, isNew: false, localPreview: p.url }));
  renderPhotoGrid();
  showPage('form');
};

window.saveForm = async () => {
  const partName = document.getElementById('fPartName').value.trim();
  if (!partName) { showToast('Preencha o nome da peça'); return; }
  if (currentPhotos.length === 0) {
    document.getElementById('photoError')?.classList.add('visible');
    showToast('Adicione pelo menos uma foto');
    return;
  }

  document.getElementById('photoError')?.classList.remove('visible');
  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  btn.textContent = '⏳ A guardar...';

  try {
    const formData = {
      partNo:   document.getElementById('fPartNo').value,
      partName,
      model:    document.getElementById('fModel').value,
      orderNo:  document.getElementById('fOrderNo').value,
      lotNo:    document.getElementById('fLotNo').value,
      ngQty:    document.getElementById('fNgQty').value,
      defect:   document.getElementById('fDefect').value,
      detected: document.getElementById('fDetected').value,
      carNum:   document.getElementById('fCarNum').value,
    };

    await saveIncident(formData, currentPhotos, editingId, currentUser);
    showToast(editingId ? '✅ Actualizado!' : '✅ Incidente registado!');
    editingId = null;
    goToList();
  } catch (e) {
    showToast('Erro ao guardar: ' + e.message);
  }

  btn.disabled = false;
  btn.textContent = '💾 Guardar';
};

// ── Photos ────────────────────────────────────────────────────
window.openCameraBtn = () => {
  openCamera(
    (photo) => { currentPhotos.push(photo); renderPhotoGrid(); },
    (err) => {
      console.warn('Camera failed, using file input:', err.message);
      document.getElementById('cameraFallback').click();
    }
  );
};

window.handleFileInput = (input) => {
  processFiles(input.files, (photo) => {
    currentPhotos.push(photo);
    renderPhotoGrid();
  });
  input.value = '';
};

window.removePhoto = (i, e) => {
  e.stopPropagation();
  currentPhotos.splice(i, 1);
  renderPhotoGrid();
};

window.handleDrop = (e) => {
  e.preventDefault();
  document.getElementById('photoDropZone')?.classList.remove('drag-over');
  processFiles(e.dataTransfer.files, (photo) => {
    currentPhotos.push(photo);
    renderPhotoGrid();
  });
};

function renderPhotoGrid() {
  const grid = document.getElementById('photoGrid');
  if (!grid) return;
  grid.innerHTML = currentPhotos.map((p, i) => `
    <div class="photo-thumb">
      <img src="${p.localPreview || p.url}" alt="foto ${i + 1}">
      <button class="photo-thumb-del" onclick="removePhoto(${i}, event)">✕</button>
    </div>
  `).join('');
}

// Paste photos
document.addEventListener('paste', (e) => {
  const page = document.getElementById('page-form');
  if (!page?.classList.contains('active')) return;
  const items = Array.from((e.clipboardData || e.originalEvent.clipboardData).items);
  const imageFiles = items.filter(i => i.type.startsWith('image/')).map(i => i.getAsFile());
  if (imageFiles.length) {
    processFiles(imageFiles, (photo) => { currentPhotos.push(photo); renderPhotoGrid(); });
    showToast('Foto colada!');
  }
});

// ── QR Scanner ────────────────────────────────────────────────
window.openQRScanner = () => {
  openQR(
    async (data) => {
      const parsed = parseQRData(data);
      if (!parsed) { showToast('Formato QR não reconhecido'); return; }

      clearForm();
      document.getElementById('fPartNo').value  = parsed.partNo;
      document.getElementById('fLotNo').value   = parsed.lotNo;
      document.getElementById('fNgQty').value   = parsed.qty;
      document.getElementById('fOrderNo').value = parsed.orderNo;
      showPage('form');
      showToast('QR lido! A procurar dados...');

      const partData = await lookupPart(parsed.partNo, parsed.lotNo);
      if (partData) {
        document.getElementById('fPartName').value = partData.partName || '';
        document.getElementById('fModel').value    = partData.model    || '';
        if (!document.getElementById('fOrderNo').value) {
          document.getElementById('fOrderNo').value = partData.orderNo || '';
        }
        showToast('✅ Dados preenchidos automaticamente!');
      } else {
        showToast('QR lido! Preencha os dados em falta.');
      }
    },
    (err) => showToast('Erro ao aceder à câmera: ' + err.message)
  );
};

window.closeQRScanner = closeQR;

// ── CAR Generation ────────────────────────────────────────────
window.doGenerateCAR = async (id) => {
  const inc = incidents.find(i => i.id === id);
  if (!inc) { showToast('Incidente não encontrado'); return; }

  showToast('⏳ A gerar CAR Excel...');

  try {
    const year = new Date().getFullYear().toString().slice(-2);
    const manualNum = inc.carNum ? inc.carNum.trim() : null;
    const carNum = manualNum
      ? (manualNum.padStart(3, '0') + '/' + year)
      : await getNextCARNumber();

    const blob = await generateCAR(inc, carNum);
    const code = carNum.replace('/', '_');
    const label = (inc.partName || inc.partNo || 'PART').replace(/[^a-zA-Z0-9 -]/g, '').trim().substring(0, 30);
    downloadBlob(blob, `CAR_No_${code}_${label}.xlsx`);
    showToast('✅ CAR Excel gerado!');
  } catch (e) {
    showToast('Erro: ' + e.message);
  }
};

// ── Excel export ──────────────────────────────────────────────
function updateExcelStats() {
  const stats = getStats(incidents);
  document.getElementById('exSTotal').textContent   = stats.total;
  document.getElementById('exSPending').textContent = stats.pending;
  document.getElementById('exSDone').textContent    = stats.done;
}

window.exportExcel = () => {
  const filter = document.getElementById('excelFilter').value;
  const period = document.getElementById('excelPeriod').value;
  const now = Date.now();

  let list = incidents.filter(inc => {
    const mf = filter === 'all' || inc.status === filter;
    const mp = period === 'all' || (now - (inc.createdAt || 0)) <= parseInt(period) * 86400000;
    return mf && mp;
  });

  if (!list.length) { showToast('Nenhum incidente para exportar.'); return; }

  const rows = list.map((inc, i) => ({
    'Nº': i + 1, 'ID': inc.id,
    'Status': inc.status === 'done' ? 'Concluído' : 'Pendente',
    'Código da Peça': inc.partNo || '', 'Nome da Peça': inc.partName || '',
    'Modelo': inc.model || '', 'Nº Pedido': inc.orderNo || '', 'Lote': inc.lotNo || '',
    'Qtd. Defeituosa': inc.ngQty || '', 'Descrição do Defeito': inc.defect || '',
    'Como Detectado': inc.detected || '',
    'Registado por': inc.user || '', 'Data Registo': fmtDate(inc.createdAt),
    'Data Conclusão': inc.completedAt ? fmtDate(inc.completedAt) : '',
    'Nº Fotos': (inc.photos || []).length,
    'Links das Fotos': (inc.photos || []).map(p => p.url).join(' | '),
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [5,16,12,20,22,14,22,14,8,40,30,20,14,14,8,60].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Incidentes CAR');
  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `CAR-Garantia-${date}.xlsx`);
  showToast('📥 Excel exportado!');
};

// ── Pack List Import ──────────────────────────────────────────
window.doImportPackList = async () => {
  const model    = document.getElementById('importModel').value.trim();
  const orderNo  = document.getElementById('importOrderNo').value.trim();
  const file     = document.getElementById('importFile').files[0];
  const progress = document.getElementById('importProgress');

  progress.className = 'import-progress visible';

  try {
    const saved = await importPackList(
      { file, model, orderNoOverride: orderNo },
      (msg) => { progress.textContent = msg; }
    );
    progress.className = 'import-progress visible success';
    progress.textContent = `✅ ${saved} peças guardadas no Firebase.`;
    showToast('Pack List importado!');
    document.getElementById('importModel').value  = '';
    document.getElementById('importOrderNo').value = '';
    document.getElementById('importFile').value   = '';
  } catch (e) {
    progress.className = 'import-progress visible error';
    progress.textContent = 'Erro: ' + e.message;
  }
};

// ── Fullscreen ────────────────────────────────────────────────
window.openFullscreen  = openFullscreen;
window.closeFullscreen = closeFullscreen;

// ── SVG Icons (inline) ────────────────────────────────────────
function svgIcon(name) {
  const icons = {
    'car':        '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 9l1.5-4h9L14 9v3H2V9z"/><circle cx="4.5" cy="12.5" r="1"/><circle cx="11.5" cy="12.5" r="1"/></svg>',
    'calendar':   '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M5 2v2M11 2v2M2 7h12"/></svg>',
    'user':       '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="5.5" r="2.5"/><path d="M2.5 13.5c0-3.5 11-3.5 11 0"/></svg>',
    'camera':     '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 12a1 1 0 01-1 1H3a1 1 0 01-1-1V6a1 1 0 011-1h2l1-2h4l1 2h2a1 1 0 011 1v6z"/><circle cx="8" cy="8.5" r="2"/></svg>',
    'package':    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 4L8 1 3 4v8l5 3 5-3V4z"/><path d="M8 1v12M3 4l5 3 5-3"/></svg>',
    'file-text':  '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V6L9 2z"/><path d="M9 2v4h4M5 9h6M5 11.5h4"/></svg>',
    'arrow-left': '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M10 3L5 8l5 5"/></svg>',
  };
  return icons[name] || '';
}
