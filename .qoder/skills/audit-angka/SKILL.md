---
name: audit-angka
description: Ahli matematika untuk memverifikasi perhitungan dan grafik dashboard analitik — menghitung ulang tiap angka lewat dua jalur bebas (SQL ke DuckDB dan payload JSON yang dibaca browser), membuktikan rumus statistik dengan data sintetis, dan menandai angka yang tidak bisa dipertanggungjawabkan. Gunakan saat diminta memastikan hitungan benar, mengecek konsistensi kartu/grafik, sebelum menyetujui "100% benar", atau setelah npm run sync / rebuild data.
---

# Audit angka dashboard analitik

## Prinsip

Jangan pernah membuktikan kebenaran sebuah angka dengan jalur yang sama saat angka itu dibuat.
Setiap klaim harus punya **dua perhitungan independen** yang bertemu. Kalau hanya ada satu jalur,
statusnya bukan "benar" melainkan "belum diuji".

Tiga tingkat yang harus cocok, dan biasanya justru di sinilah letak kesalahan:

1. **Aritmetika** — penjumlahan, pembagian, persen. Hampir selalu benar.
2. **Rumus** — Gini, HHI, median, kuantil, rata-rata tertimbang vs sederhana. Sering salah implementasi.
3. **Semantik** — angka ini *populasi* siapa, pada *jendela* berapa, dengan *penyebut* apa.
   Ini yang paling sering menipu direksi, dan tidak terdeteksi oleh tes aritmetika.

Katakan "terukur cocok pada N pemeriksaan" bukan "100% benar". Selalu sebutkan yang **tidak**
terverifikasi, dan yang **tidak bisa** dihitung dari data itu.

## Alur kerja

### 1. Jalankan baterai pemeriksaan

```bash
node .qoder/skills/audit-angka/scripts/audit-angka.mjs            # penuh (butuh DuckDB)
node .qoder/skills/audit-angka/scripts/audit-angka.mjs --tanpa-db  # hanya kontrak payload
```

Script membandingkan `data/dash.json` (yang dibaca browser) dengan hasil hitung ulang SQL, plus
menguji rumus pada data sintetis. Baca artinya:

- `OK` — dua jalur bertemu.
- `WASIS` — bukan salah hitung: pertentangan di dalam file sumber, atau dua basis populasi yang
  memang beda. Tetap harus **disebut di UI**, tidak boleh disembunyikan.
- `BEDA` — salah. Jangan pakai angka itu sebelum penyebabnya ketemu; exit code 1.

Tambah pemeriksaan baru ke `baris`/`cek(...)` alih-alih menulis skrip sekali pakai.

### 2. Uji klaim yang belum tercakup

Bila angka yang dipertanyakan tidak ada di baterai, tulis pemeriksaannya di script (permanen),
lalu jalankan. Rumus yang harus selalu diuji dengan **data sintetis yang diketahui jawabannya** —
lihat `references/identitas-numerik.md`:

- seluruh nilai sama besar → Gini 0, HHI 10000/n, semua share 1/n, korelasi tak terdefinisi
- satu pemegang seluruh nilai → Gini (n−1)/n, HHI 10000
- n = 0 dan n = 1 → tidak boleh NaN/Infinity yang ikut tampil ke layar

### 3. Cocokkan grafik dengan angkanya

Grafik bisa benar datanya tapi salah bacanya. Cara cepat dan hanya-baca:

```js
const ins = echarts.getInstanceByDom(document.getElementById('cFunnel'));
const o = ins.getOption();          // bandingkan o.series[0].data dengan angka kartu
```

Periksa: sumbu kategori vs urutan, apakah bilah corong monoton-turun, apakah dua angka bertetangga
memakai sumber yang sama, dan apakah label tidak mengklaim "naik/turun" pada bulan yang tidak penuh
terekspor. Detail jebakan pengukuran di browser: `references/cek-grafik.md`.

### 4. Audit semantik (bagian yang paling sering bolong)

Untuk tiap angka, tulis dalam satu kalimat: **populasi × jendela × penyebut**. Lalu cek:

- **Irisan bukan subset.** Kalau tahap corong bisa membesar di bawah, itu bukan corong — tambahkan
  kolom irisan di mart, jangan ganti warnanya.
- **Dua label sama, dua populasi beda.** Contoh nyata di proyek ini: "Nilai transaksi" Rp 891,67 M
  (basis pendaftaran) dan Rp 13,79 T (basis aktivitas). Solusinya nama, bukan angka.
- **Delta pada jendela tak penuh.** Pertumbuhan antar kohort bulan berjalan = artefak tanggal ekspor.
- **Rata-rata dari rasio ≠ rasio dari rata-rata.** Untuk "per bulan" pakai median rasio sumber, dan
  tunjukkan sebarannya (di sini 8,77 bulan; 35 baris menyimpang ke 9–10).
- **Penyebut nol/NaN.** Setiap `a/b` butuh `nullif` atau guard, dan UI tidak boleh menampilkan `NaN`.
- **Kode kamus.** Indeks ke daftar dimensi wajib dijamin dalam rentang; kalau tidak, label bulan
  bisa muncul di kolom usia (pernah terjadi: "2026-05" vs "0 hari").

### 5. Putuskan dan laporkan

Laporan selalu berisi empat blok, berurutan:

1. **Tabel rekonsiliasi** — angka di layar, angka hitung ulang, status. Berdampingan, bukan narasi.
2. **Yang tadinya salah dan sudah diperbaiki** — dengan sebelum/sesudah.
3. **Yang tidak bisa dihitung dari data ini** — dan di UI angka itu sekarang disebut apa.
4. **Yang belum terverifikasi** — misalnya kerapatan visual pada lebar layar 1440 px bila browser
   pengukuran cuma 510 px.

Bila pemeriksaan menemukan cacat struktural (bukan salah ketik), perbaiki di lapisan paling hulu:
`db/schema.sql` → `scripts/build-data.mjs` → `app.js`, lalu `npm run build && npm run deploy`
dan jalankan ulang baterai ini sampai `0 BEDA`.

Kartu **Tambah data** di tab Mutu data menjalankan ketiga langkah ini lewat tombol
(`POST /api/build` di `scripts/serve.mjs`) dan menolak menayangkan hasil kalau baterai ini
masih menemukan BEDA — jadi setelah sinkronisasi apa pun, `0 BEDA` adalah syarat tayang,
bukan laporan setelahnya.

## Batas

- Script ini hanya-baca terhadap `C:\dt\wondr.duckdb` dan `data/*.json`.
- Angka sumber yang saling bertentangan tidak bisa "dibenerin" — hanya bisa ditandai dan dibuka.
- Satu MID tanpa pengisi daya (kolom MID kosong) memakai kunci pengganti; jangan disimpulkan unik.

## Resources

- `scripts/audit-angka.mjs` — baterai 59 pemeriksaan tiga grup (payload, database, rumus).
- `references/identitas-numerik.md` — katalog identitas & mode gagal yang harus diuji.
- `references/cek-grafik.md` — teknik memverifikasi grafik ECharts dan tata letak di browser.
