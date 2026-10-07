/** Menyalin dashboard siap-pakai ke folder data, supaya semua ada di satu tempat.
 *  Cara pakai: node scripts/deploy.mjs [TUJUAN]  (default C:\dt\wondr-dashboard) */
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const TUJUAN = path.resolve(process.argv[2] || 'C:\\dt\\wondr-dashboard');
const BUTIRAN = [
  'index.html', 'app.js', 'styles.css',
  'data/dash.json', 'data/peta.json',
  'vendor/echarts.min.js',
  'vendor/fonts/fonts.css', 'vendor/fonts/saira-1.woff2', 'vendor/fonts/saira-2.woff2', 'vendor/fonts/saira-3.woff2',
  'scripts/serve.mjs',
];

for (const f of BUTIRAN) {
  await mkdir(path.dirname(path.join(TUJUAN, f)), { recursive: true });
  await cp(path.resolve(f), path.join(TUJUAN, f));
}
await cp(path.join(TUJUAN, 'scripts/serve.mjs'), path.join(TUJUAN, 'serve.mjs'));
const proyek = process.cwd();
await writeFile(path.join(TUJUAN, 'data', 'engine.json'), JSON.stringify({
  root: proyek,
  catatan: 'folder tempat node_modules + scripts/build-*.mjs berada; serve.mjs memakai ini untuk tombol Tambah Data',
}, null, 1));
const meta = JSON.parse(await readFile('data/db-meta.json', 'utf8'));
await writeFile(path.join(TUJUAN, 'README.txt'), [
  'Wondr Merchant - dashboard analisa aktivitas merchant',
  'Snapshot data: ' + meta.snapshot + '   Dibangun: ' + meta.dibuatPada.slice(0, 16).replace('T', ' '),
  '',
  'JALANKAN',
  '  node serve.mjs 4173      lalu buka http://localhost:4173/',
  '',
  'TAMBAH DATA BARU (tanpa perintah apa pun)',
  '  1. buka halaman, masuk menu "Mutu data", kartu paling atas: Tambah Data',
  '  2. seret atau pilih berkas .csv / .xlsx hasil ekspor, lalu tekan "Unggah & bangun ulang"',
  '  3. halaman memuat sendiri; tab Mutu data menampilkan berapa berkas masuk dan hasil pemeriksaannya',
  '',
  '  Yang dilakukan tombol itu: menyimpan berkas ke ' + meta.sumber + ' (isi yang sama ditolak, jadi',
  '  satu ekspor tidak terhitung dua kali), membangun ulang DuckDB + angka siap pakai, menjalankan',
  '  62 pemeriksaan angka, dan HANYA menayangkan hasil baru kalau tidak ada yang tidak cocok.',
  '  Alternatif tanpa browser: tumpukkan berkas ke ' + meta.sumber + ' lalu tekan tombol yang sama,',
  '  atau jalankan  npm run sync  dari folder proyek ' + proyek,
  '',
  '  Jenis file dikenali dari ISI header, bukan dari nama file:',
  '    ada kolom "Nilai Penjualan (Rp)"      -> transaksi',
  '    ada "Hari Sejak Login Terakhir"       -> aktivitas',
  '    ada "Tipe Merchant" + Status + Kabupaten/Kota -> pendaftaran',
  '  File lain di folder yang sama diabaikan dan dilaporkan di konsol build.',
  '  Satu MID yang muncul di beberapa ekspor diselesaikan dengan aturan: ekspor terbaru menang.',
  '',
  'ISI FOLDER',
  '  index.html app.js styles.css    tampilan (gaya Velzon Galaxy; font Saira ikut tersalin, offline)',
  '  data/dash.json                  seluruh angka yang ditampilkan, hasil mart DuckDB',
  '  data/peta.json                  batas 38 provinsi Indonesia (CC BY 4.0)',
  '  vendor/echarts.min.js           library grafik, offline',
  '  vendor/fonts/                   Saira variable, offline',
  '',
  'Di luar folder ini: ' + meta.db + ' (DuckDB) dan skrip sumber di node_modules proyek.',
].join('\r\n'));

console.log('Tersalin ke', TUJUAN);
let total = 0;
for (const f of BUTIRAN) {
  const isi = await readFile(path.join(TUJUAN, f));
  total += isi.length;
  console.log(`  ${f.padEnd(30)} ${(isi.length / 1024).toFixed(0)} KB`);
}
console.log(`  ${'TOTAL'.padEnd(30)} ${(total / 1048576).toFixed(2)} MB`);
