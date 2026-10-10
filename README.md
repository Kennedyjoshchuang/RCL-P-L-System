# RCL P/L System

Dashboard laporan kegiatan **PT. Raya Cakrawala Logistik**. Data dibaca langsung (live) dari Google Sheets.

## Halaman
- **P/L** — sales, cost, margin per Job Order, kontainer dikerjakan, biaya per vendor & jenis
- **Piutang / Hutang** — outstanding, umur piutang/hutang, status jatuh tempo
- **Invoice** — generate invoice per JO dengan kop surat, bisa diedit + catatan, cetak / simpan PDF
- **Quotation** — surat penawaran harga dengan kop surat, cetak / simpan PDF

## Cara menjalankan
Buka `dashboard-rcl.html` di browser (klik dua kali), atau jalankan server lokal:

```bash
npx http-server -p 5173
```

lalu buka http://localhost:5173/dashboard-rcl.html.

## Konfigurasi
Atur `CONFIG.SHEET_ID` di bagian `<script>` pada `dashboard-rcl.html`. Spreadsheet harus dibagikan sebagai **Anyone with the link · Viewer**.

Draf invoice/quotation dan data kop surat disimpan di browser (localStorage) masing-masing pengguna.
