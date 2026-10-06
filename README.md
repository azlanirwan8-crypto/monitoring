# Wondr Merchant — dashboard analisa aktivitas merchant

Dashboard analitik untuk data aktivitas aplikasi **Wondr Merchant**: sebaran wilayah, retensi
login, nilai transaksi, dan mutu datanya sendiri. Jalan sepenuhnya lokal — tanpa cloud, tanpa
API pihak ketiga, tanpa koneksi internet setelah `npm install`.

Angka sumber: hasil ekspor (`.csv` / `.xlsx`) yang ditumpuk di satu folder. Pipeline membacanya,
menyimpan ke DuckDB, lalu menuliskan seluruh angka yang dibaca browser ke satu berkas JSON.

## Jalan cepat (tanpa data sendiri)

```bash
npm install
node scripts/serve.mjs 4173    # buka http://localhost:4173/
```

Repo ini tidak membawa data merchant asli. Kalau `data/dash.json` belum ada, peladen otomatis
menayangkan `data/dash.contoh.json` — 750 merchant dan 1.200 pendaftar yang **seluruh** nama,
MID, NMID dan MPAN-nya dikarang. Penandanya ikut tampil di kanan atas halaman (`DATA CONTOH`),
supaya angka karangan tidak kebetulan dilaporkan sebagai angka nyata.

Bangkit ulang contoh (hasilnya deterministik, hanya cap waktu yang berubah):

```bash
node scripts/contoh.mjs        # tulis data/dash.json sintetis; ditolak kalau isinya data asli
```

## Pakai data sendiri

1. Taruh hasil ekspor di satu folder, misalnya `C:\dt`.
2. `node scripts/build-db.mjs C:\dt` lalu `node scripts/build-data.mjs` — atau `npm run sync`
   kalau folder tujuannya memang `C:\dt`.
3. Buka halaman, menu **Mutu data** → kartu **Tambah data**: seret berkas `.csv`/`.xlsx`, tekan
   satu tombol "Unggah & bangun ulang". Halaman membangun ulang, memeriksa, lalu memuat sendiri.

Jenis ekspor dikenali dari **isi baris pertama**, bukan dari nama berkas:

| Penanda kolom | Jenis |
|---|---|
| `Nilai Penjualan (Rp)` | transaksi |
| `Hari Sejak Login Terakhir` | aktivitas |
| `Tipe Merchant` + `Status` + `Kabupaten/Kota` | pendaftaran |

Berkas lain di folder yang sama diabaikan dan dilaporkan saat build. Satu MID yang muncul di
beberapa ekspor diselesaikan dengan aturan: ekspor terbaru menang.

## Pemeriksaan angka

```bash
npm run audit
```

55 pemeriksaan di tiga kelompok: kontrak numerik payload, hitung ulang lewat SQL ke DuckDB
(jalur bebas dari yang dipakai tampilan), dan kebenaran rumus — Gini diuji dengan dua implementasi
sekaligus dan divalidasi pada data sintetis yang jawabannya diketahui. Keluarannya `OK / WASIS / BEDA`:

- `WASIS` = bukan salah hitung: pertentangan di dalam berkas sumber, atau dua basis populasi yang
  memang beda. Angka ini tetap ditampilkan di tab Mutu data, tidak disembunyikan.
- `BEDA` = dua jalur hitung tidak cocok. Tombol "Unggah & bangun ulang" **menolak menayangkan**
  hasil build yang masih punya `BEDA`.

## Struktur

```
index.html app.js styles.css   tampilan (satu halaman, offline, tanpa framework)
db/schema.sql                  raw.* → fact.* → mart.* + makro normalisasi tanggal/angka/segmen
data/peta.json                 batas wilayah siap gambar
data/dash.contoh.json          payload sintetis untuk klone baru (lihat Jalan cepat)
scripts/build-db.mjs           baca ekspor → DuckDB
scripts/build-data.mjs         DuckDB → data/dash.json (angka yang dibaca browser)
scripts/contoh.mjs             pembangkit data contoh sintetis
scripts/serve.mjs              peladen statis + API tambah data (hanya listen 127.0.0.1)
scripts/deploy.mjs             salin berkas siap-pakai ke folder lain
.qoder/skills/audit-angka/     baterai pemeriksaan (dijalankan lewat `npm run audit` atau skill /audit-angka)
vendor/                        ECharts (MIT), font Saira (OFL), batas wilayah Indonesia (CC BY 4.0)
```

## Yang tidak bisa dihitung dari data ini

Ditampilkan juga di tab Mutu data, supaya tidak ada angka yang terlihat pasti padahal tidak:

- **Tingkat aktivasi pendaftar.** Berkas pendaftaran dan berkas aktivitas adalah dua populasi
  berbeda yang hanya beririsan sebagian; rasio "dari terdaftar" mengukur irisan itu.
- Tren harian, ukuran keranjang, rasio gagal bayar, dan fitur aplikasi yang dipakai — ekspor hanya
  berisi satu angka agregat per merchant pada satu jendela tetap.
- Perbandingan antar bulan yang adil: bulan terakhir pada ekspor belum penuh.

## Privasi

Yang terdorong ke repositori: kode, `db/schema.sql`, `data/peta.json`, `vendor/`, skill audit,
dan `data/dash.contoh.json` yang isinya karangan semua.

Yang di-`.gitignore` dan tidak boleh terdorong: `data/dash.json`, `data/db-meta.json`,
`data/db-checks.json` serta salinan `.sebelum`-nya — ketiganya adalah hasil build dari ekspor asli
dan berisi nama merchant, MID, MPAN beserta nilai transaksinya. Jangan menghapus entri itu dari
`.gitignore`, dan jangan mendorong hasil build data asli ke repositori publik. Sebelum mendorong,
`git status` sebaiknya tidak menampilkan satu pun berkas di bawah `data/` selain `peta.json` dan
`dash.contoh.json`.

## Lisensi

- ECharts 5.5.1 — MIT (`vendor/echarts.min.js`)
- Font Saira — SIL Open Font License (`vendor/fonts/`)
- Batas wilayah Indonesia 38 provinsi — CC BY 4.0, denyherianto (`vendor/indonesia-38-provinces.geojson`)
