/* ============================================================
   RECRUITER — app.js  (Part 1/2)
   Firebase Firestore | Full Platform Logic
   ============================================================ */
"use strict";

// ════════════════════════════════════════════════════════════
//  FIREBASE INIT
// ════════════════════════════════════════════════════════════
let db;
try {
  firebase.initializeApp(FIREBASE_CONFIG);
  db = firebase.firestore();
} catch (e) { console.error("Firebase init error:", e); }

// ════════════════════════════════════════════════════════════
//  GLOBAL STATE
// ════════════════════════════════════════════════════════════
const S = {
  user:           null,   // current logged-in user object
  page:           null,
  sidebarOpen:    true,
  hostStep:       1,
  hostData:       {},
  hostQuestions:  [],
  allRecs:        [],
  allApps:        [],
  allUsers:       [],
  allInvites:     [],
  allRoles:       [],
  allServers:     [],
  allNotifs:      [],
  allGCs:         [],
  auditLogs:      [],
  settings:       {},
  recTypes:       [],
  departments:    [],
  activeGCId:     null,
  gcUnsub:        null,
  confirmCb:      null,
};

// ════════════════════════════════════════════════════════════
//  FIRESTORE COLLECTIONS
// ════════════════════════════════════════════════════════════
const C = {
  users:        ()   => db.collection("users"),
  invites:      ()   => db.collection("invites"),
  recs:         ()   => db.collection("recruitments"),
  apps:         ()   => db.collection("applications"),
  notifs:       ()   => db.collection("notifications"),
  roles:        ()   => db.collection("roles"),
  servers:      ()   => db.collection("servers"),
  gcs:          ()   => db.collection("group_chats"),
  gcMsgs:       (id) => db.collection("group_chats").doc(id).collection("messages"),
  audit:        ()   => db.collection("audit_log"),
  config:       ()   => db.collection("settings"),
};

// ════════════════════════════════════════════════════════════
//  UTILITIES
// ════════════════════════════════════════════════════════════
const $  = id  => document.getElementById(id);
const q  = sel => document.querySelector(sel);
const qq = sel => [...document.querySelectorAll(sel)];
const esc = s => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const ts  = ()  => firebase.firestore.FieldValue.serverTimestamp();
const inc = (n) => firebase.firestore.FieldValue.increment(n);
const uid = ()  => crypto.randomUUID ? crypto.randomUUID().replace(/-/g,"").slice(0,16) : Math.random().toString(36).slice(2,10)+Date.now().toString(36);

const fmtDate = v => {
  if (!v) return "—";
  const d = v?.toDate ? v.toDate() : new Date(v);
  return isNaN(d) ? "—" : d.toLocaleString("id-ID", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" });
};
const fmtShort = v => {
  if (!v) return "—";
  const d = v?.toDate ? v.toDate() : new Date(v);
  return isNaN(d) ? "—" : d.toLocaleString("id-ID", { day:"2-digit", month:"short", year:"numeric" });
};
const timeAgo = v => {
  if (!v) return "—";
  const d = v?.toDate ? v.toDate() : new Date(v);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return "Baru saja";
  if (diff < 3600000) return Math.floor(diff/60000) + " mnt lalu";
  if (diff < 86400000) return Math.floor(diff/3600000) + " jam lalu";
  return Math.floor(diff/86400000) + " hari lalu";
};
const validateUser = u => /^[a-z0-9_]{3,20}$/.test(u);
const hashPw = async pw => {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("rc_2025_" + pw + "_salt"));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,"0")).join("");
};

// Session (localStorage + sessionStorage double-store)
const SESSION_KEY = "rc_v3_session";
const saveSession  = d => { try { const j=JSON.stringify(d); localStorage.setItem(SESSION_KEY,j); sessionStorage.setItem(SESSION_KEY,j); } catch(e){} };
const loadSession  = ()  => { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)||localStorage.getItem(SESSION_KEY)); } catch{ return null; } };
const clearSession = ()  => { try { localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY); } catch(e){} };

// ════════════════════════════════════════════════════════════
//  TOAST
// ════════════════════════════════════════════════════════════
function toast(title, msg="", type="info", ms=4500) {
  const icons = { info:"◆", success:"✓", error:"⊗", warning:"⚠" };
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type]||"◆"}</span>
    <div class="toast-body">
      <div class="toast-title">${esc(title)}</div>
      ${msg ? `<div class="toast-msg">${esc(msg)}</div>` : ""}
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">✕</button>`;
  $("toastContainer").appendChild(el);
  setTimeout(() => el.remove(), ms);
}

// ════════════════════════════════════════════════════════════
//  MODALS
// ════════════════════════════════════════════════════════════
function openModal(id) {
  const m = $(id); if (!m) return;
  $("modalOverlay").classList.remove("hidden");
  m.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}
function closeModal(id) {
  const m = $(id); if (!m) return;
  m.classList.add("hidden");
  if (!q(".modal:not(.hidden)")) { $("modalOverlay").classList.add("hidden"); document.body.style.overflow = ""; }
}
function closeAll() {
  qq(".modal").forEach(m => m.classList.add("hidden"));
  $("modalOverlay").classList.add("hidden");
  document.body.style.overflow = "";
}
document.addEventListener("DOMContentLoaded", () => {
  $("modalOverlay")?.addEventListener("click", closeAll);
});

function showConfirm(title, msg, cb, btnLabel="YA, LANJUTKAN") {
  $("confirmTitle").textContent   = title;
  $("confirmMessage").textContent = msg;
  const btn = $("confirmActionBtn");
  btn.textContent = btnLabel;
  btn.onclick = () => { closeModal("modalConfirm"); cb(); };
  openModal("modalConfirm");
}

// ════════════════════════════════════════════════════════════
//  LOADING SCREEN
// ════════════════════════════════════════════════════════════
function setLoader(pct, status) {
  const f = $("lsFill"), s = $("lsStatus");
  if (f) f.style.width = pct + "%";
  if (s) s.textContent = status;
}
function hideLoader() {
  const ls = $("loadingScreen");
  if (!ls) return;
  ls.classList.add("fade-out");
  setTimeout(() => ls.style.display = "none", 500);
}

// ════════════════════════════════════════════════════════════
//  APP BOOT
// ════════════════════════════════════════════════════════════
window.addEventListener("DOMContentLoaded", async () => {
  setLoader(10, "Menginisialisasi...");
  if (!db) {
    setLoader(100, "Firebase belum dikonfigurasi! Lihat README.md");
    toast("Firebase Error", "Isi firebase-config.js dengan kredensial Anda. Lihat README.md.", "error", 0);
    return;
  }
  await new Promise(r => setTimeout(r, 200));

  setLoader(30, "Menghubungkan ke database...");
  try { await C.config().doc("platform").get(); }
  catch(e) { setLoader(100, "Koneksi gagal. Cek Firebase config & rules."); toast("Koneksi Gagal", "Pastikan Firebase Firestore diaktifkan dan rules sudah diset.", "error", 0); return; }

  setLoader(50, "Memuat konfigurasi platform...");
  await loadSettings();

  setLoader(65, "Memuat statistik...");
  await loadPublicStats();

  setLoader(80, "Memeriksa sesi login...");
  const sess = loadSession();
  if (sess?.username && sess?.token) {
    try {
      const uDoc = await C.users().doc(sess.username).get();
      if (uDoc.exists) {
        const ud = uDoc.data();
        if (ud.sessionToken === sess.token && ud.status !== "banned" && ud.status !== "suspended") {
          S.user = { username: sess.username, ...ud };
          setLoader(100, "Siap.");
          setTimeout(async () => { hideLoader(); await bootMainApp(); }, 350);
          return;
        }
      }
    } catch(e) { console.warn("Session restore failed:", e); }
  }
  clearSession();
  setLoader(100, "Siap.");
  setTimeout(() => { hideLoader(); showAuthPage(); }, 350);
});

// ════════════════════════════════════════════════════════════
//  SETTINGS LOAD
// ════════════════════════════════════════════════════════════
async function loadSettings() {
  try {
    const doc = await C.config().doc("platform").get();
    S.settings    = doc.exists ? (doc.data() || {}) : {};
    S.recTypes    = S.settings.recTypes    || ["Staff","Moderator","Admin","Event","Media","Partner","Collab","Desainer","Penulis","Helper"];
    S.departments = S.settings.departments || ["Moderasi","Event","Media & Konten","Desain","Partnership","Administrasi","Teknikal","Keamanan"];
  } catch(e) {
    S.recTypes    = ["Staff","Moderator","Admin","Event"];
    S.departments = ["Moderasi","Event","Media","Desain"];
  }
}

async function loadPublicStats() {
  try {
    const [uS, rS, aS] = await Promise.all([
      C.users().get(),
      C.recs().where("status","==","open").get(),
      C.apps().get(),
    ]);
    $("statUsers").textContent = uS.size;
    $("statRec").textContent   = rS.size;
    $("statApps").textContent  = aS.size;
  } catch(e) {}
}

// ════════════════════════════════════════════════════════════
//  AUTH PAGE
// ════════════════════════════════════════════════════════════
function showAuthPage() {
  $("authPage").classList.remove("hidden");
  $("mainApp").classList.add("hidden");
}

function switchAuthTab(tab) {
  $("tabLogin").classList.toggle("active",    tab === "login");
  $("tabRegister").classList.toggle("active", tab === "register");
  $("loginForm").classList.toggle("hidden",    tab !== "login");
  $("registerForm").classList.toggle("hidden", tab !== "register");
}

function togglePass(inputId, btn) {
  const inp = $(inputId); if (!inp) return;
  inp.type   = inp.type === "password" ? "text" : "password";
  btn.textContent = inp.type === "password" ? "👁" : "🙈";
}

// ════════════════════════════════════════════════════════════
//  LOGIN
// ════════════════════════════════════════════════════════════
async function handleLogin() {
  const username = $("loginUsername")?.value.trim().toLowerCase();
  const password = $("loginPassword")?.value;
  if (!username || !password) { toast("Isi semua field","","warning"); return; }

  const btn = q("#loginForm .btn-primary");
  if (btn) { btn.disabled = true; btn.querySelector(".btn-text").textContent = "MEMPROSES..."; }
  try {
    if (S.settings.maintenance) {
      const tmp = await C.users().doc(username).get();
      if (!tmp.exists || (tmp.data().roleLevel || 0) < 80) {
        toast("Maintenance Mode","Platform sedang dalam pemeliharaan. Coba lagi nanti.","warning"); return;
      }
    }
    const uDoc = await C.users().doc(username).get();
    if (!uDoc.exists) { toast("Login Gagal","Username atau password salah.","error"); return; }
    const ud = uDoc.data();
    const hash = await hashPw(password);
    if (ud.passwordHash !== hash) { toast("Login Gagal","Username atau password salah.","error"); return; }
    if (ud.status === "banned")    { toast("Akun Dibanned","Hubungi admin untuk info lebih lanjut.","error"); return; }
    if (ud.status === "suspended") { toast("Akun Disuspend","Hubungi admin untuk info lebih lanjut.","error"); return; }

    const token = uid();
    await C.users().doc(username).update({ sessionToken: token, lastLogin: ts() });
    S.user = { username, ...ud, sessionToken: token };
    saveSession({ username, token });
    await writeAudit("login", username, "Login berhasil");
    await bootMainApp();
  } catch(e) { console.error(e); toast("Error","Terjadi kesalahan. Coba lagi.","error"); }
  finally { if (btn) { btn.disabled = false; btn.querySelector(".btn-text").textContent = "MASUK"; } }
}

// ════════════════════════════════════════════════════════════
//  REGISTER
// ════════════════════════════════════════════════════════════
async function handleRegister() {
  const code     = $("regInviteCode")?.value.trim().toUpperCase();
  const username = $("regUsername")?.value.trim().toLowerCase();
  const dispName = $("regDisplayName")?.value.trim();
  const discord  = $("regDiscordTag")?.value.trim();
  const pw       = $("regPassword")?.value;
  const pwc      = $("regPasswordConfirm")?.value;
  const agreed   = $("regAgree")?.checked;

  if (!code||!username||!dispName||!discord||!pw||!pwc)   { toast("Isi semua field wajib","","warning"); return; }
  if (!agreed)                                              { toast("Setujui syarat penggunaan","","warning"); return; }
  if (!validateUser(username))                              { toast("Username tidak valid","Gunakan huruf kecil, angka, underscore. 3–20 karakter.","warning"); return; }
  if (pw.length < 8)                                        { toast("Password terlalu pendek","Minimal 8 karakter.","warning"); return; }
  if (pw !== pwc)                                           { toast("Password tidak cocok","","warning"); return; }
  if (S.settings.registrationOpen === false)                { toast("Registrasi Ditutup","Saat ini tidak menerima pendaftaran baru.","warning"); return; }

  const btn = q("#registerForm .btn-primary");
  if (btn) { btn.disabled = true; btn.querySelector(".btn-text").textContent = "MEMPROSES..."; }
  try {
    // Validate invite code
    const invSnap = await C.invites().where("code","==",code).where("status","==","active").get();
    if (invSnap.empty) { toast("Kode Tidak Valid","Kode undangan tidak ditemukan atau sudah tidak aktif.","error"); return; }
    const invDoc  = invSnap.docs[0];
    const invData = invDoc.data();

    // Expiry check
    if (invData.expiresAt) {
      const exp = invData.expiresAt?.toDate ? invData.expiresAt.toDate() : new Date(invData.expiresAt);
      if (exp < new Date()) {
        await invDoc.ref.update({ status: "expired" });
        toast("Kode Kadaluarsa","Minta kode baru ke admin.","error"); return;
      }
    }
    // Max use check
    if (invData.maxUse > 0 && (invData.usedCount||0) >= invData.maxUse) {
      await invDoc.ref.update({ status: "used" });
      toast("Kode Sudah Habis","Kode ini sudah mencapai batas penggunaan.","error"); return;
    }
    // Username uniqueness
    const exist = await C.users().doc(username).get();
    if (exist.exists) { toast("Username Sudah Dipakai","Pilih username lain.","error"); return; }

    // Determine role
    let roleId = invData.defaultRole || "";
    let roleLevel = 1, roleName = "Member", permissions = {};
    if (username === SUPER_ADMIN_USERNAME) {
      roleLevel = 100; roleName = "Super Admin"; roleId = "_superadmin";
      permissions = { manageRec:true, manageUsers:true, manageInvites:true, viewAnalytics:true, manageRoles:true, manageSettings:true, reviewApps:true, viewAuditLog:true };
    } else if (roleId) {
      try {
        const rDoc = await C.roles().doc(roleId).get();
        if (rDoc.exists) { const rd=rDoc.data(); roleLevel=rd.level||1; roleName=rd.name||"Member"; permissions=rd.permissions||{}; }
      } catch(e) {}
    }

    const hash  = await hashPw(pw);
    const token = uid();
    const uData = {
      username, displayName: dispName, discordTag: discord,
      passwordHash: hash, sessionToken: token,
      role: roleName, roleId, roleLevel, permissions,
      status: S.settings.autoApprove !== false ? "active" : "pending",
      bio: "", joinedAt: ts(), lastLogin: ts(),
      inviteCode: code, invitedBy: invData.createdBy || "system",
      totalApps: 0, acceptedApps: 0, rejectedApps: 0,
    };
    await C.users().doc(username).set(uData);

    // Update invite use count
    const newUsed = (invData.usedCount||0) + 1;
    await invDoc.ref.update({
      usedCount: inc(1),
      usedBy: firebase.firestore.FieldValue.arrayUnion({ username, usedAt: new Date().toISOString() }),
      status: invData.maxUse > 0 && newUsed >= invData.maxUse ? "used" : "active",
    });

    await writeAudit("register", username, `Registrasi baru dengan kode ${code}`);
    if (S.settings.notifNewUser !== false) await sendAdminNotif("user_registered", `User baru terdaftar: @${username}`, username);

    S.user = { username, ...uData };
    saveSession({ username, token });
    toast("Registrasi Berhasil!","Selamat datang di Recruiter.","success");
    await bootMainApp();
  } catch(e) { console.error(e); toast("Error","Terjadi kesalahan. Coba lagi.","error"); }
  finally { if (btn) { btn.disabled = false; btn.querySelector(".btn-text").textContent = "DAFTAR SEKARANG"; } }
}

// ════════════════════════════════════════════════════════════
//  MAIN APP BOOT
// ════════════════════════════════════════════════════════════
async function bootMainApp() {
  $("authPage").classList.add("hidden");
  $("mainApp").classList.remove("hidden");

  const u = S.user;
  const initials = (u.displayName||u.username).slice(0,2).toUpperCase();
  $("sbAvatar").textContent      = initials;
  $("sbUsername").textContent    = u.username;
  $("sbRole").textContent        = u.role || "Member";
  $("topbarAvatar").textContent  = initials;

  const isAdmin = isAdminUser();
  $("navUser").classList.toggle("hidden",  isAdmin);
  $("navAdmin").classList.toggle("hidden", !isAdmin);

  await Promise.all([
    loadRecs(),
    loadMyNotifs(),
    isAdmin ? loadAdminData() : Promise.resolve(),
  ]);

  navigateTo(isAdmin ? "adminOverview" : "home");
  if (isAdmin) startClock();
}

async function handleLogout() {
  if (!S.user) return;
  try { await C.users().doc(S.user.username).update({ sessionToken: "" }); await writeAudit("logout", S.user.username, "Logout"); } catch(e) {}
  if (S.gcUnsub) S.gcUnsub();
  clearSession(); S.user = null;
  closeAll();
  $("authPage").classList.remove("hidden");
  $("mainApp").classList.add("hidden");
  toast("Berhasil keluar","","info");
}

function isAdminUser() {
  if (!S.user) return false;
  return S.user.username === SUPER_ADMIN_USERNAME || (S.user.roleLevel||0) >= 50 ||
    Object.values(S.user.permissions||{}).some(v => v === true);
}
function hasPerm(perm) {
  if (!S.user) return false;
  if (S.user.username === SUPER_ADMIN_USERNAME || (S.user.roleLevel||0) >= 100) return true;
  return !!(S.user.permissions||{})[perm];
}

// ════════════════════════════════════════════════════════════
//  NAVIGATION
// ════════════════════════════════════════════════════════════
function navigateTo(page) {
  qq(".content-page").forEach(p => p.classList.add("hidden"));
  qq(".sb-link").forEach(l => l.classList.remove("active"));
  const pid = "page" + page[0].toUpperCase() + page.slice(1);
  const pel = $(pid);
  if (!pel) { console.warn("Page not found:", pid); return; }
  pel.classList.remove("hidden");
  S.page = page;
  const link = q(`.sb-link[data-page="${page}"]`);
  if (link) link.classList.add("active");
  const titles = {
    home:"Beranda", recruitments:"Rekrutmen Aktif", myApplications:"Lamaran Saya",
    notifications:"Notifikasi", profile:"Profil Saya",
    adminOverview:"Dashboard Admin", adminRecruitments:"Kelola Rekrutmen",
    adminApplications:"Semua Lamaran", adminUsers:"Manajemen User",
    adminInvites:"Kode Undangan", adminRoles:"Manajemen Role",
    adminServers:"Server Discord", adminAnalytics:"Analytics",
    adminGC:"Group Chat", adminAuditLog:"Audit Log", adminSettings:"Pengaturan Platform",
  };
  $("topbarTitle").textContent = titles[page] || page;
  const loaders = {
    home:               loadHome,
    recruitments:       loadRecPage,
    myApplications:     loadMyAppsPage,
    notifications:      loadNotifPage,
    profile:            loadProfilePage,
    adminOverview:      loadAdminOverview,
    adminRecruitments:  loadAdminRecPage,
    adminApplications:  loadAdminAppsPage,
    adminUsers:         loadAdminUsersPage,
    adminInvites:       loadAdminInvitesPage,
    adminRoles:         loadAdminRolesPage,
    adminServers:       loadAdminServersPage,
    adminAnalytics:     loadAnalyticsPage,
    adminGC:            loadGCPage,
    adminAuditLog:      loadAuditPage,
    adminSettings:      loadSettingsPage,
  };
  if (loaders[page]) loaders[page]();
  if (window.innerWidth <= 768) $("sidebar").classList.remove("open");
  window.scrollTo(0,0);
}

function toggleSidebar() {
  if (window.innerWidth <= 768) {
    $("sidebar").classList.toggle("open");
  } else {
    S.sidebarOpen = !S.sidebarOpen;
    $("sidebar").classList.toggle("collapsed", !S.sidebarOpen);
    $("topbar").classList.toggle("full-width", !S.sidebarOpen);
    $("mainContent").classList.toggle("expanded", !S.sidebarOpen);
  }
}

// ════════════════════════════════════════════════════════════
//  DATA LOADERS
// ════════════════════════════════════════════════════════════
async function loadRecs() {
  try {
    const snap = await C.recs().orderBy("createdAt","desc").get();
    S.allRecs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const open = S.allRecs.filter(r => r.status === "open").length;
    setBadge("badgeRec", open);
    setBadge("badgeAdminRec", S.allRecs.length);
  } catch(e) { console.error(e); }
}

async function loadAdminData() {
  try {
    const [uS,iS,rS,sS,aS,auS,gcS] = await Promise.all([
      C.users().orderBy("joinedAt","desc").get(),
      C.invites().orderBy("createdAt","desc").get(),
      C.roles().get(),
      C.servers().get(),
      C.apps().orderBy("submittedAt","desc").get(),
      C.audit().orderBy("timestamp","desc").limit(300).get(),
      C.gcs().orderBy("createdAt","desc").get(),
    ]);
    S.allUsers   = uS.docs.map(d => ({ id:d.id, ...d.data() }));
    S.allInvites = iS.docs.map(d => ({ id:d.id, ...d.data() }));
    S.allRoles   = rS.docs.map(d => ({ id:d.id, ...d.data() }));
    S.allServers = sS.docs.map(d => ({ id:d.id, ...d.data() }));
    S.allApps    = aS.docs.map(d => ({ id:d.id, ...d.data() }));
    S.auditLogs  = auS.docs.map(d => ({ id:d.id, ...d.data() }));
    S.allGCs     = gcS.docs.map(d => ({ id:d.id, ...d.data() }));
    const pending = S.allApps.filter(a => a.status==="pending").length;
    setBadge("badgeAdminApps", pending);
    populateRoleFilters();
  } catch(e) { console.error(e); }
}

async function loadMyNotifs() {
  try {
    const snap = await C.notifs()
      .where("targetUsername","==",S.user.username)
      .orderBy("createdAt","desc").limit(60).get();
    S.allNotifs = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    const unread = S.allNotifs.filter(n => !n.read).length;
    updateNotifBadges(unread);
  } catch(e) {}
}

function setBadge(id, n) {
  const el = $(id); if (!el) return;
  el.textContent = n;
  el.classList.toggle("hidden", !n || n < 1);
}
function updateNotifBadges(n) {
  setBadge("sbNotifBadge",  n);
  setBadge("badgeNotif",    n);
  setBadge("tnBadge",       n);
  if ($("qsNotifs")) $("qsNotifs").textContent = n;
}
function populateRoleFilters() {
  const sels = ["adminUserRoleFilter","giRole"];
  sels.forEach(id => {
    const el = $(id); if (!el) return;
    const first = el.querySelector("option")?.outerHTML || "";
    el.innerHTML = first + S.allRoles.map(r => `<option value="${r.id}">${esc(r.name)}</option>`).join("");
  });
}

// ════════════════════════════════════════════════════════════
//  HOME PAGE
// ════════════════════════════════════════════════════════════
function loadHome() {
  const u = S.user;
  $("homeGreeting").textContent = `Halo, ${u.displayName || u.username}`;
  const openRecs = S.allRecs.filter(r => r.status==="open");
  const myApps   = S.allApps.filter(a => a.applicantUsername === u.username);
  if ($("qsActiveRec")) $("qsActiveRec").textContent = openRecs.length;
  if ($("qsMyApps"))    $("qsMyApps").textContent    = myApps.length;
  if ($("qsStatus"))    $("qsStatus").textContent     = u.status === "active" ? "Aktif" : (u.status||"—");

  const recList = $("homeRecList");
  if (recList) {
    if (!openRecs.length) {
      recList.innerHTML = emptyState("◈","Tidak Ada Rekrutmen","Tidak ada recruitment yang tersedia, silahkan nunggu.");
    } else {
      recList.innerHTML = openRecs.slice(0,4).map(renderRecCard).join("");
    }
  }
  const appList = $("homeAppList");
  if (appList) {
    if (!myApps.length) {
      appList.innerHTML = emptyState("◉","Belum Ada Lamaran","Anda belum pernah melamar ke rekrutmen apapun.");
    } else {
      appList.innerHTML = myApps.slice(0,5).map(a => renderAppItem(a)).join("");
    }
  }
}

function emptyState(icon, title, msg) {
  return `<div class="empty-state"><div class="es-icon">${icon}</div><h3>${esc(title)}</h3><p>${esc(msg)}</p></div>`;
}

// ════════════════════════════════════════════════════════════
//  RECRUITMENTS PAGE
// ════════════════════════════════════════════════════════════
function loadRecPage() {
  const srvSel  = $("recFilterServer");
  const typeSel = $("recFilterType");
  const srvs = [...new Set(S.allRecs.map(r=>r.serverName).filter(Boolean))];
  const typs = [...new Set(S.allRecs.map(r=>r.type).filter(Boolean))];
  if (srvSel)  srvSel.innerHTML  = `<option value="">Semua Server</option>` + srvs.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join("");
  if (typeSel) typeSel.innerHTML = `<option value="">Semua Tipe</option>`   + typs.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join("");
  filterRecs();
}

function filterRecs() {
  const q      = $("recSearchInput")?.value.trim().toLowerCase();
  const server = $("recFilterServer")?.value;
  const type   = $("recFilterType")?.value;
  const status = $("recFilterStatus")?.value;
  let recs = S.allRecs.filter(r => {
    if (r.visibility === "private") return false;
    if (status === "open"   && r.status !== "open")   return false;
    if (status === "closed" && r.status !== "closed") return false;
    if (server && r.serverName !== server) return false;
    if (type   && r.type !== type)         return false;
    if (q && !`${r.title} ${r.serverName} ${r.position} ${r.type}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const container = $("recListContainer");
  if (!container) return;
  container.innerHTML = recs.length ? recs.map(renderRecCard).join("") : emptyState("◈","Tidak Ada Rekrutmen","Tidak ada recruitment yang tersedia, silahkan nunggu.");
}

function renderRecCard(r) {
  const pLabel = { urgent:"⚡ URGENT", high:"↑ HIGH", critical:"⚠ CRITICAL" }[r.priority] || "";
  return `<div class="rec-card" onclick="openRecDetail('${r.id}')">
    <div class="rc-top">
      <div class="rc-title">${esc(r.title)}</div>
      <div class="rc-status ${r.status}">${(r.status||"").toUpperCase()}</div>
    </div>
    <div class="rc-meta">
      <div class="rc-meta-item"><span>◆</span>${esc(r.serverName||"—")}</div>
      <div class="rc-meta-item"><span>◈</span>${esc(r.type||"—")}</div>
      <div class="rc-meta-item"><span>✦</span>${esc(r.department||"—")}</div>
      ${r.endDate?`<div class="rc-meta-item"><span>⏱</span>Tutup: ${fmtShort(r.endDate)}</div>`:""}
      ${r.slots>0?`<div class="rc-meta-item"><span>👥</span>${r.slots} posisi</div>`:""}
    </div>
    <div class="rc-desc">${esc(r.description||"")}</div>
    <div class="rc-footer">
      <div class="rc-tags">${(r.tags||[]).slice(0,3).map(t=>`<span class="rc-tag">${esc(t)}</span>`).join("")}</div>
      ${pLabel?`<span class="rc-priority ${r.priority}">${pLabel}</span>`:""}
    </div>
  </div>`;
}

// ════════════════════════════════════════════════════════════
//  RECRUITMENT DETAIL MODAL
// ════════════════════════════════════════════════════════════
async function openRecDetail(recId) {
  const rec = S.allRecs.find(r => r.id === recId); if (!rec) return;
  const u   = S.user;
  const myApp = S.allApps.find(a => a.recId === recId && a.applicantUsername === u.username);
  let appCount = 0;
  try { const s = await C.apps().where("recId","==",recId).get(); appCount = s.size; } catch(e){}

  $("mrdTitle").textContent = rec.title;
  $("mrdBody").innerHTML = `
    <div class="rec-detail-grid">
      <div class="rd-left">
        <div class="rd-meta">
          <span class="rc-status ${rec.status}">${(rec.status||"").toUpperCase()}</span>
          ${rec.priority&&rec.priority!=="normal"?`<span class="rc-priority ${rec.priority}">${rec.priority.toUpperCase()}</span>`:""}
          <span class="rc-meta-item">◆ ${esc(rec.serverName||"—")}</span>
          <span class="rc-meta-item">◈ ${esc(rec.type||"—")}</span>
          <span class="rc-meta-item">✦ ${esc(rec.department||"—")}</span>
        </div>
        ${rec.description?`<div class="rd-section"><h4>DESKRIPSI</h4><p style="font-size:13px;color:var(--off-white);line-height:1.7;white-space:pre-line">${esc(rec.description)}</p></div>`:""}
        ${rec.jobdesc?`<div class="rd-section"><h4>TANGGUNG JAWAB</h4><p style="font-size:13px;color:var(--off-white);line-height:1.7;white-space:pre-line">${esc(rec.jobdesc)}</p></div>`:""}
        ${(rec.requirements||[]).length?`<div class="rd-section"><h4>SYARAT WAJIB</h4><div class="rd-list">${rec.requirements.map(r=>`<div class="rd-list-item">${esc(r)}</div>`).join("")}</div></div>`:""}
        ${(rec.preferences||[]).length?`<div class="rd-section"><h4>DIUTAMAKAN</h4><div class="rd-list">${rec.preferences.map(p=>`<div class="rd-list-item">${esc(p)}</div>`).join("")}</div></div>`:""}
        ${(rec.benefits||[]).length?`<div class="rd-section"><h4>BENEFIT</h4><div class="rd-list">${rec.benefits.map(b=>`<div class="rd-list-item">${esc(b)}</div>`).join("")}</div></div>`:""}
        ${rec.disclaimer?`<div class="rd-section"><h4>CATATAN PENTING</h4><div style="background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.25);border-radius:6px;padding:12px 16px;font-size:13px;color:var(--muted)">${esc(rec.disclaimer)}</div></div>`:""}
      </div>
      <div class="rd-right">
        <div class="rd-sidebar-card"><h4>INFORMASI</h4>
          <div class="rd-info-row"><span class="rd-info-label">Status</span><span class="rd-info-val">${rec.status}</span></div>
          <div class="rd-info-row"><span class="rd-info-label">Posisi</span><span class="rd-info-val">${esc(rec.position||"—")}</span></div>
          ${rec.slots>0?`<div class="rd-info-row"><span class="rd-info-label">Slot</span><span class="rd-info-val">${rec.slots}</span></div>`:""}
          ${!rec.hideApplicantCount?`<div class="rd-info-row"><span class="rd-info-label">Pelamar</span><span class="rd-info-val">${appCount}</span></div>`:""}
          ${rec.endDate?`<div class="rd-info-row"><span class="rd-info-label">Ditutup</span><span class="rd-info-val">${fmtShort(rec.endDate)}</span></div>`:""}
          ${rec.contactPerson?`<div class="rd-info-row"><span class="rd-info-label">Kontak</span><span class="rd-info-val">${esc(rec.contactPerson)}</span></div>`:""}
          ${rec.announceLink?`<div class="rd-info-row"><span class="rd-info-label">Pengumuman</span><a href="${esc(rec.announceLink)}" target="_blank" style="color:var(--gold-400);font-size:12px">Lihat ↗</a></div>`:""}
        </div>
        ${(rec.tags||[]).length?`<div class="rd-sidebar-card"><h4>TAG</h4><div class="rc-tags">${rec.tags.map(t=>`<span class="rc-tag">${esc(t)}</span>`).join("")}</div></div>`:""}
      </div>
    </div>`;

  let footer = "";
  if (myApp) {
    footer = `<div style="display:flex;align-items:center;gap:12px">
      <span class="app-status-badge ${myApp.status}">LAMARAN: ${myApp.status.toUpperCase()}</span>
      ${myApp.status==="pending"&&rec.allowWithdraw!==false?`<button class="btn-danger sm" onclick="withdrawApp('${myApp.id}')">Tarik Lamaran</button>`:""}
    </div>`;
  } else if (rec.status==="open") {
    footer = `<button class="btn-ghost" onclick="closeModal('modalRecDetail')">Tutup</button>
      <button class="btn-primary" onclick="openApplyModal('${rec.id}')">LAMAR SEKARANG →</button>`;
  } else {
    footer = `<span style="color:var(--muted);font-size:13px">Rekrutmen ini sudah ditutup</span>
      <button class="btn-ghost" onclick="closeModal('modalRecDetail')">Tutup</button>`;
  }
  $("mrdFooter").innerHTML = footer;
  openModal("modalRecDetail");
}

// ════════════════════════════════════════════════════════════
//  APPLY MODAL
// ════════════════════════════════════════════════════════════
async function openApplyModal(recId) {
  const rec = S.allRecs.find(r => r.id === recId); if (!rec) return;
  closeModal("modalRecDetail");
  $("maTitle").textContent = rec.title;
  const questions = rec.questions || [];
  let html = `<div class="apply-form" id="applyFormInner" data-rec-id="${recId}">
    <div style="background:var(--navy-800);border:1px solid var(--border2);border-radius:6px;padding:14px 16px;margin-bottom:16px">
      <div style="font-family:var(--font-mono);font-size:10px;letter-spacing:.2em;color:var(--gold-500);margin-bottom:8px">DATA OTOMATIS TERKUMPUL</div>
      <div style="display:flex;flex-wrap:wrap;gap:16px;font-size:13px;color:var(--off-white)">
        <span>Username: <strong>@${esc(S.user.username)}</strong></span>
        <span>Display: <strong>${esc(S.user.displayName||S.user.username)}</strong></span>
        <span>Discord: <strong>${esc(S.user.discordTag||"—")}</strong></span>
      </div>
    </div>`;
  if (!questions.length) {
    html += `<div style="color:var(--muted);font-size:13px;padding:12px 0">Tidak ada pertanyaan tambahan untuk rekrutmen ini.</div>`;
  }
  questions.forEach((q, i) => {
    html += `<div class="apply-field"><label>${esc(q.label)}${q.required?` <span class="req">*</span>`:` <span style="color:var(--muted2)">(Opsional)</span>`}</label>`;
    if (q.type==="text")     html += `<input type="text" id="aq_${i}" placeholder="${esc(q.placeholder||"")}" />`;
    else if (q.type==="textarea") html += `<textarea id="aq_${i}" rows="4" placeholder="${esc(q.placeholder||"")}"></textarea>`;
    else if (q.type==="number")   html += `<input type="number" id="aq_${i}" placeholder="${esc(q.placeholder||"")}" />`;
    else if (q.type==="url")      html += `<input type="url" id="aq_${i}" placeholder="https://..." />`;
    else if (q.type==="select")   html += `<select id="aq_${i}"><option value="">-- Pilih --</option>${(q.options||[]).map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join("")}</select>`;
    else if (q.type==="radio")    html += `<div class="apply-radio-group" id="aq_${i}">${(q.options||[]).map(o=>`<label class="apply-option"><input type="radio" name="aq_${i}" value="${esc(o)}" />${esc(o)}</label>`).join("")}</div>`;
    else if (q.type==="checkbox") html += `<div class="apply-checkbox-group" id="aq_${i}">${(q.options||[]).map(o=>`<label class="apply-option"><input type="checkbox" value="${esc(o)}" />${esc(o)}</label>`).join("")}</div>`;
    else if (q.type==="scale")    html += `<div class="scale-group" id="aq_${i}">${Array.from({length:10},(_,j)=>`<button type="button" class="scale-btn" data-val="${j+1}" onclick="selectScale(this,'aq_${i}')">${j+1}</button>`).join("")}</div>`;
    html += `</div>`;
  });
  html += `</div>`;
  $("maBody").innerHTML = html;
  openModal("modalApply");
}

function selectScale(btn, groupId) {
  const g = $(groupId); if (!g) return;
  g.querySelectorAll(".scale-btn").forEach(b => b.classList.remove("selected"));
  btn.classList.add("selected");
  g.dataset.value = btn.dataset.val;
}

async function submitApplication() {
  const form = $("applyFormInner"); if (!form) return;
  const recId = form.dataset.recId;
  const rec   = S.allRecs.find(r => r.id === recId); if (!rec) return;
  const qs = rec.questions || [];
  const answers = {}; let valid = true;
  qs.forEach((q, i) => {
    let val = "";
    if (["text","textarea","number","url","select"].includes(q.type)) val = $(`aq_${i}`)?.value?.trim() || "";
    else if (q.type==="radio")    { const c = document.querySelector(`input[name="aq_${i}"]:checked`); val = c ? c.value : ""; }
    else if (q.type==="checkbox") val = [...document.querySelectorAll(`#aq_${i} input:checked`)].map(c=>c.value).join(", ");
    else if (q.type==="scale")    val = $(`aq_${i}`)?.dataset?.value || "";
    if (q.required && !val) valid = false;
    answers[`q${i}`] = { label: q.label, type: q.type, value: val };
  });
  if (!valid) { toast("Isi semua pertanyaan wajib","","warning"); return; }
  const dup = S.allApps.find(a => a.recId===recId && a.applicantUsername===S.user.username);
  if (dup)   { toast("Sudah Pernah Melamar","Anda sudah mengirimkan lamaran untuk rekrutmen ini.","warning"); return; }

  const btn = q("#modalApply .btn-primary:last-child");
  if (btn) { btn.disabled=true; btn.textContent="MENGIRIM..."; }
  try {
    const data = {
      recId, recTitle: rec.title, serverId: rec.serverId||"", serverName: rec.serverName||"",
      applicantUsername: S.user.username,
      applicantDisplay:  S.user.displayName || S.user.username,
      applicantDiscord:  S.user.discordTag || "",
      status: "pending", answers, score: 0,
      reviewedBy: "", reviewNote: "",
      submittedAt: ts(), updatedAt: ts(),
    };
    const ref = await C.apps().add(data);
    S.allApps.unshift({ id: ref.id, ...data });
    await C.users().doc(S.user.username).update({ totalApps: inc(1) });
    if (S.settings.notifNewApplication !== false) await sendAdminNotif("new_application", `Lamaran baru dari @${S.user.username} → ${rec.title}`, S.user.username, ref.id);
    await writeAudit("application", S.user.username, `Apply ke: ${rec.title}`);
    toast("Lamaran Terkirim!","Status lamaran dapat dipantau di halaman Lamaran Saya.","success");
    closeAll();
    await loadRecs();
    if (S.page==="home") loadHome();
    if (S.page==="myApplications") loadMyAppsPage();
  } catch(e) { console.error(e); toast("Gagal mengirim lamaran","Coba lagi.","error"); }
  finally { if (btn) { btn.disabled=false; btn.textContent="KIRIM LAMARAN →"; } }
}

async function withdrawApp(appId) {
  closeAll();
  showConfirm("Tarik Lamaran","Yakin ingin menarik lamaran ini? Tidak bisa dibatalkan.", async () => {
    try {
      await C.apps().doc(appId).update({ status:"withdrawn", updatedAt: ts() });
      const a = S.allApps.find(a=>a.id===appId); if (a) a.status="withdrawn";
      toast("Lamaran ditarik","","info");
      if (S.page==="myApplications") loadMyAppsPage();
      if (S.page==="home") loadHome();
    } catch(e) { toast("Gagal","Coba lagi.","error"); }
  });
}

// ════════════════════════════════════════════════════════════
//  MY APPLICATIONS PAGE
// ════════════════════════════════════════════════════════════
function loadMyAppsPage() {
  const myApps = S.allApps
    .filter(a => a.applicantUsername===S.user.username)
    .sort((a,b)=>(b.submittedAt?.seconds||0)-(a.submittedAt?.seconds||0));
  setBadge("badgeMyApps", myApps.length);
  const c = $("myAppsContainer"); if (!c) return;
  c.innerHTML = myApps.length ? myApps.map(a=>renderAppItem(a,true)).join("") : emptyState("◉","Belum Ada Lamaran","Anda belum pernah melamar ke rekrutmen apapun.");
}

function renderAppItem(a, detailed=false) {
  return `<div class="app-item">
    <div class="app-status-dot ${a.status}"></div>
    <div class="app-info">
      <div class="app-rec-title">${esc(a.recTitle||"Rekrutmen")}</div>
      <div class="app-meta">${esc(a.serverName||"—")} &bull; Dikirim ${fmtShort(a.submittedAt)}${a.reviewNote?` &bull; "${esc(a.reviewNote.slice(0,40))}"`:""}</div>
    </div>
    <span class="app-status-badge ${a.status}">${(a.status||"").toUpperCase()}</span>
  </div>`;
}

// ════════════════════════════════════════════════════════════
//  NOTIFICATIONS PAGE
// ════════════════════════════════════════════════════════════
function loadNotifPage() {
  const c = $("notifList"); if (!c) return;
  if (!S.allNotifs.length) { c.innerHTML = emptyState("◆","Tidak Ada Notifikasi","Belum ada notifikasi untuk Anda."); return; }
  c.innerHTML = S.allNotifs.map(n => `
    <div class="notif-item ${n.read?"":"unread"}" onclick="markRead('${n.id}')">
      <div class="notif-icon">${notifIcon(n.type)}</div>
      <div class="notif-body">
        <div class="notif-title">${esc(n.title||"Notifikasi")}</div>
        <div class="notif-msg">${esc(n.message||"")}</div>
        <div class="notif-time">${timeAgo(n.createdAt)}</div>
      </div>
    </div>`).join("");
}

function notifIcon(t) {
  return ({new_application:"◉",application_status:"◆",user_registered:"✦",recruitment_open:"◈",system:"⚙",gc_message:"◧"})[t]||"◆";
}

async function markRead(id) {
  try {
    await C.notifs().doc(id).update({ read:true });
    const n = S.allNotifs.find(n=>n.id===id); if (n) n.read=true;
    updateNotifBadges(S.allNotifs.filter(n=>!n.read).length);
    loadNotifPage();
  } catch(e) {}
}

async function markAllRead() {
  try {
    const batch = db.batch();
    S.allNotifs.filter(n=>!n.read).forEach(n=>batch.update(C.notifs().doc(n.id),{read:true}));
    await batch.commit();
    S.allNotifs.forEach(n=>n.read=true);
    updateNotifBadges(0);
    loadNotifPage();
    toast("Semua notifikasi dibaca","","success");
  } catch(e) {}
}

// ════════════════════════════════════════════════════════════
//  PROFILE PAGE
// ════════════════════════════════════════════════════════════
function loadProfilePage() {
  const u = S.user;
  const ini = (u.displayName||u.username).slice(0,2).toUpperCase();
  if ($("profileAvatarBig")) $("profileAvatarBig").textContent = ini;
  if ($("profileDisplayName")) $("profileDisplayName").textContent = u.displayName||u.username;
  if ($("profileUsernameDisp")) $("profileUsernameDisp").textContent = "@"+u.username;
  if ($("profileRoleBadge")) $("profileRoleBadge").textContent = u.role||"Member";
  if ($("profileJoined")) $("profileJoined").textContent = "Bergabung "+fmtShort(u.joinedAt);
  if ($("piUsername")) $("piUsername").textContent = u.username;
  if ($("piDisplayNameInput")) $("piDisplayNameInput").value = u.displayName||"";
  if ($("piDiscordInput")) $("piDiscordInput").value = u.discordTag||"";
  if ($("piBioInput")) $("piBioInput").value = u.bio||"";
  const myApps = S.allApps.filter(a=>a.applicantUsername===u.username);
  if ($("psTotalApps")) $("psTotalApps").textContent = myApps.length;
  if ($("psAccepted"))  $("psAccepted").textContent  = myApps.filter(a=>a.status==="accepted").length;
  if ($("psRejected"))  $("psRejected").textContent  = myApps.filter(a=>a.status==="rejected").length;
  if ($("psPending"))   $("psPending").textContent   = myApps.filter(a=>["pending","reviewing","interview"].includes(a.status)).length;
  if ($("psRole"))      $("psRole").textContent      = u.role||"—";
}
async function saveDisplayName() {
  const v = $("piDisplayNameInput")?.value.trim();
  if (!v) { toast("Nama tidak boleh kosong","","warning"); return; }
  try {
    await C.users().doc(S.user.username).update({ displayName: v });
    S.user.displayName = v;
    if($("profileDisplayName")) $("profileDisplayName").textContent = v;
    $("sbAvatar").textContent = v.slice(0,2).toUpperCase();
    $("topbarAvatar").textContent = v.slice(0,2).toUpperCase();
    toast("Display name diperbarui","","success");
  } catch(e) { toast("Gagal","","error"); }
}
async function saveDiscordTag() {
  const v = $("piDiscordInput")?.value.trim()||"";
  try { await C.users().doc(S.user.username).update({ discordTag:v }); S.user.discordTag=v; toast("Discord tag diperbarui","","success"); }
  catch(e) { toast("Gagal","","error"); }
}
async function saveBio() {
  const v = $("piBioInput")?.value.trim()||"";
  try { await C.users().doc(S.user.username).update({ bio:v }); S.user.bio=v; toast("Bio diperbarui","","success"); }
  catch(e) { toast("Gagal","","error"); }
}
async function changePassword() {
  const old = $("piOldPass")?.value;
  const nw  = $("piNewPass")?.value;
  const cf  = $("piNewPassConfirm")?.value;
  if (!old||!nw||!cf) { toast("Isi semua field","","warning"); return; }
  if (nw.length<8) { toast("Password min. 8 karakter","","warning"); return; }
  if (nw!==cf) { toast("Password tidak cocok","","warning"); return; }
  const oldHash = await hashPw(old);
  if (oldHash!==S.user.passwordHash) { toast("Password lama salah","","error"); return; }
  const newHash = await hashPw(nw);
  try {
    await C.users().doc(S.user.username).update({ passwordHash: newHash });
    S.user.passwordHash = newHash;
    [$("piOldPass"),$("piNewPass"),$("piNewPassConfirm")].forEach(el=>{ if(el) el.value=""; });
    await writeAudit("admin", S.user.username, "Ganti password");
    toast("Password berhasil diubah","","success");
  } catch(e) { toast("Gagal","","error"); }
}

// ════════════════════════════════════════════════════════════
//  SEND NOTIFICATIONS (HELPERS)
// ════════════════════════════════════════════════════════════
async function sendNotif(targetUsername, type, title, message, refId="") {
  try {
    await C.notifs().add({ targetUsername, type, title, message, refId, read:false, createdAt:ts() });
  } catch(e) {}
}
async function sendAdminNotif(type, message, fromUser="", refId="") {
  try {
    const admins = S.allUsers.filter(u=>(u.roleLevel||0)>=50||u.username===SUPER_ADMIN_USERNAME);
    const batch = db.batch();
    admins.forEach(a => {
      if (a.username===fromUser) return;
      batch.set(C.notifs().doc(), { targetUsername:a.username, type, title:"Notifikasi Admin", message, refId, read:false, createdAt:ts() });
    });
    await batch.commit();
  } catch(e) {}
}

// ════════════════════════════════════════════════════════════
//  AUDIT LOG WRITER
// ════════════════════════════════════════════════════════════
async function writeAudit(action, username, detail, extra={}) {
  try {
    await C.audit().add({ action, username, detail, extra, timestamp:ts(), ip: "client" });
  } catch(e) {}
}

// ════════════════════════════════════════════════════════════
//  CLOCK
// ════════════════════════════════════════════════════════════
function startClock() {
  const update = () => { const el=$("adminTime"); if(el) el.textContent=new Date().toLocaleString("id-ID"); };
  update(); setInterval(update,1000);
}
// ════════════════════════════════════════════════════════════
//  ADMIN OVERVIEW
// ════════════════════════════════════════════════════════════
function loadAdminOverview() {
  const stats = [
    { icon:"◈", num:S.allRecs.length,                                     label:"Total Rekrutmen",   sub:`${S.allRecs.filter(r=>r.status==="open").length} aktif` },
    { icon:"◉", num:S.allApps.length,                                     label:"Total Lamaran",     sub:`${S.allApps.filter(a=>a.status==="pending").length} pending` },
    { icon:"✦", num:S.allUsers.length,                                    label:"Total User",        sub:`${S.allUsers.filter(u=>u.status==="active").length} aktif` },
    { icon:"⌘", num:S.allInvites.filter(i=>i.status==="active").length,   label:"Kode Undangan Aktif", sub:`${S.allInvites.length} total` },
    { icon:"◆", num:S.allRoles.length,                                    label:"Role Terdaftar",    sub:"" },
    { icon:"◫", num:S.allServers.length,                                  label:"Server Discord",    sub:"" },
    { icon:"◧", num:S.allGCs.length,                                      label:"Group Chat",        sub:`${S.allGCs.reduce((t,g)=>(t+(g.unreadCount||0)),0)} pesan baru` },
    { icon:"≡", num:S.auditLogs.length,                                   label:"Log Aktivitas",     sub:"Total tercatat" },
  ];
  $("adminStatsGrid").innerHTML = stats.map(s=>`
    <div class="admin-stat-card">
      <div class="asc-icon">${s.icon}</div>
      <span class="asc-num">${s.num}</span>
      <div class="asc-label">${s.label}</div>
      ${s.sub?`<div class="asc-change up">${esc(s.sub)}</div>`:""}
    </div>`).join("");

  const acItem = (dot,title,sub,color="var(--gold-500)") =>
    `<div class="ac-item"><div class="ac-item-dot" style="background:${color}"></div><div class="ac-item-title">${esc(title)}</div><div class="ac-item-time">${esc(sub)}</div></div>`;
  const none = `<p style="color:var(--muted);font-size:13px;padding:8px">Belum ada data</p>`;

  $("overviewRecentRec").innerHTML   = S.allRecs.slice(0,5).map(r=>acItem("",r.title,r.status)).join("")||none;
  $("overviewRecentApps").innerHTML  = S.allApps.slice(0,5).map(a=>acItem("",`@${a.applicantUsername}`,a.status,
    a.status==="accepted"?"var(--success)":a.status==="rejected"?"var(--danger)":"var(--gold-500)")).join("")||none;
  $("overviewRecentUsers").innerHTML = S.allUsers.slice(0,5).map(u=>acItem("",`@${u.username}`,u.role||"Member")).join("")||none;
  $("overviewActivity").innerHTML    = S.auditLogs.slice(0,6).map(l=>acItem("",`@${l.username} — ${l.action}`,timeAgo(l.timestamp))).join("")||none;
}

// ════════════════════════════════════════════════════════════
//  ADMIN RECRUITMENTS
// ════════════════════════════════════════════════════════════
function loadAdminRecPage() {
  const sel = $("adminRecServerFilter");
  const srvs = [...new Set(S.allRecs.map(r=>r.serverName).filter(Boolean))];
  if (sel) sel.innerHTML = `<option value="">Semua Server</option>`+srvs.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join("");
  filterAdminRec();
}
function filterAdminRec() {
  const q  = $("adminRecSearch")?.value.trim().toLowerCase();
  const st = $("adminRecStatusFilter")?.value;
  const sv = $("adminRecServerFilter")?.value;
  const recs = S.allRecs.filter(r=>{
    if (st&&r.status!==st) return false;
    if (sv&&r.serverName!==sv) return false;
    if (q&&!`${r.title} ${r.serverName} ${r.position}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const wrap = $("adminRecTable"); if (!wrap) return;
  if (!recs.length) { wrap.innerHTML=`<div style="padding:40px;text-align:center;color:var(--muted)">Tidak ada data</div>`; return; }
  wrap.innerHTML=`<table class="data-table"><thead><tr>
    <th>JUDUL</th><th>SERVER</th><th>TIPE</th><th>STATUS</th><th>PRIORITAS</th><th>PELAMAR</th><th>DIBUAT</th><th>AKSI</th>
  </tr></thead><tbody>${recs.map(r=>{
    const cnt = S.allApps.filter(a=>a.recId===r.id).length;
    const canManage = hasPerm("manageRec");
    return `<tr>
      <td><div style="font-weight:600;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.title)}</div>
          <div style="font-size:11px;color:var(--muted)">${esc(r.position||"")}</div></td>
      <td>${esc(r.serverName||"—")}</td>
      <td>${esc(r.type||"—")}</td>
      <td><span class="rc-status ${r.status}">${r.status.toUpperCase()}</span></td>
      <td><span class="rc-priority ${r.priority||"normal"}">${(r.priority||"normal").toUpperCase()}</span></td>
      <td>${cnt}</td>
      <td>${fmtShort(r.createdAt)}</td>
      <td><div class="dt-actions">
        <button class="dt-btn" onclick="openRecDetail('${r.id}')">Lihat</button>
        ${canManage&&r.status==="draft"?`<button class="dt-btn success" onclick="publishRec('${r.id}')">Publish</button>`:""}
        ${canManage&&r.status==="open"?`<button class="dt-btn" onclick="closeRec('${r.id}')">Tutup</button>`:""}
        ${canManage&&r.status!=="archived"?`<button class="dt-btn danger" onclick="archiveRec('${r.id}')">Arsip</button>`:""}
      </div></td>
    </tr>`;
  }).join("")}</tbody></table>`;
}

async function publishRec(id) {
  const r = S.allRecs.find(r=>r.id===id);
  showConfirm("Publish Rekrutmen",`"${r?.title}" akan aktif dan bisa dilihat semua user.`, async()=>{
    try {
      await C.recs().doc(id).update({ status:"open", publishedAt:ts() });
      if (r) r.status="open";
      filterAdminRec();
      await writeAudit("recruitment", S.user.username, `Publish: ${r?.title}`);
      toast("Rekrutmen dipublish","","success");
    } catch(e) { toast("Gagal","","error"); }
  },"YA, PUBLISH");
}
async function closeRec(id) {
  const r = S.allRecs.find(r=>r.id===id);
  showConfirm("Tutup Rekrutmen","Rekrutmen tidak menerima lamaran baru.", async()=>{
    try {
      await C.recs().doc(id).update({ status:"closed", closedAt:ts() });
      if (r) r.status="closed";
      filterAdminRec();
      await writeAudit("recruitment", S.user.username, `Tutup: ${r?.title}`);
      toast("Rekrutmen ditutup","","success");
    } catch(e) { toast("Gagal","","error"); }
  });
}
async function archiveRec(id) {
  const r = S.allRecs.find(r=>r.id===id);
  showConfirm("Arsipkan","Rekrutmen akan diarsipkan.", async()=>{
    try {
      await C.recs().doc(id).update({ status:"archived" });
      if (r) r.status="archived";
      filterAdminRec();
      toast("Diarsipkan","","success");
    } catch(e) { toast("Gagal","","error"); }
  });
}

// ════════════════════════════════════════════════════════════
//  ADMIN APPLICATIONS
// ════════════════════════════════════════════════════════════
function loadAdminAppsPage() {
  const sel = $("adminAppRecFilter");
  const names = [...new Set(S.allApps.map(a=>a.recTitle).filter(Boolean))];
  if (sel) sel.innerHTML = `<option value="">Semua Rekrutmen</option>`+names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join("");
  filterAdminApps();
}
function filterAdminApps() {
  const q  = $("adminAppSearch")?.value.trim().toLowerCase();
  const st = $("adminAppStatusFilter")?.value;
  const rc = $("adminAppRecFilter")?.value;
  const apps = S.allApps.filter(a=>{
    if (st&&a.status!==st) return false;
    if (rc&&a.recTitle!==rc) return false;
    if (q&&!`${a.applicantUsername} ${a.applicantDisplay} ${a.recTitle}`.toLowerCase().includes(q)) return false;
    return true;
  }).sort((a,b)=>(b.submittedAt?.seconds||0)-(a.submittedAt?.seconds||0));
  const wrap=$("adminAppTable"); if (!wrap) return;
  if (!apps.length) { wrap.innerHTML=`<div style="padding:40px;text-align:center;color:var(--muted)">Tidak ada lamaran</div>`; return; }
  const canReview = hasPerm("reviewApps");
  wrap.innerHTML=`<table class="data-table"><thead><tr>
    <th>PELAMAR</th><th>REKRUTMEN</th><th>STATUS</th><th>NILAI</th><th>DIREVIEW</th><th>DIKIRIM</th><th>AKSI</th>
  </tr></thead><tbody>${apps.map(a=>`<tr>
    <td><div style="font-weight:600">@${esc(a.applicantUsername)}</div>
        <div style="font-size:11px;color:var(--muted)">${esc(a.applicantDiscord||"")}</div></td>
    <td style="max-width:160px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(a.recTitle||"—")}</td>
    <td><span class="app-status-badge ${a.status}">${a.status.toUpperCase()}</span></td>
    <td>${a.score||"—"}</td>
    <td>${esc(a.reviewedBy||"—")}</td>
    <td>${fmtShort(a.submittedAt)}</td>
    <td><div class="dt-actions">
      <button class="dt-btn" onclick="openAppDetail('${a.id}')">Detail</button>
      ${canReview&&a.status==="pending"?`<button class="dt-btn" onclick="quickStatus('${a.id}','reviewing')">Reviewing</button>`:""}
      ${canReview&&["pending","reviewing","interview"].includes(a.status)?`
        <button class="dt-btn" onclick="quickStatus('${a.id}','interview')">Interview</button>
        <button class="dt-btn success" onclick="quickStatus('${a.id}','accepted')">Terima</button>
        <button class="dt-btn danger" onclick="quickStatus('${a.id}','rejected')">Tolak</button>`:""}
    </div></td>
  </tr>`).join("")}</tbody></table>`;
}

async function quickStatus(appId, newStatus) {
  const labels = { reviewing:"Reviewing", interview:"Interview", accepted:"Diterima", rejected:"Ditolak" };
  showConfirm(`Ubah ke ${labels[newStatus]}`, `Pelamar akan mendapat notifikasi.`, async()=>{
    try {
      await C.apps().doc(appId).update({ status:newStatus, updatedAt:ts(), reviewedBy:S.user.username });
      const a = S.allApps.find(a=>a.id===appId);
      if (a) { a.status=newStatus; a.reviewedBy=S.user.username; }
      if (newStatus==="accepted") await C.users().doc(a?.applicantUsername).update({ acceptedApps:inc(1) }).catch(()=>{});
      if (newStatus==="rejected") await C.users().doc(a?.applicantUsername).update({ rejectedApps:inc(1) }).catch(()=>{});
      if (S.settings.notifStatusChange!==false && a) {
        const msgs={reviewing:"Lamaran Anda sedang direview.",accepted:"Selamat! Lamaran Anda DITERIMA!",rejected:"Lamaran Anda tidak lolos seleksi. Terima kasih.",interview:"Anda lanjut ke tahap interview!"};
        await sendNotif(a.applicantUsername,"application_status",`Status Lamaran: ${labels[newStatus]}`,msgs[newStatus]||"",appId);
        const n = await C.notifs().where("targetUsername","==",a.applicantUsername).limit(1).get();
        if (!n.empty) { S.allNotifs = [...S.allNotifs]; }
      }
      filterAdminApps();
      await writeAudit("admin", S.user.username, `Status lamaran ${appId} → ${newStatus}`);
      toast(`Status diubah ke ${labels[newStatus]}`, "", "success");
    } catch(e) { console.error(e); toast("Gagal","","error"); }
  }, `YA, ${(labels[newStatus]||newStatus).toUpperCase()}`);
}

async function openAppDetail(appId) {
  const app = S.allApps.find(a=>a.id===appId); if (!app) return;
  const answersHtml = app.answers&&Object.keys(app.answers).length
    ? Object.entries(app.answers).map(([k,v])=>`<div class="rd-info-row"><span class="rd-info-label">${esc(v.label||k)}</span><span class="rd-info-val">${esc(v.value||"—")}</span></div>`).join("")
    : "<p style='color:var(--muted);font-size:13px'>Tidak ada jawaban</p>";
  $("madBody").innerHTML=`<div style="display:flex;flex-direction:column;gap:20px">
    <div class="rd-sidebar-card"><h4>INFORMASI PELAMAR</h4>
      <div class="rd-info-row"><span class="rd-info-label">Username</span><span class="rd-info-val">@${esc(app.applicantUsername)}</span></div>
      <div class="rd-info-row"><span class="rd-info-label">Display</span><span class="rd-info-val">${esc(app.applicantDisplay||"—")}</span></div>
      <div class="rd-info-row"><span class="rd-info-label">Discord</span><span class="rd-info-val">${esc(app.applicantDiscord||"—")}</span></div>
      <div class="rd-info-row"><span class="rd-info-label">Rekrutmen</span><span class="rd-info-val">${esc(app.recTitle||"—")}</span></div>
      <div class="rd-info-row"><span class="rd-info-label">Status</span><span class="app-status-badge ${app.status}">${app.status.toUpperCase()}</span></div>
      <div class="rd-info-row"><span class="rd-info-label">Dikirim</span><span class="rd-info-val">${fmtDate(app.submittedAt)}</span></div>
      ${app.reviewedBy?`<div class="rd-info-row"><span class="rd-info-label">Direview</span><span class="rd-info-val">@${esc(app.reviewedBy)}</span></div>`:""}
    </div>
    <div class="rd-sidebar-card"><h4>JAWABAN FORM</h4>${answersHtml}</div>
    <div class="rd-sidebar-card"><h4>NILAI & CATATAN</h4>
      <div style="display:flex;flex-direction:column;gap:12px">
        <div><label style="font-family:var(--font-mono);font-size:10px;color:var(--muted);display:block;margin-bottom:6px">NILAI (0–100)</label>
          <input type="number" id="appScore" value="${app.score||0}" min="0" max="100" style="background:var(--navy-800);border:1px solid var(--border);border-radius:4px;color:var(--white);padding:8px 12px;font-size:13px;width:120px;outline:none" /></div>
        <div><label style="font-family:var(--font-mono);font-size:10px;color:var(--muted);display:block;margin-bottom:6px">CATATAN</label>
          <textarea id="appNote" rows="3" style="width:100%;background:var(--navy-800);border:1px solid var(--border);border-radius:4px;color:var(--white);padding:8px 12px;font-size:13px;outline:none;resize:vertical">${esc(app.reviewNote||"")}</textarea></div>
      </div>
    </div>
  </div>`;
  $("madFooter").innerHTML=`
    <button class="btn-ghost" onclick="closeModal('modalAppDetail')">Tutup</button>
    <button class="btn-ghost sm" onclick="saveAppReview('${app.id}')">Simpan Nilai</button>
    <div style="display:flex;gap:8px">
      ${["pending","reviewing"].includes(app.status)?`<button class="dt-btn" style="padding:10px 16px" onclick="quickStatus('${app.id}','interview');closeModal('modalAppDetail')">Interview</button>`:""}
      ${["pending","reviewing","interview"].includes(app.status)?`
        <button class="btn-primary sm" onclick="quickStatus('${app.id}','accepted');closeModal('modalAppDetail')">TERIMA ✓</button>
        <button class="btn-danger sm" onclick="quickStatus('${app.id}','rejected');closeModal('modalAppDetail')">TOLAK ✕</button>`:""}
    </div>`;
  openModal("modalAppDetail");
}
async function saveAppReview(id) {
  const score = parseInt($("appScore")?.value)||0;
  const note  = $("appNote")?.value.trim()||"";
  try {
    await C.apps().doc(id).update({ score, reviewNote:note, reviewedBy:S.user.username, updatedAt:ts() });
    const a=S.allApps.find(a=>a.id===id); if(a){a.score=score;a.reviewNote=note;}
    toast("Tersimpan","","success");
  } catch(e) { toast("Gagal","","error"); }
}

// ════════════════════════════════════════════════════════════
//  ADMIN USERS
// ════════════════════════════════════════════════════════════
function loadAdminUsersPage() { filterAdminUsers(); }
function filterAdminUsers() {
  const q  = $("adminUserSearch")?.value.trim().toLowerCase();
  const rl = $("adminUserRoleFilter")?.value;
  const st = $("adminUserStatusFilter")?.value;
  const users = S.allUsers.filter(u=>{
    if (st&&u.status!==st) return false;
    if (rl&&u.roleId!==rl) return false;
    if (q&&!`${u.username} ${u.displayName} ${u.discordTag}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const wrap=$("adminUserTable"); if(!wrap) return;
  if(!users.length){wrap.innerHTML=`<div style="padding:40px;text-align:center;color:var(--muted)">Tidak ada user</div>`;return;}
  wrap.innerHTML=`<table class="data-table"><thead><tr>
    <th>USERNAME</th><th>DISPLAY</th><th>DISCORD</th><th>ROLE</th><th>STATUS</th><th>LAMARAN</th><th>BERGABUNG</th><th>AKSI</th>
  </tr></thead><tbody>${users.map(u=>`<tr>
    <td style="font-family:var(--font-mono);font-size:12px">@${esc(u.username)}</td>
    <td>${esc(u.displayName||"—")}</td>
    <td style="font-size:12px">${esc(u.discordTag||"—")}</td>
    <td><span style="color:var(--gold-400);font-size:12px">${esc(u.role||"Member")}</span></td>
    <td><span style="font-family:var(--font-mono);font-size:10px;padding:3px 8px;border-radius:3px;border:1px solid var(--border2);color:${u.status==='active'?'var(--success)':u.status==='banned'?'var(--danger)':'var(--warning)'}">${u.status||"active"}</span></td>
    <td>${S.allApps.filter(a=>a.applicantUsername===u.username).length}</td>
    <td>${fmtShort(u.joinedAt)}</td>
    <td><div class="dt-actions">
      <button class="dt-btn" onclick="openUserDetail('${u.username}')">Detail</button>
      ${hasPerm("manageUsers")&&u.username!==S.user.username&&u.username!==SUPER_ADMIN_USERNAME?`
        <button class="dt-btn" onclick="changeUserRole('${u.username}')">Role</button>
        ${u.status==="active"?`<button class="dt-btn danger" onclick="suspendUser('${u.username}')">Suspend</button>`:
          `<button class="dt-btn success" onclick="unsuspendUser('${u.username}')">Aktifkan</button>`}
        ${u.status!=="banned"?`<button class="dt-btn danger" onclick="banUser('${u.username}')">Ban</button>`:""}
      `:""}
    </div></td>
  </tr>`).join("")}</tbody></table>`;
}

async function openUserDetail(username) {
  const u = S.allUsers.find(u=>u.username===username); if(!u) return;
  const uApps = S.allApps.filter(a=>a.applicantUsername===username);
  $("mudBody").innerHTML=`<div style="display:flex;flex-direction:column;gap:16px">
    <div class="rd-sidebar-card">
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px">
        <div style="width:56px;height:56px;background:var(--navy-500);border:1px solid var(--border);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:var(--gold-400)">${(u.displayName||u.username).slice(0,2).toUpperCase()}</div>
        <div><div style="font-size:17px;font-weight:700">${esc(u.displayName||u.username)}</div>
          <div style="font-size:13px;color:var(--muted)">@${esc(u.username)}</div>
          <div style="color:var(--gold-500);font-size:12px">${esc(u.role||"Member")}</div></div>
      </div>
      <div class="rd-info-row"><span class="rd-info-label">Discord</span><span class="rd-info-val">${esc(u.discordTag||"—")}</span></div>
      <div class="rd-info-row"><span class="rd-info-label">Status</span><span class="rd-info-val">${esc(u.status||"active")}</span></div>
      <div class="rd-info-row"><span class="rd-info-label">Bergabung</span><span class="rd-info-val">${fmtDate(u.joinedAt)}</span></div>
      <div class="rd-info-row"><span class="rd-info-label">Login Terakhir</span><span class="rd-info-val">${fmtDate(u.lastLogin)}</span></div>
      <div class="rd-info-row"><span class="rd-info-label">Kode Undangan</span><span class="rd-info-val" style="font-family:var(--font-mono)">${esc(u.inviteCode||"—")}</span></div>
      <div class="rd-info-row"><span class="rd-info-label">Diundang oleh</span><span class="rd-info-val">@${esc(u.invitedBy||"system")}</span></div>
    </div>
    <div class="rd-sidebar-card"><h4>STATISTIK LAMARAN</h4>
      <div class="rd-info-row"><span class="rd-info-label">Total Lamaran</span><span class="rd-info-val">${uApps.length}</span></div>
      <div class="rd-info-row"><span class="rd-info-label">Diterima</span><span class="rd-info-val" style="color:var(--success)">${uApps.filter(a=>a.status==="accepted").length}</span></div>
      <div class="rd-info-row"><span class="rd-info-label">Ditolak</span><span class="rd-info-val" style="color:var(--danger)">${uApps.filter(a=>a.status==="rejected").length}</span></div>
      <div class="rd-info-row"><span class="rd-info-label">Pending</span><span class="rd-info-val" style="color:var(--warning)">${uApps.filter(a=>["pending","reviewing","interview"].includes(a.status)).length}</span></div>
    </div>
    ${u.bio?`<div class="rd-sidebar-card"><h4>BIO</h4><p style="font-size:13px;color:var(--muted)">${esc(u.bio)}</p></div>`:""}
  </div>`;
  $("mudFooter").innerHTML=`<button class="btn-ghost" onclick="closeModal('modalUserDetail')">Tutup</button>`;
  openModal("modalUserDetail");
}

async function changeUserRole(username) {
  const u = S.allUsers.find(u=>u.username===username); if(!u) return;
  const roleOpts = S.allRoles.map(r=>`<option value="${r.id}" ${u.roleId===r.id?"selected":""}>${esc(r.name)}</option>`).join("");
  const newRoleId = prompt(`Ganti role untuk @${username}.\nRole ID saat ini: ${u.roleId||"(kosong)"}\nRole tersedia:\n${S.allRoles.map(r=>`${r.id} = ${r.name}`).join("\n")}\n\nMasukkan Role ID baru:`);
  if (!newRoleId) return;
  const role = S.allRoles.find(r=>r.id===newRoleId.trim());
  if (!role) { toast("Role ID tidak ditemukan","","error"); return; }
  try {
    await C.users().doc(username).update({ roleId:role.id, role:role.name, roleLevel:role.level||1, permissions:role.permissions||{} });
    const uIdx = S.allUsers.findIndex(u=>u.username===username);
    if(uIdx>=0){S.allUsers[uIdx].role=role.name;S.allUsers[uIdx].roleId=role.id;S.allUsers[uIdx].roleLevel=role.level||1;}
    await writeAudit("admin", S.user.username, `Ganti role @${username} → ${role.name}`);
    toast(`Role @${username} diubah ke ${role.name}`,"","success");
    filterAdminUsers();
  } catch(e) { toast("Gagal","","error"); }
}

async function suspendUser(username) {
  showConfirm("Suspend User",`@${username} tidak bisa login selama disuspend.`, async()=>{
    try {
      await C.users().doc(username).update({ status:"suspended" });
      const u=S.allUsers.find(u=>u.username===username); if(u) u.status="suspended";
      await writeAudit("admin", S.user.username, `Suspend @${username}`);
      toast(`@${username} disuspend`,"","success"); filterAdminUsers();
    } catch(e){toast("Gagal","","error");}
  });
}
async function unsuspendUser(username) {
  try {
    await C.users().doc(username).update({ status:"active" });
    const u=S.allUsers.find(u=>u.username===username); if(u) u.status="active";
    await writeAudit("admin", S.user.username, `Aktifkan @${username}`);
    toast(`@${username} diaktifkan kembali`,"","success"); filterAdminUsers();
  } catch(e){toast("Gagal","","error");}
}
async function banUser(username) {
  showConfirm("BAN User",`@${username} akan dibanned permanen. Yakin?`, async()=>{
    try {
      await C.users().doc(username).update({ status:"banned", sessionToken:"" });
      const u=S.allUsers.find(u=>u.username===username); if(u) u.status="banned";
      await writeAudit("admin", S.user.username, `BAN @${username}`);
      toast(`@${username} dibanned`,"","warning"); filterAdminUsers();
    } catch(e){toast("Gagal","","error");}
  },"YA, BAN");
}

// ════════════════════════════════════════════════════════════
//  ADMIN INVITES
// ════════════════════════════════════════════════════════════
function loadAdminInvitesPage() { filterInvites(); }
function filterInvites() {
  const q  = $("inviteSearch")?.value.trim().toLowerCase();
  const st = $("inviteStatusFilter")?.value;
  const invites = S.allInvites.filter(i=>{
    if (st&&i.status!==st) return false;
    if (q&&!`${i.code} ${i.note||""} ${i.createdBy||""}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const wrap=$("inviteTable"); if(!wrap) return;
  if(!invites.length){wrap.innerHTML=`<div style="padding:40px;text-align:center;color:var(--muted)">Tidak ada kode undangan</div>`;return;}
  wrap.innerHTML=`<table class="data-table"><thead><tr>
    <th>KODE</th><th>STATUS</th><th>PEMAKAIAN</th><th>KADALUARSA</th><th>CATATAN</th><th>DIBUAT</th><th>AKSI</th>
  </tr></thead><tbody>${invites.map(i=>`<tr>
    <td class="invite-code-cell">${esc(i.code)}</td>
    <td><span style="font-family:var(--font-mono);font-size:10px;padding:3px 8px;border-radius:3px;border:1px solid var(--border2);color:${i.status==='active'?'var(--success)':i.status==='used'?'var(--muted)':'var(--danger)'}">${esc(i.status)}</span></td>
    <td style="font-family:var(--font-mono)">${i.usedCount||0}/${i.maxUse||"∞"}</td>
    <td>${i.expiresAt?fmtShort(i.expiresAt):"Tidak pernah"}</td>
    <td style="color:var(--muted);font-size:12px">${esc(i.note||"—")}</td>
    <td>${fmtShort(i.createdAt)} <span style="color:var(--muted);font-size:11px">oleh @${esc(i.createdBy||"—")}</span></td>
    <td><div class="dt-actions">
      <button class="dt-btn" onclick="copyToClipboard('${esc(i.code)}','Kode disalin!')">Copy</button>
      ${i.status==="active"?`<button class="dt-btn danger" onclick="revokeInvite('${i.id}')">Cabut</button>`:""}
    </div></td>
  </tr>`).join("")}</tbody></table>`;
}

function openGenerateInviteModal() {
  openModal("modalGenerateInvite");
}
async function generateInviteCodes() {
  const count  = parseInt($("giCount")?.value)||1;
  const maxUse = parseInt($("giMaxUse")?.value)||1;
  const expiry = parseInt($("giExpiry")?.value)||0;
  const note   = $("giNote")?.value.trim()||"";
  const roleId = $("giRole")?.value||"";
  if (count<1||count>50) { toast("Jumlah 1–50","","warning"); return; }

  const batch  = db.batch();
  const codes  = [];
  const expDate = expiry>0 ? new Date(Date.now()+expiry*86400000) : null;
  for (let i=0;i<count;i++) {
    const code = [uid().toUpperCase().slice(0,4), uid().toUpperCase().slice(0,4), uid().toUpperCase().slice(0,4)].join("-");
    const ref  = C.invites().doc();
    const data = { code, status:"active", maxUse, usedCount:0, usedBy:[], note, defaultRole:roleId, createdBy:S.user.username, createdAt:ts(), expiresAt:expDate };
    batch.set(ref, data);
    codes.push({ id:ref.id, ...data, expiresAt:expDate });
  }
  try {
    await batch.commit();
    S.allInvites.unshift(...codes);
    await writeAudit("admin", S.user.username, `Generate ${count} kode undangan`);
    closeModal("modalGenerateInvite");
    filterInvites();
    toast(`${count} kode berhasil dibuat`,"Cek tabel undangan.","success");
  } catch(e) { console.error(e); toast("Gagal","","error"); }
}
async function revokeInvite(id) {
  showConfirm("Cabut Kode","Kode ini tidak bisa dipakai lagi.", async()=>{
    try {
      await C.invites().doc(id).update({ status:"revoked" });
      const i=S.allInvites.find(i=>i.id===id); if(i) i.status="revoked";
      filterInvites(); toast("Kode dicabut","","info");
    } catch(e){toast("Gagal","","error");}
  });
}

// ════════════════════════════════════════════════════════════
//  ADMIN ROLES
// ════════════════════════════════════════════════════════════
function loadAdminRolesPage() {
  const c=$("roleList"); if(!c) return;
  if(!S.allRoles.length){c.innerHTML=`<div style="text-align:center;padding:40px;color:var(--muted)">Belum ada role. Klik "+ BUAT ROLE BARU" untuk mulai.</div>`;return;}
  c.innerHTML=S.allRoles.map(r=>`
    <div class="role-card" style="--role-color:${esc(r.color||"#C9A84C")}">
      <div class="role-name">${esc(r.name)}</div>
      <div class="role-level">Level ${r.level||1} &bull; ${esc(r.roleId||r.id)}</div>
      ${r.description?`<div class="role-desc">${esc(r.description)}</div>`:""}
      <div class="role-perms">${Object.entries(r.permissions||{}).filter(([,v])=>v).map(([k])=>`<span class="role-perm-tag">${esc(k)}</span>`).join("")}</div>
      <div class="role-actions">
        ${hasPerm("manageRoles")?`<button class="btn-ghost sm" onclick="openEditRole('${r.id}')">Edit</button>
        <button class="btn-danger sm" onclick="deleteRole('${r.id}')">Hapus</button>`:""}
      </div>
    </div>`).join("");
}

function openCreateRoleModal() {
  $("roleModalTitle").textContent = "Buat Role Baru";
  $("roleName").value=""; $("roleColor").value="#C9A84C"; $("roleDesc").value=""; $("roleLevel").value="1"; $("roleEditId").value="";
  ["permManageRec","permManageUsers","permManageInvites","permViewAnalytics","permManageRoles","permManageSettings","permReviewApps","permViewAuditLog"]
    .forEach(id=>{ const el=$(id); if(el) el.checked=false; });
  updateRoleColorPreview();
  openModal("modalCreateRole");
}
function openEditRole(id) {
  const r = S.allRoles.find(r=>r.id===id); if(!r) return;
  $("roleModalTitle").textContent = "Edit Role";
  $("roleName").value   = r.name||""; $("roleColor").value = r.color||"#C9A84C";
  $("roleDesc").value   = r.description||""; $("roleLevel").value = r.level||1;
  $("roleEditId").value = id;
  const pm = r.permissions||{};
  $("permManageRec")?.setAttribute("checked", pm.manageRec?"true":"false");
  if($("permManageRec"))   $("permManageRec").checked   = !!pm.manageRec;
  if($("permManageUsers")) $("permManageUsers").checked = !!pm.manageUsers;
  if($("permManageInvites")) $("permManageInvites").checked = !!pm.manageInvites;
  if($("permViewAnalytics")) $("permViewAnalytics").checked = !!pm.viewAnalytics;
  if($("permManageRoles")) $("permManageRoles").checked = !!pm.manageRoles;
  if($("permManageSettings")) $("permManageSettings").checked = !!pm.manageSettings;
  if($("permReviewApps")) $("permReviewApps").checked = !!pm.reviewApps;
  if($("permViewAuditLog")) $("permViewAuditLog").checked = !!pm.viewAuditLog;
  updateRoleColorPreview();
  openModal("modalCreateRole");
}
function updateRoleColorPreview() {
  const color = $("roleColor")?.value||"#C9A84C";
  const prev  = $("roleColorPreview"); if(!prev) return;
  prev.style.background = color+"22"; prev.style.color=color; prev.style.border=`1px solid ${color}44`;
}
$("roleColor")?.addEventListener("input", updateRoleColorPreview);

async function saveRole() {
  const name  = $("roleName")?.value.trim();
  const color = $("roleColor")?.value||"#C9A84C";
  const desc  = $("roleDesc")?.value.trim()||"";
  const level = parseInt($("roleLevel")?.value)||1;
  const editId = $("roleEditId")?.value||"";
  if (!name) { toast("Nama role wajib diisi","","warning"); return; }
  const permissions = {
    manageRec:      !!$("permManageRec")?.checked,
    manageUsers:    !!$("permManageUsers")?.checked,
    manageInvites:  !!$("permManageInvites")?.checked,
    viewAnalytics:  !!$("permViewAnalytics")?.checked,
    manageRoles:    !!$("permManageRoles")?.checked,
    manageSettings: !!$("permManageSettings")?.checked,
    reviewApps:     !!$("permReviewApps")?.checked,
    viewAuditLog:   !!$("permViewAuditLog")?.checked,
  };
  try {
    if (editId) {
      await C.roles().doc(editId).update({ name, color, description:desc, level, permissions, updatedAt:ts() });
      const r=S.allRoles.find(r=>r.id===editId);
      if(r){Object.assign(r,{name,color,description:desc,level,permissions});}
      await writeAudit("admin", S.user.username, `Edit role: ${name}`);
      toast("Role diperbarui","","success");
    } else {
      const ref = await C.roles().add({ name, color, description:desc, level, permissions, createdBy:S.user.username, createdAt:ts() });
      S.allRoles.push({ id:ref.id, name, color, description:desc, level, permissions });
      await writeAudit("admin", S.user.username, `Buat role: ${name}`);
      toast("Role dibuat","","success");
    }
    closeModal("modalCreateRole");
    loadAdminRolesPage();
    populateRoleFilters();
  } catch(e) { console.error(e); toast("Gagal","","error"); }
}
async function deleteRole(id) {
  const r=S.allRoles.find(r=>r.id===id);
  showConfirm("Hapus Role",`Role "${r?.name}" akan dihapus permanen.`, async()=>{
    try {
      await C.roles().doc(id).delete();
      S.allRoles = S.allRoles.filter(r=>r.id!==id);
      await writeAudit("admin", S.user.username, `Hapus role: ${r?.name}`);
      loadAdminRolesPage(); toast("Role dihapus","","info");
    } catch(e){toast("Gagal","","error");}
  },"YA, HAPUS");
}

// ════════════════════════════════════════════════════════════
//  ADMIN SERVERS
// ════════════════════════════════════════════════════════════
function loadAdminServersPage() {
  const c=$("serverList"); if(!c) return;
  if(!S.allServers.length){c.innerHTML=`<div style="text-align:center;padding:40px;color:var(--muted)">Belum ada server. Tambahkan server Discord pertama.</div>`;return;}
  c.innerHTML=S.allServers.map(s=>`
    <div class="server-card">
      <div class="server-header">
        <div class="server-icon" style="background:${esc(s.color||"#5865F2")}">${esc((s.name||"?")[0].toUpperCase())}</div>
        <div><div class="server-name">${esc(s.name)}</div>
          ${s.serverId?`<div class="server-id">#${esc(s.serverId)}</div>`:""}
        </div>
      </div>
      ${s.description?`<div class="server-desc">${esc(s.description)}</div>`:""}
      <div class="rd-info-row"><span class="rd-info-label">Status</span><span class="rd-info-val" style="color:${s.status==='active'?'var(--success)':'var(--muted)'}">${esc(s.status||"active")}</span></div>
      ${s.inviteLink?`<div class="rd-info-row"><span class="rd-info-label">Invite</span><a href="${esc(s.inviteLink)}" target="_blank" style="color:var(--gold-400);font-size:12px">${esc(s.inviteLink)}</a></div>`:""}
      <div class="server-actions" style="margin-top:12px">
        ${hasPerm("manageRec")?`<button class="btn-ghost sm" onclick="openEditServer('${s.id}')">Edit</button>
        <button class="btn-danger sm" onclick="deleteServer('${s.id}')">Hapus</button>`:""}
      </div>
    </div>`).join("");
  // Populate server selects in modals
  const sels = ["hServer", "adminRecServerFilter"];
  sels.forEach(id => {
    const el=$(id); if(!el) return;
    const first = el.querySelector("option")?.outerHTML||"";
    el.innerHTML = first + S.allServers.filter(s=>s.status==="active").map(s=>`<option value="${s.id}" data-name="${esc(s.name)}">${esc(s.name)}</option>`).join("");
  });
}

function openAddServerModal() { $("serverModalTitle").textContent="Tambah Server"; $("serverName").value=""; $("serverId").value=""; $("serverInvite").value=""; $("serverDesc").value=""; $("serverColor").value="#5865F2"; $("serverStatus").value="active"; $("serverEditId").value=""; openModal("modalAddServer"); }
function openEditServer(id) {
  const s=S.allServers.find(s=>s.id===id); if(!s) return;
  $("serverModalTitle").textContent="Edit Server"; $("serverName").value=s.name||""; $("serverId").value=s.serverId||""; $("serverInvite").value=s.inviteLink||""; $("serverDesc").value=s.description||""; $("serverColor").value=s.color||"#5865F2"; $("serverStatus").value=s.status||"active"; $("serverEditId").value=id;
  openModal("modalAddServer");
}
async function saveServer() {
  const name    = $("serverName")?.value.trim();
  const srvId   = $("serverId")?.value.trim()||"";
  const invite  = $("serverInvite")?.value.trim()||"";
  const desc    = $("serverDesc")?.value.trim()||"";
  const color   = $("serverColor")?.value||"#5865F2";
  const status  = $("serverStatus")?.value||"active";
  const editId  = $("serverEditId")?.value||"";
  if (!name) { toast("Nama server wajib diisi","","warning"); return; }
  const data = { name, serverId:srvId, inviteLink:invite, description:desc, color, status };
  try {
    if (editId) {
      await C.servers().doc(editId).update({ ...data, updatedAt:ts() });
      const s=S.allServers.find(s=>s.id===editId); if(s) Object.assign(s,data);
      toast("Server diperbarui","","success");
    } else {
      const ref = await C.servers().add({ ...data, createdBy:S.user.username, createdAt:ts() });
      S.allServers.push({ id:ref.id, ...data });
      toast("Server ditambahkan","","success");
    }
    closeModal("modalAddServer");
    await writeAudit("admin", S.user.username, `${editId?"Edit":"Tambah"} server: ${name}`);
    loadAdminServersPage();
  } catch(e) { console.error(e); toast("Gagal","","error"); }
}
async function deleteServer(id) {
  const s=S.allServers.find(s=>s.id===id);
  showConfirm("Hapus Server",`"${s?.name}" akan dihapus dari platform.`, async()=>{
    try {
      await C.servers().doc(id).delete();
      S.allServers=S.allServers.filter(s=>s.id!==id);
      loadAdminServersPage(); toast("Server dihapus","","info");
    } catch(e){toast("Gagal","","error");}
  },"YA, HAPUS");
}

// ════════════════════════════════════════════════════════════
//  ANALYTICS
// ════════════════════════════════════════════════════════════
function loadAnalyticsPage() {
  // Bar chart: recruitments by month (last 6 months)
  const months = Array.from({length:6},(_,i)=>{
    const d=new Date(); d.setMonth(d.getMonth()-5+i);
    return { label:d.toLocaleString("id-ID",{month:"short"}), year:d.getFullYear(), month:d.getMonth() };
  });
  const maxRec = Math.max(1, ...months.map(m=>S.allRecs.filter(r=>{const d=r.createdAt?.toDate?r.createdAt.toDate():new Date(r.createdAt||0);return d.getMonth()===m.month&&d.getFullYear()===m.year;}).length));
  const chartRec=$("chartRecruitments"); if(chartRec) {
    chartRec.innerHTML = months.map(m=>{
      const cnt=S.allRecs.filter(r=>{const d=r.createdAt?.toDate?r.createdAt.toDate():new Date(r.createdAt||0);return d.getMonth()===m.month&&d.getFullYear()===m.year;}).length;
      const h=Math.max(4,Math.round((cnt/maxRec)*140));
      return `<div class="chart-bar-wrap"><div class="chart-bar" style="height:${h}px" title="${cnt} rekrutmen"></div><div class="chart-label">${m.label}</div></div>`;
    }).join("");
  }
  // Status pie
  const pie=$("chartApplicationStatus"); if(pie){
    const statuses=[{k:"pending",c:"#F59E0B",l:"Pending"},{k:"reviewing",c:"#60A5FA",l:"Reviewing"},{k:"interview",c:"#C9A84C",l:"Interview"},{k:"accepted",c:"#2DD4BF",l:"Diterima"},{k:"rejected",c:"#F43F5E",l:"Ditolak"},{k:"withdrawn",c:"#4A5268",l:"Ditarik"}];
    const total=Math.max(1,S.allApps.length);
    pie.innerHTML=`<div class="pie-legend">${statuses.map(s=>{const n=S.allApps.filter(a=>a.status===s.k).length;return `<div class="pie-item"><div class="pie-dot" style="background:${s.c}"></div><div class="pie-label">${s.l}</div><div class="pie-val">${n} <span style="color:var(--muted);font-size:11px">(${Math.round(n/total*100)}%)</span></div></div>`;}).join("")}</div>`;
  }
  // Users chart
  const chartU=$("chartUsers"); if(chartU){
    const maxU=Math.max(1,...months.map(m=>S.allUsers.filter(u=>{const d=u.joinedAt?.toDate?u.joinedAt.toDate():new Date(u.joinedAt||0);return d.getMonth()===m.month&&d.getFullYear()===m.year;}).length));
    chartU.innerHTML=months.map(m=>{
      const cnt=S.allUsers.filter(u=>{const d=u.joinedAt?.toDate?u.joinedAt.toDate():new Date(u.joinedAt||0);return d.getMonth()===m.month&&d.getFullYear()===m.year;}).length;
      const h=Math.max(4,Math.round((cnt/maxU)*140));
      return `<div class="chart-bar-wrap"><div class="chart-bar" style="height:${h}px;background:linear-gradient(180deg,#60A5FA,#2563EB)" title="${cnt} user baru"></div><div class="chart-label">${m.label}</div></div>`;
    }).join("");
  }
  // Top recruitments
  const topRec=$("topRecTable"); if(topRec){
    const ranked=S.allRecs.map(r=>({...r,cnt:S.allApps.filter(a=>a.recId===r.id).length})).sort((a,b)=>b.cnt-a.cnt).slice(0,5);
    topRec.innerHTML=ranked.length?ranked.map((r,i)=>`<div class="ac-item"><div style="width:20px;font-family:var(--font-mono);font-size:11px;color:var(--gold-500)">${i+1}</div><div class="ac-item-title">${esc(r.title)}</div><div class="ac-item-time">${r.cnt} pelamar</div></div>`).join(""):`<p style="color:var(--muted);font-size:13px;padding:8px">Belum ada data</p>`;
  }
}

// ════════════════════════════════════════════════════════════
//  GROUP CHAT
// ════════════════════════════════════════════════════════════
function loadGCPage() {
  const list=$("gcList"); if(!list) return;
  if(!S.allGCs.length){list.innerHTML=`<div style="padding:20px;color:var(--muted);font-size:13px">Belum ada GC. Klik "+ BUAT GC BARU".</div>`;return;}
  list.innerHTML=S.allGCs.map(gc=>`
    <div class="gc-item ${S.activeGCId===gc.id?"active":""}" onclick="openGC('${gc.id}')">
      <div class="gc-item-name">${esc(gc.name)}</div>
      <div class="gc-item-preview">${esc(gc.lastMessage||"Belum ada pesan")}</div>
      <div class="gc-item-time">${gc.lastMessageAt?timeAgo(gc.lastMessageAt):"—"}</div>
    </div>`).join("");
}

async function openGC(gcId) {
  S.activeGCId=gcId;
  if(S.gcUnsub){S.gcUnsub();S.gcUnsub=null;}
  const gc=S.allGCs.find(g=>g.id===gcId); if(!gc) return;
  const main=$("gcMain"); if(!main) return;
  main.innerHTML=`
    <div class="gc-chat-header">${esc(gc.name)} ${gc.relatedRecTitle?`<span style="color:var(--muted);font-size:12px">— ${esc(gc.relatedRecTitle)}</span>`:""}
      ${hasPerm("manageRec")?`<button class="btn-ghost sm" style="margin-left:auto" onclick="deleteGC('${gc.id}')">Hapus GC</button>`:""}
    </div>
    <div class="gc-messages" id="gcMessages"></div>
    <div class="gc-input-area">
      <input class="gc-input" id="gcInputMsg" placeholder="Ketik pesan..." onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendGCMsg('${gcId}');}"/>
      <button class="btn-primary sm" onclick="sendGCMsg('${gcId}')">Kirim</button>
    </div>`;
  loadGCPage();
  // Real-time listener
  S.gcUnsub = C.gcMsgs(gcId).orderBy("sentAt","asc").limit(100).onSnapshot(snap=>{
    const msgs=$("gcMessages"); if(!msgs) return;
    msgs.innerHTML=snap.docs.map(d=>{
      const m=d.data();
      const ini=(m.senderDisplay||m.senderUsername||"?").slice(0,2).toUpperCase();
      return `<div class="gc-message">
        <div class="gc-msg-avatar">${esc(ini)}</div>
        <div class="gc-msg-body">
          <div class="gc-msg-meta"><span class="gc-msg-name">${esc(m.senderDisplay||m.senderUsername)}</span><span class="gc-msg-time">${timeAgo(m.sentAt)}</span></div>
          <div class="gc-msg-text">${esc(m.text)}</div>
        </div>
      </div>`;
    }).join("");
    msgs.scrollTop=msgs.scrollHeight;
  });
}

async function sendGCMsg(gcId) {
  const inp=$("gcInputMsg"); if(!inp) return;
  const text=inp.value.trim(); if(!text) return;
  inp.value="";
  try {
    const msgData={ senderUsername:S.user.username, senderDisplay:S.user.displayName||S.user.username, text, sentAt:ts() };
    await C.gcMsgs(gcId).add(msgData);
    await C.gcs().doc(gcId).update({ lastMessage:text.slice(0,60), lastMessageAt:ts() });
    const gc=S.allGCs.find(g=>g.id===gcId); if(gc){gc.lastMessage=text.slice(0,60);}
  } catch(e){toast("Gagal mengirim","","error");}
}

function openCreateGCModal() {
  // Populate related rec select
  const sel=$("gcRelatedRec"); if(sel) sel.innerHTML=`<option value="">-- Tidak terkait --</option>`+S.allRecs.map(r=>`<option value="${r.id}" data-title="${esc(r.title)}">${esc(r.title)}</option>`).join("");
  $("gcName").value=""; $("gcDesc").value="";
  $("gcMemberList").innerHTML="";
  openModal("modalCreateGC");
}

const gcTempMembers = [];
function addGCMember() {
  const inp=$("gcMemberInput"); if(!inp) return;
  const uname=inp.value.trim().toLowerCase(); if(!uname) return;
  const exists=S.allUsers.find(u=>u.username===uname);
  if(!exists){toast("User tidak ditemukan","","warning");return;}
  if(gcTempMembers.includes(uname)){toast("Sudah ditambahkan","","warning");return;}
  gcTempMembers.push(uname);
  $("gcMemberList").innerHTML=gcTempMembers.map((m,i)=>`<div class="dynamic-item"><span class="di-text">@${esc(m)}</span><button class="di-remove" onclick="gcTempMembers.splice(${i},1);addGCMember()">✕</button></div>`).join("");
  inp.value="";
}

async function createGC() {
  const name=  $("gcName")?.value.trim();
  const desc=  $("gcDesc")?.value.trim()||"";
  const relSel=$("gcRelatedRec");
  const relId= relSel?.value||"";
  const relTitle=relSel?.options[relSel?.selectedIndex]?.dataset?.title||"";
  if(!name){toast("Nama GC wajib diisi","","warning");return;}
  try {
    const members=[...new Set([S.user.username,...gcTempMembers])];
    const data={ name, description:desc, relatedRecId:relId, relatedRecTitle:relTitle, members, createdBy:S.user.username, createdAt:ts(), lastMessage:"", lastMessageAt:null };
    const ref=await C.gcs().add(data);
    S.allGCs.unshift({id:ref.id,...data});
    gcTempMembers.length=0;
    await writeAudit("admin", S.user.username, `Buat GC: ${name}`);
    closeModal("modalCreateGC");
    loadGCPage();
    openGC(ref.id);
    toast("GC dibuat","","success");
  } catch(e){console.error(e);toast("Gagal","","error");}
}

async function deleteGC(gcId) {
  const gc=S.allGCs.find(g=>g.id===gcId);
  showConfirm("Hapus GC",`"${gc?.name}" dan semua pesannya akan dihapus.`, async()=>{
    try {
      // Delete messages subcollection (Firestore doesn't auto-delete)
      const msgs=await C.gcMsgs(gcId).get();
      const batch=db.batch();
      msgs.docs.forEach(d=>batch.delete(d.ref));
      batch.delete(C.gcs().doc(gcId));
      await batch.commit();
      if(S.gcUnsub){S.gcUnsub();S.gcUnsub=null;}
      S.allGCs=S.allGCs.filter(g=>g.id!==gcId);
      S.activeGCId=null;
      $("gcMain").innerHTML=`<div class="gc-empty"><div class="gc-empty-icon">◧</div><p>Pilih group chat untuk mulai</p></div>`;
      loadGCPage();
      toast("GC dihapus","","info");
    } catch(e){toast("Gagal","","error");}
  },"YA, HAPUS");
}

// ════════════════════════════════════════════════════════════
//  AUDIT LOG
// ════════════════════════════════════════════════════════════
function loadAuditPage() { filterAuditLog(); }
function filterAuditLog() {
  const q  =$("auditSearch")?.value.trim().toLowerCase();
  const ac =$("auditActionFilter")?.value;
  const logs=S.auditLogs.filter(l=>{
    if(ac&&l.action!==ac) return false;
    if(q&&!`${l.username} ${l.action} ${l.detail}`.toLowerCase().includes(q)) return false;
    return true;
  });
  const wrap=$("auditTable"); if(!wrap) return;
  if(!logs.length){wrap.innerHTML=`<div style="padding:40px;text-align:center;color:var(--muted)">Tidak ada log</div>`;return;}
  wrap.innerHTML=`<table class="data-table"><thead><tr><th>WAKTU</th><th>USER</th><th>AKSI</th><th>DETAIL</th></tr></thead>
  <tbody>${logs.map(l=>`<tr>
    <td style="font-family:var(--font-mono);font-size:11px;white-space:nowrap">${fmtDate(l.timestamp)}</td>
    <td style="font-family:var(--font-mono);font-size:12px">@${esc(l.username||"—")}</td>
    <td><span class="audit-action ${l.action==="login"?"login":l.action==="register"?"login":l.action==="admin"?"admin":l.action==="danger"?"danger":""}">${esc(l.action)}</span></td>
    <td style="font-size:12px;color:var(--muted)">${esc(l.detail||"—")}</td>
  </tr>`).join("")}</tbody></table>`;
}

function exportAuditLog() {
  const rows=[["Waktu","User","Aksi","Detail"],...S.auditLogs.map(l=>[fmtDate(l.timestamp),l.username||"",l.action||"",l.detail||""])];
  const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
  const blob=new Blob([csv],{type:"text/csv"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=`audit_log_${Date.now()}.csv`; a.click();
  URL.revokeObjectURL(url);
  toast("Audit log diexport","","success");
}

// ════════════════════════════════════════════════════════════
//  HOST RECRUITMENT — STEP BUILDER
// ════════════════════════════════════════════════════════════
function openHostRecruitmentModal() {
  if(!hasPerm("manageRec")){toast("Tidak ada izin","","error");return;}
  S.hostStep=1; S.hostData={}; S.hostQuestions=[];
  // Populate selects
  const srvSel=$("hServer"); if(srvSel) srvSel.innerHTML=`<option value="">-- Pilih Server --</option>`+S.allServers.filter(s=>s.status==="active").map(s=>`<option value="${s.id}" data-name="${esc(s.name)}">${esc(s.name)}</option>`).join("");
  const dptSel=$("hDept"); if(dptSel) dptSel.innerHTML=`<option value="">-- Pilih Divisi --</option>`+S.departments.map(d=>`<option value="${esc(d)}">${esc(d)}</option>`).join("");
  const typSel=$("hType"); if(typSel) typSel.innerHTML=`<option value="">-- Pilih Tipe --</option>`+S.recTypes.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join("");
  // Set default dates
  const now=new Date(); const end=new Date(now.getTime()+14*86400000);
  if($("hStartDate")) $("hStartDate").value=now.toISOString().slice(0,16);
  if($("hEndDate"))   $("hEndDate").value=end.toISOString().slice(0,16);
  // Clear dynamic lists
  ["reqList","prefList","benefitList","hTagList"].forEach(id=>{const el=$(id);if(el)el.innerHTML="";});
  S._reqItems=[]; S._prefItems=[]; S._benefitItems=[]; S._hostTags=[];
  // Clear questions
  $("questionBuilder").innerHTML="";
  renderHostStepDots();
  showHostStep(1);
  openModal("modalHostRec");
}

function renderHostStepDots() {
  const dotsEl=$("hostStepDots"); if(!dotsEl) return;
  dotsEl.innerHTML=Array.from({length:5},(_,i)=>`<div class="step-dot ${i+1===S.hostStep?"active":""}"></div>`).join("");
}

function showHostStep(n) {
  for(let i=1;i<=5;i++){
    const el=$(`hostStep${i}`); if(el) el.classList.toggle("hidden",i!==n);
    const si=q(`[data-step="${i}"]`);
    if(si){si.classList.toggle("active",i===n);si.classList.toggle("done",i<n);}
  }
  $("hostPrevBtn").style.display = n>1?"block":"none";
  const nextBtn=$("hostNextBtn");
  if(nextBtn){nextBtn.textContent=n===5?"🚀 PUBLISH SEKARANG":"Selanjutnya →";}
  renderHostStepDots();
  S.hostStep=n;
  if(n===5) buildHostReview();
}

function hostStepNext() {
  if(S.hostStep<5){
    const err=validateHostStep(S.hostStep);
    if(err){toast("Lengkapi data",err,"warning");return;}
    collectHostStepData(S.hostStep);
    showHostStep(S.hostStep+1);
  } else {
    collectHostStepData(5);
    submitHostRec();
  }
}
function hostStepPrev() { if(S.hostStep>1) showHostStep(S.hostStep-1); }

function validateHostStep(step) {
  if(step===1){
    if(!$("hTitle")?.value.trim())    return "Judul rekrutmen wajib diisi.";
    if(!$("hServer")?.value)          return "Server Discord wajib dipilih.";
    if(!$("hDept")?.value)            return "Divisi wajib dipilih.";
    if(!$("hType")?.value)            return "Tipe rekrutmen wajib dipilih.";
    if(!$("hPosition")?.value.trim()) return "Posisi yang dicari wajib diisi.";
    if(!$("hDesc")?.value.trim())     return "Deskripsi umum wajib diisi.";
    if(!$("hJobdesc")?.value.trim())  return "Tanggung jawab wajib diisi.";
  }
  if(step===2){
    if((S._reqItems||[]).length<3)    return "Minimal 3 syarat wajib harus diisi.";
  }
  if(step===4){
    if(!$("hStartDate")?.value)       return "Tanggal mulai wajib diisi.";
    if(!$("hEndDate")?.value)         return "Tanggal berakhir wajib diisi.";
    const start=new Date($("hStartDate").value), end=new Date($("hEndDate").value);
    if(end<=start)                    return "Tanggal berakhir harus setelah tanggal mulai.";
  }
  return null;
}

function collectHostStepData(step) {
  const d=S.hostData;
  if(step===1){
    d.title=$("hTitle")?.value.trim();
    const srvSel=$("hServer"); d.serverId=srvSel?.value||"";
    d.serverName=srvSel?.options[srvSel?.selectedIndex]?.dataset?.name||srvSel?.options[srvSel?.selectedIndex]?.text||"";
    d.department=$("hDept")?.value||""; d.type=$("hType")?.value||"";
    d.position=$("hPosition")?.value.trim()||"";
    d.description=$("hDesc")?.value.trim()||"";
    d.jobdesc=$("hJobdesc")?.value.trim()||"";
  }
  if(step===2){
    d.requirements=S._reqItems||[]; d.preferences=S._prefItems||[];
    d.benefits=S._benefitItems||[]; d.tags=S._hostTags||[];
    d.slots=parseInt($("hSlots")?.value)||0;
    d.ageMin=parseInt($("hAgeMin")?.value)||0; d.ageMax=parseInt($("hAgeMax")?.value)||0;
    d.disclaimer=$("hDisclaimer")?.value.trim()||"";
  }
  if(step===3){ d.questions=[...S.hostQuestions]; }
  if(step===4){
    d.startDate=$("hStartDate")?.value||""; d.endDate=$("hEndDate")?.value||"";
    d.maxApplicants=parseInt($("hMaxApplicants")?.value)||0;
    d.priority=$("hPriority")?.value||"normal"; d.visibility=$("hVisibility")?.value||"public";
    d.initStatus=$("hInitStatus")?.value||"draft";
    d.announceLink=$("hAnnounceLink")?.value.trim()||"";
    d.contactPerson=$("hContactPerson")?.value.trim()||"";
    d.allowWithdraw=!!$("hAllowWithdraw")?.checked;
    d.hideApplicantCount=!$("hShowApplicantCount")?.checked;
    d.autoClose=!!$("hAutoClose")?.checked; d.autoCloseDate=!!$("hAutoCloseDate")?.checked;
    d.sendAcceptNotif=!!$("hSendAcceptNotif")?.checked;
  }
}

function buildHostReview() {
  const d=S.hostData;
  const row=(label,val)=>`<div class="review-row"><span class="review-label">${label}</span><span class="review-val">${esc(val||"—")}</span></div>`;
  $("hostReviewContent").innerHTML=`
    <div class="review-section"><div class="review-section-header">INFORMASI DASAR</div>
      <div class="review-section-body">
        ${row("Judul",d.title)}${row("Server",d.serverName)}${row("Divisi",d.department)}
        ${row("Tipe",d.type)}${row("Posisi",d.position)}
      </div>
    </div>
    <div class="review-section"><div class="review-section-header">DETAIL</div>
      <div class="review-section-body">
        ${row("Syarat Wajib",`${(d.requirements||[]).length} syarat`)}
        ${row("Slot Posisi",d.slots>0?String(d.slots):"Unlimited")}
        ${row("Pertanyaan Form",`${(d.questions||[]).length} pertanyaan`)}
      </div>
    </div>
    <div class="review-section"><div class="review-section-header">PENGATURAN</div>
      <div class="review-section-body">
        ${row("Mulai",d.startDate)} ${row("Berakhir",d.endDate)}
        ${row("Prioritas",(d.priority||"normal").toUpperCase())}
        ${row("Visibilitas",(d.visibility||"public").toUpperCase())}
        ${row("Status Awal",(d.initStatus||"draft").toUpperCase())}
        ${row("Max Pelamar",d.maxApplicants>0?String(d.maxApplicants):"Unlimited")}
      </div>
    </div>`;
}

async function submitHostRec() {
  const d=S.hostData;
  const btn=$("hostNextBtn"); if(btn){btn.disabled=true;btn.textContent="MEMPROSES...";}
  try {
    const data={
      ...d,
      status: d.initStatus==="open"?"open":"draft",
      questions: S.hostQuestions,
      requirements: d.requirements||[], preferences:d.preferences||[], benefits:d.benefits||[],
      tags: d.tags||[],
      applicantCount:0,
      createdBy: S.user.username,
      createdAt: ts(), updatedAt:ts(),
      publishedAt: d.initStatus==="open"?ts():null,
    };
    delete data.initStatus;
    const ref=await C.recs().add(data);
    S.allRecs.unshift({id:ref.id,...data});
    await writeAudit("recruitment", S.user.username, `Host rekrutmen: ${d.title} [${data.status}]`);
    closeAll();
    navigateTo("adminRecruitments");
    toast("Rekrutmen berhasil dibuat!",data.status==="open"?"Sudah aktif dan bisa dilihat user.":"Tersimpan sebagai Draft.","success");
  } catch(e){console.error(e);toast("Gagal membuat rekrutmen","Coba lagi.","error");}
  finally{if(btn){btn.disabled=false;btn.textContent="🚀 PUBLISH SEKARANG";}}
}

// Dynamic list helpers (requirements, preferences, benefits, tags)
S._reqItems=[]; S._prefItems=[]; S._benefitItems=[]; S._hostTags=[];

function addRequirement() {
  const inp=$("reqInput"); if(!inp) return;
  const v=inp.value.trim(); if(!v){toast("Isi syarat terlebih dahulu","","warning");return;}
  S._reqItems.push(v); inp.value=""; renderDynList("reqList",S._reqItems,"_reqItems");
}
function addPreference() {
  const inp=$("prefInput"); if(!inp) return;
  const v=inp.value.trim(); if(!v) return;
  S._prefItems.push(v); inp.value=""; renderDynList("prefList",S._prefItems,"_prefItems");
}
function addBenefit() {
  const inp=$("benefitInput"); if(!inp) return;
  const v=inp.value.trim(); if(!v) return;
  S._benefitItems.push(v); inp.value=""; renderDynList("benefitList",S._benefitItems,"_benefitItems");
}
function addHostTag() {
  const inp=$("hTagInput"); if(!inp) return;
  const v=inp.value.trim().toLowerCase(); if(!v) return;
  if(S._hostTags.includes(v)){toast("Tag sudah ada","","warning");return;}
  S._hostTags.push(v); inp.value=""; renderDynList("hTagList",S._hostTags,"_hostTags",true);
}
function renderDynList(listId, arr, arrKey, inline=false) {
  const c=$(listId); if(!c) return;
  c.innerHTML=arr.map((item,i)=>`<div class="dynamic-item${inline?" inline-tag":""}">
    <span class="di-text">${esc(item)}</span>
    <button class="di-remove" onclick="S.${arrKey}.splice(${i},1);renderDynList('${listId}',S.${arrKey},'${arrKey}',${inline})">✕</button>
  </div>`).join("");
}

// Question Builder
let qIdCounter=0;
function addQuestion(type) {
  qIdCounter++;
  const qid=`q_${qIdCounter}`;
  const labels={text:"Teks Singkat",textarea:"Paragraf",radio:"Pilihan Ganda",checkbox:"Checkbox",number:"Angka",select:"Dropdown",scale:"Skala 1–10",url:"URL / Link"};
  const needOptions=["radio","checkbox","select"].includes(type);
  const q={id:qid,type,label:"",placeholder:"",required:true,options:needOptions?["Opsi 1","Opsi 2"]:[]};
  S.hostQuestions.push(q);
  const qb=$("questionBuilder"); if(!qb) return;
  const div=document.createElement("div"); div.className="q-card"; div.id=`qcard_${qid}`;
  div.innerHTML=`
    <div class="q-card-header">
      <div class="q-num">${S.hostQuestions.length}</div>
      <span class="q-type-badge">${esc(labels[type]||type)}</span>
      <button class="q-remove" onclick="removeQuestion('${qid}')">Hapus ✕</button>
    </div>
    <div class="q-fields">
      <div class="q-field-row">
        <input type="text" placeholder="Label pertanyaan *" style="flex:1;background:var(--navy-700);border:1px solid var(--border);border-radius:4px;color:var(--white);padding:8px 12px;font-size:13px;outline:none" oninput="updateQuestion('${qid}','label',this.value)" />
      </div>
      ${!["radio","checkbox","select","scale"].includes(type)?`
      <div class="q-field-row">
        <input type="text" placeholder="Placeholder (opsional)" style="flex:1;background:var(--navy-700);border:1px solid var(--border);border-radius:4px;color:var(--white);padding:8px 12px;font-size:13px;outline:none" oninput="updateQuestion('${qid}','placeholder',this.value)" />
      </div>`:""}
      <label class="q-required"><input type="checkbox" checked onchange="updateQuestion('${qid}','required',this.checked)" /> Wajib diisi</label>
      ${needOptions?`
      <div class="q-options" id="qopts_${qid}">
        <div class="q-option-row"><input type="text" value="Opsi 1" style="flex:1;background:var(--navy-700);border:1px solid var(--border2);border-radius:3px;color:var(--white);padding:6px 10px;font-size:12px;outline:none" oninput="updateQuestionOption('${qid}',0,this.value)" /><button style="background:none;border:none;color:var(--muted);cursor:pointer;padding:0 8px" onclick="removeQuestionOption('${qid}',0)">✕</button></div>
        <div class="q-option-row"><input type="text" value="Opsi 2" style="flex:1;background:var(--navy-700);border:1px solid var(--border2);border-radius:3px;color:var(--white);padding:6px 10px;font-size:12px;outline:none" oninput="updateQuestionOption('${qid}',1,this.value)" /><button style="background:none;border:none;color:var(--muted);cursor:pointer;padding:0 8px" onclick="removeQuestionOption('${qid}',1)">✕</button></div>
        <button class="btn-ghost sm" style="align-self:flex-start;margin-top:4px" onclick="addQuestionOption('${qid}')">+ Tambah Opsi</button>
      </div>`:""}
    </div>`;
  qb.appendChild(div);
}

function updateQuestion(qid,field,val){const q=S.hostQuestions.find(q=>q.id===qid);if(q)q[field]=val;}
function updateQuestionOption(qid,idx,val){const q=S.hostQuestions.find(q=>q.id===qid);if(q&&q.options)q.options[idx]=val;}
function removeQuestionOption(qid,idx){const q=S.hostQuestions.find(q=>q.id===qid);if(!q||!q.options)return;q.options.splice(idx,1);reRenderQOpts(qid);}
function addQuestionOption(qid){const q=S.hostQuestions.find(q=>q.id===qid);if(!q||!q.options)return;q.options.push(`Opsi ${q.options.length+1}`);reRenderQOpts(qid);}
function reRenderQOpts(qid){
  const q=S.hostQuestions.find(q=>q.id===qid); if(!q) return;
  const c=$(`qopts_${qid}`); if(!c) return;
  const btns=c.querySelectorAll(".btn-ghost");
  const rowsHtml=q.options.map((o,i)=>`<div class="q-option-row"><input type="text" value="${esc(o)}" style="flex:1;background:var(--navy-700);border:1px solid var(--border2);border-radius:3px;color:var(--white);padding:6px 10px;font-size:12px;outline:none" oninput="updateQuestionOption('${qid}',${i},this.value)" /><button style="background:none;border:none;color:var(--muted);cursor:pointer;padding:0 8px" onclick="removeQuestionOption('${qid}',${i})">✕</button></div>`).join("");
  c.innerHTML=rowsHtml+`<button class="btn-ghost sm" style="align-self:flex-start;margin-top:4px" onclick="addQuestionOption('${qid}')">+ Tambah Opsi</button>`;
}
function removeQuestion(qid){
  S.hostQuestions=S.hostQuestions.filter(q=>q.id!==qid);
  const el=$(`qcard_${qid}`); if(el) el.remove();
}

// ════════════════════════════════════════════════════════════
//  SETTINGS PAGE
// ════════════════════════════════════════════════════════════
function loadSettingsPage() {
  const st=S.settings;
  if($("settingAppName"))      $("settingAppName").value=st.appName||"Recruiter";
  if($("settingRegOpen"))      $("settingRegOpen").checked=st.registrationOpen!==false;
  if($("settingMaintenance"))  $("settingMaintenance").checked=!!st.maintenance;
  if($("settingMultiServer"))  $("settingMultiServer").checked=st.multiServer!==false;
  if($("settingInviteRequired"))$("settingInviteRequired").checked=st.inviteRequired!==false;
  if($("settingInviteExpiry")) $("settingInviteExpiry").value=st.inviteExpiry||30;
  if($("settingInviteMaxUse")) $("settingInviteMaxUse").value=st.inviteMaxUse||1;
  if($("settingAutoApprove"))  $("settingAutoApprove").checked=st.autoApprove!==false;
  if($("settingMaxApps"))      $("settingMaxApps").value=st.maxAppsPerRec||100;
  if($("settingRecDuration"))  $("settingRecDuration").value=st.recDuration||14;
  if($("settingMultiApply"))   $("settingMultiApply").checked=st.multiApply!==false;
  if($("settingHideCount"))    $("settingHideCount").checked=!!st.hideApplicantCount;
  if($("settingRecReview"))    $("settingRecReview").checked=!!st.recRequireReview;
  if($("settingNotifApp"))     $("settingNotifApp").checked=st.notifNewApplication!==false;
  if($("settingNotifUser"))    $("settingNotifUser").checked=st.notifNewUser!==false;
  if($("settingNotifStatus"))  $("settingNotifStatus").checked=st.notifStatusChange!==false;
  renderRecTypes(); renderDepts();
}

function renderRecTypes(){
  const c=$("recTypeList"); if(!c) return;
  c.innerHTML=S.recTypes.map((t,i)=>`<div class="tag-item"><span>${esc(t)}</span><button class="tag-remove" onclick="removeRecType(${i})">✕</button></div>`).join("");
}
function addRecType(){
  const inp=$("newRecTypeInput"); if(!inp) return;
  const v=inp.value.trim(); if(!v)return;
  S.recTypes.push(v); inp.value=""; renderRecTypes();
}
function removeRecType(i){S.recTypes.splice(i,1);renderRecTypes();}

function renderDepts(){
  const c=$("deptList"); if(!c) return;
  c.innerHTML=S.departments.map((d,i)=>`<div class="tag-item"><span>${esc(d)}</span><button class="tag-remove" onclick="removeDept(${i})">✕</button></div>`).join("");
}
function addDept(){
  const inp=$("newDeptInput"); if(!inp) return;
  const v=inp.value.trim(); if(!v)return;
  S.departments.push(v); inp.value=""; renderDepts();
}
function removeDept(i){S.departments.splice(i,1);renderDepts();}

async function saveGeneralSettings(){
  const data={appName:$("settingAppName")?.value.trim()||"Recruiter",registrationOpen:!!$("settingRegOpen")?.checked,maintenance:!!$("settingMaintenance")?.checked,multiServer:!!$("settingMultiServer")?.checked};
  await persistSettings(data,"Pengaturan umum disimpan");
}
async function saveInviteSettings(){
  const data={inviteRequired:!!$("settingInviteRequired")?.checked,inviteExpiry:parseInt($("settingInviteExpiry")?.value)||30,inviteMaxUse:parseInt($("settingInviteMaxUse")?.value)||1,autoApprove:!!$("settingAutoApprove")?.checked};
  await persistSettings(data,"Pengaturan invite disimpan");
}
async function saveRecruitmentSettings(){
  const data={maxAppsPerRec:parseInt($("settingMaxApps")?.value)||100,recDuration:parseInt($("settingRecDuration")?.value)||14,multiApply:!!$("settingMultiApply")?.checked,hideApplicantCount:!!$("settingHideCount")?.checked,recRequireReview:!!$("settingRecReview")?.checked,recTypes:S.recTypes,departments:S.departments};
  await persistSettings(data,"Pengaturan rekrutmen disimpan");
}
async function saveNotifSettings(){
  const data={notifNewApplication:!!$("settingNotifApp")?.checked,notifNewUser:!!$("settingNotifUser")?.checked,notifStatusChange:!!$("settingNotifStatus")?.checked};
  await persistSettings(data,"Pengaturan notifikasi disimpan");
}
async function persistSettings(data,successMsg){
  if(!hasPerm("manageSettings")){toast("Tidak ada izin","","error");return;}
  try {
    await C.config().doc("platform").set(data,{merge:true});
    Object.assign(S.settings,data);
    await writeAudit("admin",S.user.username,`Update settings`);
    toast(successMsg,"","success");
  } catch(e){toast("Gagal menyimpan","","error");}
}

function confirmDangerAction(action){
  const labels={resetNotifs:"Reset semua notifikasi? Tidak bisa dibatalkan.",archiveRec:"Arsipkan semua rekrutmen yang sudah closed?"};
  showConfirm("Konfirmasi Aksi Berbahaya",labels[action]||"Yakin?",()=>executeDangerAction(action),"YA, LANJUTKAN");
}
async function executeDangerAction(action){
  try{
    if(action==="resetNotifs"){
      const snap=await C.notifs().get();
      const batch=db.batch(); snap.docs.forEach(d=>batch.delete(d.ref)); await batch.commit();
      S.allNotifs=[]; updateNotifBadges(0);
      toast("Semua notifikasi dihapus","","info");
    }
    if(action==="archiveRec"){
      const closed=S.allRecs.filter(r=>r.status==="closed");
      const batch=db.batch(); closed.forEach(r=>batch.update(C.recs().doc(r.id),{status:"archived"})); await batch.commit();
      closed.forEach(r=>r.status="archived");
      toast(`${closed.length} rekrutmen diarsipkan`,"","info");
    }
    await writeAudit("danger",S.user.username,`Danger action: ${action}`);
  }catch(e){toast("Gagal","","error");}
}

// ════════════════════════════════════════════════════════════
//  UTILITY FUNCTIONS
// ════════════════════════════════════════════════════════════
function copyToClipboard(text, successMsg="Disalin!") {
  navigator.clipboard?.writeText(text).then(()=>toast(successMsg,"","success")).catch(()=>{
    const ta=document.createElement("textarea"); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); toast(successMsg,"","success");
  });
}

// Filter recruitments (public page)
function filterRecruitments() { filterRecs(); }
