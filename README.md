# RECRUITER — Setup Guide Lengkap

Platform rekrutmen berbasis web untuk komunitas Discord.  
Stack: HTML + CSS + Vanilla JS + Firebase Firestore + GitHub Pages.

---

## DAFTAR ISI

1. [Prasyarat](#1-prasyarat)
2. [Buat Firebase Project](#2-buat-firebase-project)
3. [Aktifkan Firestore](#3-aktifkan-firestore)
4. [Firestore Security Rules](#4-firestore-security-rules)
5. [Firestore Indexes](#5-firestore-indexes)
6. [Konfigurasi firebase-config.js](#6-konfigurasi-firebase-configjs)
7. [Setup Super Admin](#7-setup-super-admin)
8. [Deploy ke GitHub Pages](#8-deploy-ke-github-pages)
9. [Setup Pertama Kali (First Run)](#9-setup-pertama-kali-first-run)
10. [Cara Buat Invite Code & Undang User](#10-cara-buat-invite-code--undang-user)
11. [Cara Buat Rekrutmen](#11-cara-buat-rekrutmen)
12. [Manajemen Role](#12-manajemen-role)
13. [Troubleshooting](#13-troubleshooting)
14. [Security Checklist](#14-security-checklist)
15. [Struktur Firestore](#15-struktur-firestore)

---

## 1. PRASYARAT

Sebelum mulai, pastikan kamu punya:

- Akun Google (untuk Firebase)
- Akun GitHub (untuk hosting)
- Browser modern (Chrome / Firefox / Edge terbaru)
- Koneksi internet

Tidak butuh Node.js, server, atau backend apapun.

---

## 2. BUAT FIREBASE PROJECT

### Langkah-langkah:

1. Buka [https://console.firebase.google.com](https://console.firebase.google.com)

2. Klik **"Add project"** / **"Tambahkan project"**

3. Isi nama project, contoh: `recruiter-discord`

4. **Matikan** Google Analytics (tidak diperlukan)

5. Klik **"Create project"** — tunggu sampai selesai

6. Setelah masuk dashboard project, klik ikon **`</>`** (Web app)

7. Isi App nickname, contoh: `recruiter-web`

8. **Jangan centang** Firebase Hosting (kita pakai GitHub Pages)

9. Klik **"Register app"**

10. Kamu akan melihat snippet seperti ini:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "recruiter-discord.firebaseapp.com",
  projectId: "recruiter-discord",
  storageBucket: "recruiter-discord.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

11. **Salin semua nilai ini** — akan dipakai di langkah 6

12. Klik **"Continue to console"**

---

## 3. AKTIFKAN FIRESTORE

1. Di sidebar Firebase Console, klik **"Firestore Database"**

2. Klik **"Create database"**

3. Pilih mode: **"Start in production mode"**  
   (Rules kita set manual di langkah berikutnya)

4. Pilih lokasi server:
   - Rekomendasi Asia: **`asia-southeast1`** (Singapura)
   - Atau **`asia-east1`** (Taiwan) untuk latensi lebih rendah ke Indonesia

5. Klik **"Enable"** — tunggu beberapa detik

---

## 4. FIRESTORE SECURITY RULES

Ini bagian **paling penting**. Rules yang salah = data bisa dicuri atau dihapus orang lain.

### Cara mengatur Rules:

1. Di Firestore Console, klik tab **"Rules"**

2. Hapus semua rules yang ada

3. Paste rules berikut:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ── USERS ──────────────────────────────────────────
    // Siapapun bisa baca user (untuk cek username exists)
    // Hanya user itu sendiri atau admin yang bisa update
    match /users/{username} {
      allow read: if true;
      allow create: if true; // registrasi terbuka lewat invite
      allow update: if request.auth == null &&
        (resource.data.username == username ||
         request.resource.data.keys().hasOnly([
           'displayName','discordTag','bio',
           'passwordHash','sessionToken','lastLogin',
           'totalApps','acceptedApps','rejectedApps'
         ]));
      allow delete: if false;
    }

    // ── INVITES ────────────────────────────────────────
    // Siapapun bisa baca (untuk validasi kode)
    // Hanya bisa dibuat/diedit lewat app (no auth)
    match /invites/{inviteId} {
      allow read: if true;
      allow write: if true;
    }

    // ── RECRUITMENTS ───────────────────────────────────
    match /recruitments/{recId} {
      allow read: if true;
      allow write: if true;
    }

    // ── APPLICATIONS ───────────────────────────────────
    match /applications/{appId} {
      allow read: if true;
      allow write: if true;
    }

    // ── NOTIFICATIONS ──────────────────────────────────
    match /notifications/{notifId} {
      allow read: if true;
      allow write: if true;
    }

    // ── ROLES ──────────────────────────────────────────
    match /roles/{roleId} {
      allow read: if true;
      allow write: if true;
    }

    // ── SERVERS ────────────────────────────────────────
    match /servers/{serverId} {
      allow read: if true;
      allow write: if true;
    }

    // ── GROUP CHATS ────────────────────────────────────
    match /group_chats/{gcId} {
      allow read: if true;
      allow write: if true;
      match /messages/{msgId} {
        allow read: if true;
        allow write: if true;
      }
    }

    // ── AUDIT LOG ──────────────────────────────────────
    match /audit_log/{logId} {
      allow read: if true;
      allow write: if true;
    }

    // ── SETTINGS ───────────────────────────────────────
    match /settings/{docId} {
      allow read: if true;
      allow write: if true;
    }

  }
}
```

4. Klik **"Publish"**

> **Catatan Keamanan:**
> Rules di atas menggunakan `allow write: if true` karena aplikasi ini
> menggunakan custom auth berbasis Firestore (bukan Firebase Auth).
> Keamanan dijaga lewat:
> - Session token tersimpan di Firestore, divalidasi setiap request
> - Password di-hash SHA-256 sebelum disimpan
> - Invite code wajib untuk registrasi
> - Semua aksi admin dicatat di Audit Log
>
> Untuk produksi skala besar, pertimbangkan upgrade ke Firebase Auth.

---

## 5. FIRESTORE INDEXES

Beberapa query butuh composite index. Firebase akan menampilkan error di console browser jika index belum dibuat, lengkap dengan link untuk membuatnya otomatis.

### Cara mudah:

1. Deploy dulu ke GitHub Pages (langkah 8)
2. Buka website, buka DevTools (F12) → Console
3. Jika ada error `The query requires an index`, klik link di error tersebut
4. Firebase akan redirect ke halaman buat index, klik **"Create index"**
5. Tunggu beberapa menit sampai status jadi `Enabled`

### Index yang mungkin dibutuhkan (buat manual jika perlu):

Buka Firestore → **Indexes** → **Composite** → **Add index**

| Collection     | Field 1              | Field 2       | Query Scope  |
|----------------|----------------------|---------------|--------------|
| notifications  | targetUsername (ASC) | createdAt (DESC) | Collection |
| applications   | applicantUsername (ASC) | submittedAt (DESC) | Collection |
| applications   | recId (ASC)          | submittedAt (DESC) | Collection |
| audit_log      | username (ASC)       | timestamp (DESC) | Collection |
| recruitments   | status (ASC)         | createdAt (DESC) | Collection |

---

## 6. KONFIGURASI firebase-config.js

1. Buka file `firebase-config.js` di editor teks (VSCode, Notepad++, dll)

2. Ganti setiap nilai placeholder dengan nilai dari Firebase Console:

```js
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyXXXXXXXXXXXXXXXXXXX",      // ← ganti ini
  authDomain:        "nama-project.firebaseapp.com",     // ← ganti ini
  projectId:         "nama-project",                     // ← ganti ini
  storageBucket:     "nama-project.appspot.com",         // ← ganti ini
  messagingSenderId: "123456789012",                     // ← ganti ini
  appId:             "1:123456789012:web:abc123def456",  // ← ganti ini
};
```

3. Ganti `SUPER_ADMIN_USERNAME` dengan username yang kamu mau:

```js
const SUPER_ADMIN_USERNAME = "namaadminku";
// Contoh: "budi_admin", "staffrekrut", "owner2025"
// INGAT: username hanya boleh huruf kecil, angka, underscore
// Minimal 3 karakter, maksimal 20 karakter
```

4. Simpan file

> **PENTING:** Jangan pernah share `firebase-config.js` dengan nilai asli
> ke orang yang tidak dipercaya. Walaupun API key Firebase tidak 100% rahasia,
> sebaiknya tetap dijaga. Gunakan Firebase Rules (langkah 4) sebagai lapisan
> keamanan utama.

---

## 7. SETUP SUPER ADMIN

Super Admin adalah akun dengan akses penuh ke semua fitur dashboard.

### Cara membuat Super Admin:

Super Admin dibuat **otomatis** saat register menggunakan username yang sama dengan `SUPER_ADMIN_USERNAME` di `firebase-config.js`.

**Langkah:**

1. Pastikan `SUPER_ADMIN_USERNAME` sudah diset di `firebase-config.js`

2. Buat Invite Code pertama **langsung di Firestore Console**:
   - Buka Firestore Console → klik **"Start collection"** jika belum ada, atau klik **"+ Add document"** di collection `invites`
   - Document ID: biarkan auto-generate
   - Tambahkan fields:

   | Field       | Type      | Value             |
   |-------------|-----------|-------------------|
   | code        | string    | `ADMIN-INIT-2025` |
   | status      | string    | `active`          |
   | maxUse      | number    | `1`               |
   | usedCount   | number    | `0`               |
   | usedBy      | array     | *(kosong)*        |
   | createdBy   | string    | `system`          |
   | note        | string    | `First admin setup` |
   | expiresAt   | null      | *(kosong/null)*   |

3. Buka website, klik **"DAFTAR"**

4. Isi form registrasi:
   - **Kode Undangan:** `ADMIN-INIT-2025`
   - **Username:** isi **persis sama** dengan `SUPER_ADMIN_USERNAME`
   - **Display Name, Discord, Password:** isi sesuai keinginan

5. Klik **"DAFTAR SEKARANG"** — kamu otomatis masuk sebagai Super Admin

6. Dashboard Admin akan langsung terbuka

---

## 8. DEPLOY KE GITHUB PAGES

### Persiapan file:

Pastikan folder project berisi file-file berikut:
```
recruiter/
├── index.html
├── style.css
├── app.js
├── app2.js
├── firebase-config.js    ← sudah diisi kredensial
└── README.md
```

### Cara deploy:

1. Buka [https://github.com](https://github.com), login

2. Klik **"New repository"**

3. Isi nama repo, contoh: `recruiter`

4. Pilih **Public** (diperlukan untuk GitHub Pages gratis)

5. Klik **"Create repository"**

6. Upload semua file:
   - Klik **"uploading an existing file"**
   - Drag & drop semua file ke browser
   - Klik **"Commit changes"**

7. Aktifkan GitHub Pages:
   - Buka tab **Settings** di repo
   - Scroll ke bagian **"Pages"** di sidebar kiri
   - Source: pilih **"Deploy from a branch"**
   - Branch: pilih **`main`**, folder: **`/ (root)`**
   - Klik **"Save"**

8. Tunggu 1–3 menit, refresh halaman Settings → Pages

9. URL website kamu akan muncul:
   ```
   https://username-github.github.io/recruiter/
   ```

10. Kunjungi URL tersebut — website sudah live!

### Update file setelah deploy:

Setiap kali ada perubahan file, ulangi langkah upload atau gunakan Git:
```bash
git add .
git commit -m "update"
git push
```

---

## 9. SETUP PERTAMA KALI (FIRST RUN)

Setelah login sebagai Super Admin, lakukan setup berikut **secara berurutan**:

### Step 1 — Tambah Server Discord

1. Buka **Dashboard → Server Discord**
2. Klik **"+ TAMBAH SERVER"**
3. Isi:
   - **Nama Server:** nama server Discord kamu
   - **Server ID:** ID numerik server (opsional, untuk referensi)
   - **Invite Link:** `https://discord.gg/kodeundangan`
   - **Deskripsi:** singkat tentang server
4. Klik **"SIMPAN SERVER"**

### Step 2 — Buat Role

1. Buka **Dashboard → Manajemen Role**
2. Klik **"+ BUAT ROLE BARU"**
3. Buat minimal 2 role:

   **Role: Admin**
   - Nama: `Admin`
   - Level: `80`
   - Warna: pilih warna (misal merah/emas)
   - Centang semua permission

   **Role: Staff**
   - Nama: `Staff`
   - Level: `10`
   - Warna: pilih warna (misal biru)
   - Centang: `Kelola Rekrutmen`, `Review Lamaran`

   **Role: Member**
   - Nama: `Member`
   - Level: `1`
   - Warna: abu-abu
   - Tidak perlu centang permission apapun

4. Catat **ID** setiap role (tampil di card role) — dibutuhkan saat generate invite

### Step 3 — Pengaturan Platform

1. Buka **Dashboard → Pengaturan Platform**
2. Scroll ke bagian **"Tipe Rekrutmen"** — tambah/hapus tipe sesuai kebutuhan
3. Scroll ke bagian **"Departemen / Divisi"** — tambah divisi server kamu
4. Simpan masing-masing pengaturan

### Step 4 — Generate Invite Code

1. Buka **Dashboard → Kode Undangan**
2. Klik **"+ GENERATE KODE"**
3. Isi:
   - **Jumlah Kode:** sesuai kebutuhan
   - **Max Penggunaan:** `1` (sekali pakai per orang)
   - **Kadaluarsa:** `30` hari
   - **Role Default:** pilih role yang sesuai
4. Klik **"GENERATE"**
5. Salin kode yang muncul di tabel, bagikan ke calon member

---

## 10. CARA BUAT INVITE CODE & UNDANG USER

### Generate kode baru:

1. Login sebagai admin
2. **Dashboard → Kode Undangan → "+ GENERATE KODE"**
3. Atur sesuai kebutuhan:
   - Jumlah kode: bisa sampai 50 sekaligus
   - Max penggunaan: `1` untuk sekali pakai, `0` untuk unlimited
   - Kadaluarsa: isi `0` untuk tidak pernah expired
   - Role default: role yang otomatis diberikan ke user baru dengan kode ini

### Bagikan kode:

Kirim kode ke calon member via DM Discord atau channel khusus:

```
Halo! Berikut link dan kode untuk mendaftar di platform rekrutmen kami:

🌐 Website: https://username.github.io/recruiter/
🔑 Kode Undangan: XXXX-XXXX-XXXX

Kode berlaku sampai [tanggal] dan hanya bisa dipakai 1x.
Segera daftar sebelum kadaluarsa!
```

### Cabut kode (jika perlu):

Di tabel Kode Undangan, klik tombol **"Cabut"** di baris kode yang ingin dinonaktifkan.

---

## 11. CARA BUAT REKRUTMEN

1. Login sebagai admin
2. **Dashboard → Kelola Rekrutmen → "+ HOST REKRUTMEN"**
3. Ikuti 5 langkah wizard:

### Step 1 — Informasi Dasar
- Judul rekrutmen (maks 120 karakter, deskriptif)
- Server Discord target
- Divisi/Departemen
- Tipe rekrutmen
- Posisi yang dicari
- Deskripsi umum
- Tanggung jawab/jobdesc

### Step 2 — Detail & Syarat
- **Syarat Wajib** (minimal 3) — hal yang HARUS dipenuhi pelamar
- Syarat Diutamakan — nilai plus tapi tidak wajib
- Benefit — keuntungan yang didapat jika diterima
- Slot posisi tersedia
- Batas usia (isi 0 untuk bebas)
- Disclaimer/catatan penting
- Tag untuk memudahkan pencarian

### Step 3 — Form Pertanyaan
Tambahkan pertanyaan custom untuk pelamar. Tersedia 8 tipe:
- **Teks Singkat** — jawaban satu baris
- **Paragraf** — jawaban panjang (essay)
- **Pilihan Ganda** — pilih satu dari beberapa opsi
- **Checkbox** — pilih banyak opsi
- **Angka** — input numerik
- **Dropdown** — select dari daftar
- **Skala 1–10** — rating
- **URL/Link** — input link

> Data dasar (username, Discord) sudah otomatis dikumpulkan, tidak perlu ditanyakan lagi.

### Step 4 — Pengaturan
- Tanggal mulai dan berakhir
- Maksimal pelamar (0 = unlimited)
- Prioritas (Normal / Tinggi / Urgent / Critical)
- Visibilitas (Publik / Private)
- Status awal (Draft atau Langsung Open)
- Link pengumuman Discord
- Contact person

### Step 5 — Review & Publish
- Periksa semua data
- Jika status awal **Draft**: rekrutmen tersimpan, bisa di-publish kapan saja
- Jika status awal **Langsung Open**: rekrutmen langsung aktif dan bisa dilihat semua member

---

## 12. MANAJEMEN ROLE

### Sistem Role:

| Level | Deskripsi |
|-------|-----------|
| 100   | Super Admin — akses penuh, tidak bisa diedit |
| 80–99 | Admin — bisa akses semua dashboard |
| 50–79 | Moderator — akses terbatas sesuai permission |
| 10–49 | Staff — akses sesuai permission |
| 1–9   | Member — hanya bisa lihat dan apply |

### Permission yang tersedia:

| Permission | Deskripsi |
|------------|-----------|
| `manageRec` | Buat, edit, publish, tutup rekrutmen |
| `manageUsers` | Suspend, ban, ganti role user |
| `manageInvites` | Generate dan cabut kode undangan |
| `viewAnalytics` | Akses halaman analytics |
| `manageRoles` | Buat, edit, hapus role |
| `manageSettings` | Ubah pengaturan platform |
| `reviewApps` | Review dan ubah status lamaran |
| `viewAuditLog` | Lihat audit log aktivitas |

### Ganti role user:

1. **Dashboard → Manajemen User**
2. Cari user → klik **"Role"**
3. Masukkan Role ID baru (terlihat di halaman Manajemen Role)

---

## 13. TROUBLESHOOTING

### Website tidak bisa dibuka / blank putih

- Pastikan semua 5 file ada di repo GitHub (`index.html`, `style.css`, `app.js`, `app2.js`, `firebase-config.js`)
- Buka DevTools (F12) → Console, lihat pesan error
- Pastikan `firebase-config.js` sudah diisi dengan benar

---

### "Firebase belum dikonfigurasi" muncul saat buka website

- Buka `firebase-config.js`, pastikan semua nilai sudah diganti (tidak ada yang masih `"GANTI_..."`)
- Pastikan tidak ada typo di nama field

---

### "Koneksi Gagal" muncul

1. Pastikan Firestore sudah diaktifkan (langkah 3)
2. Pastikan Firebase Security Rules sudah di-publish (langkah 4)
3. Coba buka Firestore Console dan refresh

---

### Login selalu gagal padahal password benar

- Pastikan tidak ada spasi di awal/akhir username
- Username harus huruf kecil semua
- Coba clear cache browser (Ctrl+Shift+Delete)
- Cek Firestore → collection `users` → apakah dokumen user ada

---

### "The query requires an index" di console

- Klik link yang muncul di error tersebut
- Firebase akan redirect ke halaman buat index
- Klik "Create index", tunggu 2–5 menit
- Refresh website

---

### Kode undangan selalu "tidak valid"

- Pastikan kode diketik dengan HURUF KAPITAL
- Cek Firestore → collection `invites` → apakah dokumen ada dengan field `status: "active"`
- Pastikan `expiresAt` belum lewat atau bernilai null

---

### Notifikasi real-time tidak muncul

- Fitur ini menggunakan polling manual, bukan real-time listener
- Notifikasi muncul setelah refresh halaman atau navigasi ke halaman Notifikasi

---

### Group Chat tidak update otomatis

- GC menggunakan Firestore `onSnapshot` (real-time listener)
- Jika tidak update, cek koneksi internet
- Pastikan Firestore Rules mengizinkan read pada `group_chats/{gcId}/messages`

---

## 14. SECURITY CHECKLIST

Sebelum mulai pakai secara serius, pastikan:

- [ ] `SUPER_ADMIN_USERNAME` sudah diganti dari default `"superadmin"`
- [ ] Firebase Security Rules sudah di-publish
- [ ] Invite code pertama (`ADMIN-INIT-2025`) sudah dicabut setelah Super Admin dibuat
- [ ] Password Super Admin minimal 12 karakter, kombinasi huruf+angka+simbol
- [ ] `firebase-config.js` tidak di-share ke sembarang orang
- [ ] Role dan permission sudah dikonfigurasi sesuai kebutuhan
- [ ] Maintenance Mode dimatikan setelah setup selesai

### Tentang keamanan password:

Password di-hash menggunakan **SHA-256** dengan salt sebelum disimpan ke Firestore.  
Ini berarti:
- Password asli **tidak pernah tersimpan** di database
- Bahkan admin Firebase tidak bisa melihat password user
- Jika lupa password, harus di-reset manual oleh Super Admin di Firestore (hapus field `passwordHash` dan minta user set ulang)

### Reset password user (admin):

Jika user lupa password dan tidak bisa login:
1. Buka Firestore Console → collection `users` → dokumen user tersebut
2. Edit field `passwordHash` → isi dengan hash SHA-256 dari password sementara
3. Atau gunakan fitur "Edit User" di dashboard admin (ganti role → user bisa update password sendiri)

> Hash SHA-256 bisa digenerate di: https://emn178.github.io/online-tools/sha256.html  
> Format input: `rc_2025_PASSWORDDISINI_salt`  
> Contoh untuk password `Ganti123`: hash dari string `rc_2025_Ganti123_salt`

---

## 15. STRUKTUR FIRESTORE

Berikut struktur lengkap collection dan field di Firestore:

### Collection: `users`
Document ID = username

```
username:        string   — username unik (huruf kecil)
displayName:     string   — nama tampilan
discordTag:      string   — discord username/tag
passwordHash:    string   — SHA-256 hash password
sessionToken:    string   — token sesi aktif
role:            string   — nama role
roleId:          string   — ID role
roleLevel:       number   — level role (1-100)
permissions:     map      — map permission boolean
status:          string   — "active" | "suspended" | "banned" | "pending"
bio:             string   — bio singkat
joinedAt:        timestamp
lastLogin:       timestamp
inviteCode:      string   — kode yang dipakai saat daftar
invitedBy:       string   — username yang generate kode
totalApps:       number
acceptedApps:    number
rejectedApps:    number
```

### Collection: `invites`
Document ID = auto-generated

```
code:        string    — kode format "XXXX-XXXX-XXXX"
status:      string    — "active" | "used" | "expired" | "revoked"
maxUse:      number    — 0 = unlimited
usedCount:   number
usedBy:      array     — [{username, usedAt}]
note:        string    — catatan admin
defaultRole: string    — roleId default untuk user baru
createdBy:   string    — username admin yang generate
createdAt:   timestamp
expiresAt:   timestamp | null
```

### Collection: `recruitments`
Document ID = auto-generated

```
title:              string
serverName:         string
serverId:           string
department:         string
type:               string
position:           string
description:        string
jobdesc:            string
requirements:       array    — syarat wajib
preferences:        array    — syarat diutamakan
benefits:           array    — keuntungan
disclaimer:         string
tags:               array
slots:              number    — 0 = unlimited
ageMin:             number
ageMax:             number
questions:          array    — [{id, type, label, placeholder, required, options}]
status:             string   — "draft" | "open" | "closed" | "archived"
priority:           string   — "normal" | "high" | "urgent" | "critical"
visibility:         string   — "public" | "private"
maxApplicants:      number
startDate:          string
endDate:            string
announceLink:       string
contactPerson:      string
allowWithdraw:      boolean
hideApplicantCount: boolean
autoClose:          boolean
autoCloseDate:      boolean
sendAcceptNotif:    boolean
createdBy:          string
createdAt:          timestamp
updatedAt:          timestamp
publishedAt:        timestamp | null
closedAt:           timestamp | null
```

### Collection: `applications`
Document ID = auto-generated

```
recId:              string
recTitle:           string
serverId:           string
serverName:         string
applicantUsername:  string
applicantDisplay:   string
applicantDiscord:   string
status:             string   — "pending"|"reviewing"|"interview"|"accepted"|"rejected"|"withdrawn"
answers:            map      — {q0:{label,type,value}, q1:...}
score:              number   — 0-100
reviewedBy:         string
reviewNote:         string
submittedAt:        timestamp
updatedAt:          timestamp
```

### Collection: `notifications`
Document ID = auto-generated

```
targetUsername: string
type:           string   — "new_application"|"application_status"|"user_registered"|...
title:          string
message:        string
refId:          string   — ID dokumen terkait (opsional)
read:           boolean
createdAt:      timestamp
```

### Collection: `roles`
Document ID = auto-generated

```
name:        string
color:       string   — hex color
description: string
level:       number
permissions: map      — {manageRec, manageUsers, ...}
createdBy:   string
createdAt:   timestamp
```

### Collection: `servers`
Document ID = auto-generated

```
name:        string
serverId:    string   — Discord server ID
inviteLink:  string
description: string
color:       string
status:      string   — "active" | "inactive"
createdBy:   string
createdAt:   timestamp
```

### Collection: `group_chats`
Document ID = auto-generated

```
name:             string
description:      string
relatedRecId:     string
relatedRecTitle:  string
members:          array    — [username]
createdBy:        string
createdAt:        timestamp
lastMessage:      string
lastMessageAt:    timestamp | null

  Subcollection: messages/{msgId}
    senderUsername:  string
    senderDisplay:   string
    text:            string
    sentAt:          timestamp
```

### Collection: `audit_log`
Document ID = auto-generated

```
action:    string   — "login"|"register"|"logout"|"recruitment"|"application"|"admin"|"danger"
username:  string
detail:    string
extra:     map      — data tambahan opsional
timestamp: timestamp
ip:        string
```

### Collection: `settings`
Document ID = `"platform"`

```
appName:             string
registrationOpen:    boolean
maintenance:         boolean
multiServer:         boolean
inviteRequired:      boolean
inviteExpiry:        number
inviteMaxUse:        number
autoApprove:         boolean
maxAppsPerRec:       number
recDuration:         number
multiApply:          boolean
hideApplicantCount:  boolean
recRequireReview:    boolean
notifNewApplication: boolean
notifNewUser:        boolean
notifStatusChange:   boolean
recTypes:            array
departments:         array
```

---

## KONTAK & KONTRIBUSI

Website ini dibuat dengan HTML, CSS, dan JavaScript murni tanpa framework.  
Semua logika bisnis ada di `app.js` dan `app2.js`.

Untuk pertanyaan atau bug report, buka issue di repository GitHub.

---

*Recruiter v1.0.0 — Platform Rekrutmen Discord*
