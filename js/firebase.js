// ── Firebase Configuration ───────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, doc,
  updateDoc, deleteDoc, query, orderBy, getDoc, setDoc,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getAuth, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut,
  onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBkOtlCGjrfSkR2HgVP2OOv4UZpW6txm90",
  authDomain: "car-garantia.firebaseapp.com",
  projectId: "car-garantia",
  storageBucket: "car-garantia.firebasestorage.app",
  messagingSenderId: "1038572043129",
  appId: "1:1038572043129:web:6769b31e0d3be9fd4c0da8"
};

const app = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);

// Firestore helpers
export const fb = {
  collection, addDoc, getDocs, doc,
  updateDoc, deleteDoc, query, orderBy,
  getDoc, setDoc, arrayUnion
};

// Auth helpers
export const fbAuth = {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
};
