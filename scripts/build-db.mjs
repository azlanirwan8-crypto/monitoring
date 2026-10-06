/**
 * Membangun C:\dt\wondr.duckdb dari ekspor di folder sumber.
 * Cara pakai: node scripts/build-db.mjs [FOLDER_SUMBER] [PATH_DB]
 *
 * Mendukung .csv maupun .xlsx. Jenis file dikenali dari ISI header, bukan dari nama file,
 * jadi ekspor bulan depan (atau format baru) ikut terbaca selama kolomnya sama.
 * Untuk MID yang muncul di lebih dari satu file, ekspor terbaru yang dipakai.
 */
import { readdir, readFile } from 'node:fs/promises';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';

const SUMBER = path.resolve(process.argv[2] || 'C:\\dt');
const DB = path.resolve(process.argv[3] || path.join(SUMBER, 'wondr.duckdb'));
const SKEMA = path.resolve('db/schema.sql');

/* ---------- pisahkan pernyataan SQL, hormati string literal ---------- */
function pisah(sql) {
  const out = [];
  let buf = '', kutip = false;
  for (const c of sql) {
    if (c === "'") kutip = !kutip;
    if (c === ';' && !kutip) { out.push(buf); buf = ''; continue; }
    buf += c;
  }
  if (buf.trim()) out.push(buf);
  return out
    .map(s => s.split('\n').filter(l => !l.trim().startsWith('--')).join('\n').trim())
    .filter(Boolean);
}

const instance = await DuckDBInstance.create(DB);
const conn = await instance.connect();
const baca = async sql => (await conn.runAndReadAll(sql)).getRowObjects().map(o =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v])));

/* ---------- kenali berkas ---------- */
const berkas = (await readdir(SUMBER)).filter(f => /\.(csv|xlsx)$/i.test(f)).sort();
if (!berkas.length) { console.error(`Tidak ada .csv/.xlsx di ${SUMBER}`); process.exit(1); }

async function kolomCsv(f) {
  const isi = await readFile(path.join(SUMBER, f), 'utf8');
  return isi.split('\n', 1)[0].replace(/^/, '').trim().split(',').map(s => s.trim());
}
async function kolomXlsx(f) {
  const r = await baca(`describe select * from read_xlsx(${(`'${(SUMBER + '/' + f).replace(/\\/g, '/')}'`)}, header = true, all_varchar = true)`);
  return r.map(x => String(x.column_name).trim());
}

const kelas = new Map();
const headers = {};
for (const f of berkas) {
  let h;
  try { h = /\.xlsx$/i.test(f) ? await kolomXlsx(f) : await kolomCsv(f); }
  catch (e) { console.warn(`  diabaikan (gagal baca header): ${f} — ${String(e.message).slice(0, 80)}`); continue; }
  const s = new Set(h);
  const jenis = s.has('Nilai Penjualan (Rp)') ? 'transaksi'
    : s.has('Hari Sejak Login Terakhir') ? 'aktivitas'
    : (s.has('Tipe Merchant') && s.has('Status') && s.has('Kabupaten/Kota')) ? 'pendaftaran'
    : null;
  if (jenis) { kelas.set(f, jenis); headers[f] = h; }
}

const kelompok = { pendaftaran: [], aktivitas: [], transaksi: [] };
for (const [f, j] of kelas) kelompok[j].push(f);
const diabaikan = berkas.filter(f => !kelas.has(f));

if (!kelompok.pendaftaran.length || !kelompok.aktivitas.length || !kelompok.transaksi.length) {
  console.error('Kelompok file tidak lengkap:', JSON.stringify({ kelompok, diabaikan }, null, 1));
  process.exit(1);
}

const tanggal = berkas.map(f => (f.match(/(\d{4})(\d{2})(\d{2})/) || []).slice(1)).filter(a => a.length === 3)
  .map(a => `${a[0]}-${a[1]}-${a[2]}`).sort();
const snapshot = tanggal[tanggal.length - 1];

console.log(`Sumber ${SUMBER}`);
for (const k of Object.keys(kelompok)) {
  const x = kelompok[k].filter(f => /\.xlsx$/i.test(f)).length;
  console.log(`  ${k.padEnd(12)} ${String(kelompok[k].length).padStart(2)} file${x ? ` (${x} xlsx)` : ''}`);
}
if (diabaikan.length) console.log(`  diabaikan    ${diabaikan.join(', ')}`);
console.log(`  snapshot turunan dari nama ekspor: ${snapshot}`);

/* ---------- sumber per kelompok ---------- */
const petikan = f => `'${(SUMBER + '/' + f).replace(/\\/g, '/')}'`;
const satu = f => /\.xlsx$/i.test(f)
  ? `select *, ${petikan(f)} as sumber from read_xlsx(${petikan(f)}, header = true, all_varchar = true)`
  : `select *, ${petikan(f)} as sumber from read_csv(${petikan(f)}, header = true, all_varchar = true)`;
const gabungan = fs => fs.map(f => `(${satu(f)})`).join('\n  union all by name\n  ');

/* ---------- jalankan skema ---------- */
const skema = (await readFile(SKEMA, 'utf8'))
  .replaceAll('{{REG_SRC}}', gabungan(kelompok.pendaftaran))
  .replaceAll('{{ACT_SRC}}', gabungan(kelompok.aktivitas))
  .replaceAll('{{TXN_SRC}}', gabungan(kelompok.transaksi))
  .replaceAll('{{SNAPSHOT}}', `'${snapshot}'`);

await mkdir(path.dirname(DB), { recursive: true });
const pernyataan = pisah(skema);
const t0 = Date.now();
for (let i = 0; i < pernyataan.length; i++) {
  try { await conn.run(pernyataan[i]); }
  catch (e) {
    console.error(`\nPernyataan #${i + 1} gagal:\n${pernyataan[i].slice(0, 300)}\n\n${e.message}`);
    process.exit(1);
  }
}
console.log(`  ${pernyataan.length} pernyataan SQL selesai dalam ${((Date.now() - t0) / 1000).toFixed(1)} s`);

/* ---------- pemeriksaan ---------- */
const cek = {};
cek.baris = await baca(`select
  (select count(*) from raw.pendaftaran) as mentah_pendaftaran,
  (select count(*) from fact.pendaftaran) as fact_pendaftaran,
  (select count(*) from raw.aktivitas) as aktivitas,
  (select count(*) from raw.transaksi) as transaksi,
  (select count(*) from fact.merchant) as merchant`);
cek.tanpaMid = (await baca(`select count(*) n from raw.pendaftaran where mid is null or mid = ''`))[0].n;
cek.midDuplikat = (await baca(`select count(*) n from raw.pendaftaran where banyak > 1`))[0].n;
cek.tanggalGagal = (await baca(`select count(*) n from fact.pendaftaran where bulan_daftar is null`))[0].n;
cek.segmenAsing = await baca(`select segmen, count(*) n from fact.merchant where segmen = 'Tidak tersegmentasi' group by 1`);
cek.conflictProvinsi = await baca(`
  select count(*) n from raw.aktivitas a join raw.transaksi t using (mid)
  where a.provinsi <> t.provinsi or a.kabupaten <> t.kabupaten or a.kategori <> t.kategori or a.segmen <> t.segmen`);
cek.provinsiUnik = (await baca(`select count(distinct provinsi) n from fact.pendaftaran`))[0].n;
cek.jendelaBulan = await baca(`
  select round(nilai / rata_bulan, 2) rasio, count(*) n from raw.transaksi
  where nilai > 0 and rata_bulan > 0 group by 1 order by n desc limit 3`);
cek.konsistenHariLogin = await baca(`
  select count_if(abs(hari_since_login - date_diff('day', cast(tgl_login as date), DATE '${snapshot}')) <= 1) cocok,
         count_if(abs(hari_since_login - date_diff('day', cast(tgl_login as date), DATE '${snapshot}')) > 1) beda
  from raw.aktivitas where tgl_login is not null`);
cek.loginSebelumDaftar = await baca(`
  select count(*) n, min(date_diff('day', cast(tgl_daftar as date), cast(tgl_login as date))) paling_terbalik
  from fact.merchant where tgl_login is not null and tgl_daftar is not null and tgl_login < tgl_daftar`);
cek.mart = await baca(`select
  (select sum(n) from mart.agg_daerah) n_dari_mart,
  (select count(*) from fact.pendaftaran) n_dari_fact,
  (select sum(nilai) from mart.agg_daerah) nilai_mart,
  (select sum(nilai) from fact.merchant where di_pendaftaran_2026 = 1) nilai_merchant_cohort,
  (select sum(n) from mart.agg_kategori) n_kategori,
  (select count(*) from mart.agg_daerah) sel_daerah,
  (select count(*) from mart.agg_kategori) sel_kategori`);
cek.jamPuncak = await baca(`
  select jam, sum(n) n from mart.agg_jam where bulan >= '2026-01' and jam <> '(tanpa jam)'
  group by 1 order by n desc limit 3`);
cek.sumberTerpakai = await baca(`select sumber, count(*) n from raw.pendaftaran group by 1 order by 1`);

/* ---------- kelengkapan kolom: berapa isi tiap kolom sumber, per jenis file ----------
   Ini yang menjawab "ada kolom yang tidak dipakai tidak?" — diukur, bukan diingat. */
const kelengkapan = [];
for (const [jenis, fs] of Object.entries(kelompok)) {
  const gabunganCols = [...new Set(fs.flatMap(f => headers[f]))];
  await conn.run(`create or replace temp view v_kel as ${gabungan(fs)}`);
  const hitung = gabunganCols.map((c, k) =>
    `count_if(nullif(trim("${c.replace(/"/g, '""')}"), '') is not null) as c${k}`).join(', ');
  const baris = (await baca(`select count(*) as n, ${hitung} from v_kel`))[0];
  gabunganCols.forEach((c, k) => kelengkapan.push({
    jenis, kolom: c, baris: baris.n, isi: Number(baris['c' + k]), persen: +(100 * baris['c' + k] / baris.n).toFixed(1),
  }));
}
await conn.run('drop view if exists v_kel');
cek.kelengkapan = kelengkapan;
cek.kolombaTanpaKolom = [...new Set(kelengkapan.filter(x => x.isi === 0).map(x => `${x.jenis}:${x.kolom}`))];

/* Berkas yang saling tumpang tindih bisa memuat MID yang sama dengan atribut berbeda.
   Aturan penyelesaian: ekspor terbaru menang. Ini dicatat supaya selisihnya tidak hilang tanpa jejak. */
cek.duplikatBedaNilai = (await baca(`
  select count(*) n from (
    select mid from raw.pendaftaran where banyak > 1 group by mid
    having count(distinct status) > 1 or count(distinct kategori) > 1 or count(distinct provinsi) > 1
        or count(distinct kabupaten) > 1 or count(distinct tgl_daftar) > 1)`))[0].n;
cek.duplikatBedaRinci = await baca(`
  select kolom, count(*) n from (
    select mid, 'status' kolom from raw.pendaftaran where banyak > 1 group by mid having count(distinct status) > 1
    union all select mid, 'kategori' from raw.pendaftaran where banyak > 1 group by mid having count(distinct kategori) > 1
    union all select mid, 'provinsi' from raw.pendaftaran where banyak > 1 group by mid having count(distinct provinsi) > 1
    union all select mid, 'kabupaten' from raw.pendaftaran where banyak > 1 group by mid having count(distinct kabupaten) > 1
    union all select mid, 'tanggal daftar' from raw.pendaftaran where banyak > 1 group by mid having count(distinct tgl_daftar) > 1
  ) group by 1 order by 2 desc`);
cek.mpanRusak = (await baca(`select count(*) n from raw.pendaftaran where mpan is not null and contains(mpan, 'E+')`))[0].n;
cek.userAktifSatu = (await baca(`select count(*) n from fact.merchant where user_aktif = 1`))[0].n;
cek.aktivitasDibuang = (await baca(`select count(*) n from (${gabungan(kelompok.aktivitas)}) t`))[0].n;
cek.transaksiDibaca = (await baca(`select count(*) n from (${gabungan(kelompok.transaksi)}) t`))[0].n;
cek.formatDibaca = [...new Set([...kelompok.pendaftaran, ...kelompok.aktivitas, ...kelompok.transaksi].map(f => f.split('.').pop().toLowerCase()))].sort();

/* Merchant tanpa MID tidak boleh hilang: mereka nyata, hanya kuncinya kosong di sumber. */
cek.merchant = await baca(`select
  (select count(*) from fact.merchant) total,
  (select count(*) from fact.merchant where punya_mid = 0) tanpaMid,
  (select count(*) from fact.merchant where mpan_status = 'utuh') mpanUtuh,
  (select count(*) from fact.merchant where mpan_status = 'rusak: notasi ilmiah') mpanRusak,
  (select count(*) from fact.merchant where user_aktif > 1) multiUser`);

console.log('\n=== PEMERIKSAAN ===');
console.log(JSON.stringify({ ...cek, mart: cek.mart[0], baris: cek.baris[0] }, null, 1));

const meta = {
  snapshot, sumber: SUMBER, jendelaBulan: cek.jendelaBulan[0]?.rasio ?? null,
  dibuatPada: new Date().toISOString(),
  file: { pendaftaran: kelompok.pendaftaran, aktivitas: kelompok.aktivitas, transaksi: kelompok.transaksi, diabaikan },
};
await mkdir(path.resolve('data'), { recursive: true });
await writeFile(path.resolve('data/db-meta.json'), JSON.stringify(meta, null, 2));
await writeFile(path.resolve('data/db-checks.json'), JSON.stringify(cek, null, 2));
await conn.closeSync?.();
console.log(`\nDB tersimpan di ${DB}`);
