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

// ── Lightbox com zoom, pan e navegação ───────────────────────
let _lbPhotos   = [];
let _lbIndex    = 0;
let _lbScale    = 1;
let _lbOffX     = 0;
let _lbOffY     = 0;
let _lbInited   = false;

// Drag (mouse)
let _drag       = false;
let _dragSX     = 0;
let _dragSY     = 0;
let _dragOX     = 0;
let _dragOY     = 0;

// Touch
let _touches    = [];
let _pinchDist  = 0;
let _lastTap    = 0;
let _swipeX     = 0;

const MAX_SCALE = 6;
const MIN_SCALE = 1;

export function openLightbox(photos, index = 0) {
  _lbPhotos = Array.isArray(photos) ? photos.filter(Boolean) : [photos].filter(Boolean);
  if (!_lbPhotos.length) return;
  _lbIndex = Math.max(0, Math.min(index, _lbPhotos.length - 1));
  _lbScale = 1; _lbOffX = 0; _lbOffY = 0;
  if (!_lbInited) _lbInit();
  _lbRender();
  document.getElementById('fsOverlay')?.classList.add('open');
  document.addEventListener('keydown', _lbKey);
  // Oculta dica após 3s
  setTimeout(() => document.getElementById('fsHint')?.classList.add('hidden'), 3000);
}

// Compatibilidade com chamadas antigas
export function openFullscreen(url) { openLightbox([url], 0); }
export function closeFullscreen()   { closeLightbox(); }

export function closeLightbox() {
  document.getElementById('fsOverlay')?.classList.remove('open');
  document.removeEventListener('keydown', _lbKey);
  _lbScale = 1; _lbOffX = 0; _lbOffY = 0;
}

export function lbNavigate(dir) {
  if (_lbPhotos.length <= 1) return;
  _lbIndex = (_lbIndex + dir + _lbPhotos.length) % _lbPhotos.length;
  _lbScale = 1; _lbOffX = 0; _lbOffY = 0;
  _lbRender();
}

function _lbRender() {
  const img  = document.getElementById('fsImg');
  const cnt  = document.getElementById('fsCounter');
  const prev = document.getElementById('fsPrev');
  const next = document.getElementById('fsNext');
  const dl   = document.getElementById('fsDownload');
  const hint = document.getElementById('fsHint');
  if (!img) return;
  img.src = _lbPhotos[_lbIndex];
  if (cnt)  cnt.textContent  = _lbPhotos.length > 1 ? `${_lbIndex + 1} / ${_lbPhotos.length}` : '';
  if (prev) prev.style.display = _lbPhotos.length > 1 ? 'flex' : 'none';
  if (next) next.style.display = _lbPhotos.length > 1 ? 'flex' : 'none';
  if (dl)   { dl.href = _lbPhotos[_lbIndex]; dl.setAttribute('download', ''); }
  if (hint) hint.classList.remove('hidden');
  _lbApply();
}

function _lbApply() {
  const wrap = document.getElementById('fsImgWrap');
  if (wrap) wrap.style.transform = `translate(${_lbOffX}px,${_lbOffY}px) scale(${_lbScale})`;
}

function _lbClamp() {
  if (_lbScale <= 1) { _lbOffX = 0; _lbOffY = 0; return; }
  const stage = document.getElementById('fsStage');
  if (!stage) return;
  const maxX = stage.clientWidth  * (_lbScale - 1) / 2;
  const maxY = stage.clientHeight * (_lbScale - 1) / 2;
  _lbOffX = Math.max(-maxX, Math.min(maxX, _lbOffX));
  _lbOffY = Math.max(-maxY, Math.min(maxY, _lbOffY));
}

function _lbZoomAt(newScale, cx, cy) {
  const stage = document.getElementById('fsStage');
  if (!stage) return;
  newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
  const rect = stage.getBoundingClientRect();
  const px   = cx - rect.left - rect.width  / 2;
  const py   = cy - rect.top  - rect.height / 2;
  const ratio = newScale / _lbScale;
  _lbOffX = px + (_lbOffX - px) * ratio;
  _lbOffY = py + (_lbOffY - py) * ratio;
  _lbScale = newScale;
  _lbClamp();
  _lbApply();
}

function _lbKey(e) {
  if (e.key === 'Escape')                       closeLightbox();
  else if (e.key === 'ArrowLeft')               lbNavigate(-1);
  else if (e.key === 'ArrowRight')              lbNavigate(1);
  else if (e.key === '+' || e.key === '=')      _lbZoomAt(_lbScale * 1.4, window.innerWidth/2, window.innerHeight/2);
  else if (e.key === '-')                       _lbZoomAt(_lbScale / 1.4, window.innerWidth/2, window.innerHeight/2);
}

function _dist(t) {
  const dx = t[0].clientX - t[1].clientX;
  const dy = t[0].clientY - t[1].clientY;
  return Math.sqrt(dx*dx + dy*dy);
}

function _lbInit() {
  _lbInited = true;
  const stage = document.getElementById('fsStage');
  const wrap  = document.getElementById('fsImgWrap');
  if (!stage || !wrap) return;

  // ── Mouse wheel zoom ──────────────────────────────────────
  stage.addEventListener('wheel', e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1/1.15;
    _lbZoomAt(_lbScale * factor, e.clientX, e.clientY);
  }, { passive: false });

  // ── Mouse drag ────────────────────────────────────────────
  stage.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    _drag = true; wrap.classList.add('is-grabbing');
    _dragSX = e.clientX; _dragSY = e.clientY;
    _dragOX = _lbOffX;   _dragOY = _lbOffY;
  });
  window.addEventListener('mousemove', e => {
    if (!_drag) return;
    _lbOffX = _dragOX + (e.clientX - _dragSX);
    _lbOffY = _dragOY + (e.clientY - _dragSY);
    _lbClamp();
    _lbApply();
  });
  window.addEventListener('mouseup', () => {
    _drag = false;
    wrap.classList.remove('is-grabbing');
  });

  // ── Double click zoom toggle ──────────────────────────────
  stage.addEventListener('dblclick', e => {
    if (_lbScale > 1) { _lbScale=1; _lbOffX=0; _lbOffY=0; _lbApply(); }
    else               _lbZoomAt(2.5, e.clientX, e.clientY);
  });

  // ── Touch ─────────────────────────────────────────────────
  stage.addEventListener('touchstart', e => {
    _touches = Array.from(e.touches);
    if (_touches.length === 2) {
      _pinchDist = _dist(_touches);
    }
    if (_touches.length === 1) {
      _swipeX = _touches[0].clientX;
      _dragSX = _touches[0].clientX; _dragSY = _touches[0].clientY;
      _dragOX = _lbOffX;             _dragOY = _lbOffY;
      // Double tap
      const now = Date.now();
      if (now - _lastTap < 280) {
        if (_lbScale > 1) { _lbScale=1; _lbOffX=0; _lbOffY=0; _lbApply(); }
        else               _lbZoomAt(2.5, _touches[0].clientX, _touches[0].clientY);
      }
      _lastTap = now;
    }
  }, { passive: true });

  stage.addEventListener('touchmove', e => {
    e.preventDefault();
    _touches = Array.from(e.touches);
    if (_touches.length === 2) {
      // Pinch zoom
      const newDist  = _dist(_touches);
      const factor   = newDist / _pinchDist;
      const cx       = (_touches[0].clientX + _touches[1].clientX) / 2;
      const cy       = (_touches[0].clientY + _touches[1].clientY) / 2;
      _lbZoomAt(_lbScale * factor, cx, cy);
      _pinchDist = newDist;
    } else if (_touches.length === 1 && _lbScale > 1) {
      // Pan quando zoom > 1
      _lbOffX = _dragOX + (_touches[0].clientX - _dragSX);
      _lbOffY = _dragOY + (_touches[0].clientY - _dragSY);
      _lbClamp();
      _lbApply();
    }
  }, { passive: false });

  stage.addEventListener('touchend', e => {
    if (_touches.length === 1 && _lbScale <= 1 && e.changedTouches.length === 1) {
      const dx = e.changedTouches[0].clientX - _swipeX;
      if (Math.abs(dx) > 50) lbNavigate(dx < 0 ? 1 : -1);
    }
    _touches = Array.from(e.touches);
  }, { passive: true });

  // ── Clique fora da imagem fecha (só quando zoom = 1) ──────
  stage.addEventListener('click', e => {
    if (e.target === stage && _lbScale <= 1) closeLightbox();
  });
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
