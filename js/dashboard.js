// ── dashboard.js — KPI Dashboard ─────────────────────────────
import { incidents } from './incidents.js';
import { escHtml } from './ui.js';

let dashPeriod = 'month'; // 'month' | '3m' | 'all'
let monthlyChartInstance = null; // instância Chart.js activa

// ── Filtro por período ─────────────────────────────────────────
function getPeriodIncs(period) {
  if (period === 'month') {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return incidents.filter(i => i.createdAt >= start.getTime());
  }
  if (period === '3m') {
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    return incidents.filter(i => i.createdAt >= cutoff);
  }
  return [...incidents];
}

// ── KPIs ──────────────────────────────────────────────────────
function calcKPIs(incs) {
  const total        = incs.length;
  const pending      = incs.filter(i => (i.status || 'pending') === 'pending').length;
  const done         = incs.filter(i => i.status === 'done').length;
  const inProgress   = incs.filter(i => ['sent', 'awaiting', 'eta_confirmed', 'received'].includes(i.status)).length;
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

// ── Dados mensais (sempre histórico completo, últimos 6 meses) ─
function calcMonthlyData() {
  const result = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const year  = d.getFullYear();
    const month = d.getMonth();
    const label = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '');
    const count = incidents.filter(inc => {
      if (!inc.createdAt) return false;
      const dt = new Date(inc.createdAt);
      return dt.getFullYear() === year && dt.getMonth() === month;
    }).length;
    result.push({ label, count });
  }
  return result;
}

// ── Por modelo ────────────────────────────────────────────────
function calcByModel(incs) {
  const map = {};
  incs.forEach(i => {
    const m = (i.model || 'N/D').trim();
    map[m] = (map[m] || 0) + 1;
  });
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6);
}

// ── Top 5 peças com mais reclamações ─────────────────────────
function calcTopParts(incs) {
  const map = {};
  incs.forEach(i => {
    const key = (i.partNo || '').trim() || (i.partName || 'N/D').trim();
    if (!map[key]) {
      map[key] = {
        name:  (i.partName || i.partNo || 'N/D').trim(),
        code:  (i.partNo || '').trim(),
        count: 0,
        qty:   0
      };
    }
    map[key].count++;
    map[key].qty += parseInt(i.ngQty) || 0;
  });
  return Object.values(map).sort((a, b) => b.count - a.count).slice(0, 5);
}

// ── HTML de linha de barra (anima de 0% → target) ─────────────
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

// ── Render principal ──────────────────────────────────────────
export function renderDashboard() {
  const el = document.getElementById('dashboardSection');
  if (!el) return;

  const incs     = getPeriodIncs(dashPeriod);
  const kpis     = calcKPIs(incs);
  const monthly  = calcMonthlyData();
  const byModel  = calcByModel(incs);
  const topParts = calcTopParts(incs);

  const maxModel = byModel.length ? byModel[0][1] : 1;
  const maxPart  = topParts.length ? topParts[0].count : 1;

  const STATUS_COLORS = {
    pending:       '#F59E0B',
    sent:          '#3B82F6',
    awaiting:      '#8B5CF6',
    eta_confirmed: '#06B6D4',
    received:      '#84CC16',
    done:          '#22C55E',
  };
  const STATUS_LABELS = {
    pending:       'Pendente',
    sent:          'Enviado',
    awaiting:      'Aguardando',
    eta_confirmed: 'ETA Conf.',
    received:      'Recebido',
    done:          'Encerrado',
  };

  const statusRows = Object.entries(STATUS_LABELS)
    .map(([k, label]) => ({
      key:   k,
      label,
      count: incs.filter(i => (i.status || 'pending') === k).length,
      color: STATUS_COLORS[k],
    }))
    .filter(s => s.count > 0);

  el.innerHTML = `
<div class="dash-wrap">

  <!-- Filtro de período -->
  <div class="dash-period-row">
    <button class="dash-pill ${dashPeriod === 'month' ? 'active' : ''}" onclick="setDashPeriod('month')">Este mês</button>
    <button class="dash-pill ${dashPeriod === '3m'    ? 'active' : ''}" onclick="setDashPeriod('3m')">3 meses</button>
    <button class="dash-pill ${dashPeriod === 'all'   ? 'active' : ''}" onclick="setDashPeriod('all')">Tudo</button>
  </div>

  <!-- KPI cards -->
  <div class="dash-kpi-grid">
    <div class="dash-kpi">
      <div class="dash-kpi-val">${kpis.total}</div>
      <div class="dash-kpi-lbl">Total</div>
    </div>
    <div class="dash-kpi" style="--kc:#F59E0B">
      <div class="dash-kpi-val">${kpis.pending}</div>
      <div class="dash-kpi-lbl">Pendentes</div>
    </div>
    <div class="dash-kpi" style="--kc:#3B82F6">
      <div class="dash-kpi-val">${kpis.inProgress}</div>
      <div class="dash-kpi-lbl">Em Curso</div>
    </div>
    <div class="dash-kpi" style="--kc:#22C55E">
      <div class="dash-kpi-val">${kpis.done}</div>
      <div class="dash-kpi-lbl">Encerrados</div>
    </div>
    <div class="dash-kpi" style="--kc:#E11D48">
      <div class="dash-kpi-val">${kpis.totalDefective}</div>
      <div class="dash-kpi-lbl">Peças NG</div>
    </div>
  </div>

  <!-- Gráfico Chart.js mensal -->
  <div class="dash-card">
    <div class="dash-card-hd">📈 Incidentes por Mês <span class="dash-card-sub">(últimos 6 meses)</span></div>
    <div class="dash-month-chart-wrap">
      <canvas id="dashMonthlyChart"></canvas>
    </div>
  </div>

  <!-- Status + Top Peças (2 colunas) -->
  <div class="dash-grid-2">

    <div class="dash-card">
      <div class="dash-card-hd">📊 Por Estado</div>
      ${statusRows.length === 0
        ? '<p class="dash-empty">Sem dados neste período</p>'
        : statusRows.map(s => `
          <div class="dash-st-row">
            <span class="dash-st-dot" style="background:${s.color}"></span>
            <span class="dash-st-name">${s.label}</span>
            <span class="dash-st-cnt">${s.count}</span>
          </div>
        `).join('')}
    </div>

    <div class="dash-card">
      <div class="dash-card-hd">🏆 Top Peças</div>
      ${topParts.length === 0
        ? '<p class="dash-empty">Sem dados</p>'
        : topParts.map(p => barRow(
            p.name.length > 18 ? p.name.slice(0, 18) + '…' : p.name,
            p.code,
            p.count,
            maxPart,
            '#FF6600'
          )).join('')}
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

</div>`;

  // ── Pós-render: Chart.js + animação das barras ──────────────
  renderMonthlyChart(monthly);

  // Duplo rAF para garantir que o DOM está pintado antes de animar
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.querySelectorAll('.dash-bar-fill[data-target]').forEach(bar => {
      bar.style.width = bar.dataset.target + '%';
    });
  }));
}

// ── Chart.js — gráfico mensal ─────────────────────────────────
function renderMonthlyChart(monthly) {
  const canvas = document.getElementById('dashMonthlyChart');
  if (!canvas) return;

  // Destrói instância anterior para evitar conflito de canvas
  if (monthlyChartInstance) {
    monthlyChartInstance.destroy();
    monthlyChartInstance = null;
  }

  // Verifica se Chart.js está disponível (carregado via CDN)
  if (typeof window.Chart === 'undefined') {
    canvas.parentElement.innerHTML = '<p class="dash-empty">Chart.js não disponível</p>';
    return;
  }

  const ctx = canvas.getContext('2d');
  const labels = monthly.map(m => m.label.charAt(0).toUpperCase() + m.label.slice(1));
  const data   = monthly.map(m => m.count);

  monthlyChartInstance = new window.Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: 'rgba(255,102,0,0.72)',
        hoverBackgroundColor: '#FF6600',
        borderRadius: 5,
        borderSkipped: false,
      }]
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      animation: { duration: 650, easing: 'easeOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor:  '#1A1A1A',
          borderColor:      'rgba(255,102,0,0.35)',
          borderWidth:      1,
          titleColor:       'rgba(255,255,255,0.85)',
          bodyColor:        '#FF8533',
          padding:          10,
          displayColors:    false,
          callbacks: {
            label: ctx => `${ctx.parsed.y} incidente${ctx.parsed.y !== 1 ? 's' : ''}`,
          }
        }
      },
      scales: {
        x: {
          grid:   { display: false },
          border: { display: false },
          ticks:  { color: 'rgba(255,255,255,0.3)', font: { size: 10, family: 'DM Sans, sans-serif' } },
        },
        y: {
          grid:   { color: 'rgba(255,255,255,0.05)' },
          border: { display: false },
          ticks:  {
            color:     'rgba(255,255,255,0.3)',
            font:      { size: 10, family: 'DM Sans, sans-serif' },
            precision: 0,
            stepSize:  1,
          },
          beginAtZero: true,
        }
      }
    }
  });
}

// ── Muda período e re-renderiza ───────────────────────────────
export function setDashPeriod(period) {
  dashPeriod = period;
  renderDashboard();
}
