/** Peladen statis + jalur "tambah data" untuk dashboard Wondr Merchant.
 *
 *   node serve.mjs [port] [--sumber C:\dt] [--engine PATH] [--host 127.0.0.1]
 *
 * Tanpa API-nya, ini hanya peladen berkas. Dengan API-nya, tombol di tab Mutu data bisa
 * mengunggah ekspor .csv/.xlsx lalu membangun ulang seluruh angka — tanpa perintah apa pun.
 *
 * Guard yang sengaja dipasang:
 *  - hanya listen di 127.0.0.1 (tidak tertulis ke antrean) supaya folder data tidak bisa
 *    ditulisi dari jaringan lokal;
 *  - nama berkas dipotong ke basename, ekstensi dibatasi, isi dibatasi ukurannya;
 *  - berkas dengan ISI yang sama persis ditolak (mencegah satu ekspor terhitung dua kali);
 *  - hasil baru TIDAK tayang kalau baterai pemeriksaan (npm run audit) masih menemukan BEDA.
 */
import { createServer } from 'node:http';
import { readFile, readdir, stat, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { extname, join, normalize, resolve, basename, sep } from 'node:path';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const PORT = +(argv.find(a => /^\d+$/.test(a)) || 4173);
const HOST = arg('host', '127.0.0.1');
const ROOT = resolve(arg('root', process.cwd()));
const MAKS_UKURAN = 400 * 1024 * 1024;
const EKSTENSI = new Set(['.csv', '.xlsx']);
// Sumber deret unduhan aplikasi. Default = tab "Jumlah Download" milik user; bisa diganti lewat
// --sheet-url / env WONDR_SHEET_URL. Halaman tetap offline-first: penarikan hanya terjadi saat
// tombol ditekan (proses peladen lokal ini), BUKAN saat halaman dirender.
const NAMA_UNDUHAN = 'Unduhan_PlayStore.csv';
const SHEET_URL = arg('sheet-url', process.env.WONDR_SHEET_URL
  || 'https://docs.google.com/spreadsheets/d/1f7xpDZc7Dl5pCSJL535kovpNgys2gC9_nS_MoWwm-MM/gviz/tq?tqx=out:csv&gid=828110846');

async function bacaJson(f) { try { return JSON.parse(await readFile(f, 'utf8')); } catch { return null; } }

/* ---------- dari mana kita membangun? ---------- */
async function cariEngine() {
  const kandidat = [];
  if (arg('engine', '')) kandidat.push(resolve(arg('engine')));
  if (process.env.WONDR_ENGINE) kandidat.push(resolve(process.env.WONDR_ENGINE));
  const pointer = await bacaJson(join(ROOT, 'data', 'engine.json'));
  if (pointer?.root) kandidat.push(resolve(pointer.root));
  kandidat.push(ROOT);
  for (const k of kandidat) {
    if (existsSync(join(k, 'scripts', 'build-db.mjs')) && existsSync(join(k, 'node_modules', '@duckdb', 'node-api'))) return k;
  }
  return null;
}

const ENGINE = await cariEngine();
const META = (await bacaJson(join(ROOT, 'data', 'db-meta.json'))) || (ENGINE ? await bacaJson(join(ENGINE, 'data', 'db-meta.json')) : null) || {};
const SUMBER = resolve(arg('sumber', META.sumber || 'C:\\dt'));
const DB = join(SUMBER, 'wondr.duckdb');

const TIPE = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.geojson': 'application/geo+json', '.woff2': 'font/woff2',
};

/** Jenis ekspor dikenali dari ISI header — sama aturannya dengan scripts/build-db.mjs. */
function kenali(headerCsv) {
  const s = new Set(headerCsv.replace(/^/, '').split(/[,\t;]/).map(x => x.trim().replace(/^"|"$/g, '')));
  if (s.has('Nilai Penjualan (Rp)')) return 'transaksi';
  if (s.has('Hari Sejak Login Terakhir')) return 'aktivitas';
  if (s.has('Tipe Merchant') && s.has('Status') && s.has('Kabupaten/Kota')) return 'pendaftaran';
  if (/download/i.test(headerCsv)) return 'unduhan';
  return null;
}

const daftarBerkas = async () => {
  const nama = (await readdir(SUMBER).catch(() => [])).filter(f => EKSTENSI.has(extname(f).toLowerCase())).sort();
  const out = [];
  for (const f of nama) {
    const st = await stat(join(SUMBER, f)).catch(() => null);
    out.push({ nama: f, ukuran: st?.size ?? 0, diubah: st?.mtime?.toISOString?.() ?? null });
  }
  return out;
};

const sha1 = buf => createHash('sha1').update(buf).digest('hex');
const hashBerkas = async f => sha1(await readFile(join(SUMBER, f)));

let sedangSibuk = false;
const jalan = (perintah, args, cwd) => new Promise(res => {
  const p = spawn(perintah, args, { cwd, windowsHide: true });
  let keluaran = '';
  const tampung = d => { keluaran += d.toString(); if (keluaran.length > 200000) keluaran = keluaran.slice(-160000); };
  p.stdout.on('data', tampung); p.stderr.on('data', tampung);
  p.on('close', kode => res({ kode, keluaran }));
});

async function bangun() {
  const langkah = [];
  const tahap = async (nama, args) => {
    const t0 = Date.now();
    const r = await jalan(process.execPath, args, ENGINE);
    langkah.push({ nama, ms: Date.now() - t0, ok: r.kode === 0, ekor: r.keluaran.trim().split('\n').slice(-4).join(' | ') });
    if (r.kode !== 0) throw new Error(nama + ' gagal:\n' + r.keluaran.slice(-2500));
    return r;
  };
  await tahap('baca ekspor → DuckDB', [join(ENGINE, 'scripts', 'build-db.mjs'), SUMBER, DB]);
  await tahap('DuckDB → angka siap pakai', [join(ENGINE, 'scripts', 'build-data.mjs'), DB]);
  const audit = await tahap('pemeriksaan 59 angka', [join(ENGINE, '.qoder', 'skills', 'audit-angka', 'scripts', 'audit-angka.mjs'),
    '--db', DB, '--json', join(ENGINE, 'data', 'dash.json'), '--checks', join(ENGINE, 'data', 'db-checks.json')]);
  const ringkas = /(\d+) pemeriksaan · (\d+) OK · (\d+) WASIS · (\d+) BEDA/.exec(audit.keluaran);
  const hasil = ringkas ? { total: +ringkas[1], ok: +ringkas[2], wasis: +ringkas[3], beda: +ringkas[4] } : null;
  if (!hasil) throw new Error('baterai pemeriksaan tidak menghasilkan ringkasan — build baru tidak ditayangkan.');
  if (hasil.beda > 0) {
    const baris = audit.keluaran.split('\n').filter(l => l.trim().startsWith('BEDA')).slice(0, 6).join('\n');
    throw new Error('Pemeriksaan menemukan ' + hasil.beda + ' angka yang tidak cocok antar jalur. Build baru TIDAK ditayangkan.\n' + baris);
  }
  for (const f of ['dash.json', 'db-meta.json', 'db-checks.json']) {
    await mkdir(join(ROOT, 'data'), { recursive: true });
    const aslinya = join(ROOT, 'data', f);
    if (existsSync(aslinya)) await copyFile(aslinya, aslinya + '.sebelum');
    await copyFile(join(ENGINE, 'data', f), aslinya);
  }
  const metaBaru = await bacaJson(join(ROOT, 'data', 'db-meta.json'));
  return { langkah, audit: hasil, snapshot: metaBaru?.snapshot, berkas: metaBaru?.file };
}

async function simpanBerkas(namaAsli, isi) {
  const nama = basename(String(namaAsli || '')).replace(/[\\/:*?"<>|]/g, '_');
  const ek = extname(nama).toLowerCase();
  if (!EKSTENSI.has(ek)) return { ditolak: 'ekstensi ' + (ek || '(tanpa ekstensi)') + ' bukan .csv/.xlsx' };
  if (!isi.length) return { ditolak: 'berkas kosong' };
  if (isi.length > MAKS_UKURAN) return { ditolak: 'ukuran ' + (isi.length / 1048576).toFixed(0) + ' MB di atas batas ' + (MAKS_UKURAN / 1048576) + ' MB' };
  const h = sha1(isi);
  for (const b of await daftarBerkas()) {
    if (b.ukuran !== isi.length) continue;
    if (await hashBerkas(b.nama) === h) return { sudahAda: b.nama, pesan: 'isi berkas ini sudah ada di folder sumber, jadi tidak disimpan dua kali' };
  }
  let tujuan = nama;
  if (existsSync(join(SUMBER, nama))) {
    const stem = basename(nama, ek);
    let k = 2;
    while (existsSync(join(SUMBER, stem + '-' + k + ek))) k++;
    tujuan = stem + '-' + k + ek;
  }
  const jenis = ek === '.csv' ? kenali((isi.subarray(0, 4096).toString('utf8').split(/\r?\n/)[0] || '')) : 'menunggu';
  if (jenis === null) {
    return { ditolak: 'baris pertama tidak dikenali sebagai salah satu ekspor. Penanda yang dipakai: "Nilai Penjualan (Rp)" = transaksi, "Hari Sejak Login Terakhir" = aktivitas, atau Tipe Merchant + Status + Kabupaten/Kota = pendaftaran.' };
  }
  await writeFile(join(SUMBER, tujuan), isi);
  return { tersimpan: tujuan, jenis, ukuran: isi.length, hash: h.slice(0, 10), peringatan: jenis === 'menunggu' ? 'jenis berkas Excel baru diketahui saat build' : '' };
}

/** Ambil deret unduhan dari Google Sheet (server-side), tulis menimpa satu berkas tetap, lalu bangun.
 *  Sheet = sumber kebenaran seluruh deret, jadi satu berkas ditimpa tiap sinkron (bukan akumulasi
 *  berkas bertanggal yang membuat satu periode terhitung dua kali). Semua angka tetap lewat
 *  gerbang audit di bangun() — hasil BEDA tidak ditayangkan.
 *  Isi dibandingkan byte-per-byte dengan berkas yang tersimpan: kalau sama, build tidak dijalankan
 *  dan pemanggil diberi tahu bahwa tidak ada yang baru (periode = baris data di sheet). */
async function tarikSheet() {
  const t = await fetch(SHEET_URL, {
    redirect: 'follow', signal: AbortSignal.timeout(25000), headers: { 'user-agent': 'wondr-dashboard-sync/1.0' },
  });
  if (!t.ok) throw new Error('Google menolak (HTTP ' + t.status + ') — pastikan sheet dibagi "siapa saja dengan tautan", atau pakai unggah manual.');
  const teks = await t.text();
  if (teks.length > MAKS_UKURAN) throw new Error('isi sheet ' + (teks.length / 1048576).toFixed(0) + ' MB, di atas batas ' + (MAKS_UKURAN / 1048576) + ' MB');
  const baris = teks.replace(/^/, '').split(/\r?\n/).filter(x => x.trim());
  if (baris.length < 2) throw new Error('sheet kosong atau hanya header — tidak ada baris unduhan.');
  if (!/download/i.test(baris[0])) throw new Error('baris pertama bukan ekspor unduhan (tidak ada kolom "Download"): ' + baris[0].slice(0, 120));
  const isi = Buffer.from(baris.join('\r\n') + '\r\n', 'utf8');
  await mkdir(SUMBER, { recursive: true });
  const tujuan = join(SUMBER, NAMA_UNDUHAN);
  const periode = baris.length - 1;
  const lama = existsSync(tujuan) ? await readFile(tujuan) : null;
  if (lama && lama.equals(isi)) return { berkas: NAMA_UNDUHAN, periode, sama: true, dibangun: false, snapshot: META.snapshot || null };
  await writeFile(tujuan, isi);
  const hasil = await bangun();
  return { ...hasil, berkas: NAMA_UNDUHAN, periode, sama: false, dibangun: true };
}

const kirim = (res, kode, obj) => { res.writeHead(kode, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };const bodyMentah = req => new Promise((res, rej) => {
  const bagian = []; let n = 0;
  req.on('data', c => { n += c.length; if (n > MAKS_UKURAN) { rej(new Error('terlalu besar')); req.destroy(); } else bagian.push(c); });
  req.on('end', () => res(Buffer.concat(bagian)));
  req.on('error', rej);
});

createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const jalur = decodeURIComponent(u.pathname);

  if (jalur.startsWith('/api/')) {
    try {
      if (jalur === '/api/status' && req.method === 'GET') {
        const berkas = await daftarBerkas();
        const dbSt = existsSync(DB) ? await stat(DB) : null;
        return kirim(res, 200, {
          sumber: SUMBER, engine: ENGINE, bisaBangun: !!ENGINE,
          snapshot: META.snapshot || null, jendelaBulan: META.jendelaBulan || null,
          jumlah: { csv: berkas.length, totalUkuran: berkas.reduce((a, b) => a + b.ukuran, 0) },
          berkas, db: dbSt ? { ada: true, ukuran: dbSt.size, diubah: dbSt.mtime.toISOString() } : { ada: false },
          sibuk: sedangSibuk,
        });
      }
      if (jalur === '/api/data' && req.method === 'POST') {
        if (!ENGINE) return kirim(res, 503, { error: 'mesin build tidak ditemukan — jalankan lewat folder proyek (yang ada node_modules)' });
        const isi = await bodyMentah(req);
        return kirim(res, 200, await simpanBerkas(u.searchParams.get('nama'), isi));
      }
      if (jalur === '/api/build' && req.method === 'POST') {
        if (!ENGINE) return kirim(res, 503, { error: 'mesin build tidak ditemukan' });
        if (sedangSibuk) return kirim(res, 409, { error: 'masih ada build yang berjalan' });
        sedangSibuk = true;
        try { return kirim(res, 200, { ok: true, ...(await bangun()) }); }
        finally { sedangSibuk = false; }
      }
      if (jalur === '/api/sync-sheet' && req.method === 'POST') {
        if (!ENGINE) return kirim(res, 503, { error: 'mesin build tidak ditemukan — jalankan peladen dari folder proyek yang ada node_modules-nya' });
        if (sedangSibuk) return kirim(res, 409, { error: 'masih ada build yang berjalan' });
        sedangSibuk = true;
        try { return kirim(res, 200, { ok: true, ...(await tarikSheet()) }); }
        catch (e) { return kirim(res, 500, { error: String(e?.message || e) }); }
        finally { sedangSibuk = false; }
      }
      return kirim(res, 404, { error: 'endpoint tidak ada' });
    } catch (e) {
      return kirim(res, 500, { error: String(e?.message || e) });
    }
  }

  let berkasStatis = jalur === '/' ? 'index.html' : jalur;
  // Repo ini hanya berisi kode — hasil build dari ekspor asli tidak ikut terkirim.
  // Maka klone baru dilayani dengan data/dash.contoh.json (nama merchant & MID dikarang) supaya halaman tidak kosong.
  if (berkasStatis === '/data/dash.json' && !existsSync(join(ROOT, berkasStatis)) && existsSync(join(ROOT, 'data', 'dash.contoh.json'))) {
    berkasStatis = '/data/dash.contoh.json';
  }
  const file = normalize(join(ROOT, berkasStatis));
  if (!file.startsWith(ROOT + sep) && file !== ROOT) { res.writeHead(403).end('403'); return; }
  try {
    const isi = await readFile(file);
    res.writeHead(200, { 'content-type': TIPE[extname(file).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(isi);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('404 ' + jalur);
  }
}).listen(PORT, HOST, () => console.log([
  `http://${HOST}:${PORT}/`,
  'folder sumber : ' + SUMBER,
  'mesin build   : ' + (ENGINE || 'TIDAK ADA — tombol tambah data akan melapor, bukan diam-diam gagal'),
].join('\n')));
