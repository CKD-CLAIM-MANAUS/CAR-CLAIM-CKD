// ── auth.js ──────────────────────────────────────────────────
import { db, auth, fb, fbAuth } from './firebase.js';

export let currentUser = null;
export let isAdmin = false;

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
      onLogin(user, isAdmin);
    } else {
      currentUser = null;
      isAdmin = false;
      onLogout();
    }
  });
}

// ── Login ─────────────────────────────────────────────────────
export async function login(email, password) {
  if (!email || !password) throw new Error('Preencha email e senha.');
  try {
    await fbAuth.signInWithEmailAndPassword(auth, email, password);
  } catch (e) {
    if (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password') {
      throw new Error('Email ou senha incorretos.');
    }
    if (e.code === 'auth/user-not-found') {
      throw new Error('Utilizador não encontrado.');
    }
    if (e.code === 'auth/too-many-requests') {
      throw new Error('Muitas tentativas. Aguarde um momento.');
    }
    throw new Error('Erro ao entrar. Verifique os dados.');
  }
}

// ── Register ──────────────────────────────────────────────────
export async function register(name, email, password, confirmPassword) {
  if (!name || !email || !password) throw new Error('Preencha todos os campos.');
  if (password.length < 6) throw new Error('A senha deve ter pelo menos 6 caracteres.');
  if (password !== confirmPassword) throw new Error('As senhas não coincidem.');

  try {
    const usersSnap = await fb.getDocs(fb.collection(db, 'users'));
    const isFirst = usersSnap.empty;
    const cred = await fbAuth.createUserWithEmailAndPassword(auth, email, password);
    await fbAuth.updateProfile(cred.user, { displayName: name });
    await fb.setDoc(fb.doc(db, 'users', cred.user.uid), {
      name, email,
      role: isFirst ? 'admin' : 'user',
      createdAt: Date.now()
    });
  } catch (e) {
    if (e.code === 'auth/email-already-in-use') throw new Error('Este email já está registado.');
    if (e.code === 'auth/invalid-email') throw new Error('Email inválido.');
    if (e.message) throw e;
    throw new Error('Erro ao criar conta.');
  }
}

// ── Logout ────────────────────────────────────────────────────
export async function logout() {
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
