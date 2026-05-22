// ── auth.js ──────────────────────────────────────────────────
import { db, auth, fb, fbAuth } from './firebase.js';

export let currentUser = null;
export let isAdmin = false;

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
    logout();
  }
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
        isAdmin = snap.exists() && snap.data().role === 'admin';
      } catch {
        isAdmin = false;
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
  if (password.length < 6) throw new Error('A senha deve ter pelo menos 6 caracteres.');

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
