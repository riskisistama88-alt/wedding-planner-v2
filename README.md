# 💎 AURA — Premium Wedding Planner & AI Budget Motherboard

AURA is a premium, responsive multi-tenant web application designed for professional wedding planners and couples to coordinate vendor databases, live budget allocations, and payment milestones. It is integrated with Google Sheets as a serverless database backend and utilizes Google's Gemini AI to analyze and compare vendor specifications.

---

## ✨ Fitur Utama

1. **Workspace Kolaboratif Multi-Tenant**
   - Mendukung pengelolaan beberapa proyek pernikahan (klien) yang berbeda secara terisolasi.
   - Pembagian akses berbasis peran (**Role-Based Access Control - RBAC**):
     - `CLIENT_DECIDER` (Rachel / Tama): Memiliki kontrol penuh atas limit anggaran, pemilihan vendor, pembuatan jadwal termin, dan verifikasi status pembayaran.
     - `CLIENT_INITIATOR` (Kevin / Indah): Memiliki akses melihat workspace dan mengusulkan opsi vendor draf.

2. **Dashboard Anggaran Interaktif & Reaktif**
   - Grafik lingkaran persentase penggunaan anggaran (*circular progress indicator*) yang reaktif secara real-time.
   - Status keamanan anggaran otomatis (**Pengeluaran Terkontrol Aman** vs. **Anggaran Overspent**).
   - Pengubahan limit anggaran secara instan langsung dari panel samping berdasarkan hak otorisasi peran.

3. **Unggah Brosur & Dokumen Google Drive**
   - Upload file foto brosur/layout fisik secara langsung yang dikonversi ke Base64 (tersimpan aman di cache).
   - Lampiran tautan kontrak/pricelist Google Drive yang terintegrasi secara visual dengan ikon Drive.
   - Panel detail vendor imersif bergaya lembar samping (*slide-over sheet* iOS).

4. **Kurasi & Analisis Spesifikasi berbasis Gemini AI**
   - Fitur analisis komparatif otomatis jika terdapat lebih dari satu kandidat vendor pada kategori terpilih.
   - Prompt engineering cerdas untuk mengidentifikasi **Titik Kritis** (analisis risiko operasional, biaya tersembunyi, dan limitasi kapasitas).
   - Output hasil kurasi disajikan dalam tabel perbandingan markdown yang rapi dan responsif.

5. **Jadwal Termin Pembayaran & Verifikasi Instan**
   - Kalkulasi otomatis pembuatan termin (DP 30% dan Pelunasan 70%, atau termin persentase kustom).
   - **Auto-Generation sisa termin**: Mendaftarkan DP otomatis membuat sisa pelunasan di bawahnya dengan jatuh tempo default pada hari-H pernikahan proyek.
   - Validasi ketat pencegahan data ganda untuk termin pembayaran yang sama di satu vendor.
   - Tombol verifikasi cepat (**Verifikasi** / **Terverifikasi**) langsung dari baris tabel rekap bagi pengguna berhak akses.

6. **Laporan Cetak Premium (PDF Optimized)**
   - Tata letak cetak dokumen yang dioptimalkan untuk PDF dengan margin halaman yang elegan, pembatasan pemotongan baris tabel (`page-break-inside: avoid`), dan watermark transparan **AURA** sebagai penanda keaslian dokumen draf.

---

## 🛠️ Teknologi yang Digunakan

* **Frontend**: HTML5 (Struktur Semantik), CSS Vanilla (Custom style & print layout), Tailwind CSS CDN (Utility classes).
* **Logic**: Vanilla JavaScript ES6 (Asynchronous Fetch, Base64 File Reader, Local Storage caching).
* **AI Engine**: Google Gemini API (Model fallback: `gemini-2.5-flash` / `gemini-1.5-flash`).
* **Cloud Database (Opsional)**: Google Sheets (Google Apps Script serverless backend).

---

## 📂 Struktur Berkas

```text
wedding_planner_v2/
│
├── index.html          # Gerbang masuk login & pemilihan profil tenant
├── admin.html          # Panel Superadmin Console untuk kelola proyek & peran user
├── dashboard.html      # Workspace utama pencarian, filter, dan komparasi vendor
├── rekap.html          # Kasir pelacakan termin pembayaran dan cetak PDF laporan
│
├── css/
│   └── style.css       # Custom stylesheet untuk transisi modal iOS & print layouts
│
└── js/
    ├── admin.js        # Logika manajemen tenant Superadmin (CRUD proyek & peran)
    ├── app.js          # Pengontrol logika dashboard workspace & live sync Sheets
    └── rekap.js        # Pengontrol tabel pembayaran, bukti transfer & verifikasi
```

---

## 🚀 Panduan Memulai (Setup Git & Repository)

Untuk membuat repositori lokal dan menghubungkannya dengan akun GitHub/GitLab Anda, ikuti langkah-langkah di bawah ini melalui terminal/command prompt:

1. **Inisialisasi Git Lokal**:
   ```bash
   git init
   ```

2. **Tambahkan Seluruh Berkas**:
   ```bash
   git add .
   ```

3. **Lakukan Commit Pertama**:
   ```bash
   git commit -m "Initial commit: AURA Wedding Planner v2 dengan Fitur Live Sync & Verifikasi Pembayaran"
   ```

4. **Hubungkan ke Repositori Remote (GitHub/GitLab)**:
   Buat repositori baru di GitHub, lalu jalankan perintah:
   ```bash
   git branch -M main
   git remote add origin https://github.com/USERNAME/NAMA-REPO.git
   git push -u origin main
   ```
