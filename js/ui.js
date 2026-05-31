// ── ui.js ─────────────────────────────────────────────────────

// ── HTML escape — previne XSS em qualquer dado de utilizador ──
export function escHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// ── Sanitiza URLs de fotos — bloqueia javascript: e data: ─────
export function sanitizeUrl(url) {
  if (!url) return '';
  const s = String(url).trim().toLowerCase();
  if (s.startsWith('javascript:') || s.startsWith('data:text') || s.startsWith('vbscript:')) return '';
  return url;
}

// ── Toast ─────────────────────────────────────────────────────
let toastTimer = null;

export function showToast(msg, duration = 2800) {
  const el = document.getElementById('toast');
  if (!el) return;
  if (toastTimer) clearTimeout(toastTimer);
  el.textContent = msg;
  el.classList.add('visible');
  toastTimer = setTimeout(() => el.classList.remove('visible'), duration);
}

// ── Page navigation ───────────────────────────────────────────
export function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('active');

  // Update nav
  document.querySelectorAll('.nav-item[data-page]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === pageId);
  });

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'instant' });
}

// ── Fullscreen image ──────────────────────────────────────────
export function openFullscreen(url) {
  const overlay = document.getElementById('fsOverlay');
  const img = document.getElementById('fsImg');
  if (!overlay || !img) return;
  img.src = url;
  overlay.classList.add('open');
}

export function closeFullscreen() {
  document.getElementById('fsOverlay')?.classList.remove('open');
}

// ── Modal ─────────────────────────────────────────────────────
export function openModal(id) {
  document.getElementById(id)?.classList.add('open');
}

export function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
}

// ── Format helpers ────────────────────────────────────────────
export function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
}

export function renderDetailRow(label, value) {
  return `
    <div class="detail-row">
      <span class="detail-label">${escHtml(label)}</span>
      <span class="detail-value">${escHtml(value) || '—'}</span>
    </div>`;
}

// ── Auth screen helpers ───────────────────────────────────────
export function showAuthError(msg) {
  const el = document.getElementById('authError');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('visible');
}

export function hideAuthError() {
  document.getElementById('authError')?.classList.remove('visible');
}

export function setAuthLoading(btnId, loading, defaultText) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  btn.textContent = loading ? 'Aguarde...' : defaultText;
}

// ── Auth tab switching ────────────────────────────────────────
export function switchAuthTab(tab) {
  const loginForm    = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const tabLogin     = document.getElementById('tabLogin');
  const tabRegister  = document.getElementById('tabRegister');

  loginForm.style.display    = tab === 'login'    ? 'block' : 'none';
  registerForm.style.display = tab === 'register' ? 'block' : 'none';
  tabLogin.classList.toggle('active',    tab === 'login');
  tabRegister.classList.toggle('active', tab === 'register');
  hideAuthError();
}
