// ── dashboard.js — KPI Dashboard ─────────────────────────────
import { incidents } from './incidents.js';
import { escHtml } from './ui.js';

// ── Estado ─────────────────────────────────────────────────────
let dashType  = 'all';   // 'all' | 'normal' | 'paint'
let dashModel = 'all';   // 'all' | <modelo>
let dashFrom  = '';      // 'YYYY-MM-DD' | ''  (vazio = sem limite)
let dashTo    = '';      // 'YYYY-MM-DD' | ''

let _trendChart  = null; // Chart.js — tendência
let _statusChart = null; // Chart.js — rosca de status

// ── Helpers de data (limites do dia LOCAL — Manaus) ───────────
function _dayStart(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}
function _dayEnd(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
}
function _inRange(ts, fromStr, toStr) {
  const from = _dayStart(fromStr);
  const to   = _dayEnd(toStr);
  if (from === null && to === null) return true;
  if (!ts) return false;
  if (from !== null && ts < from) return false;
  if (to   !== null && ts > to)   return false;
  return true;
}
function _fmt(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Conjunto filtrado (tipo + modelo + intervalo de datas) ────
function getFilteredIncs() {
  return incidents.filter(i => {
    if (dashType !== 'all' && (i.incidentType || 'normal') !== dashType) return false;
    if (dashModel !== 'all' && (i.model || '') !== dashModel) return false;
    return _inRange(i.createdAt, dashFrom, dashTo);
  });
}

function distinctModels() {
  const set = new Set();
  incidents.forEach(i => { const m = (i.model || '').trim(); if (m) set.add(m); });
  return [...set].sort();
}

// ── KPIs ──────────────────────────────────────────────────────
function calcKPIs(incs) {
  const total          = incs.length;
  const pending        = incs.filter(i => (i.status || 'pending') === 'pending').length;
  const done           = incs.filter(i => i.status === 'done').length;
  const inProgress     = incs.filter(i => ['sent', 'awaiting', 'eta_confirmed', 'received'].includes(i.status)).length;
  const totalDefective = incs.reduce((s, i) => s + (parseInt(i.ngQty) || 0), 0);

  const doneIncs = incs.filter(i => i.status === 'done' && i.createdAt && i.completedAt);
  const avgResolutionDays = doneIncs.length
    ? +(doneIncs.reduce((s, i) => s + (i.completedAt - i.createdAt), 0) / doneIncs.length / 86400000).toFixed(1)
    : null;

  const sentIncs = incs.filter(i => i.sentAt && i.createdAt);
  const avgSendDays = sentIncs.length
    ? +(sentIncs.reduce((s, i) => s + (i.sentAt - i.createdAt), 0) / sentIncs.length / 86400000).toFixed(1)
    : null;

  return { total, pending, done, inProgress, totalDefective, avgResolutionDays, avgSendDays };
}

// ── Tendência: adapta granularidade ao intervalo escolhido ────
// Período curto (≤ 62 dias) → por DIA; senão → por MÊS.
function calcTrendData(incs) {
  const now   = new Date();
  const end   = dashTo   ? new Date(_dayEnd(dashTo))   : now;
  const start = dashFrom ? new Date(_dayStart(dashFrom))
                         : new Date(end.getTime() - 182 * 86400000); // ~6 meses por omissão
  const spanDays = (end - start) / 86400000;

  if (spanDays <= 62) {
    const buckets = [];
    const cur  = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    while (cur <= last) {
      const s = cur.getTime(), e = s + 86399999;
      const count = incs.filter(i => i.createdAt >= s && i.createdAt <= e).length;
      buckets.push({ label: `${String(cur.getDate()).padStart(2, '0')}/${String(cur.getMonth() + 1).padStart(2, '0')}`, count });
      cur.setDate(cur.getDate() + 1);
    }
    return { buckets, granularity: 'dia' };
  }

  const buckets = [];
  const cur  = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= last) {
    const y = cur.getFullYear(), m = cur.getMonth();
    const count = incs.filter(i => { const dt = new Date(i.createdAt); return dt.getFullYear() === y && dt.getMonth() === m; }).length;
    const label = cur.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') + '/' + String(y).slice(-2);
    buckets.push({ label, count });
    cur.setMonth(cur.getMonth() + 1);
  }
  return { buckets, granularity: 'mês' };
}

// ── Agregações ────────────────────────────────────────────────
function calcByModel(incs) {
  const map = {};
  incs.forEach(i => { const m = (i.model || 'N/D').trim() || 'N/D'; map[m] = (map[m] || 0) + 1; });
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6);
}

function calcTopParts(incs) {
  const map = {};
  incs.forEach(i => {
    const key = (i.partNo || '').trim() || (i.partName || 'N/D').trim();
    if (!map[key]) map[key] = { name: (i.partName || i.partNo || 'N/D').trim(), code: (i.partNo || '').trim(), count: 0, qty: 0 };
    map[key].count++;
    map[key].qty += parseInt(i.ngQty) || 0;
  });
  return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 5);
}

function calcByUser(incs) {
  const map = {};
  incs.forEach(i => { const u = (i.user || '').trim() || 'N/D'; map[u] = (map[u] || 0) + 1; });
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
}

// ── Linha de barra (anima 0% → alvo) ──────────────────────────
function barRow(name, sub, value, max, color) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 4;
  return `
    <div class="dash-bar-row">
      <div class="dash-bar-labels">
        <span class="dash-bar-name">${escHtml(name)}</span>
        ${sub ? `<span class="dash-bar-sub">${escHtml(sub)}</span>` : ''}
      </div>
      <div class="dash-bar-track">
        <div class="dash-bar-fill" style="width:0%;background:${color}" data-target="${pct}"></div>
      </div>
      <span class="dash-bar-val">${Number(value) || 0}</span>
    </div>`;
}

const STATUS_COLORS = {
  pending: '#F59E0B', sent: '#3B82F6', awaiting: '#8B5CF6',
  eta_confirmed: '#06B6D4', received: '#84CC16', done: '#22C55E',
};
const STATUS_LABELS = {
  pending: 'Pendente', sent: 'Enviado', awaiting: 'Aguardando',
  eta_confirmed: 'ETA Conf.', received: 'Recebido', done: 'Encerrado',
};

// ── Render principal ──────────────────────────────────────────
export function renderDashboard() {
  const el = document.getElementById('dashboardSection');
  if (!el) return;

  const incs     = getFilteredIncs();
  const kpis     = calcKPIs(incs);
  const trend    = calcTrendData(incs);
  const byModel  = calcByModel(incs);
  const topParts = calcTopParts(incs);
  const byUser   = calcByUser(incs);

  const maxModel = byModel.length ? byModel[0][1] : 1;
  const maxPart  = topParts.length ? topParts[0].count : 1;
  const maxUser  = byUser.length ? byUser[0][1] : 1;

  const statusRows = Object.entries(STATUS_LABELS)
    .map(([k, label]) => ({ key: k, label, count: incs.filter(i => (i.status || 'pending') === k).length, color: STATUS_COLORS[k] }))
    .filter(s => s.count > 0);

  // KPIs separados por tipo (para a sub-linha 🔧 Normal · 🎨 Pintura)
  const kn = calcKPIs(incs.filter(i => (i.incidentType || 'normal') === 'normal'));
  const kp = calcKPIs(incs.filter(i => (i.incidentType || 'normal') === 'paint'));

  // Detalhe de Pintura — SEMPRE só pintura (respeita modelo + datas, ignora o filtro de tipo)
  const paintDetail = incidents.filter(i =>
    (i.incidentType || 'normal') === 'paint'
    && (dashModel === 'all' || (i.model || '') === dashModel)
    && _inRange(i.createdAt, dashFrom, dashTo)
  );
  const PAINT_STATES = [
    { code: 'pending', label: 'Aguardando Envio', color: '#F59E0B' },
    { code: 'sent',    label: 'Na Pintura',       color: '#8B5CF6' },
    { code: 'done',    label: 'Encerrado',        color: '#22C55E' },
  ].map(s => ({ ...s, count: paintDetail.filter(i => (i.status || 'pending') === s.code).length }));

  // Argumentos do drill (datas/modelo atuais) para os onclick
  const drillArgs = (t, code) => `'${t}','${code}','${dashFrom}','${dashTo}','${escHtml(dashModel)}'`;

  const models = distinctModels();

  el.innerHTML = `
<div class="dash-wrap">

  <!-- Filtros: tipo + modelo -->
  <div class="dash-filters">
    <select class="field-input" onchange="setDashType(this.value)">
      <option value="all"${dashType === 'all' ? ' selected' : ''}>Todos os tipos</option>
      <option value="normal"${dashType === 'normal' ? ' selected' : ''}>🔧 Normais</option>
      <option value="paint"${dashType === 'paint' ? ' selected' : ''}>🎨 Pintura</option>
    </select>
    <select class="field-input" onchange="setDashModel(this.value)">
      <option value="all"${dashModel === 'all' ? ' selected' : ''}>Todos os modelos</option>
      ${models.map(m => `<option value="${escHtml(m)}"${dashModel === m ? ' selected' : ''}>${escHtml(m)}</option>`).join('')}
    </select>
  </div>

  <!-- Intervalo de datas (por registo) -->
  <div class="dash-daterow">
    <input class="field-input" type="date" value="${dashFrom}" onchange="setDashDate('from', this.value)" aria-label="De">
    <input class="field-input" type="date" value="${dashTo}" onchange="setDashDate('to', this.value)" aria-label="Até">
  </div>
  <div class="date-shortcuts">
    <button type="button" class="chip" onclick="setDashRange('today')">Hoje</button>
    <button type="button" class="chip" onclick="setDashRange('week')">Esta semana</button>
    <button type="button" class="chip" onclick="setDashRange('month')">Este mês</button>
    <button type="button" class="chip" onclick="setDashRange('3m')">3 meses</button>
    <button type="button" class="chip" onclick="setDashRange('clear')">Tudo</button>
  </div>

  <!-- KPI cards -->
  <div class="dash-kpi-grid">
    <div class="dash-kpi"><div class="dash-kpi-val">${kpis.total}</div><div class="dash-kpi-lbl">Total</div>${dashType === 'all' ? `<div class="dash-kpi-split">🔧 ${kn.total} · 🎨 ${kp.total}</div>` : ''}</div>
    <div class="dash-kpi" style="--kc:#F59E0B"><div class="dash-kpi-val">${kpis.pending}</div><div class="dash-kpi-lbl">Pendentes</div>${dashType === 'all' ? `<div class="dash-kpi-split">🔧 ${kn.pending} · 🎨 ${kp.pending}</div>` : ''}</div>
    <div class="dash-kpi" style="--kc:#3B82F6"><div class="dash-kpi-val">${kpis.inProgress}</div><div class="dash-kpi-lbl">Em Curso</div>${dashType === 'all' ? `<div class="dash-kpi-split">🔧 ${kn.inProgress} · 🎨 ${kp.inProgress}</div>` : ''}</div>
    <div class="dash-kpi" style="--kc:#22C55E"><div class="dash-kpi-val">${kpis.done}</div><div class="dash-kpi-lbl">Encerrados</div>${dashType === 'all' ? `<div class="dash-kpi-split">🔧 ${kn.done} · 🎨 ${kp.done}</div>` : ''}</div>
    <div class="dash-kpi" style="--kc:#E11D48"><div class="dash-kpi-val">${kpis.totalDefective}</div><div class="dash-kpi-lbl">Peças NG</div>${dashType === 'all' ? `<div class="dash-kpi-split">🔧 ${kn.totalDefective} · 🎨 ${kp.totalDefective}</div>` : ''}</div>
  </div>

  <!-- Gráfico de tendência (adapta dia/mês ao intervalo) -->
  <div class="dash-card">
    <div class="dash-card-hd">📈 Incidentes por ${trend.granularity}</div>
    <div class="dash-month-chart-wrap"><canvas id="dashTrendChart"></canvas></div>
  </div>

  <!-- Status: lista + rosca -->
  <div class="dash-grid-2">
    <div class="dash-card">
      <div class="dash-card-hd">📊 Por Estado <span class="dash-card-sub">(clique p/ ver/exportar)</span></div>
      ${statusRows.length === 0
        ? '<p class="dash-empty">Sem dados neste filtro</p>'
        : statusRows.map(s => `
          <div class="dash-st-row dash-st-click" onclick="openStateDrill(${drillArgs(dashType, s.key)})">
            <span class="dash-st-dot" style="background:${s.color}"></span>
            <span class="dash-st-name">${s.label}</span>
            <span class="dash-st-cnt">${s.count}</span>
          </div>`).join('')}
    </div>
    <div class="dash-card">
      <div class="dash-card-hd">🍩 Distribuição</div>
      <div class="dash-doughnut-wrap">
        ${statusRows.length === 0 ? '<p class="dash-empty">Sem dados</p>' : '<canvas id="dashStatusChart"></canvas>'}
      </div>
    </div>
  </div>

  <!-- Pintura detalhada por estado (sempre só pintura) -->
  <div class="dash-card">
    <div class="dash-card-hd">🎨 Pintura — por estado <span class="dash-card-sub">(clique p/ ver/exportar)</span></div>
    ${PAINT_STATES.every(s => s.count === 0)
      ? '<p class="dash-empty">Sem peças de pintura no filtro</p>'
      : PAINT_STATES.map(s => `
        <div class="dash-st-row dash-st-click" onclick="openStateDrill(${drillArgs('paint', s.code)})">
          <span class="dash-st-dot" style="background:${s.color}"></span>
          <span class="dash-st-name">${s.label}</span>
          <span class="dash-st-cnt">${s.count}</span>
        </div>`).join('')}
  </div>

  <!-- Top Peças + Por Usuário -->
  <div class="dash-grid-2">
    <div class="dash-card">
      <div class="dash-card-hd">🏆 Top Peças</div>
      ${topParts.length === 0 ? '<p class="dash-empty">Sem dados</p>'
        : topParts.map(p => barRow(p.name.length > 18 ? p.name.slice(0, 18) + '…' : p.name, p.code, p.count, maxPart, '#FF6600')).join('')}
    </div>
    <div class="dash-card">
      <div class="dash-card-hd">👤 Por Usuário</div>
      ${byUser.length === 0 ? '<p class="dash-empty">Sem dados</p>'
        : byUser.map(([u, c]) => barRow(u.length > 18 ? u.slice(0, 18) + '…' : u, '', c, maxUser, '#3B82F6')).join('')}
    </div>
  </div>

  <!-- Por Modelo -->
  ${byModel.length > 0 ? `
  <div class="dash-card">
    <div class="dash-card-hd">🏍️ Por Modelo</div>
    ${byModel.map(([m, c]) => barRow(m, '', c, maxModel, '#FF8533')).join('')}
  </div>` : ''}

  <!-- Tempos médios -->
  <div class="dash-grid-2">
    <div class="dash-card dash-time-card">
      <div class="dash-time-ico">📤</div>
      <div class="dash-time-val">${kpis.avgSendDays !== null ? kpis.avgSendDays + 'd' : '—'}</div>
      <div class="dash-time-lbl">Tempo médio<br>até envio</div>
    </div>
    <div class="dash-card dash-time-card">
      <div class="dash-time-ico">✅</div>
      <div class="dash-time-val">${kpis.avgResolutionDays !== null ? kpis.avgResolutionDays + 'd' : '—'}</div>
      <div class="dash-time-lbl">Tempo médio<br>de resolução</div>
    </div>
  </div>

  <!-- Exportar -->
  <div class="dash-noexport" style="margin-top:4px">
    <button class="btn btn-success btn-full" onclick="exportFullExcel('${dashType}','${escHtml(dashModel)}','${dashFrom}','${dashTo}')">
      📥 Exportar tudo (Excel detalhado)
    </button>
    <button class="btn btn-full" style="margin-top:8px" onclick="exportDashboardPDF()">
      📄 Exportar Dashboard (PDF)
    </button>
  </div>

</div>`;

  // ── Pós-render: gráficos + animação das barras ──────────────
  renderTrendChart(trend.buckets);
  renderStatusChart(statusRows);

  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.querySelectorAll('.dash-bar-fill[data-target]').forEach(bar => { bar.style.width = bar.dataset.target + '%'; });
  }));
}

// ── Chart.js — tendência (barras) ─────────────────────────────
function renderTrendChart(buckets) {
  const canvas = document.getElementById('dashTrendChart');
  if (!canvas) return;
  if (_trendChart) { _trendChart.destroy(); _trendChart = null; }
  if (typeof window.Chart === 'undefined') { canvas.parentElement.innerHTML = '<p class="dash-empty">Chart.js não disponível</p>'; return; }

  _trendChart = new window.Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: buckets.map(b => b.label),
      datasets: [{ data: buckets.map(b => b.count), backgroundColor: 'rgba(255,102,0,0.72)', hoverBackgroundColor: '#FF6600', borderRadius: 5, borderSkipped: false }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      animation: { duration: 650, easing: 'easeOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1A1A1A', borderColor: 'rgba(255,102,0,0.35)', borderWidth: 1,
          titleColor: 'rgba(255,255,255,0.85)', bodyColor: '#FF8533', padding: 10, displayColors: false,
          callbacks: { label: ctx => `${ctx.parsed.y} incidente${ctx.parsed.y !== 1 ? 's' : ''}` },
        },
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10, family: 'DM Sans, sans-serif' }, maxRotation: 0, autoSkip: true } },
        y: { grid: { color: 'rgba(255,255,255,0.05)' }, border: { display: false }, ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 10, family: 'DM Sans, sans-serif' }, precision: 0, stepSize: 1 }, beginAtZero: true },
      },
    },
  });
}

// ── Chart.js — rosca de status ────────────────────────────────
function renderStatusChart(statusRows) {
  const canvas = document.getElementById('dashStatusChart');
  if (!canvas) return;
  if (_statusChart) { _statusChart.destroy(); _statusChart = null; }
  if (typeof window.Chart === 'undefined') return;

  _statusChart = new window.Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: statusRows.map(s => s.label),
      datasets: [{ data: statusRows.map(s => s.count), backgroundColor: statusRows.map(s => s.color), borderColor: '#0B1220', borderWidth: 2 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '62%',
      animation: { duration: 650 },
      plugins: {
        legend: { position: 'bottom', labels: { color: 'rgba(255,255,255,0.6)', font: { size: 10, family: 'DM Sans, sans-serif' }, boxWidth: 10, padding: 8 } },
        tooltip: { backgroundColor: '#1A1A1A', padding: 10, displayColors: true, callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}` } },
      },
    },
  });
}

// ── Handlers (expostos ao HTML via window em app.js) ──────────
export function setDashType(v)  { dashType = v;  renderDashboard(); }
export function setDashModel(v) { dashModel = v; renderDashboard(); }
export function setDashDate(which, val) { if (which === 'from') dashFrom = val; else dashTo = val; renderDashboard(); }
export function setDashRange(kind) {
  const now = new Date();
  if (kind === 'clear')      { dashFrom = ''; dashTo = ''; }
  else if (kind === 'today') { const s = _fmt(now); dashFrom = s; dashTo = s; }
  else if (kind === 'week')  { const day = (now.getDay() + 6) % 7; const mon = new Date(now); mon.setDate(now.getDate() - day); dashFrom = _fmt(mon); dashTo = _fmt(now); }
  else if (kind === 'month') { const first = new Date(now.getFullYear(), now.getMonth(), 1); dashFrom = _fmt(first); dashTo = _fmt(now); }
  else if (kind === '3m')    { const d = new Date(now); d.setMonth(d.getMonth() - 3); dashFrom = _fmt(d); dashTo = _fmt(now); }
  renderDashboard();
}

// ── Exportar dashboard como PDF (html2canvas + jsPDF) ─────────
export async function exportDashboardPDF() {
  const el = document.getElementById('dashboardSection');
  if (!el) return;
  if (typeof window.html2canvas === 'undefined' || !window.jspdf) {
    alert('Ferramenta de exportação ainda a carregar. Tente de novo em alguns segundos.');
    return;
  }
  try {
    const canvas = await window.html2canvas(el, {
      backgroundColor: '#0B1220', scale: 1.5, useCORS: true,
      ignoreElements: (node) => node.classList && node.classList.contains('dash-noexport'),
    });
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();

    // Fatia o canvas por página e grava JPEG comprimido — evita PDF gigante
    // (uma única imagem PNG da tela inteira gerava arquivos de dezenas de MB).
    const pageH = Math.floor(canvas.width * ph / pw); // altura de 1 página, em px do canvas
    let y = 0, first = true;
    while (y < canvas.height) {
      const sliceH = Math.min(pageH, canvas.height - y);
      const slice  = document.createElement('canvas');
      slice.width  = canvas.width;
      slice.height = sliceH;
      const sctx = slice.getContext('2d');
      sctx.fillStyle = '#0B1220';
      sctx.fillRect(0, 0, slice.width, slice.height);
      sctx.drawImage(canvas, 0, y, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
      const img = slice.toDataURL('image/jpeg', 0.9);
      if (!first) pdf.addPage();
      pdf.addImage(img, 'JPEG', 0, 0, pw, sliceH * pw / canvas.width);
      first = false;
      y += sliceH;
    }
    pdf.save(`Dashboard-${new Date().toISOString().slice(0, 10)}.pdf`);
  } catch (e) {
    alert('Erro ao gerar o PDF: ' + e.message);
  }
}
