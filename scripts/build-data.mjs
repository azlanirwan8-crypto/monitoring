/**
 * Menulis data/dash.json dari mart DuckDB.
 * Cara pakai: node scripts/build-data.mjs [PATH_DB]
 * Semua normalisasi ada di db/schema.sql; file ini hanya memetakan hasil query
 * ke struktur ringkas yang dipakai browser, lalu menghitung turunannya.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DuckDBInstance } from '@duckdb/node-api';

const DB = path.resolve(process.argv[2] || 'C:\\dt\\wondr.duckdb');
const meta = JSON.parse(await readFile('data/db-meta.json', 'utf8'));
const cek = JSON.parse(await readFile('data/db-checks.json', 'utf8'));
const geo = JSON.parse(await readFile('vendor/indonesia-38-provinces.geojson', 'utf8'));
const SNAP = meta.snapshot;
const WIN = meta.jendelaBulan || 8.77;

const instance = await DuckDBInstance.create(DB);
const conn = await instance.connect();
const ambil = async sql => (await conn.runAndReadAll(sql)).getRowObjects().map(o =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : (v === null ? null : v)])));

class Dict {
  constructor() { this.m = new Map(); }
  id(v) {
    const k = v == null || v === '' ? '(tidak ada)' : String(v);
    let i = this.m.get(k);
    if (i === undefined) { i = this.m.size; this.m.set(k, i); }
    return i;
  }
  get values() { return [...this.m.keys()]; }
}
const dProv = new Dict(), dKab = new Dict(), dKat = new Dict(), dFam = new Dict();
const dTipe = new Dict(), dStatus = new Dict(), dSeg = new Dict(), dBulan = new Dict();
const dBulanLogin = new Dict(), dBulanTxn = new Dict(), dJam = new Dict(), dMpan = new Dict();

const round = x => Math.round(x);
const umurUrut = ['<=30 hari', '31-90 hari', '91-180 hari', '6-12 bulan', '>12 bulan', 'tidak diketahui'];

/* ---------------- mart ---------------- */

const aggDaerah = await ambil('select * from mart.agg_daerah');
const aggKategori = await ambil('select * from mart.agg_kategori');
const aggJam = await ambil('select * from mart.agg_jam');
const churn = await ambil('select * from mart.churn');
const merchant = await ambil(`select mid, punya_mid, nmid, mpan, mpan_status, nama, provinsi, kabupaten, kategori, keluarga,
  tipe, status, segmen, bulan_daftar, hari_since_login, tgl_login, jam_login, user_aktif, punya_login, punya_transaksi,
  jumlah_transaksi, nilai, rata_transaksi, rata_bulan, bulan_transaksi,
  strftime(tgl_transaksi, '%Y-%m-%d') as tgl_transaksi, di_pendaftaran_2026 from fact.merchant order by nilai desc`);
const aggTipe = await ambil('select * from mart.agg_tipe');
const bulanMart = (await ambil('select bulan from mart.bulan')).map(r => r.bulan).filter(Boolean).sort();

const R1 = aggDaerah.map(r => [
  dBulan.id(r.bulan_daftar), dProv.id(r.provinsi), dKab.id(r.kabupaten), dTipe.id(r.tipe), dStatus.id(r.status),
  r.n, r.n_login, r.n_login30, r.n_transaksi, round(r.nilai || 0), r.jumlah_transaksi, r.n_login30_txn,
]);
const R2 = aggKategori.map(r => [
  dBulan.id(r.bulan_daftar), dProv.id(r.provinsi), dKat.id(r.kategori), dFam.id(r.keluarga),
  r.n, r.n_login, r.n_login30, r.n_transaksi, round(r.nilai || 0), r.jumlah_transaksi, r.n_login30_txn,
]);
const R3 = aggJam.map(r => [dBulan.id(r.bulan), dJam.id(r.jam), r.n]);
const R4 = churn.map(r => [dBulan.id(r.bulan), umurUrut.indexOf(r.umur), r.n]).filter(r => r[1] >= 0);
const M = merchant.map(r => [
  r.mid, r.nama, dProv.id(r.provinsi), dKab.id(r.kabupaten), dKat.id(r.kategori), dFam.id(r.keluarga),
  dTipe.id(r.tipe), dStatus.id(r.status), dSeg.id(r.segmen), dBulan.id(r.bulan_daftar),
  r.hari_since_login ?? -1, dBulanLogin.id(r.tgl_login ? String(r.tgl_login).slice(0, 7) : null),
  r.user_aktif, r.punya_login, r.punya_transaksi, round(r.nilai || 0), r.jumlah_transaksi, round(r.rata_transaksi || 0),
  dBulanTxn.id(r.bulan_transaksi), r.di_pendaftaran_2026,
  r.punya_mid, r.nmid, r.mpan || '(tidak ada)', dMpan.id(r.mpan_status), round(r.rata_bulan || 0),
  r.tgl_transaksi || null, r.jam_login ?? -1,
]);
/* Tipe Merchant × Jumlah User Aktif — ringkasan mart.agg_tipe, dibaca apa adanya. */
const T = aggTipe.map(r => [
  dTipe.id(r.tipe), r.n, r.n_login, r.n_login30, r.n_transaksi, round(r.nilai || 0), r.jumlah_transaksi,
  r.total_user, r.n_multi_user, r.n_tanpa_mid, r.n_login30_txn,
]);
const iT = { tipe: 0, n: 1, nLogin: 2, nLogin30: 3, nTxn: 4, gmv: 5, txns: 6, totalUser: 7, multiUser: 8, tanpaMid: 9, nLogin30Txn: 10 };

/* ---------------- dimensi & geo ---------------- */

const namaGeo = new Set(geo.features.map(f => f.properties.PROVINSI));
const ALIAS = Object.fromEntries((await ambil('select provinsi, geo_name from dim.provinsi')).map(x => [x.provinsi, x.geo_name]));
const provGeo = dProv.values.map(n => (namaGeo.has(n) ? n : (namaGeo.has(ALIAS[n]) ? ALIAS[n] : null)));
const provTanpaPasangan = dProv.values.filter((n, i) => !provGeo[i]);
const geoTanpaData = [...namaGeo].filter(g => !provGeo.includes(g));

/* ---------------- KPI (sumber: tabel merchant + mart) ---------------- */

const iM = { mid: 0, nama: 1, prov: 2, kab: 3, cat: 4, fam: 5, tipe: 6, status: 7, seg: 8, bulanDaftar: 9, loginDays: 10, bulanLogin: 11, users: 12, punyaLogin: 13, punyaTxn: 14, gmv: 15, txns: 16, avgTxn: 17, bulanTxn: 18, diRegistry: 19, punyaMid: 20, nmid: 21, mpan: 22, mpanStatus: 23, rataBulan: 24, tglTxn: 25, jamLogin: 26 };
const gmvTotal = M.reduce((a, r) => a + r[iM.gmv], 0);
const txnTotal = M.reduce((a, r) => a + r[iM.txns], 0);
const bernilai = M.filter(r => r[iM.punyaTxn] && r[iM.gmv] > 0);
const urutGmv = bernilai.map(r => r[iM.gmv]).sort((a, b) => b - a);
const cum = k => urutGmv.slice(0, k).reduce((a, b) => a + b, 0) / gmvTotal;
const median = arr => arr.length ? arr[(arr.length - 1) >> 1] : null;
const hariLogin = M.filter(r => r[iM.punyaLogin]).map(r => r[iM.loginDays]).sort((a, b) => a - b);
const nTerdaftar = R1.reduce((a, r) => a + r[5], 0);
const mpanRusak = (await ambil(`select count(*) n from raw.pendaftaran where mpan is not null and regexp_matches(mpan, 'E[+]')`))[0].n;
const bulanPendaftaran = new Set(R1.map(r => dBulan.values[r[0]]));
const bulanAktivitas = new Set(M.map(r => dBulan.values[r[iM.bulanDaftar]]).filter(b => b && b.startsWith('2026')));
const bulanBocor = [...bulanAktivitas].filter(b => !bulanPendaftaran.has(b)).sort();

/* ---------------- keluaran ---------------- */

const out = {
  meta: {
    dibuatPada: meta.dibuatPada, snapshot: SNAP, jendelaTransaksiBulan: WIN, db: DB,
    bulanTanpaPendaftaran: bulanBocor,
    sumber: { folder: meta.sumber, filePendaftaran: meta.file.pendaftaran, fileAktivitas: meta.file.aktivitas, fileTransaksi: meta.file.transaksi, fileUnduhan: meta.file.unduhan || [], diabaikan: meta.file.diabaikan },
    unduhan: meta.unduhan || [],
    catatan: `Ukuran transaksi (nilai, jumlah, rata-rata) dihitung pada jendela tetap ~${WIN} bulan, bukan seumur hidup merchant.`,
    lisensiPeta: 'Batas wilayah: indonesia-38-provinces.geojson, CC BY 4.0 (denyherianto).',
  },
  issues: [
    { label: 'MPAN tersimpan sebagai notasi ilmiah', n: mpanRusak, aksi: 'kunci gabungan memakai MID' },
    { label: `Bulan tanpa baris pendaftaran: ${bulanBocor.join(', ') || '-'}`, n: 0, aksi: 'digambar sebagai celah kosong, bukan nol' },
    { label: 'Baris pendaftaran tanpa MID', n: cek.tanpaMid, aksi: 'keluar dari ringkasan' },
    { label: 'Jumlah User Aktif hampir selalu 1', n: M.filter(r => r[iM.users] === 1).length, aksi: 'tidak dipakai sebagai KPI' },
    { label: 'Tipe merchant tidak ada di file transaksi', n: merchant.filter(r => !r.tipe || r.tipe === '(tidak ada)').length, aksi: 'dilengkapi dari tabel pendaftaran' },
    { label: 'Tanggal daftar lebih baru daripada login terakhir', n: cek.loginSebelumDaftar?.[0]?.n ?? 0, aksi: 'yang diragukan tanggal daftar (kohort) merchant ini; usia login tetap dihitung dari tanggal data' },
  ],
  kpi: {
    terdaftar: nTerdaftar,
    merchantBeraktivitas: M.length,
    punyaLogin: M.filter(r => r[iM.punyaLogin]).length,
    punyaTransaksi: M.filter(r => r[iM.punyaTxn]).length,
    gmvTotal, gmvPerBulan: gmvTotal / WIN, transaksiTotal: txnTotal, transaksiPerBulan: txnTotal / WIN,
    rataPerTransaksi: gmvTotal / (txnTotal || 1),
    medianGmv: median([...urutGmv].sort((a, b) => a - b)),
    medianUsiaLogin: median(hariLogin),
    unduhanTerkini: (meta.unduhan && meta.unduhan.length) ? meta.unduhan[meta.unduhan.length - 1] : null,
    konsentrasi: {
      basis: 'persentase nilai transaksi, diurutkan dari merchant terbesar',
      nBasis: urutGmv.length,
      top10: +(cum(10) * 100).toFixed(1),
      topSatuPersen: +(cum(Math.round(urutGmv.length * 0.01)) * 100).toFixed(1),
      topSepuluhPersen: +(cum(Math.round(urutGmv.length * 0.1)) * 100).toFixed(1),
      merchantTerbesar: (() => { const t = M[0]; return { mid: t[iM.mid], nama: t[iM.nama], gmv: t[iM.gmv], share: +(t[iM.gmv] / gmvTotal * 100).toFixed(1) }; })(),
    },
  },
  dims: {
    provinsi: dProv.values, kabupaten: dKab.values, kategori: dKat.values, keluarga: dFam.values,
    tipe: dTipe.values, status: dStatus.values, segmen: dSeg.values, bulan: dBulan.values, jam: dJam.values,
    bulanLogin: dBulanLogin.values, bulanTxn: dBulanTxn.values, umurSaatTutup: umurUrut, mpanStatus: dMpan.values,
  },
  provGeo, bulanUrut: bulanMart,
  idx: {
    r1: { bulan: 0, provinsi: 1, kabupaten: 2, tipe: 3, status: 4, n: 5, nLogin: 6, nLogin30: 7, nTxn: 8, gmv: 9, txns: 10, nLogin30Txn: 11 },
    r2: { bulan: 0, provinsi: 1, kategori: 2, keluarga: 3, n: 4, nLogin: 5, nLogin30: 6, nTxn: 7, gmv: 8, txns: 9, nLogin30Txn: 10 },
    r3: { bulan: 0, jam: 1, n: 2 },
    r4: { bulan: 0, umur: 1, n: 2 },
    m: iM, t: iT,
  },
  tables: {
    r1: R1, r1Cols: ['bulan', 'provinsi', 'kabupaten', 'tipe', 'status', 'n', 'nLogin', 'nLogin30', 'nTxn', 'gmv', 'txns', 'nLogin30Txn'],
    r2: R2, r2Cols: ['bulan', 'provinsi', 'kategori', 'keluarga', 'n', 'nLogin', 'nLogin30', 'nTxn', 'gmv', 'txns', 'nLogin30Txn'],
    r3: R3, r3Cols: ['bulan', 'jam', 'n'],
    r4: R4, r4Cols: ['bulan', 'umur', 'n'],
    m: M, mCols: ['mid', 'nama', 'prov', 'kab', 'cat', 'fam', 'tipe', 'status', 'seg', 'bulanDaftar', 'loginDays', 'bulanLogin', 'users', 'punyaLogin', 'punyaTxn', 'gmv', 'txns', 'avgTxn', 'bulanTxn', 'diRegistry', 'punyaMid', 'nmid', 'mpan', 'mpanStatus', 'rataBulan', 'tglTxn', 'jamLogin'],
    t: T, tCols: ['tipe', 'n', 'nLogin', 'nLogin30', 'nTxn', 'gmv', 'txns', 'totalUser', 'multiUser', 'tanpaMid', 'nLogin30Txn'],
  },
  verifikasi: {
    barisPendaftaranMentah: cek.baris[0].mentah_pendaftaran,
    barisPendaftaran: nTerdaftar,
    MIDtanpaIsi: cek.tanpaMid,
    MIDberulang: cek.midDuplikat,
    tanggalGagalDibaca: cek.tanggalGagal,
    merchantAktivitas: M.length,
    segmenTanpaMapping: cek.segmenAsing,
    konflikAtribut: cek.conflictProvinsi[0]?.n ?? null,
    provinsiDiGeojson: `${provGeo.filter(Boolean).length}/${dProv.values.length}`,
    geojsonTanpaData: geoTanpaData,
    konsistensiHariLogin: cek.konsistenHariLogin[0],
    loginSebelumDaftar: cek.loginSebelumDaftar[0]?.n ?? 0,
    rasioNilaiPerBulan: cek.jendelaBulan.map(r => [r.rasio, r.n]),
    rekonsiliasiMart: { nMart: cek.mart[0].n_dari_mart, nFact: cek.mart[0].n_dari_fact, selDaerah: cek.mart[0].sel_daerah, selKategori: cek.mart[0].sel_kategori },
    selisihGmvPersen: +(Math.abs(cek.mart[0].nilai_mart - cek.mart[0].nilai_merchant_cohort) / cek.mart[0].nilai_merchant_cohort * 100).toFixed(6),
    duplikatBedaNilai: cek.duplikatBedaNilai,
    duplikatBedaRinci: cek.duplikatBedaRinci,
    mpanNotasiIlmiah: cek.mpanRusak,
    userAktifSatu: cek.userAktifSatu,
    formatDibaca: cek.formatDibaca,
    kelengkapan: cek.kelengkapan,
    akuntansiMerchant: cek.merchant[0],
    aktivitasBarisDibuang: cek.aktivitasDibuang ?? null,
    transaksiBarisDibuang: cek.transaksiDibaca ?? null,
  },
};

await writeFile(path.resolve('data/dash.json'), JSON.stringify(out));
console.log('verifikasi:', JSON.stringify(out.verifikasi, null, 1));
console.log(`dash.json = ${(JSON.stringify(out).length / 1048576).toFixed(2)} MB · R1 ${R1.length} · R2 ${R2.length} · R3 ${R3.length} · R4 ${R4.length} · M ${M.length}`);
console.log(`KPI: terdaftar ${nTerdaftar} · merchant ${M.length} · GMV ${Math.round(gmvTotal).toLocaleString('id')} · medianGmv ${out.kpi.medianGmv} · medianUsiaLogin ${out.kpi.medianUsiaLogin} · konsentrasi ${JSON.stringify(out.kpi.konsentrasi)}`);
