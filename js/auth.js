// ── auth.js ──────────────────────────────────────────────────
import { db, auth, fb, fbAuth } from './firebase.js';

export let currentUser = null;
export let isAdmin = false;
export let isViewer = false;

// Base do backend (Render) — mesmos endpoints da geração de CAR/upload
const API_URL = 'https://car-claim-manaus.onrender.com';

// ── Session timeout — 8 horas ────────────────────────────────
const SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 horas
const SESSION_KEY = 'car_session_ts';
let sessionTimer = null;

function startSessionTimer() {
  clearSessionTimer();
  localStorage.setItem(SESSION_KEY, Date.now().toString());
  sessionTimer = setInterval(checkSessionTimeout, 60 * 1000); // verifica a cada minuto
}

function checkSessionTimeout() {
  const ts = parseInt(localStorage.getItem(SESSION_KEY) || '0');
  if (Date.now() - ts > SESSION_TIMEOUT_MS) {
    clearSessionTimer();
    _showSessionExpiredModal();
    logout();
  }
}

function _showSessionExpiredModal() {
  // Remove modal anterior se existir
  document.getElementById('sessionExpiredOverlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id        = 'sessionExpiredOverlay';
  overlay.className = 'confirm-overlay';
  overlay.style.cssText = 'z-index:9998';
  overlay.innerHTML = `
    <div class="confirm-box">
      <div class="confirm-icon session-expired-icon">🔒</div>
      <div class="confirm-title">Sessão expirada</div>
      <div class="confirm-subtitle">
        A sua sessão de 8 horas terminou.<br>
        Os seus dados foram guardados — faça login para continuar.
      </div>
      <div class="confirm-btns">
        <button class="btn btn-primary confirm-btn-main" id="sessionExpiredOk">Fazer login</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  document.getElementById('sessionExpiredOk').onclick = () => overlay.remove();
}

export function refreshSession() {
  localStorage.setItem(SESSION_KEY, Date.now().toString());
}

function clearSessionTimer() {
  if (sessionTimer) { clearInterval(sessionTimer); sessionTimer = null; }
}

// ── Init ─────────────────────────────────────────────────────
export function initAuth(onLogin, onLogout) {
  fbAuth.onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      try {
        const snap = await fb.getDoc(fb.doc(db, 'users', user.uid));
        const role = snap.exists() ? (snap.data().role || 'user') : 'user';
        isAdmin  = role === 'admin';
        isViewer = role === 'viewer';
      } catch {
        isAdmin  = false;
        isViewer = false;
      }

      // Verifica se a sessão não expirou
      const ts = parseInt(localStorage.getItem(SESSION_KEY) || '0');
      if (ts > 0 && Date.now() - ts > SESSION_TIMEOUT_MS) {
        await fbAuth.signOut(auth);
        return;
      }

      startSessionTimer();
      onLogin(user, isAdmin);
    } else {
      currentUser = null;
      isAdmin = false;
      clearSessionTimer();
      onLogout();
    }
  });

  // Actualiza timestamp de sessão em qualquer interacção
  ['click', 'touchstart', 'keydown'].forEach(evt => {
    document.addEventListener(evt, refreshSession, { passive: true });
  });
}

// ── Login ─────────────────────────────────────────────────────
export async function login(email, password) {
  if (!email || !password) throw new Error('Preencha email e senha.');
  try {
    await fbAuth.signInWithEmailAndPassword(auth, email, password);
    localStorage.setItem(SESSION_KEY, Date.now().toString());
  } catch (e) {
    if (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password') {
      throw new Error('Email ou senha incorretos.');
    }
    if (e.code === 'auth/user-not-found') throw new Error('Utilizador não encontrado.');
    if (e.code === 'auth/too-many-requests') throw new Error('Muitas tentativas. Aguarde um momento.');
    throw new Error('Erro ao entrar. Verifique os dados.');
  }
}

// ── Create user (admin only) ──────────────────────────────────
// Usa uma abordagem segura — cria o utilizador e volta a autenticar o admin
// SEM guardar a senha em sessionStorage
export async function createUser(name, email, password) {
  if (!name || !email || !password) throw new Error('Preencha todos os campos.');
  if (password.length < 8) throw new Error('A senha deve ter pelo menos 8 caracteres.');

  const adminUser = currentUser;
  const adminUid  = adminUser.uid;

  try {
    // Cria o novo utilizador
    const cred = await fbAuth.createUserWithEmailAndPassword(auth, email, password);
    await fbAuth.updateProfile(cred.user, { displayName: name });
    await fb.setDoc(fb.doc(db, 'users', cred.user.uid), {
      name, email, role: 'user',
      createdAt: Date.now(),
      createdBy: adminUid
    });

    // Faz logout do novo utilizador imediatamente
    await fbAuth.signOut(auth);

    // Mostra instruções — admin precisa de voltar a fazer login
    return { name, email, requiresRelogin: true };

  } catch (e) {
    if (e.code === 'auth/email-already-in-use') throw new Error('Este email já está registado.');
    if (e.code === 'auth/invalid-email') throw new Error('Email inválido.');
    throw new Error('Erro ao criar utilizador: ' + e.message);
  }
}

// ── Load all users ────────────────────────────────────────────
export async function loadUsers() {
  const snap = await fb.getDocs(fb.collection(db, 'users'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Logout ────────────────────────────────────────────────────
export async function logout() {
  clearSessionTimer();
  localStorage.removeItem(SESSION_KEY);
  await fbAuth.signOut(auth);
}

// ── User display helpers ──────────────────────────────────────
export function getUserInitials(user) {
  const name = user.displayName || user.email || '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export function getUserFirstName(user) {
  const name = user.displayName || user.email || '';
  return name.split(' ')[0];
}

// ── Admin: gestão de utilizadores via backend (Admin SDK) ─────
// Os endpoints exigem que o chamador seja admin (validado no servidor).
// Vantagem: cria/gere utilizadores SEM deslogar o admin actual.
async function adminFetch(path, options = {}) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error('Sessão expirada. Faça login novamente.');
  const res = await fetch(API_URL + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
      ...(options.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || ('Erro (' + res.status + ').'));
  return body;
}

export const adminListUsers = () => adminFetch('/admin/users');

export const adminCreateUser = (name, email, password, role) =>
  adminFetch('/admin/users', {
    method: 'POST',
    body: JSON.stringify({ name, email, password, role }),
  });

export const adminSetRole = (uid, role) =>
  adminFetch('/admin/users/role', {
    method: 'POST',
    body: JSON.stringify({ uid, role }),
  });

export const adminDisableUser = (uid, disabled) =>
  adminFetch('/admin/users/disable', {
    method: 'POST',
    body: JSON.stringify({ uid, disabled }),
  });

export const adminDeleteUser = (uid) =>
  adminFetch('/admin/users/delete', {
    method: 'POST',
    body: JSON.stringify({ uid }),
  });
