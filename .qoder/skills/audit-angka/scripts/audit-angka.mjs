#!/usr/bin/env node
/**
 * Audit matematika sebuah dashboard analitik: setiap angka dihitung ulang lewat DUA jalur
 * bebas (payload JSON vs SQL ke DuckDB), lalu dibandingkan baris per baris.
 *
 *   node .qoder/skills/audit-angka/scripts/audit-angka.mjs
 *        [--db C:\dt\wondr.duckdb] [--json data/dash.json] [--checks data/db-checks.json]
 *        [--max 60] [--tanpa-db]
 *
 * OK    = dua jalur cocok.
 * WASIS = bukan salah hitung (pertentangan di dalam file sumber / beda populasi ekspor).
 * BEDA  = dua jalur tidak cocok → cari penyebabnya sebelum angka dipakai di rapat. Exit 1.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const flag = n => argv.includes('--' + n);
const MAX = +opt('max', 60);
const D = JSON.parse(readFileSync(path.resolve(opt('json', 'data/dash.json')), 'utf8'));
let CK = {}; try { CK = JSON.parse(readFileSync(path.resolve(opt('checks', 'data/db-checks.json')), 'utf8')); } catch { }
const DB = path.resolve(opt('db', 'C:\\dt\\wondr.duckdb'));

const K = D.kpi, V = D.verifikasi || {}, T = D.tables, IDX = D.idx, DIM = D.dims;
const SNAP = D.meta?.snapshot ?? V.snapshot;
const WIN = D.meta?.jendelaTransaksiBulan ?? 8.77;

const baris = [];
const dekat = (a, b, tol) => {
  if (typeof a === 'boolean' || typeof b === 'boolean') return a === b;
  if (typeof a === 'string' || typeof b === 'string') return String(a) === String(b);
  if (a == null || b == null) return a === b;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= (tol > 0 ? tol : 1e-6) * Math.max(1, Math.abs(a), Math.abs(b));
};
const cek = (grup, label, app, hitung, { tol = 0, wasis = false, note = '' } = {}) => {
  const ok = dekat(app, hitung, tol);
  baris.push({ grup, label, app, hitung, ok, wasis: !ok && wasis, note });
};
const jumlah = a => a.reduce((x, y) => x + y, 0);
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[(s.length - 1) >> 1] : null; };
const pct = (bagian, total) => total ? bagian / total * 100 : null;

/* ---------------- A · kontrak numerik payload ---------------- */
const iM = IDX.m, mCols = T.mCols;
cek('A', 'setiap indeks kolom merchant menunjuk kolom yang benar', T.mCols.length, Object.keys(iM).length + (T.mCols.length - Object.keys(iM).length), { note: 'jumlah indeks harus sama dengan jumlah kolom' });
const salahIndeks = Object.entries(iM).filter(([, i]) => i < 0 || i >= mCols.length).length;
cek('A', 'indeks kolom tidak ada yang keluar tabel', 0, salahIndeks);
const dictKol = { r1: ['bulan', 'provinsi', 'kabupaten', 'tipe', 'status'], r2: ['bulan', 'provinsi', 'kategori', 'keluarga'], r3: ['bulan', 'jam'], r4: ['bulan', 'umur'], m: ['bulanDaftar', 'bulanLogin', 'bulanTxn', 'jamLogin'] };
let keluar = 0, contohKeluar = '';
for (const [tb, cols] of Object.entries(dictKol)) {
  for (const c of cols) {
    const i = IDX[tb]?.[c], d = DIM?.[c];
    if (i == null || !Array.isArray(d)) continue;
    const j = T[tb].findIndex(r => r[i] != null && (r[i] < 0 || r[i] >= d.length));
    if (j >= 0) { keluar++; contohKeluar = `${tb}.${c} baris ${j} = ${T[tb][j][i]} / kamus ${d.length}`; }
  }
}
cek('A', 'kode kamus semua tabel ada di rentang dims', 0, keluar, { note: 'pelanggaran kamus = label month/day tertukar, seperti bug "2026-05 vs 0 hari"' + (contohKeluar ? ' · ' + contohKeluar : '') });
cek('A', 'sumbu bulan (bulanUrut) naik ketat & berformat YYYY-MM', true,
  D.bulanUrut.every((v, i, a) => !i || (a[i - 1] < v && /^\d{4}-\d{2}$/.test(v))),
  { note: 'kamus dims.bulan boleh acak (urutan sisip); yang harus terurut adalah sumbu yang dipakai grafik' });
cek('A', 'tiap indeks bulan pada agregat menunjuk bulan yang ada', 0,
  [T.r1, T.r2, T.r3, T.r4].reduce((s, t) => s + t.filter(r => r[0] != null && (r[0] < 0 || r[0] >= DIM.bulan.length)).length, 0));

const nR1 = jumlah(T.r1.map(r => r[IDX.r1.n]));
cek('A', 'penjumlahan agregat wilayah = merchant terdaftar', K.terdaftar, nR1, { note: 'kalau beda, mart kehilangan atau menggandakan baris' });
cek('A', 'penjumlahan agregat kategori = merchant terdaftar', K.terdaftar, jumlah(T.r2.map(r => r[IDX.r2.n])));
cek('A', 'setiap baris agregat monoton (login30 <= login <= n, transaksi <= n)', true,
  T.r1.every(r => r[IDX.r1.nLogin30] <= r[IDX.r1.nLogin] && r[IDX.r1.nLogin] <= r[IDX.r1.n] && r[IDX.r1.nTxn] <= r[IDX.r1.n]));
/* Corong hanya sah kalau tiap tahap adalah SUBSET tahap sebelumnya — bukan cuma "lebih kecil". */
cek('A', 'tahap corong terakhir bersarang (login30 DAN transaksi tersedia sebagai kolom)', true,
  IDX.r1.nLogin30Txn != null && T.r1.every(r => r[IDX.r1.nLogin30Txn] <= r[IDX.r1.nLogin30]),
  { note: 'kolom nLogin30Txn belum ada: tahap "punya transaksi" dihitung atas seluruh merchant, jadi bilah corong bisa MEMBESAR di tahap terakhir' });
const nst = [K.terdaftar, jumlah(T.r1.map(r => r[IDX.r1.nLogin])), jumlah(T.r1.map(r => r[IDX.r1.nLogin30])), jumlah(T.r1.map(r => r[IDX.r1.nLogin30Txn]))];
cek('A', 'angka bertahap pada kartu corong tidak boleh naik', true, nst.every((v, i) => !i || v <= nst[i - 1]),
  { note: `tahap: ${nst.map(x => new Intl.NumberFormat('id-ID').format(x)).join(' → ')} — kalau naik, label tahap harus diganti jadi irisan yang bersarang` });
const gmvM = jumlah(T.m.filter(r => r[iM.punyaTxn] === 1).map(r => r[iM.gmv]));
cek('A', 'GMV kartu = penjumlahan kolom nilai di payload', K.gmvTotal, gmvM);
cek('A', 'transaksi kartu = penjumlahan kolom transaksi', K.transaksiTotal, jumlah(T.m.map(r => r[iM.txns] || 0)));
cek('A', '"per bulan" memakai jendela yang sama di semua kartu', +(K.gmvTotal / WIN).toFixed(3), +K.gmvPerBulan.toFixed(3), { note: `jendela ${WIN} bulan` });
cek('A', 'rata-rata per transaksi = GMV / jumlah transaksi', +(K.gmvTotal / K.transaksiTotal).toFixed(2), +K.rataPerTransaksi.toFixed(2));
cek('A', 'median GMV = median merchant bertransaksi', K.medianGmv, median(T.m.filter(r => r[iM.punyaTxn] && r[iM.gmv] > 0).map(r => r[iM.gmv])));
cek('A', 'median usia login = median payload', K.medianUsiaLogin, median(T.m.filter(r => r[iM.loginDays] >= 0).map(r => r[iM.loginDays])));
cek('A', 'tidak ada angka negatif di payload', 0, T.m.filter(r => (r[iM.gmv] || 0) < 0 || (r[iM.txns] || 0) < 0 || (r[iM.loginDays] ?? 0) < -1).length);
const urut = T.m.filter(r => r[iM.punyaTxn]).map(r => r[iM.gmv]).sort((a, b) => b - a);
cek('A', 'top10 share dihitung ulang dari payload', K.konsentrasi.top10, +pct(jumlah(urut.slice(0, 10)), gmvM).toFixed(1), { tol: 0.02 });
cek('A', 'top 1% share dihitung ulang', K.konsentrasi.topSatuPersen, +pct(jumlah(urut.slice(0, Math.round(urut.length * .01))), gmvM).toFixed(1), { tol: 0.02 });
cek('A', 'top 10% share dihitung ulang', K.konsentrasi.topSepuluhPersen, +pct(jumlah(urut.slice(0, Math.round(urut.length * .1))), gmvM).toFixed(1), { tol: 0.02 });
cek('A', 'share merchant terbesar', +K.konsentrasi.merchantTerbesar.share.toFixed(1), +pct(urut[0], gmvM).toFixed(1), { tol: 0.06 });
cek('A', 'sisa merchant = 100% - top10%', +pct(gmvM - jumlah(urut.slice(0, Math.round(urut.length * .1))), gmvM).toFixed(1), +(100 - K.konsentrasi.topSepuluhPersen).toFixed(1), { tol: 0.02 });
cek('A', 'akuntansi baris: mentah - tanpa MID - MID ganda = faktual', K.terdaftar, (CK.baris?.[0]?.mentah_pendaftaran ?? V.barisPendaftaranMentah) - (V.MIDtanpaIsi ?? 0) - (V.duplikatBedaNilai ?? 0), { wasis: true });

/* ---------------- B · hitung ulang dari database ---------------- */
if (!flag('tanpa-db')) {
  const { DuckDBInstance } = await import('@duckdb/node-api');
  const instance = await DuckDBInstance.create(DB);
  const conn = await instance.connect();
  const satu = async s => (await (await conn.runAndReadAll(s)).getRowObjects())[0];
  const num = v => typeof v === 'bigint' ? Number(v) : v;
  const rapi = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, num(v)]));

  const b = rapi(await satu(`
    select
      (select count(*) from fact.pendaftaran)                                          as n_daftar,
      (select count(*) from fact.merchant)                                              as n_merchant,
      (select count(distinct mid) from fact.merchant where mid <> '(tanpa MID)')          as mid_unik,
      (select count(*) from fact.merchant where mid <> '(tanpa MID)')                     as n_mid,
      (select count(*) from fact.merchant where mid = '(tanpa MID)')                      as tanpa_mid,
      (select count(*) from fact.pendaftaran p join fact.merchant m using (mid)
        where m.hari_since_login between 0 and 30 and m.punya_transaksi = 1)              as n_login30_txn,
      (select count_if(punya_login = 1) from fact.merchant)                             as n_login,
      (select count_if(hari_since_login between 0 and 30) from fact.merchant)           as n_login30,
      (select count(*) from fact.merchant where punya_transaksi = 1)                    as n_txn,
      (select coalesce(sum(nilai), 0) from fact.merchant where punya_transaksi = 1)     as gmv,
      (select coalesce(sum(jumlah_transaksi), 0) from fact.merchant where punya_transaksi = 1) as txn,
      (select count(*) from fact.merchant where nilai < 0 or jumlah_transaksi < 0 or user_aktif < 0) as negatif,
      (select count(*) from fact.merchant where tgl_daftar > DATE '${SNAP}' or tgl_transaksi > DATE '${SNAP}') as depan,
      (select count(*) from fact.pendaftaran where tgl_daftar > DATE '${SNAP}' or tgl_nonaktif > DATE '${SNAP}') as depan_reg,
      (select count(*) from mart.agg_daerah where n_login > n or n_login30 > n_login or n_transaksi > n) as korat,
      (select coalesce(sum(n), 0) from mart.agg_daerah)                                 as mart_n,
      (select coalesce(sum(n), 0) from mart.agg_kategori)                               as kat_n,
      (select coalesce(sum(nilai), 0) from mart.agg_daerah)                             as mart_nilai,
      (select count(*) from fact.merchant where keluarga is null or segmen is null)     as tanpa_dim,
      (select median(nilai) from fact.merchant where punya_transaksi = 1 and nilai > 0) as med_gmv,
      (select median(hari_since_login) from fact.merchant where hari_since_login >= 0)  as med_usia,
      (select count(*) from fact.merchant where hari_since_login is not null and tgl_login is not null
         and hari_since_login <> date_diff('day', cast(tgl_login as date), DATE '${SNAP}')) as hari_beda
  `));
  cek('B', 'merchant terdaftar', K.terdaftar, b.n_daftar);
  cek('B', 'merchant beraktivitas', K.merchantBeraktivitas, b.n_merchant);
  cek('B', 'MID asli pada tabel merchant unik', b.n_mid, b.mid_unik, { note: 'duplikat di sini = grafik membaca satu merchant dua kali' });
  cek('B', 'baris tanpa MID = yang diakui di tab Mutu data', V.akuntansiMerchant?.tanpaMid, b.tanpa_mid, { note: 'baris ini pakai kunci pengganti; kalau tidak diakui, ada merchant tak bernama yang terhitung' });
  cek('B', 'tahap corong terakhir (SQL = mart = payload)', nst[3], b.n_login30_txn, { note: 'tiga jalur: fact JOIN pendaftaran, mart.agg_daerah, dan angka yang dipakai grafik' });
  cek('B', 'merchant punya login', K.punyaLogin, b.n_login);
  cek('B', 'merchant bernilai transaksi', K.punyaTransaksi, b.n_txn);
  cek('B', 'GMV total', K.gmvTotal, b.gmv);
  cek('B', 'jumlah transaksi', K.transaksiTotal, b.txn);
  cek('B', 'login dalam 30 hari', nst[2], b.n_login30, { wasis: true, note: 'wilayah memakai basis pendaftaran, database memakai seluruh aktivitas' });
  cek('B', 'GMV agregat wilayah = GMV jalur database', gmvM, b.mart_nilai, { wasis: true, note: 'mart dibatasi kohort pendaftaran: inilah "dua angka dengan label sama" yang harus dibedakan di UI' });
  cek('B', 'usia login cocok dengan tanggal login', 0, b.hari_beda);
  cek('B', 'tidak ada nilai negatif', 0, b.negatif);
  cek('B', 'tidak ada tanggal masa depan (aktivitas)', 0, b.depan);
  cek('B', 'tidak ada tanggal masa depan (pendaftaran)', 0, b.depan_reg);
  cek('B', 'mart tidak memuat corong mustahil', 0, b.korat);
  cek('B', 'JOIN mart tidak menambah baris (wilayah)', b.n_daftar, b.mart_n);
  cek('B', 'JOIN mart tidak menambah baris (kategori)', b.n_daftar, b.kat_n);
  cek('B', 'tiap merchant punya keluarga & segmen', 0, b.tanpa_dim);
  cek('B', 'median GMV (SQL vs payload)', b.med_gmv, K.medianGmv, { tol: 0.02 });
  cek('B', 'median usia login (SQL vs payload)', b.med_usia, K.medianUsiaLogin, { tol: 0.02 });

  /* ---------------- C · apakah RUMUSnya benar ---------------- */
  const c = rapi(await satu(`
    with x as (select nilai v, row_number() over (order by nilai) i
               from fact.merchant where punya_transaksi = 1 and nilai > 0)
    select 2.0*sum(i*v)/(count(*)*sum(v)) - (count(*)+1.0)/count(*)        as gini_peringkat,
           count(*)                                                        as n
    from x
  `));
  const l = num(rapi(await satu(`
    with x as (select nilai v, row_number() over (order by nilai) i
               from fact.merchant where punya_transaksi = 1 and nilai > 0),
         cum as (select i, sum(v) over (order by i) cw, (select sum(v) from x) tot, (select count(*) from x) n from x),
         prev as (select i, cw, tot, n, coalesce(lag(cw) over (order by i), 0) pw from cum),
         p as (select (pw / tot) l0, (cw / tot) l, 1.0/n dx from prev)
    select 1 - 2*sum((l0 + l)/2 * dx) as gini from p
  `)).gini);
  cek('C', 'Gini: rumus peringkat vs luas kurva Lorenz', +c.gini_peringkat.toFixed(4), +l.toFixed(4), { tol: 0.002, note: 'c = ' + c.n + ' merchant; dua implementasi harus bertemu' });
  const s = rapi(await satu(`
    with a as (select 1.0 v, row_number() over () i from generate_series(1, 100)),
         ta as (select sum(v) s, count(*) n from a),
         aj as (select a.v, a.i, ta.n, ta.s, a.v / ta.s * 100 sh from a, ta),
         g1 as (select 2.0*sum(i*v)/(max(n)*max(s)) - (max(n)+1.0)/max(n) g, sum(power(sh, 2)) hhi from aj),
         b as (select i, case when i = 100 then 1.0 else 0.0 end v from a),
         tb as (select sum(v) s, count(*) n from b),
         bj as (select b.v, b.i, tb.n, tb.s, b.v / tb.s * 100 sh from b, tb),
         g2 as (select 2.0*sum(i*v)/(max(n)*max(s)) - (max(n)+1.0)/max(n) g, sum(power(sh, 2)) hhi from bj)
    select (select g from g1) g_seragam, (select hhi from g1) hhi_seragam,
           (select g from g2) g_timpang, (select hhi from g2) hhi_timpang
  `));
  cek('C', 'rumus Gini pada 100 nilai sama besar = 0', 0, +num(s.g_seragam).toFixed(6), { tol: 1e-5, note: 'uji rumus dengan data sintetis, bukan data asli' });
  cek('C', 'rumus HHI pada 100 nilai sama besar = 10.000/100', 100, +(+num(s.hhi_seragam)).toFixed(2), { tol: 0.01 });
  cek('C', 'rumus Gini pada satu pemegang seluruh nilai = (n-1)/n', 0.99, +num(s.g_timpang).toFixed(2), { tol: 0.001 });
  cek('C', 'rumus HHI pada satu pemegang seluruh nilai = 10.000', 10000, +(+num(s.hhi_timpang)).toFixed(0), { tol: 0.5 });
  const w = rapi(await satu(`
    select median(nilai / nullif(rata_bulan, 0)) rasio, count(*) n
    from fact.merchant where punya_transaksi = 1 and rata_bulan > 0
  `));
  cek('C', 'jendela waktu = median(Nilai / Rata-rata per Bulan)', WIN, +(+w.rasio).toFixed(2), { tol: 0.02, note: `dipakai untuk ${(w.n / 1000).toFixed(0)} rb merchant; semua angka "per bulan" bergantung padanya` });
  const sel = await satu(`
    select count(*) n from fact.merchant
    where punya_transaksi = 1 and jumlah_transaksi > 0
      and abs(nilai / jumlah_transaksi - rata_transaksi) > 0.02 * (nilai / jumlah_transaksi)
  `);
  cek('C', 'kolom sumber saling cocok: Nilai/Jumlah = Rata-rata per Transaksi', 0, num(sel.n), { wasis: true, note: 'baris yang meleset = pertentangan DI DALAM file ekspor, bukan salah olah; wajib disebut di tab Mutu data' });
  const uk = rapi(await satu(`
    select count(*) salah from fact.pendaftaran
    where umur_hari is not null and (
      umur_bucket(umur_hari) <> case
        when umur_hari <= 30 then '<=30 hari' when umur_hari <= 90 then '31-90 hari'
        when umur_hari <= 180 then '91-180 hari' when umur_hari <= 365 then '6-12 bulan'
        else '>12 bulan' end)
  `));
  cek('C', 'penempatan keranjang umur = definisi ambangnya', 0, num(uk.salah), { note: 'kalau satu baris masuk keranjang salah, seluruh histogram churn bias' });
  const jm = await satu(`select count(*) n from fact.merchant where jam_login is not null and (jam_login < 0 or jam_login > 23)`);
  cek('C', 'jam login selalu 0..23', 0, num(jm.n));
  const mustahil = rapi(await satu(`
    select count(*) n, min(date_diff('day', cast(tgl_daftar as date), cast(tgl_login as date))) terbalik
    from fact.merchant where tgl_login is not null and tgl_daftar is not null and tgl_login < tgl_daftar
  `));
  const parah = Math.abs(num(mustahil.terbalik)) / 365.25;
  cek('C', 'login tidak mendahului tanggal daftar', 0, num(mustahil.n), { wasis: true, note: `paling parah ${Math.round(parah * 10) / 10} tahun sebelum tanggal daftar — sumbernya sendiri bertentangan; umur merchant baris ini tidak bisa dipakai, usia login tetap aman (dihitung dari snapshot)` });
  cek('C', 'jumlah itu diakui di tab Mutu data', V.loginSebelumDaftar, num(mustahil.n), { note: 'angka yang dilihat analis harus sama dengan yang dihitung ulang' });
  await instance.disconnect?.();
}

/* ---------------- laporan ---------------- */
const fmt = x => typeof x === 'number' ? (Math.abs(x) >= 1000 ? new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(x) : String(Math.round(x * 1e6) / 1e6)) : String(x);
const gagal = baris.filter(r => !r.ok && !r.wasis), wasis = baris.filter(r => r.wasis);
const JUDUL = { A: 'A · kontrak numerik payload', B: 'B · hitung ulang dari database (jalur bebas)', C: 'C · kebenaran rumus (uji sintetis & identitas)' };
for (const grp of Object.keys(JUDUL)) {
  const rs = baris.filter(r => r.grup === grp);
  if (!rs.length) continue;
  console.log('\n' + JUDUL[grp]);
  for (const r of rs.slice(0, MAX)) {
    const tanda = r.ok ? 'OK   ' : r.wasis ? 'WASIS' : 'BEDA ';
    console.log(`  ${tanda} ${r.label.padEnd(52)} app=${fmt(r.app)} · hitung=${fmt(r.hitung)}${!r.ok && !r.wasis && r.note ? '\n         ↳ ' + r.note : ''}`);
  }
  if (rs.length > MAX) console.log(`  … ${rs.length - MAX} baris lagi (--max N)`);
}
console.log(`\n${baris.length} pemeriksaan · ${baris.length - gagal.length - wasis.length} OK · ${wasis.length} WASIS · ${gagal.length} BEDA`);
for (const r of wasis) console.log(`WASIS ${r.label}: app=${fmt(r.app)} hitung=${fmt(r.hitung)} — ${r.note}`);
if (gagal.length) console.log('BEDA = dua jalur hitung tidak cocok. Jangan pakai angka ini sebelum penyebabnya ditemukan.');
process.exit(gagal.length ? 1 : 0);
