// ============================================================
//  RECRUITER — firebase-config.js
//  Isi semua nilai di bawah dengan kredensial Firebase kamu.
//  Lihat README.md untuk panduan setup lengkap step-by-step.
// ============================================================

// ──────────────────────────────────────────────────────────
//  1. FIREBASE PROJECT CONFIG
//     Dapatkan dari: Firebase Console → Project Settings →
//     Your Apps → Web App → firebaseConfig (snippet JS)
// ──────────────────────────────────────────────────────────
const FIREBASE_CONFIG = {
  apiKey:            "GANTI_API_KEY",
  authDomain:        "GANTI_PROJECT_ID.firebaseapp.com",
  projectId:         "GANTI_PROJECT_ID",
  storageBucket:     "GANTI_PROJECT_ID.appspot.com",
  messagingSenderId: "GANTI_SENDER_ID",
  appId:             "GANTI_APP_ID"
};

// ──────────────────────────────────────────────────────────
//  2. SUPER ADMIN USERNAME
//     Username ini OTOMATIS mendapat akses Super Admin
//     (level 100, semua permission) saat pertama register.
//     Ganti sebelum deploy. Jangan pakai username umum.
// ──────────────────────────────────────────────────────────
const SUPER_ADMIN_USERNAME = "superadmin";

// ──────────────────────────────────────────────────────────
//  3. APP CONSTANTS
// ──────────────────────────────────────────────────────────
const APP_META = {
  name:    "Recruiter",
  version: "1.0.0",
};
