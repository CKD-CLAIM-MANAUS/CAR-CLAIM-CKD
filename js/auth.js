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

// ── Create user (admin only) ──────────────────────────────────
export async function createUser(name, email, password) {
  if (!name || !email || !password) throw new Error('Preencha todos os campos.');
  if (password.length < 6) throw new Error('A senha deve ter pelo menos 6 caracteres.');

  // Firebase Admin SDK não está disponível no browser
  // Usamos uma Cloud Function ou criamos via API REST
  // Solução: criar via signInWithEmailAndPassword temporário
  // Para não perder a sessão actual, guardamos o token e recriamos

  const currentAuth = auth;
  const adminEmail  = currentUser.email;
  const adminUid    = currentUser.uid;

  try {
    // Cria o utilizador — isto vai fazer sign-in automático no Firebase
    const cred = await fbAuth.createUserWithEmailAndPassword(currentAuth, email, password);
    await fbAuth.updateProfile(cred.user, { displayName: name });
    await fb.setDoc(fb.doc(db, 'users', cred.user.uid), {
      name,
      email,
      role: 'user',
      createdAt: Date.now(),
      createdBy: adminUid
    });

    // Volta a fazer sign-in como admin
    const adminPass = sessionStorage.getItem('_ap');
    if (adminPass) {
      await fbAuth.signInWithEmailAndPassword(currentAuth, adminEmail, adminPass);
    }

    return { name, email };
  } catch (e) {
    if (e.code === 'auth/email-already-in-use') throw new Error('Este email já está registado.');
    if (e.code === 'auth/invalid-email') throw new Error('Email inválido.');
    throw new Error('Erro ao criar utilizador: ' + e.message);
  }
}

// ── Load all users from Firestore ─────────────────────────────
export async function loadUsers() {
  const snap = await fb.getDocs(fb.collection(db, 'users'));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Logout ────────────────────────────────────────────────────
export async function logout() {
  sessionStorage.removeItem('_ap');
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
