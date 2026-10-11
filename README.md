# RCL P/L System

Dashboard laporan kegiatan **PT. Raya Cakrawala Logistik**. Data dibaca langsung (live) dari Google Sheets.

## Halaman
- **Login** — akun disimpan di server dan sama untuk semua perangkat. Saat server pertama kali dipakai, buat akun admin; setelah itu semua orang masuk dengan username & password dari admin
- **Pengguna** (admin) — tambah pengguna, hapus pengguna, atur ulang password
- **P/L** — sales, cost, margin per Job Order, kontainer dikerjakan, biaya per vendor & jenis
- **Piutang / Hutang** — outstanding, umur piutang/hutang, status jatuh tempo
- **Invoice** — generate invoice per JO dengan kop surat, bisa diedit + catatan, cetak / simpan PDF
- **Quotation** — surat penawaran harga dengan kop surat, cetak / simpan PDF

## Cara menjalankan
Butuh Node.js 18+ (tanpa `npm install`, tidak ada dependency).

```bash
npm run dev
```

lalu buka http://localhost:5173/. Server lokal menyimpan akun di `server/data/` (tidak ikut di-commit).

## Produksi
- `server/auth-server.js` berjalan sebagai service (port 3223, hanya localhost) dan menangani `/api/*`: login, logout, dan kelola pengguna.
- nginx menyajikan `dashboard-rcl.html` + `assets/` dan meneruskan `/api/` ke service tersebut.
- Akun: `DATA_DIR/users.json` (password di-hash scrypt). Sesi: cookie HttpOnly bertanda tangan, 30 hari dengan "Ingat saya". Mengatur ulang password mengeluarkan pengguna dari semua perangkat.
- 5 kali salah password per username → dikunci 5 menit.

## Konfigurasi
Atur `CONFIG.SHEET_ID` di bagian `<script>` pada `dashboard-rcl.html`. Spreadsheet harus dibagikan sebagai **Anyone with the link · Viewer**.

Draf invoice/quotation dan data kop surat disimpan di browser (localStorage) masing-masing perangkat.
