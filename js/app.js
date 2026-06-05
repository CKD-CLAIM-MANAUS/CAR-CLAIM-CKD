// ── app.js ────────────────────────────────────────────────────
import { initAuth, login, createUser, loadUsers, logout, getUserInitials, getUserFirstName, currentUser, isAdmin } from './auth.js';
import { loadIncidents, saveIncident, markDone, markPending, deleteIncident, getNextCARNumber, getCARCounter, isCARNumberInUse, lookupPart, filterIncidents, getStats, incidents, STATUS_CONFIG, STATUS_FLOW, PAINT_STATUS_CONFIG, PAINT_STATUS_FLOW, updateIncidentStatus, addIncidentNote, subscribeToIncidents, unsubscribeFromIncidents, batchAdvanceToETA } from './incidents.js';
import { openCamera, processFiles } from './camera.js';
import { openQR, closeQR, parseQRData } from './qr.js';
import { generateCAR, downloadBlob, downloadBlobSmart, getMissingFields, getSavePickerPref, setSavePickerPref, isSavePickerSupported } from './car.js';
import { importPackList } from './packList.js';
import { showToast, showPage, openFullscreen, openLightbox, closeLightbox, lbNavigate, closeFullscreen, openModal, closeModal, fmtDate, renderDetailRow, showAuthError, hideAuthError, setAuthLoading, escHtml, sanitizeUrl } from './ui.js';
import { renderDashboard, setDashPeriod } from './dashboard.js';
import { loadStock, recordStockMovement, getStockHistory } from './stock.js';
import { getTrackingUrl, getCarrierLabel } from './tracking.js';

// ── Paint URL detection — executa antes do auth ───────────────
// QR das etiquetas de pintura codifica: APP_URL?paint=INCIDENT_ID
// Ao abrir o URL num telemóvel, o app detecta e trata o retorno da peça.
let _pendingPaintId = null;
(function () {
  const params  = new URLSearchParams(window.location.search);
  const paintId = params.get('paint');
  if (paintId) {
    _pendingPaintId = paintId;
    // Limpa o ?paint= da URL sem recarregar a página
    window.history.replaceState({}, '', window.location.pathname);
  }
})();

// ── State ─────────────────────────────────────────────────────
let currentPhotos     = [];
let editingId         = null;
let stockItems        = [];
let stockDetailPartNo = null;
let _currentDetailId  = null; // ID do incidente actualmente visível no painel de detalhe

// ── Tabs de tipo (Peças / Pintura) ────────────────────────────
let currentTypeTab = 'normal'; // 'normal' | 'paint'
// Estado independente por tab: pesquisa + filtro de status + modelo
let tabState = {
  normal: { search: '', filter: 'all', model: '' },
  paint:  { search: '', filter: 'all', model: '' },
};

// ── Splash screen ─────────────────────────────────────────────
function hideSplash() {
  const splash = document.getElementById('splashScreen');
  if (!splash) return;
  splash.classList.add('splash-out');
  setTimeout(() => splash.remove(), 350);
}

// ── Realtime sync ─────────────────────────────────────────────
let _realtimeStarted = false;

// ── Debounce para renderDashboard — evita recalcular a cada snapshot ─
let _dashDebounceTimer = null;
function _debouncedRenderDashboard() {
  clearTimeout(_dashDebounceTimer);
  _dashDebounceTimer = setTimeout(renderDashboard, 500);
}

function startRealtimeSync(onFirstLoad) {
  if (_realtimeStarted) {
    // Já subscrito — apenas re-renderiza
    renderList();
    onFirstLoad?.();
    return;
  }
  _realtimeStarted = true;

  const el = document.getElementById('incidentList');
  if (el) el.innerHTML = '<div class="loading-state"><div class="spinner"></div> A carregar...</div>';

  let _firstLoad = true;
  subscribeToIncidents(() => {
    renderList();

    // Re-renderiza o painel de detalhe se estiver aberto — corrige o bug
    // de alterações só aparecerem após F5
    if (_currentDetailId) {
      const inc = incidents.find(i => i.id === _currentDetailId);
      if (inc) {
        const html = buildDetailHTML(inc);
        if (isDesktop()) {
          const content = document.getElementById('desktopDetailContent');
          if (content && content.style.display !== 'none') {
            content.innerHTML = html;
          }
        } else {
          const detailPage = document.getElementById('page-detail');
          if (detailPage?.classList.contains('active')) {
            document.getElementById('detailContent').innerHTML = html;
          }
        }
      } else {
        // Incidente foi eliminado — limpa o detalhe
        _currentDetailId = null;
      }
    }

    // Atualiza dashboard se estiver visível (com debounce)
    const dashSection = document.getElementById('dashboardSection');
    const dashPage    = document.querySelector('.page#dashboard');
    if (dashSection && dashPage && dashPage.classList.contains('active')) {
      _debouncedRenderDashboard();
    }
    // Notifica o callback de primeiro carregamento
    if (_firstLoad) {
      _firstLoad = false;
      onFirstLoad?.();
    }
  });
}

function stopRealtimeSync() {
  _realtimeStarted = false;
  unsubscribeFromIncidents();
}

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

    hideSplash();
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('appScreen').classList.add('visible');
    showPage('list');
    // Verifica rascunho e QR pendente após o primeiro snapshot carregar
    startRealtimeSync(() => {
      checkForDraft();
      if (_pendingPaintId) handlePendingPaint();
    });
  },
  () => {
    stopRealtimeSync();
    hideSplash();
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
  } catch (e) {
    showAuthError(e.message);
    setAuthLoading('loginBtn', false, 'Entrar');
  }
};

window.doLogout = async () => {
  stopRealtimeSync();
  await logout();
  closeModal('userModal');
};

// ── User modal ────────────────────────────────────────────────
window.openUserModal  = () => { openModal('userModal'); _renderSavePickerToggle(); };
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
      el.innerHTML = '<div class="user-list-empty">Nenhum utilizador</div>';
      return;
    }
    el.innerHTML = users.map(u => {
      const initials  = escHtml((u.name || u.email || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2));
      const roleClass = u.role === 'admin' ? 'admin' : 'user';
      const roleLabel = u.role === 'admin' ? '👑 Admin' : 'User';
      return `
      <div class="user-list-item">
        <div class="user-list-avatar">${initials}</div>
        <div class="user-list-info">
          <div class="user-list-name">${escHtml(u.name) || '—'}</div>
          <div class="user-list-email">${escHtml(u.email) || ''}</div>
        </div>
        <span class="user-list-role ${roleClass}">${roleLabel}</span>
      </div>`;
    }).join('');
  } catch {
    el.innerHTML = '<div class="user-list-error">Erro ao carregar utilizadores.</div>';
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
    const result = await createUser(name, email, pass);
    document.getElementById('newUserName').value  = '';
    document.getElementById('newUserEmail').value = '';
    document.getElementById('newUserPass').value  = '';

    if (result.requiresRelogin) {
      // Firebase fez logout do admin ao criar o novo utilizador
      // Mostra mensagem clara antes de redirecionar para login
      closeModal('usersModal');
      showToast(`✅ ${name} criado! Faça login novamente.`);
      setTimeout(() => {
        document.getElementById('appScreen').classList.remove('visible');
        document.getElementById('authScreen').style.display = 'flex';
      }, 2000);
    } else {
      showToast(`✅ ${name} adicionado com sucesso!`);
      await renderUsersList();
    }
  } catch (e) {
    errEl.textContent   = e.message;
    errEl.style.display = 'block';
  }

  btn.disabled = false;
  btn.textContent = '➕ Criar utilizador';
};

// ── Navigation ────────────────────────────────────────────────
// ── Desktop nav tab sync ──────────────────────────────────────
function setDesktopTab(tabId) {
  document.querySelectorAll('.desktop-nav-tab').forEach(t => t.classList.remove('active'));
  const tab = document.getElementById('dnt-' + tabId);
  if (tab) tab.classList.add('active');
}

window.goToList  = () => { _currentDetailId = null; showPage('list'); setDesktopTab('list'); renderList(); checkForDraft(); };
window.goToForm  = () => {
  clearForm();
  showPage('form');
  setDesktopTab('form');
  // Pré-selecciona o tipo de acordo com a tab activa
  setIncidentType(currentTypeTab);
  // Pré-preenche o campo Nº CAR com o próximo número sugerido
  _prefillCARNumber();
  startDraftTimer();
  attachDraftListeners();
};
window.goToExcel = () => { showPage('excel'); setDesktopTab('excel'); updateExcelStats(); renderDashboard(); };
window.goToStock = () => { showPage('stock'); setDesktopTab('stock'); renderStockPage(); };

// ══════════════════════════════════════════════════════════════
// STOCK — funções de página
// ══════════════════════════════════════════════════════════════

async function renderStockPage() {
  const el = document.getElementById('stockList');
  if (!el) return;
  el.innerHTML = '<div class="loading-state"><div class="spinner"></div> A carregar...</div>';
  try {
    stockItems = await loadStock();
    renderStockList();
    updateStockSummary();
  } catch (e) {
    el.innerHTML = `<div class="loading-state" style="color:var(--red-500)">Erro: ${e.message}</div>`;
  }
}

function renderStockList(search = '') {
  const el = document.getElementById('stockList');
  if (!el) return;
  const q = (search || '').toLowerCase();
  const filtered = q
    ? stockItems.filter(i =>
        (i.partName || '').toLowerCase().includes(q) ||
        (i.partNo   || '').toLowerCase().includes(q))
    : stockItems;

  if (!filtered.length) {
    el.innerHTML = `<div class="loading-state" style="color:var(--ink-400);font-size:13px;">
      ${q ? 'Nenhuma peça encontrada.' : 'Nenhuma peça em stock.<br>O stock actualiza automaticamente quando incidentes mudam de status.'}
    </div>`;
    return;
  }

  // Ordenar: zero/negativo primeiro, depois crescente por qty, depois nome
  const sorted = [...filtered].sort((a, b) => {
    const qa = a.qty || 0, qb = b.qty || 0;
    if (qa <= 0 && qb > 0) return -1;
    if (qa > 0 && qb <= 0) return 1;
    if (qa <= 2 && qb > 2) return -1;
    if (qa > 2 && qb <= 2) return 1;
    return (a.partName || '').localeCompare(b.partName || '');
  });

  el.innerHTML = sorted.map(item => {
    const qty = item.qty || 0;
    const cls = qty <= 0 ? 'stock-zero' : qty <= 2 ? 'stock-low' : 'stock-ok';
    const dot = qty <= 0 ? 'var(--red-500)' : qty <= 2 ? 'var(--amber-500)' : 'var(--green-500)';
    const safePartNo = (item.partNo || '').replace(/'/g, "\\'");
    return `
      <div class="stock-card" onclick="openStockDetail('${safePartNo}')">
        <span class="stock-dot" style="background:${dot}"></span>
        <div class="stock-info">
          <div class="stock-name">${escHtml(item.partName) || '—'}</div>
          <div class="stock-code">${escHtml(item.partNo) || '—'}</div>
        </div>
        <div class="stock-qty ${cls}">${qty}</div>
      </div>`;
  }).join('');
}

function updateStockSummary() {
  const total   = stockItems.length;
  const inStock = stockItems.filter(i => (i.qty || 0) > 0).length;
  const zero    = stockItems.filter(i => (i.qty || 0) <= 0).length;
  const t = document.getElementById('stockSummaryTotal');
  const s = document.getElementById('stockSummaryIn');
  const z = document.getElementById('stockSummaryZero');
  if (t) t.textContent = total;
  if (s) s.textContent = inStock;
  if (z) z.textContent = zero;
}

window.filterStock = () => {
  renderStockList(document.getElementById('stockSearch')?.value || '');
};

window.openStockDetail = async (partNo) => {
  stockDetailPartNo = partNo;
  const item = stockItems.find(i => i.partNo === partNo) || { partNo, partName: '', qty: 0 };
  const qty  = item.qty || 0;
  const cls  = qty <= 0 ? 'stock-zero' : qty <= 2 ? 'stock-low' : 'stock-ok';

  const titleEl = document.getElementById('stockDetailTitle');
  const codeEl  = document.getElementById('stockDetailCode');
  const qtyEl   = document.getElementById('stockDetailQty');
  if (titleEl) titleEl.textContent = item.partName || partNo;
  if (codeEl)  codeEl.textContent  = partNo;
  if (qtyEl)   { qtyEl.textContent = qty; qtyEl.className = 'stock-detail-qty ' + cls; }

  const histEl = document.getElementById('stockDetailHistory');
  if (histEl) histEl.innerHTML = '<div class="loading-state"><div class="spinner"></div></div>';

  openModal('stockDetailModal');

  try {
    const history = await getStockHistory(partNo);
    if (!history.length) {
      histEl.innerHTML = '<p style="color:var(--ink-400);font-size:13px;text-align:center;padding:16px 0;">Sem movimentos registados</p>';
      return;
    }
    histEl.innerHTML = history.map(m => {
      const icon  = m.type === 'in' ? '📥' : m.type === 'out' ? '📤' : '🔧';
      const sign  = m.qty > 0 ? '+' : '';
      const color = m.qty > 0 ? 'var(--green-500)' : 'var(--red-500)';
      const d     = new Date(m.date);
      const ds    = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
      return `
        <div class="stock-move-row">
          <span class="stock-move-icon">${icon}</span>
          <div class="stock-move-info">
            <span class="stock-move-label">${escHtml(m.note) || (m.type === 'in' ? 'Entrada' : m.type === 'out' ? 'Saída' : 'Ajuste')}</span>
            ${m.carNum ? `<span class="stock-move-car">${escHtml(m.carNum)}</span>` : ''}
          </div>
          <div class="stock-move-right">
            <span class="stock-move-qty" style="color:${color}">${sign}${Number(m.qty) || 0}</span>
            <span class="stock-move-date">${ds}</span>
          </div>
        </div>`;
    }).join('');
  } catch (e) {
    if (histEl) histEl.innerHTML = `<p style="color:var(--red-500);font-size:13px;text-align:center;">Erro: ${e.message}</p>`;
  }
};

window.closeStockDetail = (e) => {
  if (!e || e.target === document.getElementById('stockDetailModal')) closeModal('stockDetailModal');
};

window.openStockAdjust = (partNo) => {
  const pNo  = partNo || '';
  const item = stockItems.find(i => i.partNo === pNo) || { partNo: pNo, partName: '', qty: 0 };

  const pnEl = document.getElementById('adjustPartNoInput');
  const qEl  = document.getElementById('adjustQty');
  const nEl  = document.getElementById('adjustNote');
  const tEl  = document.getElementById('adjustType');
  if (pnEl) pnEl.value = item.partNo || '';
  if (qEl)  qEl.value  = '';
  if (nEl)  nEl.value  = '';
  if (tEl)  tEl.value  = 'in';
  openModal('stockAdjustModal');
};

window.closeStockAdjust = (e) => {
  if (!e || e.target === document.getElementById('stockAdjustModal')) closeModal('stockAdjustModal');
};

window.doStockAdjust = async () => {
  const partNoVal = (document.getElementById('adjustPartNoInput')?.value || '').trim();
  const type      = document.getElementById('adjustType')?.value || 'in';
  const qtyRaw    = parseInt(document.getElementById('adjustQty')?.value || '0');
  const note      = (document.getElementById('adjustNote')?.value || '').trim();

  if (!partNoVal)       { showToast('⚠️ Código da peça em falta'); return; }
  if (!qtyRaw || qtyRaw <= 0) { showToast('⚠️ Quantidade inválida'); return; }

  const item = stockItems.find(i => i.partNo === partNoVal) || { partNo: partNoVal, partName: '' };
  const qty  = type === 'out' ? -qtyRaw : qtyRaw;

  const btn = document.getElementById('adjustConfirmBtn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ A guardar...'; }

  try {
    await recordStockMovement({
      partNo:   item.partNo,
      partName: item.partName,
      type:     'adjust',
      qty,
      user:     currentUser?.displayName || currentUser?.email || '',
      note:     note || (type === 'in' ? 'Entrada manual' : 'Saída manual'),
    });
    closeModal('stockAdjustModal');
    showToast(type === 'in'
      ? `📥 +${qtyRaw} adicionado ao stock`
      : `📤 −${qtyRaw} removido do stock`);
    await renderStockPage();
    if (stockDetailPartNo === partNoVal) await window.openStockDetail(partNoVal);
  } catch (e) {
    showToast('❌ Erro: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '✓ Confirmar'; }
  }
};

// ── Sub-tabs da página Relatório ──────────────────────────────
window.showExcelTab = (tab) => {
  const dash  = document.getElementById('dashboardSection');
  const rpts  = document.getElementById('reportsSection');
  const paint = document.getElementById('paintReportSection');
  if (dash)  dash.style.display  = tab === 'dashboard' ? '' : 'none';
  if (rpts)  rpts.style.display  = tab === 'reports'   ? '' : 'none';
  if (paint) paint.style.display = tab === 'paint'     ? '' : 'none';
  document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
  const btn = document.getElementById('st-' + tab);
  if (btn) btn.classList.add('active');
  if (tab === 'dashboard') renderDashboard();
  if (tab === 'paint')     renderPaintReport();
};

// ── Expõe setDashPeriod ao HTML ───────────────────────────────
window.setDashPeriod = setDashPeriod;

// ── Listeners para guardar rascunho ao digitar ────────────────
function attachDraftListeners() {
  const fields = ['fCarNum','fPartNo','fPartName','fModel','fOrderNo','fLotNo','fNgQty','fDefect','fDetected'];
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', saveDraft);
      el.addEventListener('change', saveDraft);
    }
  });
}

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
  // ── Estado da tab activa ──────────────────────────────────
  const state  = tabState[currentTypeTab];
  const search = state.search;
  const filter = state.filter;
  const model  = state.model;

  // Actualiza opções do dropdown de modelo
  _updateModelFilterOptions();

  // Incidentes do tipo actual (para stats e empty state)
  const typeIncs = incidents.filter(i => (i.incidentType || 'normal') === currentTypeTab);

  // Lista filtrada por tipo + status + pesquisa + modelo
  let list = filterIncidents(incidents, { filter, search, incidentType: currentTypeTab });
  if (model) list = list.filter(i => i.model === model);

  // Stats da tab activa
  const stats = getStats(typeIncs);

  // Contadores nos botões de tab
  const normalCount = incidents.filter(i => (i.incidentType || 'normal') === 'normal').length;
  const paintCount  = incidents.filter(i => (i.incidentType || 'normal') === 'paint').length;
  const tabCntN = document.getElementById('tabCountNormal');
  const tabCntP = document.getElementById('tabCountPaint');
  if (tabCntN) tabCntN.textContent = normalCount || '0';
  if (tabCntP) tabCntP.textContent = paintCount  || '0';

  // Calcula tendência para o tipo activo
  const now = Date.now();
  const month = 30 * 24 * 60 * 60 * 1000;
  const thisMonth = typeIncs.filter(i => now - (i.createdAt || 0) < month).length;
  const lastMonth = typeIncs.filter(i => {
    const age = now - (i.createdAt || 0);
    return age >= month && age < month * 2;
  }).length;
  const diff = thisMonth - lastMonth;
  const trendHTML = diff > 0
    ? `<div class="stat-trend up">↑ +${diff} este mês</div>`
    : diff < 0
    ? `<div class="stat-trend down">↓ ${diff} este mês</div>`
    : `<div class="stat-trend flat">— igual ao mês anterior</div>`;

  document.getElementById('statTotal').textContent   = stats.total;
  document.getElementById('statPending').textContent = stats.pending;
  document.getElementById('statDone').textContent    = stats.done;

  // Empty state KPIs (desktop detail panel) — sempre todos os incidentes
  const IN_TRANSIT = ['sent', 'awaiting', 'eta_confirmed', 'received'];
  const emT  = document.getElementById('emptyTotal');
  const emP  = document.getElementById('emptyPending');
  const emTr = document.getElementById('emptyInTransit');
  const emD  = document.getElementById('emptyDone');
  if (emT)  emT.textContent  = incidents.length;
  if (emP)  emP.textContent  = incidents.filter(i => (i.status || 'pending') === 'pending').length;
  if (emTr) emTr.textContent = incidents.filter(i => IN_TRANSIT.includes(i.status)).length;
  if (emD)  emD.textContent  = incidents.filter(i => i.status === 'done').length;

  // Tendência no card total
  const trendEl = document.getElementById('statTrend');
  if (trendEl) trendEl.innerHTML = trendHTML;

  const el = document.getElementById('incidentList');

  if (!list.length) {
    const isPaint = currentTypeTab === 'paint';
    const empty = typeIncs.length || search
      ? '<div class="empty-state"><div class="empty-state-icon">🔍</div><div class="empty-state-title">Sem resultados</div><div class="empty-state-desc">Tente outros termos de pesquisa</div></div>'
      : `<div class="empty-state"><div class="empty-state-icon">${isPaint ? '🎨' : '📦'}</div><div class="empty-state-title">Sem incidentes de ${isPaint ? 'pintura' : 'peças'}</div><div class="empty-state-desc">Toque em <strong>+</strong> para registar</div></div>`;
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
          <div class="incident-name">${escHtml(inc.partName) || '—'}</div>
          <div class="incident-code">${escHtml(inc.partNo)}</div>
        </div>
        <div class="incident-footer">
          <span class="incident-meta">
            ${inc.carNum ? `<span class="card-car-num">CAR ${escHtml(inc.carNum)}</span> · ` : ''}${escHtml(inc.model) || '—'} · ${fmtDate(inc.createdAt)}
          </span>
          ${statusBadge(inc.status, inc)}
        </div>
      </div>
    </div>`;
  }).join('');
}

// ── Muda tab de tipo ──────────────────────────────────────────
window.setTypeTab = (type) => {
  currentTypeTab = type;

  // Actualiza aparência dos botões de tab
  document.getElementById('tab-normal')?.classList.toggle('active', type === 'normal');
  document.getElementById('tab-paint')?.classList.toggle('active', type === 'paint');

  // Restaura pesquisa, filtro de status e modelo independentes desta tab
  const state = tabState[type];
  const searchEl = document.getElementById('searchInput');
  if (searchEl) searchEl.value = state.search;

  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  const activeChip = document.querySelector(`.chip[data-filter="${state.filter}"]`);
  if (activeChip) activeChip.classList.add('active');

  renderList();
};

window.setFilter = (f, el) => {
  tabState[currentTypeTab].filter = f;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  renderList();
};

window.onSearch = () => {
  tabState[currentTypeTab].search = document.getElementById('searchInput')?.value || '';
  renderList();
};

window.onModelFilter = () => {
  tabState[currentTypeTab].model = document.getElementById('modelFilter')?.value || '';
  renderList();
};

// Actualiza as opções do dropdown de modelo com os modelos existentes na tab activa
function _updateModelFilterOptions() {
  const select = document.getElementById('modelFilter');
  if (!select) return;

  const typeIncs = incidents.filter(i => (i.incidentType || 'normal') === currentTypeTab);
  const models   = [...new Set(typeIncs.map(i => i.model).filter(Boolean))].sort();
  const current  = tabState[currentTypeTab].model;

  // Reconstrói as opções preservando a selecção actual
  select.innerHTML = '<option value="">Todos os modelos</option>' +
    models.map(m => `<option value="${escHtml(m)}"${m === current ? ' selected' : ''}>${escHtml(m)}</option>`).join('');
}

// ── Banner de conectividade offline/online ────────────────────
function _showOfflineBanner() {
  if (document.getElementById('offlineBanner')) return;
  const banner = document.createElement('div');
  banner.id        = 'offlineBanner';
  banner.className = 'offline-banner';
  banner.innerHTML = `
    <span class="offline-banner-dot"></span>
    <span>Sem ligação — os dados podem estar desactualizados</span>`;
  document.body.appendChild(banner);
}

function _hideOfflineBanner() {
  const banner = document.getElementById('offlineBanner');
  if (!banner) return;
  banner.classList.add('offline-banner-hide');
  setTimeout(() => banner.remove(), 400);
}

window.addEventListener('offline', _showOfflineBanner);
window.addEventListener('online',  _hideOfflineBanner);
// Verifica estado inicial (dispositivo pode já estar offline ao carregar)
if (!navigator.onLine) _showOfflineBanner();

// ── Layout mode — sincroniza html.is-desktop / html.is-mobile ─
function setLayoutMode() {
  const desktop = window.innerWidth >= 900;
  document.documentElement.classList.toggle('is-desktop',  desktop);
  document.documentElement.classList.toggle('is-mobile',  !desktop);
}

// Debounce no resize para não disparar a cada pixel
let _layoutTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(_layoutTimer);
  _layoutTimer = setTimeout(setLayoutMode, 120);
});

// ── Helper: is desktop? ───────────────────────────────────────
function isDesktop() {
  return document.documentElement.classList.contains('is-desktop');
}

// ── Helpers de config por tipo ────────────────────────────────
function _isPaintInc(inc) { return (inc?.incidentType || 'normal') === 'paint'; }
function _flowFor(inc)    { return _isPaintInc(inc) ? PAINT_STATUS_FLOW   : STATUS_FLOW;   }
function _configFor(inc)  { return _isPaintInc(inc) ? PAINT_STATUS_CONFIG : STATUS_CONFIG; }

// Pintura usa só 3 estados; 'received' herdado é tratado como 'done'
function _normalisePaintStatus(st) {
  return (st === 'received' || st === 'awaiting' || st === 'eta_confirmed') ? 'done' : st;
}

// ── Status badge helper ───────────────────────────────────────
function statusBadge(status, inc) {
  const config = _configFor(inc);
  const st     = _isPaintInc(inc) ? _normalisePaintStatus(status) : status;
  const cfg    = config[st] || STATUS_CONFIG.pending;
  return `<span class="badge ${cfg.badge}">${cfg.icon} ${cfg.label}</span>`;
}

// ── Status stepper ────────────────────────────────────────────
function buildStepperHTML(inc) {
  const isPaint = _isPaintInc(inc);
  const flow    = _flowFor(inc);
  const config  = _configFor(inc);
  const rawSt   = inc.status || 'pending';
  const st      = isPaint ? _normalisePaintStatus(rawSt) : rawSt;
  const idx     = flow.indexOf(st);
  const parts   = [];

  flow.forEach((s, i) => {
    const cfg       = config[s] || STATUS_CONFIG[s];
    const isPast    = i < idx;
    const isCurrent = i === idx;
    const cls       = isPast ? 'step-past' : isCurrent ? 'step-current' : 'step-future';
    parts.push(`
      <div class="stepper-step ${cls}">
        <div class="stepper-dot">${isPast ? '✓' : ''}</div>
        <div class="stepper-label">${cfg.label}</div>
      </div>`);
    if (i < flow.length - 1) {
      parts.push(`<div class="stepper-connector ${isPast ? 'connector-done' : ''}"></div>`);
    }
  });
  return parts.join('');
}

// ── Build detail HTML ─────────────────────────────────────────
function buildDetailHTML(inc) {
  const isPaint = _isPaintInc(inc);
  const rawSt   = inc.status || 'pending';
  const st      = isPaint ? _normalisePaintStatus(rawSt) : rawSt;
  const stIdx   = (isPaint ? PAINT_STATUS_FLOW : STATUS_FLOW).indexOf(st);
  const stCfg   = _configFor(inc)[st] || STATUS_CONFIG.pending;

  // ── Photos — passa array completo ao lightbox para navegar entre fotos
  const _photoUrls = (inc.photos || []).map(p => sanitizeUrl(p.url)).filter(Boolean);
  const _photoUrlsJson = escHtml(JSON.stringify(_photoUrls));
  const photos = _photoUrls.map((url, i) =>
    `<div class="photo-thumb"><img src="${escHtml(url)}" loading="lazy" onclick="window.openLightbox(JSON.parse(this.closest('.photo-grid').dataset.urls),${i})"></div>`
  ).join('');

  // ── CAR block
  const missing = getMissingFields(inc);
  const carBlock = missing.length === 0
    ? `<button class="btn btn-primary" onclick="doGenerateCAR('${inc.id}')">📄 Gerar CAR Excel</button>`
    : `<div class="car-warning"><strong>Para gerar o CAR falta:</strong> ${missing.join(', ')}</div>`;

  // ── Botões de ação — lógica completamente diferente para pintura
  let nextBtn  = '';
  let adminBtn = '';
  const reopenBtn = st !== 'pending'
    ? `<button class="btn" onclick="doAdvanceStatus('${inc.id}','pending')">↩ Reabrir</button>`
    : '';

  if (isPaint) {
    // ── Pintura: transições exigem scan de QR ─────────────────
    if (st === 'pending') {
      nextBtn  = `<button class="btn btn-primary btn-paint-scan" onclick="doScanPaintSend('${inc.id}')">📷 Escanear para Enviar</button>`;
      if (isAdmin) adminBtn = `<button class="btn btn-admin-override" onclick="doAdminPaintAdvance('${inc.id}','sent')" title="Avançar sem QR — só admin">⚠️ Sem QR</button>`;
    } else if (st === 'sent') {
      nextBtn  = `<button class="btn btn-primary btn-paint-scan" onclick="doScanPaintReturn('${inc.id}')">📷 Escanear para Receber</button>`;
      if (isAdmin) adminBtn = `<button class="btn btn-admin-override" onclick="doAdminPaintAdvance('${inc.id}','done')" title="Encerrar sem QR — só admin">⚠️ Sem QR</button>`;
    }
    // done: nenhum botão de avanço
  } else {
    // ── Peças: fluxo normal ───────────────────────────────────
    const nextStatus = STATUS_FLOW[stIdx + 1];
    if (nextStatus) {
      if (nextStatus === 'sent') {
        // "Enviado" só aparece se o CAR já foi gerado — e só como fallback manual
        if (inc.carNum) {
          nextBtn = `<button class="btn btn-primary" onclick="doAdvanceStatus('${inc.id}','sent')">📤 Marcar como Enviado</button>`;
        }
      } else if (nextStatus === 'eta_confirmed') {
        // ETA só para admin
        if (isAdmin) {
          nextBtn = `<button class="btn btn-primary" onclick="doOpenETAInput('${inc.id}')">📅 Confirmar ETA</button>`;
        }
      } else if (nextStatus === 'done') {
        // Encerrar: pede nº chassis
        nextBtn = `<button class="btn btn-primary" onclick="doOpenCloseIncident('${inc.id}')">✓ Encerrar Claim</button>`;
      } else {
        const BTN_LABELS = {
          received: '📦 Marcar como Recebido',
        };
        nextBtn = `<button class="btn btn-primary" onclick="doAdvanceStatus('${inc.id}','${nextStatus}')">${BTN_LABELS[nextStatus] || nextStatus}</button>`;
      }
    }
  }

  // Botão de etiqueta — só para pintura
  const paintLabelBtn = isPaint
    ? `<button class="btn btn-paint-label" onclick="printPaintLabel('${inc.id}')">🖨 Etiqueta</button>`
    : '';

  // ── ETA display
  const trackUrl     = inc.tracking ? getTrackingUrl(inc.tracking) : '';
  const carrierLabel = inc.tracking ? getCarrierLabel(inc.tracking) : '';
  const etaBlock = inc.eta ? `
    <div class="eta-display">
      <div>
        <span class="eta-label">📅 ETA confirmado pela China</span>
        <span class="eta-value">${inc.eta}</span>
      </div>
      ${inc.tracking ? `
      <div class="tracking-row">
        <span class="tracking-label">📦 Tracking</span>
        <span class="tracking-num">${inc.tracking}</span>
        <a href="${trackUrl}" target="_blank" rel="noopener" class="btn btn-tracking">
          🔍 ${carrierLabel}
        </a>
      </div>` : ''}
    </div>` : '';

  // ── ETA input (hidden until opened)
  const etaInput = `
    <div class="eta-input-section" id="eta-section-${inc.id}" style="display:none">
      <div class="field" style="margin-bottom:8px">
        <label class="field-label">Data prevista de chegada</label>
        <input class="field-input" type="date" id="eta-input-${inc.id}">
      </div>
      <div class="field" style="margin-bottom:8px">
        <label class="field-label">Nº Tracking (FedEx / DHL) <span class="field-optional">opcional</span></label>
        <input class="field-input" type="text" id="tracking-input-${inc.id}"
               placeholder="ex: 748926481935" style="font-family:var(--font-mono)">
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" onclick="doConfirmETA('${inc.id}')">✓ Confirmar ETA</button>
        <button class="btn" onclick="doCloseETAInput('${inc.id}')">Cancelar</button>
      </div>
    </div>`;

  // ── History timeline
  const history = (inc.history || []).slice().reverse();
  const _histCfgFor = (h) => {
    if (!h.status) return null;
    // Usa config correta consoante o tipo de incidente
    const cfgMap = _configFor(inc);
    return cfgMap[h.status] || STATUS_CONFIG[h.status] || null;
  };
  const historyHTML = history.length
    ? history.map(h => {
        const cfg  = _histCfgFor(h);
        const ts   = new Date(h.timestamp);
        const date = ts.toLocaleDateString('pt-BR') + ' ' +
                     ts.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        return `
          <div class="history-entry${h.isNote ? ' history-note-entry' : ''}">
            <div class="history-dot" style="background:${cfg ? cfg.color : 'rgba(255,255,255,0.2)'}"></div>
            <div class="history-content">
              <div class="history-header">
                <span class="history-status-label">
                  ${h.isNote ? '📝 Nota' : (cfg ? cfg.icon + ' ' + cfg.label : '')}
                </span>
                <span class="history-time">${date}</span>
              </div>
              <div class="history-user">${escHtml(h.user) || ''}</div>
              ${h.note && h.note !== 'Incidente registado.' ? `<div class="history-note-text">${escHtml(h.note)}</div>` : ''}
            </div>
          </div>`;
      }).join('')
    : '<div class="history-empty">Sem histórico de alterações.</div>';

  return `
    <button class="back-btn" onclick="goToList()">
      ${svgIcon('arrow-left')} Voltar
    </button>

    <div class="detail-header" style="border-left-color:${stCfg.color}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div>
          <div class="detail-title">${escHtml(inc.partName) || '—'}</div>
          <div class="detail-subtitle">
            ${inc.carNum ? `<span class="detail-car-badge">CAR ${escHtml(inc.carNum)}</span> · ` : ''}${escHtml(inc.partNo)} · ${fmtDate(inc.createdAt)}
          </div>
        </div>
        ${statusBadge(st, inc)}
      </div>
    </div>

    <!-- Status Stepper -->
    <div class="form-card status-stepper-card" style="margin-bottom:10px">
      <div class="stepper-track">${buildStepperHTML(inc)}</div>
      ${isPaint ? '' : etaBlock}
      ${isPaint ? '' : etaInput}
      <div class="detail-actions" style="margin-top:14px">
        ${nextBtn}
        ${adminBtn}
        ${reopenBtn}
        ${paintLabelBtn}
        <button class="btn" onclick="editIncident('${inc.id}')">✏️ Editar</button>
        ${isAdmin ? `<button class="btn btn-danger" onclick="doDelete('${inc.id}')">🗑 Eliminar</button>` : ''}
      </div>
      <div style="margin-top:12px">${carBlock}</div>
    </div>

    <div class="form-card" style="margin-bottom:10px">
      <div class="form-card-title">${svgIcon('package')} Dados da Peça</div>
      ${inc.carNum ? renderDetailRow('Nº CAR', inc.carNum) : ''}
      ${renderDetailRow('Código', inc.partNo)}
      ${renderDetailRow('Modelo', inc.model)}
      ${renderDetailRow('Nº Pedido', inc.orderNo)}
      ${renderDetailRow('Lote', inc.lotNo)}
      ${renderDetailRow('Qtd. Defeituosa', inc.ngQty)}
      ${renderDetailRow('Registado por', inc.user)}
    </div>

    <div class="form-card" style="margin-bottom:10px">
      <div class="form-card-title">${svgIcon('file-text')} Descrição</div>
      <div class="detail-text">${escHtml(inc.defect) || '—'}</div>
      ${inc.detected ? `
        <div style="margin-top:12px;font-size:11px;font-weight:700;color:var(--ink-300);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Como detectado</div>
        <div class="detail-text">${escHtml(inc.detected)}</div>
      ` : ''}
    </div>

    ${photos ? `
      <div class="form-card" style="margin-bottom:10px">
        <div class="form-card-title">${svgIcon('camera')} Fotos (${inc.photos.length})</div>
        <div class="photo-grid" data-urls="${_photoUrlsJson}">${photos}</div>
      </div>
    ` : ''}

    <!-- Histórico -->
    <div class="form-card" style="margin-bottom:10px">
      <div class="form-card-title">📋 Histórico</div>
      <div class="history-timeline">${historyHTML}</div>
      <div class="history-note-form">
        <input class="field-input" type="text" id="noteInput-${inc.id}"
               placeholder="Adicionar nota ou comunicação com a China...">
        <button class="btn" onclick="doAddNote('${inc.id}')">+ Nota</button>
      </div>
    </div>
  `;
}

// ── Detail view ───────────────────────────────────────────────
window.showDetail = (id) => {
  const inc = incidents.find(i => i.id === id);
  if (!inc) return;

  _currentDetailId = id; // regista qual detalhe está aberto

  // Marca card seleccionado
  document.querySelectorAll('.incident-card').forEach(c => c.classList.remove('selected'));
  const card = document.querySelector(`.incident-card[onclick*="${id}"]`);
  if (card) card.classList.add('selected');

  const html = buildDetailHTML(inc);

  if (isDesktop()) {
    // Desktop: mostra no painel direito sem mudar de página
    const empty   = document.getElementById('desktopDetailEmpty');
    const content = document.getElementById('desktopDetailContent');
    if (empty)   empty.style.display   = 'none';
    if (content) { content.style.display = 'block'; content.innerHTML = html; content.scrollTop = 0; }
  } else {
    // Mobile: navega para página de detalhe como antes
    document.getElementById('detailContent').innerHTML = html;
    showPage('detail');
  }
};

window.doMarkDone = async (id) => {
  try {
    await updateIncidentStatus(id, 'done', currentUser);
    // Stock OUT automático
    const inc = incidents.find(i => i.id === id);
    if (inc?.partNo && inc?.ngQty) {
      const qty = parseInt(inc.ngQty) || 0;
      if (qty > 0) recordStockMovement({
        partNo: inc.partNo, partName: inc.partName || '',
        type: 'out', qty: -qty,
        incidentId: id, carNum: inc.carNum || null,
        user: currentUser?.displayName || currentUser?.email || '',
        note: `Instalado · ${inc.carNum || id}`,
      }).catch(e => console.warn('Stock OUT:', e));
    }
    showToast('✅ Claim encerrado!');
    window.showDetail(id); renderList();
  } catch { showToast('Erro ao actualizar.'); }
};

window.doMarkPending = async (id) => {
  try { await updateIncidentStatus(id, 'pending', currentUser); showToast('↩ Reaberto como pendente'); window.showDetail(id); renderList(); }
  catch { showToast('Erro ao actualizar.'); }
};

// ── Status flow actions ───────────────────────────────────────
window.doAdvanceStatus = async (id, newStatus) => {
  const LABELS = {
    sent:          '📤 Marcado como enviado!',
    eta_confirmed: '📅 ETA confirmado!',
    received:      '📦 Peça recebida!',
    done:          '✅ Claim encerrado!',
    pending:       '↩ Reaberto como pendente',
  };
  try {
    await updateIncidentStatus(id, newStatus, currentUser);

    // ── Stock automático ────────────────────────────────────
    const inc = incidents.find(i => i.id === id);
    if (inc?.partNo && inc?.ngQty) {
      const qty = parseInt(inc.ngQty) || 0;
      if (qty > 0 && newStatus === 'received') {
        recordStockMovement({
          partNo: inc.partNo, partName: inc.partName || '',
          type: 'in', qty,
          incidentId: id, carNum: inc.carNum || null,
          user: currentUser?.displayName || currentUser?.email || '',
          note: `Recebido · ${inc.carNum || id}`,
        }).catch(e => console.warn('Stock IN:', e));
      }
      if (qty > 0 && newStatus === 'done') {
        recordStockMovement({
          partNo: inc.partNo, partName: inc.partName || '',
          type: 'out', qty: -qty,
          incidentId: id, carNum: inc.carNum || null,
          user: currentUser?.displayName || currentUser?.email || '',
          note: `Instalado · ${inc.carNum || id}`,
        }).catch(e => console.warn('Stock OUT:', e));
      }
    }
    // ────────────────────────────────────────────────────────

    showToast(LABELS[newStatus] || 'Status actualizado');
    window.showDetail(id);
    renderList();
  } catch (e) { showToast('Erro: ' + e.message); }
};

window.doOpenETAInput = (id) => {
  const s = document.getElementById(`eta-section-${id}`);
  if (s) s.style.display = 'block';
};

window.doCloseETAInput = (id) => {
  const s = document.getElementById(`eta-section-${id}`);
  if (s) s.style.display = 'none';
};

window.doConfirmETA = async (id) => {
  const input    = document.getElementById(`eta-input-${id}`);
  const trackingEl = document.getElementById(`tracking-input-${id}`);
  if (!input || !input.value) { showToast('Seleccione uma data'); return; }
  const d        = new Date(input.value + 'T00:00:00');
  const eta      = d.toLocaleDateString('pt-BR');
  const tracking = trackingEl ? trackingEl.value.trim().replace(/\s+/g, '') : '';
  const note     = tracking ? `ETA confirmado: ${eta} · Tracking: ${tracking}` : `ETA confirmado: ${eta}`;
  try {
    await updateIncidentStatus(id, 'eta_confirmed', currentUser, note, eta, tracking);
    showToast(`📅 ETA confirmado: ${eta}${tracking ? ' · ' + tracking : ''}`);
    window.showDetail(id);
    renderList();
  } catch (e) { showToast('Erro: ' + e.message); }
};

// ── Encerrar incidente com nº chassis ────────────────────────
window.doOpenCloseIncident = (id) => {
  document.getElementById('closeIncidentOverlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id        = 'closeIncidentOverlay';
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box">
      <div class="confirm-icon">✓</div>
      <div class="confirm-title">Encerrar Claim</div>
      <div class="confirm-subtitle">Indique o veículo onde a peça foi instalada.</div>
      <div class="field" style="margin:4px 0 16px">
        <label class="field-label">Nº Chassis / Veículo</label>
        <input class="field-input" type="text" id="chassisInput"
               placeholder="ex: 9C2JC6150SR000123"
               style="font-family:var(--font-mono);text-transform:uppercase;">
      </div>
      <div class="confirm-btns">
        <button class="btn btn-primary confirm-btn-main" id="closeIncidentOk">✓ Confirmar e Encerrar</button>
        <button class="btn confirm-btn-sec" id="closeIncidentCancel">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  // Foco automático no campo
  setTimeout(() => document.getElementById('chassisInput')?.focus(), 100);

  document.getElementById('closeIncidentOk').onclick = async () => {
    const chassis = (document.getElementById('chassisInput')?.value || '').trim().toUpperCase();
    if (!chassis) { showToast('⚠️ Introduza o nº de chassis'); return; }
    overlay.remove();
    try {
      await updateIncidentStatus(id, 'done', currentUser, `Peça instalada no veículo: ${chassis}`);
      showToast('✅ Claim encerrado!');
      window.showDetail(id);
      renderList();
    } catch (e) { showToast('Erro: ' + e.message); }
  };
  document.getElementById('closeIncidentCancel').onclick = () => overlay.remove();
};

// ── Batch ETA / Tracking ──────────────────────────────────────
// Todos os incidentes em aberto (excluindo "done")
function getBatchEligible() {
  return incidents.filter(i => (i.status || 'pending') !== 'done');
}

function renderBatchList(incs, search = '') {
  const listEl = document.getElementById('batchIncidentList');
  if (!listEl) return;

  const q        = (search || '').toLowerCase().trim();
  const filtered = q
    ? incs.filter(i =>
        (i.partName || '').toLowerCase().includes(q) ||
        (i.partNo   || '').toLowerCase().includes(q) ||
        (i.model    || '').toLowerCase().includes(q) ||
        (i.orderNo  || '').toLowerCase().includes(q))
    : incs;

  if (!filtered.length) {
    listEl.innerHTML = `<div class="batch-empty">Nenhum incidente encontrado${q ? ` para "${q}"` : ''}.</div>`;
    return;
  }

  // Ordena: pendentes primeiro, depois por nome
  const sorted = [...filtered].sort((a, b) => {
    const stA = a.status || 'pending';
    const stB = b.status || 'pending';
    if (stA === 'pending' && stB !== 'pending') return -1;
    if (stB === 'pending' && stA !== 'pending') return  1;
    return (a.partName || '').localeCompare(b.partName || '');
  });

  listEl.innerHTML = sorted.map(i => {
    const st      = i.status || 'pending';
    const stCfg   = STATUS_CONFIG[st] || STATUS_CONFIG.pending;
    const isPend  = st === 'pending';
    const trackBadge  = i.tracking
      ? `<span class="batch-tracking-badge">📦 ${i.tracking}</span>` : '';
    const advBadge = isPend
      ? `<span class="batch-advance-badge">⚡ auto-avançado</span>` : '';
    return `
      <label class="batch-item${isPend ? ' batch-item-pending' : ''}">
        <input type="checkbox" class="batch-cb" value="${i.id}" checked
               onchange="updateBatchCount()">
        <div class="batch-item-info">
          <div class="batch-item-name-row">
            <span class="batch-item-name">${i.partName || '—'}</span>
            <span class="batch-status-pill" style="background:${stCfg.color}20;color:${stCfg.color};border-color:${stCfg.color}40">
              ${stCfg.icon} ${stCfg.label}
            </span>
          </div>
          <span class="batch-item-meta">
            ${[i.partNo, i.model, i.ngQty ? i.ngQty + ' un' : ''].filter(Boolean).join(' · ')}
            ${trackBadge}${advBadge}
          </span>
        </div>
      </label>`;
  }).join('');
}

window.openBatchETA = () => {
  const eligible = getBatchEligible();
  const searchEl = document.getElementById('batchSearch');
  if (searchEl) searchEl.value = '';

  if (!eligible.length) {
    const listEl = document.getElementById('batchIncidentList');
    listEl.innerHTML = `
      <div class="batch-empty">Não há incidentes em aberto.</div>`;
  } else {
    renderBatchList(eligible);
  }
  updateBatchCount();
  openModal('batchETAModal');
};

window.closeBatchETA = (e) => {
  if (!e || e.target === document.getElementById('batchETAModal')) closeModal('batchETAModal');
};

window.batchSearch = () => {
  const q = document.getElementById('batchSearch')?.value || '';
  renderBatchList(getBatchEligible(), q);
  updateBatchCount();
};

window.batchSelectAll = (checked) => {
  document.querySelectorAll('.batch-cb').forEach(cb => { cb.checked = checked; });
  updateBatchCount();
};

window.updateBatchCount = () => {
  const allCbs     = document.querySelectorAll('.batch-cb');
  const checkedCbs = [...document.querySelectorAll('.batch-cb:checked')];
  const total      = allCbs.length;
  const selected   = checkedCbs.length;

  const pendingCnt = checkedCbs.filter(cb => {
    const inc = incidents.find(i => i.id === cb.value);
    return inc && (inc.status || 'pending') === 'pending';
  }).length;

  const el = document.getElementById('batchSelectedCount');
  if (el) {
    el.textContent = `${selected} de ${total} selecionados`;
    if (pendingCnt) el.textContent += ` · ${pendingCnt} serão auto-avançados ⚡`;
  }
  const btn = document.getElementById('batchConfirmBtn');
  if (btn) btn.textContent = selected > 0
    ? `✓ Confirmar ETA em ${selected} incidente${selected > 1 ? 's' : ''}`
    : '✓ Confirmar ETA';
};

window.doBatchConfirmETA = async () => {
  const trackingEl = document.getElementById('batchTracking');
  const etaEl      = document.getElementById('batchETA');
  const tracking   = (trackingEl?.value || '').trim().replace(/\s+/g, '');
  const etaRaw     = etaEl?.value || '';

  if (!tracking) { showToast('⚠️ Insere o número de tracking'); return; }
  if (!etaRaw)   { showToast('⚠️ Selecciona a data ETA');       return; }

  const selected = [...document.querySelectorAll('.batch-cb:checked')].map(cb => cb.value);
  if (!selected.length) { showToast('⚠️ Selecciona pelo menos 1 incidente'); return; }

  const d   = new Date(etaRaw + 'T00:00:00');
  const eta = d.toLocaleDateString('pt-BR');

  const btn = document.getElementById('batchConfirmBtn');
  if (btn) { btn.disabled = true; btn.textContent = `⏳ A actualizar ${selected.length}...`; }

  try {
    // batchAdvanceToETA avança de qualquer status → eta_confirmed num único write
    await Promise.all(
      selected.map(id => batchAdvanceToETA(id, currentUser, eta, tracking))
    );
    closeModal('batchETAModal');
    showToast(`✅ ${selected.length} incidente${selected.length > 1 ? 's' : ''} confirmados · ${tracking}`);
    if (trackingEl) trackingEl.value = '';
    if (etaEl)      etaEl.value      = '';
    renderList();
  } catch (e) {
    showToast('❌ Erro: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; updateBatchCount(); }
  }
};

window.doAddNote = async (id) => {
  const input = document.getElementById(`noteInput-${id}`);
  if (!input) return;
  const note = input.value.trim();
  if (!note) { showToast('Escreva uma nota primeiro'); return; }
  try {
    await addIncidentNote(id, currentUser, note);
    input.value = '';
    showToast('📝 Nota adicionada!');
    window.showDetail(id);
  } catch (e) { showToast('Erro: ' + e.message); }
};

window.doDelete = async (id) => {
  if (!isAdmin) { showToast('⛔ Só o admin pode eliminar.'); return; }
  if (!confirm('Eliminar este incidente? Não pode ser desfeito.')) return;
  try { await deleteIncident(id); showToast('🗑 Eliminado'); goToList(); }
  catch { showToast('Erro ao eliminar.'); }
};

// ══════════════════════════════════════════════════════════════
// PAINT REWORK TRACKING
// QR codifica: APP_URL?paint=INCIDENT_ID
// Etiqueta mostra: QR + nº CAR + nome da peça + data
// Ao escanear o QR → app abre → regista retorno automaticamente
// ══════════════════════════════════════════════════════════════

const PAINT_APP_URL = 'https://ckd-claim-manaus.github.io/CAR-CLAIM-CKD/';

// ── Valida QR: retorna true se o URL codifica este incidente ──
function _validatePaintQR(data, expectedId) {
  try {
    return new URL(data).searchParams.get('paint') === expectedId;
  } catch { return false; }
}

// ── Overlay de confirmação com UI personalizada ───────────────
function _showPaintActionConfirm(title, subtitle, confirmLabel, onConfirm) {
  document.getElementById('paintActionConfirm')?.remove();

  const overlay = document.createElement('div');
  overlay.id        = 'paintActionConfirm';
  overlay.className = 'paint-action-confirm';
  overlay.innerHTML = `
    <div class="paint-action-confirm-box">
      <div class="paint-action-confirm-title">${title}</div>
      <div class="paint-action-confirm-subtitle">${subtitle}</div>
      <div class="paint-action-confirm-btns">
        <button class="btn btn-primary" id="paintConfirmOk">${confirmLabel}</button>
        <button class="btn" id="paintConfirmCancel">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  document.getElementById('paintConfirmOk').onclick     = () => { overlay.remove(); onConfirm(); };
  document.getElementById('paintConfirmCancel').onclick = () => overlay.remove();
}

// ── Scan para enviar para pintoria (pending → sent) ───────────
window.doScanPaintSend = (id) => {
  openQR(
    (data) => {
      if (!_validatePaintQR(data, id)) { showToast('⚠️ QR não corresponde a este incidente'); return; }
      const inc = incidents.find(i => i.id === id);
      closeQR();
      _showPaintActionConfirm(
        '🎨 Enviar para Pintoria',
        `${inc?.partName || '—'} · ${inc?.carNum ? 'CAR ' + inc.carNum : 'SEM CAR'}`,
        '✅ Confirmar Envio',
        async () => {
          try {
            await updateIncidentStatus(id, 'sent', currentUser, 'Enviado para pintoria via leitura de QR.');
            showToast('🎨 Enviado para pintoria!');
            window.showDetail(id); renderList();
          } catch (e) { showToast('Erro: ' + e.message); }
        }
      );
    },
    (err) => showToast('Erro ao aceder à câmera: ' + err.message)
  );
};

// ── Scan para confirmar retorno e encerrar (sent → done) ──────
window.doScanPaintReturn = (id) => {
  openQR(
    (data) => {
      if (!_validatePaintQR(data, id)) { showToast('⚠️ QR não corresponde a este incidente'); return; }
      const inc = incidents.find(i => i.id === id);
      closeQR();
      _showPaintActionConfirm(
        '✅ Confirmar Retorno da Pintoria',
        `${inc?.partName || '—'} · Retrabalho concluído?`,
        '✅ Confirmar e Encerrar',
        async () => {
          try {
            await updateIncidentStatus(id, 'done', currentUser, 'Peça retornou da pintoria — confirmado por leitura de QR.');
            showToast('✅ Retrabalho de pintura encerrado!');
            window.showDetail(id); renderList();
          } catch (e) { showToast('Erro: ' + e.message); }
        }
      );
    },
    (err) => showToast('Erro ao aceder à câmera: ' + err.message)
  );
};

// ── Admin bypass — avança sem QR (só admin) ───────────────────
window.doAdminPaintAdvance = (id, targetStatus) => {
  if (!isAdmin) { showToast('⛔ Só o admin pode avançar sem QR.'); return; }
  const inc = incidents.find(i => i.id === id);
  if (!inc) return;
  const labels = { sent: 'Enviar para Pintoria', done: 'Encerrar' };
  const notes  = { sent: 'Enviado para pintoria (admin, sem QR).', done: 'Encerrado pelo admin sem leitura de QR.' };
  _showPaintActionConfirm(
    `⚠️ ${labels[targetStatus] || 'Avançar'} sem QR`,
    `Admin · ${inc.partName || '—'} · sem leitura de etiqueta`,
    `⚠️ ${labels[targetStatus] || 'Avançar'}`,
    async () => {
      try {
        await updateIncidentStatus(id, targetStatus, currentUser, notes[targetStatus] || '');
        showToast(targetStatus === 'sent' ? '🎨 Enviado para pintoria!' : '✅ Encerrado!');
        window.showDetail(id); renderList();
      } catch (e) { showToast('Erro: ' + e.message); }
    }
  );
};

// ── Trata ?paint= pendente após login + incidents carregados ──
function handlePendingPaint() {
  if (!_pendingPaintId) return;
  const id = _pendingPaintId;
  _pendingPaintId = null;

  const inc = incidents.find(i => i.id === id);
  if (!inc) { showToast('⚠️ Incidente de pintura não encontrado'); return; }

  if (!isDesktop()) goToList();
  setTimeout(() => {
    window.showDetail(id);
    const st = inc.status || 'pending';
    if (st === 'done') { showToast('✅ Este incidente já está encerrado.'); return; }
    if (st === 'pending') {
      _showPaintActionConfirm(
        '🎨 Enviar para Pintoria',
        `${inc.partName || '—'} · QR lido — confirmar envio?`,
        '✅ Confirmar Envio',
        async () => {
          try {
            await updateIncidentStatus(id, 'sent', currentUser, 'Enviado para pintoria via leitura de QR.');
            showToast('🎨 Enviado para pintoria!');
            window.showDetail(id); renderList();
          } catch (e) { showToast('Erro: ' + e.message); }
        }
      );
    } else {
      _showPaintActionConfirm(
        '✅ Confirmar Retorno da Pintoria',
        `${inc.partName || '—'} · Retrabalho concluído?`,
        '✅ Confirmar e Encerrar',
        async () => {
          try {
            await updateIncidentStatus(id, 'done', currentUser, 'Peça retornou da pintoria — confirmado por leitura de QR.');
            showToast('✅ Retrabalho de pintura encerrado!');
            window.showDetail(id); renderList();
          } catch (e) { showToast('Erro: ' + e.message); }
        }
      );
    }
  }, isDesktop() ? 0 : 120);
}

// ── Banner amarelo de confirmação de retorno ──────────────────
function _showPaintReturnBanner(id, inc) {
  document.getElementById('paintReturnBanner')?.remove();

  const st         = inc.status || 'pending';
  const nextStatus = st === 'received' ? 'done' : 'received';
  const btnLabel   = nextStatus === 'done' ? '✅ Encerrar' : '📦 Confirmar Retorno';

  const banner = document.createElement('div');
  banner.id        = 'paintReturnBanner';
  banner.className = 'paint-return-banner';
  banner.innerHTML = `
    <div class="paint-return-banner-info">
      <div class="paint-return-banner-title">🎨 Retorno da Pintoria detectado</div>
      <div class="paint-return-banner-name">${inc.partName || '—'}</div>
    </div>
    <button class="paint-return-btn" onclick="doPaintReturn('${id}')">${btnLabel}</button>
    <button class="paint-return-close"
      onclick="document.getElementById('paintReturnBanner')?.remove()">✕</button>
  `;

  document.body.appendChild(banner);
  // Remove automaticamente após 45 s
  setTimeout(() => document.getElementById('paintReturnBanner')?.remove(), 45000);
}

// ── Confirma retorno via banner ou botão manual ───────────────
window.doPaintReturn = async (id) => {
  const inc = incidents.find(i => i.id === id);
  if (!inc) return;
  document.getElementById('paintReturnBanner')?.remove();
  try {
    await updateIncidentStatus(id, 'done', currentUser, 'Retrabalho de pintura encerrado via leitura de QR.');
    showToast('✅ Retrabalho de pintura encerrado!');
    window.showDetail(id);
    renderList();
  } catch (e) { showToast('Erro: ' + e.message); }
};

// ── Gera QR + abre modal de impressão ────────────────────────
window.printPaintLabel = (id) => {
  const inc = incidents.find(i => i.id === id);
  if (!inc) return;

  const qrUrl    = `${PAINT_APP_URL}?paint=${encodeURIComponent(id)}`;
  const carLabel = inc.carNum ? `CAR ${inc.carNum}` : 'SEM CAR';
  const partName = (inc.partName || '—').toUpperCase().slice(0, 32);
  const dateStr  = new Date(inc.createdAt || Date.now()).toLocaleDateString('pt-BR');

  // Preenche campos de texto (elementos já existem no DOM — sem innerHTML)
  const byId = (i) => document.getElementById(i);
  if (byId('labelCarNum'))  byId('labelCarNum').textContent  = carLabel;
  if (byId('labelPartName')) byId('labelPartName').textContent = partName;
  if (byId('labelDate'))    byId('labelDate').textContent    = dateStr;

  // Gera QR directamente no canvas que já está no DOM
  const canvas = byId('paintLabelQR');
  let qrDataUrl = '';

  if (canvas) {
    canvas.width  = 280;
    canvas.height = 280;
    const ok = _drawQRToCanvas(canvas, qrUrl);
    if (ok) qrDataUrl = canvas.toDataURL('image/png');
  }

  // Preenche área de impressão com img (canvas não migra via innerHTML)
  const printEl = byId('paintPrintArea');
  if (printEl) {
    const qrHtml = qrDataUrl
      ? `<img class="label-qr-img" src="${qrDataUrl}">`
      : `<div class="label-qr-placeholder">QR</div>`;
    printEl.innerHTML = `
      <div class="paint-label-print-area">
        <div class="label-qr-col">${qrHtml}</div>
        <div class="label-text-col">
          <div class="label-car-num">${carLabel}</div>
          <div class="label-part-name">${partName}</div>
          <div class="label-date">${dateStr}</div>
        </div>
      </div>`;
  }

  openModal('paintLabelModal');
};

// Gera QR no canvas usando qrcode-generator (global: qrcode fn, síncrono)
// Retorna true se OK, false se falhou (mostra placeholder).
function _drawQRToCanvas(canvas, text) {
  const ctx = canvas.getContext('2d');
  const W   = canvas.width;

  // Verifica se a biblioteca está disponível (global "qrcode", minúsculas)
  if (typeof qrcode !== 'function') {
    ctx.fillStyle = '#F0F0F0';
    ctx.fillRect(0, 0, W, W);
    ctx.fillStyle = '#888';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('QR indisponível', W / 2, W / 2 - 6);
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#AAA';
    ctx.fillText('Recarregue a página', W / 2, W / 2 + 10);
    return false;
  }

  try {
    // Tipo 0 = auto-detecta o mínimo necessário (URL ~76 chars → tipo 6, 41 módulos)
    const qr = qrcode(0, 'M');
    qr.addData(text, 'Byte');
    qr.make();

    const modules  = qr.getModuleCount(); // 57 para tipo 10
    const cellSize = Math.floor(W / (modules + 4)); // 2 módulos de margem
    const offset   = Math.floor((W - modules * cellSize) / 2);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, W);
    ctx.fillStyle = '#000000';

    for (let r = 0; r < modules; r++) {
      for (let c = 0; c < modules; c++) {
        if (qr.isDark(r, c)) {
          ctx.fillRect(offset + c * cellSize, offset + r * cellSize, cellSize, cellSize);
        }
      }
    }
    return true;
  } catch (e) {
    console.warn('QR generation error:', e);
    ctx.fillStyle = '#F0F0F0';
    ctx.fillRect(0, 0, W, W);
    ctx.fillStyle = '#888';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Erro ao gerar QR', W / 2, W / 2);
    return false;
  }
}

window.closePaintLabel = (e) => {
  if (!e || e.target === document.getElementById('paintLabelModal'))
    closeModal('paintLabelModal');
};

window.doPrintLabel = () => window.print();

// ── Incident type ─────────────────────────────────────────────
let currentIncidentType = 'normal'; // 'normal' | 'paint'

window.setIncidentType = (type) => {
  currentIncidentType = type;

  const btnNormal = document.getElementById('typeNormal');
  const btnPaint  = document.getElementById('typePaint');
  const fieldDefect    = document.getElementById('fieldDefect');
  const fieldDetected  = document.getElementById('fieldDetected');
  const fieldPaintDesc = document.getElementById('fieldPaintDesc');
  const qtyOptional    = document.getElementById('qtyOptional');
  const qtyRequired    = document.getElementById('qtyRequired');
  const banner         = document.getElementById('formBannerText');

  if (type === 'paint') {
    btnNormal?.classList.remove('active');
    btnPaint?.classList.remove('active');
    btnPaint?.classList.add('active', 'active-paint');

    if (fieldDefect)   fieldDefect.style.display   = 'none';
    if (fieldDetected) fieldDetected.style.display  = 'none';
    if (fieldPaintDesc) fieldPaintDesc.style.display = 'grid-column: 1/-1; display: block;';
    if (fieldPaintDesc) fieldPaintDesc.style.display = 'block';
    fieldPaintDesc.style.gridColumn = '1 / -1';

    if (qtyOptional) qtyOptional.style.display = 'none';
    if (qtyRequired) qtyRequired.style.display = 'inline';

    if (banner) banner.innerHTML = '<strong>Pintura.</strong> Preencha o nome da peça e a quantidade — a descrição é gerada automaticamente.';

    updatePaintDescription();
  } else {
    btnPaint?.classList.remove('active', 'active-paint');
    btnNormal?.classList.add('active');

    if (fieldDefect)    fieldDefect.style.display    = 'block';
    if (fieldDetected)  fieldDetected.style.display   = 'block';
    if (fieldPaintDesc) fieldPaintDesc.style.display  = 'none';

    if (qtyOptional) qtyOptional.style.display = 'inline';
    if (qtyRequired) qtyRequired.style.display = 'none';

    if (banner) banner.innerHTML = '<strong>Registo rápido.</strong> Só o nome da peça e as fotos são obrigatórios.';
  }

  saveDraft();
};

function updatePaintDescription() {
  if (currentIncidentType !== 'paint') return;
  const partName = (document.getElementById('fPartName')?.value || '').trim().toUpperCase() || '[PART NAME]';
  const qty      = document.getElementById('fNgQty')?.value || '[QTY]';
  const desc = `DURING OUR UNPACKING PROCESS, IT WAS DETECTED THAT ${qty} ${partName} PRESENTED PAINT DEFECTS. THIS DEFECT WAS REWORKED USING ADDITIONAL MATERIALS TO CONTINUE WITH THE ASSEMBLY AND AVOID LOSSES IN OUR PRODUCTION, ALSO PREVENTING THE NEED TO REMOVE PARTS FROM ANOTHER CONTAINER IN THE PLANT. WE SUGGEST THAT PREVENTIVE MEASURES AND MORE RIGOROUS INSPECTIONS BE TAKEN TO ENSURE THAT THIS ISSUE DOES NOT RECUR IN FUTURE DELIVERIES.`;
  const el = document.getElementById('fPaintDesc');
  if (el) el.value = desc;
}

window.onPartNameChange = () => { if (currentIncidentType === 'paint') updatePaintDescription(); saveDraft(); };
window.onQtyChange      = () => { if (currentIncidentType === 'paint') updatePaintDescription(); saveDraft(); };

// ── CAR Number helpers ────────────────────────────────────────

// Pré-preenche o campo fCarNum com o próximo número sugerido
// e mostra a dica "Último usado: 005/26" abaixo do campo
function _prefillCARNumber() {
  const input = document.getElementById('fCarNum');
  if (!input) return;

  const { lastFull, nextNum } = getCARCounter();
  input.value = String(nextNum).padStart(3, '0');

  // Mostra/actualiza dica abaixo do campo
  let hint = document.getElementById('carNumHint');
  if (!hint) {
    hint = document.createElement('div');
    hint.id = 'carNumHint';
    hint.style.cssText = 'font-size:11px;color:var(--ink-300,rgba(255,255,255,0.4));margin-top:4px;';
    input.parentElement.appendChild(hint);
  }
  hint.textContent = lastFull ? `Último usado: ${lastFull}` : 'Nenhum CAR registado ainda';
}

// Actualiza a dica enquanto o utilizador edita o campo
window.onCARNumInput = () => {
  const input   = document.getElementById('fCarNum');
  const hint    = document.getElementById('carNumHint');
  if (!input || !hint) return;

  const val      = input.value.trim();
  const conflict = val ? isCARNumberInUse(val, editingId, currentIncidentType) : null;

  if (conflict) {
    hint.style.color = 'var(--red-500,#EF4444)';
    hint.textContent = `⚠️ Número já usado por: ${conflict.partName || conflict.partNo || conflict.id}`;
  } else {
    const { lastFull } = getCARCounter();
    hint.style.color   = 'var(--ink-300,rgba(255,255,255,0.4))';
    hint.textContent   = lastFull ? `Último usado: ${lastFull}` : 'Nenhum CAR registado ainda';
  }
  saveDraft();
};

// ── Form helpers ──────────────────────────────────────────────
function clearForm() {
  editingId = null;
  currentPhotos = [];
  currentIncidentType = 'normal';
  stopDraftTimer();
  ['fCarNum','fPartNo','fPartName','fModel','fOrderNo','fLotNo','fNgQty','fDefect','fDetected']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  // Remove dica do campo CAR
  document.getElementById('carNumHint')?.remove();
  // Reset tipo para normal
  setTimeout(() => setIncidentType('normal'), 50);
  renderPhotoGrid();
  document.getElementById('photoError')?.classList.remove('visible');
}

// ── Draft auto-save ───────────────────────────────────────────
const DRAFT_KEY = 'car_form_draft';
let draftTimer = null;

function saveDraft() {
  if (!editingId) { // só guarda rascunhos de incidentes novos
    try {
      const draft = {
        savedAt: Date.now(),
        incidentType: currentIncidentType,
        fields: {
          carNum:   document.getElementById('fCarNum')?.value   || '',
          partNo:   document.getElementById('fPartNo')?.value   || '',
          partName: document.getElementById('fPartName')?.value || '',
          model:    document.getElementById('fModel')?.value    || '',
          orderNo:  document.getElementById('fOrderNo')?.value  || '',
          lotNo:    document.getElementById('fLotNo')?.value    || '',
          ngQty:    document.getElementById('fNgQty')?.value    || '',
          defect:   document.getElementById('fDefect')?.value   || '',
          detected: document.getElementById('fDetected')?.value || '',
        },
        // Guarda só fotos já enviadas (URL) — fotos novas não cabem no localStorage
        photos: currentPhotos
          .filter(p => !p.isNew)
          .map(p => ({ url: p.url, publicId: p.publicId, isNew: false, localPreview: p.url }))
      };

      // Só guarda se tiver algum conteúdo
      const hasContent = Object.values(draft.fields).some(v => v.trim() !== '');
      if (hasContent || draft.photos.length > 0) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      }
    } catch (e) {
      console.warn('Draft save failed:', e);
    }
  }
}

function startDraftTimer() {
  stopDraftTimer();
  // Guarda imediatamente e depois a cada 5 segundos
  saveDraft();
  draftTimer = setInterval(saveDraft, 5000);
}

function stopDraftTimer() {
  if (draftTimer) { clearInterval(draftTimer); draftTimer = null; }
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
  stopDraftTimer();
}

function checkForDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    const draft = JSON.parse(raw);

    // Ignora rascunhos com mais de 7 dias
    if (Date.now() - draft.savedAt > 7 * 24 * 60 * 60 * 1000) {
      clearDraft(); return;
    }

    // Só mostra se tiver conteúdo relevante
    const hasContent = Object.values(draft.fields || {}).some(v => v.trim() !== '');
    if (!hasContent && (!draft.photos || draft.photos.length === 0)) return;

    const timeAgo = formatTimeAgo(draft.savedAt);
    showDraftBanner(draft, timeAgo);
  } catch (e) {
    clearDraft();
  }
}

function formatTimeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  if (mins < 1)   return 'agora mesmo';
  if (mins < 60)  return `há ${mins} min`;
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.floor(hours / 24)} dias`;
}

function showDraftBanner(draft, timeAgo) {
  // Remove banner anterior se existir
  document.getElementById('draftBanner')?.remove();

  const banner = document.createElement('div');
  banner.id        = 'draftBanner';
  banner.className = 'draft-banner';

  banner.innerHTML = `
    <div class="draft-banner-info">
      <div class="draft-banner-title">📝 Rascunho guardado</div>
      <div class="draft-banner-meta">${escHtml(draft.fields.partName) || 'Incidente'} · ${timeAgo}</div>
    </div>
    <button class="btn btn-primary draft-banner-btn" onclick="recoverDraft()">Recuperar</button>
    <button class="btn draft-banner-dismiss" onclick="dismissDraft()">Descartar</button>
  `;

  document.body.appendChild(banner);
}

window.recoverDraft = () => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) { showToast('Rascunho não encontrado.'); return; }
    const draft = JSON.parse(raw);

    // Navega para o formulário SEM limpar (não chama clearForm)
    editingId = null;
    currentPhotos = draft.photos || [];
    currentIncidentType = draft.incidentType || 'normal';

    // Mostra a página do formulário directamente
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-form')?.classList.add('active');
    setDesktopTab('form');

    // Preenche os campos após o DOM estar visível
    setTimeout(() => {
      const fieldMap = {
        carNum: 'fCarNum', partNo: 'fPartNo', partName: 'fPartName',
        model: 'fModel', orderNo: 'fOrderNo', lotNo: 'fLotNo',
        ngQty: 'fNgQty', defect: 'fDefect', detected: 'fDetected'
      };
      Object.entries(draft.fields || {}).forEach(([key, val]) => {
        const el = document.getElementById(fieldMap[key]);
        if (el) el.value = val;
      });
      setIncidentType(draft.incidentType || 'normal');
      renderPhotoGrid();
      document.getElementById('photoError')?.classList.remove('visible');
      startDraftTimer();
      attachDraftListeners();
    }, 50);

    document.getElementById('draftBanner')?.remove();
    showToast('✅ Rascunho recuperado!');
  } catch (e) {
    console.error('Recover draft error:', e);
    showToast('Erro ao recuperar rascunho.');
  }
};

window.dismissDraft = () => {
  clearDraft();
  document.getElementById('draftBanner')?.remove();
  showToast('Rascunho descartado.');
};

window.editIncident = (id) => {
  const inc = incidents.find(i => i.id === id);
  if (!inc) return;
  editingId = id;
  currentIncidentType = inc.incidentType || 'normal';
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
  setTimeout(() => setIncidentType(currentIncidentType), 50);
  showPage('form');
  setDesktopTab('form');
  startDraftTimer();
  attachDraftListeners();
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
      partNo:       document.getElementById('fPartNo').value,
      partName,
      model:        document.getElementById('fModel').value,
      orderNo:      document.getElementById('fOrderNo').value,
      lotNo:        document.getElementById('fLotNo').value,
      ngQty:        document.getElementById('fNgQty').value,
      defect:       currentIncidentType === 'paint'
                      ? document.getElementById('fPaintDesc')?.value || ''
                      : document.getElementById('fDefect').value,
      detected:     currentIncidentType === 'paint'
                      ? (document.getElementById('fPartName').value.trim().toUpperCase() || '') + ' (DEFECTIVE PAINT)'
                      : document.getElementById('fDetected').value,
      carNum:       document.getElementById('fCarNum').value,
      incidentType: currentIncidentType,
    };

    await saveIncident(formData, currentPhotos, editingId, currentUser);
    clearDraft();
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
  const previews = currentPhotos.map(p => p.localPreview || p.url || '').filter(Boolean);
  // Guarda URLs no data-attribute para evitar conflito de aspas no onclick
  grid.dataset.urls = JSON.stringify(previews);
  grid.innerHTML = currentPhotos.map((p, i) => {
    const src = p.localPreview || p.url || '';
    return `
      <div class="photo-thumb">
        <img src="${src}" alt="foto ${i + 1}"
             onclick="window.openLightbox(JSON.parse(this.closest('[data-urls]').dataset.urls),${i})"
             style="cursor:zoom-in">
        <button class="photo-thumb-del" onclick="removePhoto(${i}, event)">✕</button>
      </div>`;
  }).join('');
  // Guarda rascunho sempre que fotos mudam
  if (draftTimer !== null) saveDraft();
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
      // ── Detecta QR de etiqueta de pintura ─────────────────
      try {
        const url     = new URL(data);
        const paintId = url.searchParams.get('paint');
        if (paintId) {
          const inc = incidents.find(i => i.id === paintId);
          if (!inc) { showToast('⚠️ Incidente de pintura não encontrado'); return; }
          const st = inc.status || 'pending';
          if (st === 'done') { showToast('✅ Incidente já encerrado.'); window.showDetail(paintId); return; }
          if (!isDesktop()) goToList();
          setTimeout(() => {
            window.showDetail(paintId);
            if (st === 'pending') {
              _showPaintActionConfirm(
                '🎨 Enviar para Pintoria',
                `${inc.partName || '—'} · ${inc.carNum ? 'CAR ' + inc.carNum : 'SEM CAR'}`,
                '✅ Confirmar Envio',
                async () => {
                  try {
                    await updateIncidentStatus(paintId, 'sent', currentUser, 'Enviado para pintoria via leitura de QR.');
                    showToast('🎨 Enviado para pintoria!');
                    window.showDetail(paintId); renderList();
                  } catch (e) { showToast('Erro: ' + e.message); }
                }
              );
            } else {
              _showPaintActionConfirm(
                '✅ Confirmar Retorno da Pintoria',
                `${inc.partName || '—'} · Retrabalho concluído?`,
                '✅ Confirmar e Encerrar',
                async () => {
                  try {
                    await updateIncidentStatus(paintId, 'done', currentUser, 'Peça retornou da pintoria — confirmado por leitura de QR.');
                    showToast('✅ Retrabalho de pintura encerrado!');
                    window.showDetail(paintId); renderList();
                  } catch (e) { showToast('Erro: ' + e.message); }
                }
              );
            }
          }, isDesktop() ? 0 : 120);
          return;
        }
      } catch { /* URL inválido — continua para pack list */ }

      // ── Pack list QR (formato: orderNo&partNo&qty&lotNo) ──
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
        // Prioriza o orderNo guardado no Firestore (pode ter sido sobreposto manualmente na importação)
        // em vez do que veio no QR (que é o nome da aba do Excel)
        if (partData.orderNo) {
          document.getElementById('fOrderNo').value = partData.orderNo;
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

  const year       = new Date().getFullYear().toString().slice(-2);
  const manualNum  = inc.carNum ? inc.carNum.trim() : null;

  // ── Validação: verifica se o número já está em uso por outro incidente
  if (manualNum) {
    const conflict = isCARNumberInUse(manualNum, id, inc.incidentType || 'normal');
    if (conflict) {
      showToast(`⚠️ CAR ${manualNum.padStart(3,'0')}/${year} já está em uso por: "${conflict.partName || conflict.partNo || ''}". Edite o incidente e altere o número.`);
      return;
    }
  }

  showToast('⏳ A gerar CAR Excel...');

  try {
    const carNum = manualNum
      ? (manualNum.padStart(3, '0') + '/' + year)
      : await getNextCARNumber();

    const blob = await generateCAR(inc, carNum);
    const code = carNum.replace('/', '_');
    const label = (inc.partName || inc.partNo || 'PART').replace(/[^a-zA-Z0-9 -]/g, '').trim().substring(0, 30);
    await downloadBlobSmart(blob, `CAR_No_${code}_${label}.xlsx`);

    // ── Pergunta se quer marcar como Enviado (só se ainda estiver Pendente)
    if ((inc.status || 'pending') === 'pending') {
      _showMarkSentConfirm(id, carNum);
    } else {
      showToast('✅ CAR Excel gerado!');
    }
  } catch (e) {
    showToast('Erro: ' + e.message);
  }
};

// ── Confirmação pós-geração CAR: marcar como Enviado? ─────────
function _showMarkSentConfirm(id, carNum) {
  document.getElementById('markSentConfirm')?.remove();

  const overlay = document.createElement('div');
  overlay.id        = 'markSentConfirm';
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-box">
      <div class="confirm-icon">📤</div>
      <div class="confirm-title">CAR ${escHtml(carNum)} gerado!</div>
      <div class="confirm-subtitle">Marcar este incidente como <em>Enviado para a China</em>?</div>
      <div class="confirm-btns">
        <button class="btn btn-primary confirm-btn-main" id="markSentOk">✓ Sim, marcar como Enviado</button>
        <button class="btn confirm-btn-sec" id="markSentNo">Agora não</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  document.getElementById('markSentOk').onclick = async () => {
    overlay.remove();
    try {
      await updateIncidentStatus(id, 'sent', currentUser, `CAR ${carNum} gerado e enviado para a China.`);
      showToast('📤 Marcado como Enviado!');
      window.showDetail(id);
      renderList();
    } catch (e) { showToast('Erro: ' + e.message); }
  };
  document.getElementById('markSentNo').onclick = () => {
    overlay.remove();
    showToast('✅ CAR Excel gerado!');
  };
}

// ══════════════════════════════════════════════════════════════
// RELATÓRIO PINTORIA
// ══════════════════════════════════════════════════════════════

let _paintReportFilter = 'all'; // 'all' | 'pending' | 'sent'

function renderPaintReport() {
  const el = document.getElementById('paintReportSection');
  if (!el) return;

  // Peças de pintura em aberto
  const paintIncs = incidents.filter(i =>
    (i.incidentType || 'normal') === 'paint' && (i.status || 'pending') !== 'done'
  );

  const totalOpen    = paintIncs.length;
  const countPending = paintIncs.filter(i => (i.status || 'pending') === 'pending').length;
  const countSent    = paintIncs.filter(i => i.status === 'sent').length;

  const filtered = _paintReportFilter === 'all'     ? paintIncs
                 : _paintReportFilter === 'pending'  ? paintIncs.filter(i => (i.status || 'pending') === 'pending')
                 : paintIncs.filter(i => i.status === 'sent');

  // Ordena: na pintoria primeiro, depois aguardando, depois por data
  const sorted = [...filtered].sort((a, b) => {
    const order = { sent: 0, pending: 1 };
    const oa = order[a.status] ?? 2;
    const ob = order[b.status] ?? 2;
    if (oa !== ob) return oa - ob;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  const rows = sorted.map((inc, i) => {
    const st      = inc.status || 'pending';
    const cfg     = PAINT_STATUS_CONFIG[st] || PAINT_STATUS_CONFIG.pending;
    const dateReg = fmtDate(inc.createdAt);
    const dateSent = inc.sentAt ? fmtDate(inc.sentAt) : '—';
    return `
      <tr class="pr-row" onclick="goToList(); window.showDetail('${inc.id}');">
        <td class="pr-td pr-num">${i + 1}</td>
        <td class="pr-td pr-car">${inc.carNum ? inc.carNum : '—'}</td>
        <td class="pr-td pr-name">${inc.partName || '—'}</td>
        <td class="pr-td pr-partno">${inc.partNo || '—'}</td>
        <td class="pr-td pr-qty">${inc.ngQty || '—'}</td>
        <td class="pr-td pr-status">
          <span class="badge ${cfg.badge}" style="white-space:nowrap">${cfg.icon} ${cfg.label}</span>
        </td>
        <td class="pr-td pr-date">${dateReg}</td>
        <td class="pr-td pr-date">${dateSent}</td>
      </tr>`;
  }).join('');

  const emptyRow = `
    <tr><td colspan="8" class="pr-empty">
      ${_paintReportFilter === 'all'
        ? 'Nenhuma peça de pintura em aberto.'
        : 'Nenhuma peça neste filtro.'}
    </td></tr>`;

  el.innerHTML = `
    <div class="pr-wrap">
      <!-- Totalizadores -->
      <div class="pr-stats">
        <div class="pr-stat-card">
          <div class="pr-stat-value">${totalOpen}</div>
          <div class="pr-stat-label">Em aberto</div>
        </div>
        <div class="pr-stat-card pr-stat-paint">
          <div class="pr-stat-value">${countSent}</div>
          <div class="pr-stat-label">Na Pintoria</div>
        </div>
        <div class="pr-stat-card pr-stat-pending">
          <div class="pr-stat-value">${countPending}</div>
          <div class="pr-stat-label">Aguardando Envio</div>
        </div>
      </div>

      <!-- Filtros + export -->
      <div class="pr-toolbar">
        <div class="pr-chips">
          <button class="chip${_paintReportFilter === 'all'     ? ' active' : ''}" onclick="setPaintReportFilter('all')">Todos (${totalOpen})</button>
          <button class="chip${_paintReportFilter === 'sent'    ? ' active' : ''}" onclick="setPaintReportFilter('sent')">Na Pintoria (${countSent})</button>
          <button class="chip${_paintReportFilter === 'pending' ? ' active' : ''}" onclick="setPaintReportFilter('pending')">Aguardando (${countPending})</button>
        </div>
        <button class="btn btn-paint-label pr-label-btn" onclick="openBatchLabelModal()" ${totalOpen === 0 ? 'disabled' : ''}>
          🖨 Etiquetas em Lote
        </button>
        <button class="btn btn-success pr-export-btn" onclick="exportPaintExcel()" ${totalOpen === 0 ? 'disabled' : ''}>
          📥 Exportar Excel
        </button>
      </div>

      <!-- Tabela -->
      <div class="pr-table-wrap">
        <table class="pr-table">
          <thead>
            <tr>
              <th class="pr-th pr-num">#</th>
              <th class="pr-th pr-car">CAR</th>
              <th class="pr-th pr-name">Peça</th>
              <th class="pr-th pr-partno">Código</th>
              <th class="pr-th pr-qty">Qtd</th>
              <th class="pr-th pr-status">Status</th>
              <th class="pr-th pr-date">Registado</th>
              <th class="pr-th pr-date">Enviado</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.length ? rows : emptyRow}
          </tbody>
        </table>
      </div>

      <p class="pr-hint">Toque numa linha para ver o detalhe do incidente.</p>
    </div>`;
}

window.setPaintReportFilter = (f) => {
  _paintReportFilter = f;
  renderPaintReport();
};

window.exportPaintExcel = () => {
  const paintIncs = incidents.filter(i =>
    (i.incidentType || 'normal') === 'paint' && (i.status || 'pending') !== 'done'
  );
  if (!paintIncs.length) { showToast('Nenhuma peça de pintura em aberto.'); return; }

  const rows = paintIncs
    .sort((a, b) => {
      const order = { sent: 0, pending: 1 };
      return (order[a.status] ?? 2) - (order[b.status] ?? 2);
    })
    .map((inc, i) => {
      const cfg = PAINT_STATUS_CONFIG[inc.status || 'pending'] || PAINT_STATUS_CONFIG.pending;
      return {
        'Nº':              i + 1,
        'Nº CAR':          inc.carNum || '—',
        'Nome da Peça':    inc.partName || '—',
        'Código da Peça':  inc.partNo  || '—',
        'Qtd Defeituosa':  inc.ngQty   || '—',
        'Status':          cfg.label,
        'Registado por':   inc.user    || '—',
        'Data Registo':    fmtDate(inc.createdAt),
        'Data Envio Pintoria': inc.sentAt ? fmtDate(inc.sentAt) : '—',
        'Observações':     inc.defect  || '—',
      };
    });

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [5, 12, 28, 20, 8, 20, 20, 14, 18, 40].map(w => ({ wch: w }));
  const wb   = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pintoria em Aberto');
  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `Pintoria-Aberto-${date}.xlsx`);
  showToast('📥 Excel exportado!');
};

// ══════════════════════════════════════════════════════════════
// BATCH LABEL PRINT — Impressão de etiquetas em lote (Opção C)
// Modo Térmica: 58×40mm, uma etiqueta por página
// Modo A4: grade 2×3, 6 etiquetas por folha A4, com marcas de corte
// ══════════════════════════════════════════════════════════════

let _batchPrintMode = 'thermal'; // 'thermal' | 'a4'

window.openBatchLabelModal = () => {
  const paintIncs = incidents.filter(i =>
    (i.incidentType || 'normal') === 'paint' && (i.status || 'pending') !== 'done'
  );
  if (!paintIncs.length) { showToast('Nenhuma peça de pintura em aberto.'); return; }

  _renderBatchLabelList(paintIncs);
  _applyBatchMode(_batchPrintMode);
  updateBatchLabelCount();
  openModal('batchLabelModal');
};

window.closeBatchLabelModal = (e) => {
  if (!e || e.target === document.getElementById('batchLabelModal'))
    closeModal('batchLabelModal');
};

function _renderBatchLabelList(paintIncs) {
  const el = document.getElementById('batchLabelList');
  if (!el) return;

  const sorted = [...paintIncs].sort((a, b) => {
    const order = { sent: 0, pending: 1 };
    return (order[a.status] ?? 2) - (order[b.status] ?? 2);
  });

  el.innerHTML = sorted.map(inc => {
    const st  = inc.status || 'pending';
    const cfg = PAINT_STATUS_CONFIG[st] || PAINT_STATUS_CONFIG.pending;
    return `
      <label class="batch-label-item">
        <input type="checkbox" class="batch-label-cb" value="${inc.id}" checked
               onchange="updateBatchLabelCount()">
        <div class="batch-label-item-info">
          <div class="batch-label-item-name">${escHtml(inc.partName) || '—'}</div>
          <div class="batch-label-item-meta">
            ${inc.carNum ? `CAR ${escHtml(inc.carNum)} · ` : ''}${escHtml(inc.partNo) || '—'}
          </div>
        </div>
        <span class="batch-status-pill"
              style="background:${cfg.color}20;color:${cfg.color};border-color:${cfg.color}40">
          ${cfg.icon} ${cfg.label}
        </span>
      </label>`;
  }).join('');
}

window.setBatchPrintMode = (mode) => {
  _batchPrintMode = mode;
  _applyBatchMode(mode);
};

function _applyBatchMode(mode) {
  document.getElementById('batchModeThermal')?.classList.toggle('active', mode === 'thermal');
  document.getElementById('batchModeA4')?.classList.toggle('active', mode === 'a4');
  const hint = document.getElementById('batchModeHint');
  if (hint) hint.textContent = mode === 'thermal'
    ? '🖨 Uma etiqueta por página — compatível com impressoras térmicas 58mm (NIIMBOT, Phomemo, genéricas)'
    : '📄 6 etiquetas por folha A4 com marcas de corte — compatível com folhas autocolantes Pimaco';
}

window.batchLabelToggleAll = (checked) => {
  document.querySelectorAll('.batch-label-cb').forEach(cb => cb.checked = checked);
  updateBatchLabelCount();
};

window.updateBatchLabelCount = () => {
  const total    = document.querySelectorAll('.batch-label-cb').length;
  const selected = document.querySelectorAll('.batch-label-cb:checked').length;
  const el  = document.getElementById('batchLabelCount');
  const btn = document.getElementById('batchLabelPrintBtn');
  if (el)  el.textContent  = `${selected} de ${total} seleccionados`;
  if (btn) btn.disabled    = selected === 0;
};

// Gera o HTML interno de uma etiqueta (QR via canvas temporário → data URL)
function _buildLabelHTML(inc) {
  const qrUrl    = `${PAINT_APP_URL}?paint=${encodeURIComponent(inc.id)}`;
  const carLabel = inc.carNum ? `CAR ${inc.carNum}` : 'SEM CAR';
  const partName = (inc.partName || '—').toUpperCase().slice(0, 40);
  const dateStr  = new Date(inc.createdAt || Date.now()).toLocaleDateString('pt-BR');

  // Canvas temporário para gerar QR sem tocar no DOM existente
  const tmp = document.createElement('canvas');
  tmp.width = tmp.height = 280;
  const ok       = _drawQRToCanvas(tmp, qrUrl);
  const qrDataUrl = ok ? tmp.toDataURL('image/png') : '';

  const qrHtml = qrDataUrl
    ? `<img class="label-qr-img" src="${qrDataUrl}" alt="QR">`
    : `<div class="label-qr-placeholder">QR</div>`;

  return `
    <div class="paint-label-print-area">
      <div class="label-qr-col">${qrHtml}</div>
      <div class="label-text-col">
        <div class="label-car-num">${escHtml(carLabel)}</div>
        <div class="label-part-name">${escHtml(partName)}</div>
        <div class="label-paint-badge">🎨 PINTURA</div>
        <div class="label-date">${escHtml(dateStr)}</div>
      </div>
    </div>`;
}

window.doBatchPrint = () => {
  const selectedIds = [...document.querySelectorAll('.batch-label-cb:checked')].map(cb => cb.value);
  if (!selectedIds.length) { showToast('⚠️ Selecciona pelo menos 1 etiqueta'); return; }

  const selected = selectedIds.map(id => incidents.find(i => i.id === id)).filter(Boolean);
  const printEl  = document.getElementById('batchLabelPrintArea');
  if (!printEl) return;

  if (_batchPrintMode === 'thermal') {
    // ── Modo térmico: uma etiqueta por "página" ───────────────
    printEl.dataset.mode = 'thermal';
    printEl.innerHTML = selected.map((inc, idx) =>
      `<div class="batch-thermal-label${idx < selected.length - 1 ? ' batch-page-break' : ''}">${_buildLabelHTML(inc)}</div>`
    ).join('');
  } else {
    // ── Modo A4: grade 2 colunas × 3 linhas = 6 por página ───
    printEl.dataset.mode = 'a4';
    const pages = [];
    for (let i = 0; i < selected.length; i += 6) {
      const chunk = selected.slice(i, i + 6);
      // Preenche células vazias para manter o grid completo
      while (chunk.length < 6) chunk.push(null);
      pages.push(`
        <div class="batch-a4-page${i + 6 < selected.length ? ' batch-page-break' : ''}">
          ${chunk.map(inc => `
            <div class="batch-a4-cell">
              ${inc ? _buildLabelHTML(inc) : ''}
            </div>`).join('')}
        </div>`);
    }
    printEl.innerHTML = pages.join('');
  }

  // Injeta @page dinâmico conforme o modo
  const styleId = 'batchPrintPageStyle';
  document.getElementById(styleId)?.remove();
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = _batchPrintMode === 'thermal'
    ? '@page { size: 58mm 40mm; margin: 0; }'
    : '@page { size: A4 portrait; margin: 6mm; }';
  document.head.appendChild(style);

  // Limpa após imprimir
  window.addEventListener('afterprint', () => {
    document.getElementById(styleId)?.remove();
    printEl.innerHTML = '';
    printEl.removeAttribute('data-mode');
  }, { once: true });

  closeModal('batchLabelModal');
  setTimeout(() => window.print(), 150);
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
    'Status': (STATUS_CONFIG[inc.status] || STATUS_CONFIG.pending).label,
    'Código da Peça': inc.partNo || '', 'Nome da Peça': inc.partName || '',
    'Modelo': inc.model || '', 'Nº Pedido': inc.orderNo || '', 'Lote': inc.lotNo || '',
    'Qtd. Defeituosa': inc.ngQty || '', 'Descrição do Defeito': inc.defect || '',
    'Como Detectado': inc.detected || '',
    'Registado por': inc.user || '', 'Data Registo': fmtDate(inc.createdAt),
    'Data Envio': inc.sentAt ? fmtDate(inc.sentAt) : '',
    'ETA Confirmado': inc.eta || '',
    'Data Recepção': inc.receivedAt ? fmtDate(inc.receivedAt) : '',
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

// ── Preferência "Guardar como..." ────────────────────────────
window.toggleSavePicker = () => {
  const newVal = !getSavePickerPref();
  setSavePickerPref(newVal);
  _renderSavePickerToggle();
  showToast(newVal ? '📁 "Guardar como..." activado' : '📁 "Guardar como..." desactivado');
};

function _renderSavePickerToggle() {
  const wrap = document.getElementById('savePickerWrap');
  if (!wrap) return;
  const supported = isSavePickerSupported();
  const active    = getSavePickerPref();
  wrap.innerHTML = supported ? `
    <div class="setting-row" onclick="toggleSavePicker()">
      <div class="setting-info">
        <div class="setting-label">📁 Escolher pasta ao guardar Excel</div>
        <div class="setting-desc">Abre "Guardar como..." ao gerar o CAR</div>
      </div>
      <div class="setting-toggle ${active ? 'on' : ''}">
        <div class="setting-toggle-knob"></div>
      </div>
    </div>` : `
    <div class="setting-row setting-row-disabled">
      <div class="setting-info">
        <div class="setting-label">📁 Escolher pasta ao guardar Excel</div>
        <div class="setting-desc">Não suportado neste browser (use Chrome ou Edge)</div>
      </div>
    </div>`;
}

// ── Lightbox ──────────────────────────────────────────────────
window.openFullscreen  = openFullscreen;
window.closeFullscreen = closeFullscreen;
window.openLightbox    = openLightbox;
window.closeLightbox   = closeLightbox;
window.lbNavigate      = lbNavigate;
window.closeModal      = closeModal;       // expõe ao HTML (botões Cancelar/Fechar nos modals)

// ── Helper: abre ajuste de stock a partir do modal de detalhe ──
window.doOpenStockAdjustFromDetail = () => openStockAdjust(stockDetailPartNo);

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
