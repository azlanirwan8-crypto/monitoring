/** Pembangkit CONTOH sintetis untuk data/dash.json.
 *
 *   node scripts/contoh.mjs [--paksa]     # tulis data/dash.json sintetis (untuk lihat dashboard tanpa data asli)
 *   node scripts/contoh.mjs --cek         # bandingkan struktur dengan data/dash.json asli, tidak menulis
 *
 * Semua nama merchant, MID, NMID dan MPAN di file hasil adalah karangan — tidak ada satu pun
 * data mitra yang ikut tersebar. Angka di dalamnya dibuat saling cocok (agregat dihitung dari
 * barisnya sendiri) supaya baterai pemeriksaan `npm run audit` tetap bisa dipakai menguji.
 */
import { readFile, writeFile } from 'node:fs/promises';

const PAKSA = process.argv.includes('--paksa');
const CEK = process.argv.includes('--cek');
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : d; };
const TUJUAN = arg('keluar', 'data/dash.json');
const WIN = 8.77, SNAP = '2026-09-24';

const rnd = (seed => () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)(20260924);
const pilih = a => a[Math.floor(rnd() * a.length)];
const bulat = (a, b) => a + Math.floor(rnd() * (b - a + 1));

const PROV = ['DKI Jakarta', 'Jawa Barat', 'Jawa Tengah', 'Jawa Timur', 'Banten', 'Bali', 'Sumatera Utara', 'Sulawesi Selatan'];
const KAB = { 'DKI Jakarta': ['Jakarta Pusat', 'Jakarta Selatan'], 'Jawa Barat': ['Bandung', 'Bekasi'], 'Jawa Tengah': ['Semarang', 'Solo'], 'Jawa Timur': ['Surabaya', 'Malang'], 'Banten': ['Tangerang', 'Cilegon'], 'Bali': ['Denpasar', 'Badung'], 'Sumatera Utara': ['Medan', 'Binjai'], 'Sulawesi Selatan': ['Makassar', 'Gowa'] };
const KAT = { 'Kuliner & Restoran': ['RESTAURANTS, EATING PLACES', 'FAST FOOD RESTAURANTS'], 'Toko Bahan Makanan': ['GROCERY STORES, SUPERMARKETS', 'CONVENIENCE STORES'], 'Kesehatan & Kecantikan': ['PHARMACIES, DRUG STORES', 'BEAUTY SALONS'], 'Pakaian & Aksesoris': ['CLOTHING STORES', 'SHOE STORES'], 'Hotel & Wisata': ['HOTELS, MOTELS, LODGING', 'TRAVEL AGENCIES'], 'Transportasi & Logistik': ['TAXI/PASSENGER SHUTTLE', 'FUEL DEALERS, PETROL'], 'Layanan Digital & Telekomunikasi': ['SOFTWARE STORES', 'MOBILE PHONE STORES'], 'Ritel Lainnya': ['VARIETY STORES', 'HOME FURNISHINGS'] };
const KEL = Object.keys(KAT);
const TIPE = ['Merchant mandiri', 'Submerchant', 'Aggregator', '(tidak ada)'];
const STATUS = ['Aktif', 'Ditutup', 'Diblokir', 'Tidak Aktif'];
const SEG = ['Usaha Mikro', 'Usaha Kecil', 'Usaha Menengah', 'Usaha Besar', 'URE'];
const UMUR = ['<=30 hari', '31-90 hari', '91-180 hari', '6-12 bulan', '>12 bulan', 'tidak diketahui'];
const BULAN_DAFTAR = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-07', '2026-08', '2026-09'];

class Dict {
  constructor() { this.m = new Map(); }
  id(v) { const k = v == null || v === '' ? '(tidak ada)' : String(v); let i = this.m.get(k); if (i === undefined) { i = this.m.size; this.m.set(k, i); } return i; }
  get values() { return [...this.m.keys()]; }
}
const D = Object.fromEntries(['provinsi', 'kabupaten', 'kategori', 'keluarga', 'tipe', 'status', 'segmen', 'bulan', 'jam', 'bulanLogin', 'bulanTxn', 'mpanStatus'].map(k => [k, new Dict()]));

const N_DAFTAR = 1200, N_AKTIF = 620, N_HANYA_AKTIF = 130;
const pendaftaran = [];
for (let i = 0; i < N_DAFTAR; i++) {
  const prov = pilih(PROV), kel = pilih(KEL), kat = pilih(KAT[kel]);
  const bulan = pilih(BULAN_DAFTAR), status = pilih(STATUS);
  pendaftaran.push({
    mid: '9' + String(900000000 + i).padStart(9, '0'), prov, kab: pilih(KAB[prov]), kel, kat, bulan, status,
    tipe: pilih(TIPE), jam: bulat(1, 23), nonaktif: status === 'Ditutup' ? bulat(20, 800) : null,
  });
}
const olehMid = new Map(pendaftaran.map(r => [r.mid, r]));
const merchant = [];
const tambahMerchant = (reg) => {
  const prov = reg ? reg.prov : pilih(PROV), kab = reg ? pilih(KAB[prov]) : pilih(KAB[pilih(PROV)]);
  const kel = reg ? reg.kel : pilih(KEL), kat = reg ? reg.kat : pilih(KAT[kel]);
  const punyaLogin = rnd() < 0.86, loginDays = punyaLogin ? Math.round(Math.pow(rnd(), 1.7) * 1400) : -1;
  const punyaTxn = rnd() < 0.42, txns = punyaTxn ? bulat(3, 900) : 0;
  const gmv = punyaTxn ? Math.round((2e6 + Math.pow(rnd(), 3.4) * 4.2e11) / 1000) * 1000 : 0;
  const rusak = rnd() < 0.2;
  merchant.push([
    reg ? reg.mid : '8' + String(800000000 + merchant.length).padStart(9, '0'),
    'Toko Contoh ' + String(merchant.length + 1).padStart(4, '0'),
    D.provinsi.id(prov), D.kabupaten.id(kab), D.kategori.id(kat), D.keluarga.id(kel),
    D.tipe.id(reg ? reg.tipe : pilih(TIPE)), D.status.id(reg ? reg.status : pilih(STATUS)), D.segmen.id(pilih(SEG)),
    D.bulan.id(reg ? reg.bulan : pilih(BULAN_DAFTAR)), loginDays,
    D.bulanLogin.id(punyaLogin ? '2026-' + String(bulat(1, 9)).padStart(2, '0') : null),
    punyaLogin && rnd() < 0.06 ? bulat(2, 4) : 1, punyaLogin ? 1 : 0, punyaTxn ? 1 : 0,
    gmv, txns, txns ? Math.round(gmv / txns) : 0, D.bulanTxn.id(punyaTxn ? '2026-' + String(bulat(1, 9)).padStart(2, '0') : null),
    reg ? 1 : 0, 1, 'NMID-' + String(1000 + merchant.length), rusak ? '9.36E+18' : '9360000' + String(10000000 + merchant.length).padStart(8, '0'),
    D.mpanStatus.id(rusak ? 'rusak: notasi ilmiah' : 'utuh'), gmv ? Math.round(gmv / WIN) : 0,
    punyaTxn ? '2026-0' + bulat(4, 9) + '-1' + bulat(0, 8) : null, punyaLogin ? bulat(0, 23) : -1,
  ]);
};
for (const r of pendaftaran.slice(0, N_AKTIF)) tambahMerchant(r);
for (let i = 0; i < N_HANYA_AKTIF; i++) tambahMerchant(null);

const iM = { mid: 0, nama: 1, prov: 2, kab: 3, cat: 4, fam: 5, tipe: 6, status: 7, seg: 8, bulanDaftar: 9, loginDays: 10, bulanLogin: 11, users: 12, punyaLogin: 13, punyaTxn: 14, gmv: 15, txns: 16, avgTxn: 17, bulanTxn: 18, diRegistry: 19, punyaMid: 20, nmid: 21, mpan: 22, mpanStatus: 23, rataBulan: 24, tglTxn: 25, jamLogin: 26 };
const jum = (rows, k) => rows.reduce((a, r) => a + r[k], 0);
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[(s.length - 1) >> 1] : null; };

const agregat = (rows, dim, ukuran) => {
  const peta = new Map();
  for (const r of rows) {
    const kunci = dim.map(d => r[d]).join('\u0001');
    let o = peta.get(kunci); if (!o) peta.set(kunci, o = [...dim.map(d => r[d]), 0, 0, 0, 0, 0, 0, 0]);
    o[ukuran.n]++;
    const m = olehMid.get(r.mid);
    const baris = m ? merchant.find(x => x[iM.mid] === r.mid) : null;
    if (baris) {
      if (baris[iM.punyaLogin]) o[ukuran.nLogin]++;
      if (baris[iM.loginDays] >= 0 && baris[iM.loginDays] <= 30) o[ukuran.nLogin30]++;
      if (baris[iM.punyaTxn]) o[ukuran.nTxn]++;
      if (baris[iM.punyaTxn] && baris[iM.loginDays] >= 0 && baris[iM.loginDays] <= 30) o[ukuran.nLogin30Txn]++;
      o[ukuran.gmv] += baris[iM.gmv]; o[ukuran.txns] += baris[iM.txns];
    }
  }
  return [...peta.values()];
};
const UK = { n: 5, nLogin: 6, nLogin30: 7, nTxn: 8, gmv: 9, txns: 10, nLogin30Txn: 11 };
const r1 = agregat(pendaftaran, ['bulan', 'prov', 'kab', 'tipe', 'status'], UK)
  .map(o => [D.bulan.id(o[0]), D.provinsi.id(o[1]), D.kabupaten.id(o[2]), D.tipe.id(o[3]), D.status.id(o[4]), o[5], o[6], o[7], o[8], o[9], o[10], o[11]]);
const UK2 = { n: 4, nLogin: 5, nLogin30: 6, nTxn: 7, gmv: 8, txns: 9, nLogin30Txn: 10 };
const r2 = agregat(pendaftaran, ['bulan', 'prov', 'kat', 'kel'], UK2)
  .map(o => [D.bulan.id(o[0]), D.provinsi.id(o[1]), D.kategori.id(o[2]), D.keluarga.id(o[3]), o[4], o[5], o[6], o[7], o[8], o[9], o[10]]);
const r3 = [...(() => { const p = new Map(); for (const r of pendaftaran) { const k = r.bulan + '\u0001' + r.jam; p.set(k, (p.get(k) || 0) + 1); } return [...p].map(([k, n]) => { const [b, j] = k.split('\u0001'); return [D.bulan.id(b), D.jam.id(j), n]; }); })()];
const r4 = [...(() => { const p = new Map(); for (const r of pendaftaran.filter(x => x.status === 'Ditutup')) { const u = r.nonaktif == null ? 'tidak diketahui' : r.nonaktif <= 30 ? '<=30 hari' : r.nonaktif <= 90 ? '31-90 hari' : r.nonaktif <= 180 ? '91-180 hari' : r.nonaktif <= 365 ? '6-12 bulan' : '>12 bulan'; const k = r.bulan + '\u0001' + u; p.set(k, (p.get(k) || 0) + 1); } return [...p].map(([k, n]) => { const [b, u] = k.split('\u0001'); return [D.bulan.id(b), UMUR.indexOf(u), n]; }); })()];
const tAgg = [...(() => { const p = new Map(); for (const r of merchant) { const k = r[iM.tipe]; let o = p.get(k); if (!o) p.set(k, o = [k, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]); o[1]++; if (r[iM.punyaLogin]) o[2]++; if (r[iM.loginDays] >= 0 && r[iM.loginDays] <= 30) o[3]++; if (r[iM.punyaTxn]) o[4]++; o[5] += r[iM.gmv]; o[6] += r[iM.txns]; o[7] += r[iM.users]; if (r[iM.users] > 1) o[8]++; } return [...p.values()].map(o => [...o, 0]); })()];

const gmvTotal = jum(merchant.filter(r => r[iM.punyaTxn] === 1), iM.gmv);
const txnTotal = jum(merchant, iM.txns);
const urut = merchant.filter(r => r[iM.punyaTxn]).map(r => r[iM.gmv]).sort((a, b) => b - a);
const pct = (a, b) => b ? +(a / b * 100).toFixed(1) : null;
const bulanUrut = [...new Set([...pendaftaran.map(r => r.bulan)])].sort();
const tanpaMid = 4, duplikat = 6;

const payload = {
  meta: {
    dibuatPada: new Date().toISOString(), snapshot: SNAP, jendelaTransaksiBulan: WIN, db: '(contoh sintetis)',
    bulanTanpaPendaftaran: ['2026-06'],
    sumber: { folder: '(contoh sintetis)', filePendaftaran: ['contoh-pendaftaran.csv'], fileAktivitas: ['contoh-aktivitas.csv'], fileTransaksi: ['contoh-transaksi.csv'], diabaikan: [] },
    catatan: 'CONTOH — seluruh nama merchant, MID, NMID dan MPAN di file ini dikarang. Ukuran transaksi dihitung pada jendela tetap ~' + WIN + ' bulan.',
    lisensiPeta: 'Batas wilayah: indonesia-38-provinces.geojson, CC BY 4.0 (denyherianto).',
  },
  issues: [
    { label: 'MPAN tersimpan sebagai notasi ilmiah', n: merchant.filter(r => D.mpanStatus.values[r[iM.mpanStatus]] === 'rusak: notasi ilmiah').length, aksi: 'kunci gabungan memakai MID' },
    { label: 'Bulan tanpa baris pendaftaran: 2026-06', n: 0, aksi: 'digambar sebagai celah kosong, bukan nol' },
    { label: 'Baris pendaftaran tanpa MID', n: tanpaMid, aksi: 'keluar dari ringkasan' },
    { label: 'Jumlah User Aktif hampir selalu 1', n: merchant.filter(r => r[iM.users] === 1).length, aksi: 'tidak dipakai sebagai KPI' },
    { label: 'Tipe merchant tidak ada di file transaksi', n: 0, aksi: 'dilengkapi dari tabel pendaftaran' },
    { label: 'Tanggal daftar lebih baru daripada login terakhir', n: 0, aksi: 'tidak terjadi pada data contoh' },
  ],
  kpi: {
    terdaftar: pendaftaran.length, merchantBeraktivitas: merchant.length,
    punyaLogin: merchant.filter(r => r[iM.punyaLogin]).length, punyaTransaksi: merchant.filter(r => r[iM.punyaTxn]).length,
    gmvTotal, gmvPerBulan: gmvTotal / WIN, transaksiTotal: txnTotal, transaksiPerBulan: txnTotal / WIN,
    rataPerTransaksi: gmvTotal / (txnTotal || 1), medianGmv: median(merchant.filter(r => r[iM.punyaTxn] && r[iM.gmv] > 0).map(r => r[iM.gmv])),
    medianUsiaLogin: median(merchant.filter(r => r[iM.loginDays] >= 0).map(r => r[iM.loginDays])),
    konsentrasi: {
      basis: 'persentase nilai transaksi, diurutkan dari merchant terbesar', nBasis: urut.length,
      top10: pct(urut.slice(0, 10).reduce((a, b) => a + b, 0), gmvTotal),
      topSatuPersen: pct(urut.slice(0, Math.round(urut.length * .01)).reduce((a, b) => a + b, 0), gmvTotal),
      topSepuluhPersen: pct(urut.slice(0, Math.round(urut.length * .1)).reduce((a, b) => a + b, 0), gmvTotal),
      merchantTerbesar: { mid: (merchant.find(r => r[iM.gmv] === urut[0]) || {}).mid ?? '—', nama: (merchant.find(r => r[iM.gmv] === urut[0]) || {}).nama ?? '—', gmv: urut[0] ?? 0, share: pct(urut[0] ?? 0, gmvTotal) },
    },
  },
  dims: {
    provinsi: D.provinsi.values, kabupaten: D.kabupaten.values, kategori: D.kategori.values, keluarga: D.keluarga.values,
    tipe: D.tipe.values, status: D.status.values, segmen: D.segmen.values, bulan: D.bulan.values, jam: D.jam.values,
    bulanLogin: D.bulanLogin.values, bulanTxn: D.bulanTxn.values, umurSaatTutup: UMUR, mpanStatus: D.mpanStatus.values,
  },
  provGeo: PROV, bulanUrut,
  idx: {
    r1: { bulan: 0, provinsi: 1, kabupaten: 2, tipe: 3, status: 4, n: 5, nLogin: 6, nLogin30: 7, nTxn: 8, gmv: 9, txns: 10, nLogin30Txn: 11 },
    r2: { bulan: 0, provinsi: 1, kategori: 2, keluarga: 3, n: 4, nLogin: 5, nLogin30: 6, nTxn: 7, gmv: 8, txns: 9, nLogin30Txn: 10 },
    r3: { bulan: 0, jam: 1, n: 2 }, r4: { bulan: 0, umur: 1, n: 2 }, m: iM,
    t: { tipe: 0, n: 1, nLogin: 2, nLogin30: 3, nTxn: 4, gmv: 5, txns: 6, totalUser: 7, multiUser: 8, tanpaMid: 9, nLogin30Txn: 10 },
  },
  tables: {
    r1, r1Cols: ['bulan', 'provinsi', 'kabupaten', 'tipe', 'status', 'n', 'nLogin', 'nLogin30', 'nTxn', 'gmv', 'txns', 'nLogin30Txn'],
    r2, r2Cols: ['bulan', 'provinsi', 'kategori', 'keluarga', 'n', 'nLogin', 'nLogin30', 'nTxn', 'gmv', 'txns', 'nLogin30Txn'],
    r3, r3Cols: ['bulan', 'jam', 'n'], r4, r4Cols: ['bulan', 'umur', 'n'],
    m: merchant, mCols: ['mid', 'nama', 'prov', 'kab', 'cat', 'fam', 'tipe', 'status', 'seg', 'bulanDaftar', 'loginDays', 'bulanLogin', 'users', 'punyaLogin', 'punyaTxn', 'gmv', 'txns', 'avgTxn', 'bulanTxn', 'diRegistry', 'punyaMid', 'nmid', 'mpan', 'mpanStatus', 'rataBulan', 'tglTxn', 'jamLogin'],
    t: tAgg, tCols: ['tipe', 'n', 'nLogin', 'nLogin30', 'nTxn', 'gmv', 'txns', 'totalUser', 'multiUser', 'tanpaMid', 'nLogin30Txn'],
  },
  verifikasi: {
    barisPendaftaranMentah: pendaftaran.length + tanpaMid + duplikat, barisPendaftaran: pendaftaran.length,
    MIDtanpaIsi: tanpaMid, MIDberulang: duplikat * 2, tanggalGagalDibaca: 0, merchantAktivitas: merchant.length,
    segmenTanpaMapping: [], konflikAtribut: 0, provinsiDiGeojson: PROV.length + '/' + PROV.length,
    geojsonTanpaData: ['Papua Tengah', 'Papua Selatan'], konsistensiHariLogin: { cocok: merchant.filter(r => r[iM.punyaLogin]).length, beda: 0 },
    loginSebelumDaftar: 0, rasioNilaiPerBulan: [[WIN, merchant.filter(r => r[iM.punyaTxn]).length]],
    rekonsiliasiMart: { nMart: jum(r1, 5), nFact: pendaftaran.length, selDaerah: r1.length, selKategori: r2.length },
    selisihGmvPersen: 0, duplikatBedaNilai: duplikat, duplikatBedaRinci: [{ kolom: 'tanggal daftar', n: duplikat }],
    mpanNotasiIlmiah: merchant.filter(r => D.mpanStatus.values[r[iM.mpanStatus]] === 'rusak: notasi ilmiah').length,
    userAktifSatu: merchant.filter(r => r[iM.users] === 1).length, formatDibaca: ['csv (contoh)'],
    kelengkapan: ['pendaftaran', 'aktivitas', 'transaksi'].flatMap(j => [['Nama Merchant', 100], ['MID', 99.9], ['Tanggal Daftar', 100]].map(([kolom, persen]) => ({ jenis: j, kolom, baris: j === 'pendaftaran' ? pendaftaran.length : merchant.length, isi: Math.round((j === 'pendaftaran' ? pendaftaran.length : merchant.length) * persen / 100), persen }))),
    akuntansiMerchant: { total: merchant.length, tanpaMid: 0, mpanUtuh: merchant.filter(r => D.mpanStatus.values[r[iM.mpanStatus]] === 'utuh').length, mpanRusak: merchant.filter(r => D.mpanStatus.values[r[iM.mpanStatus]] === 'rusak: notasi ilmiah').length, multiUser: merchant.filter(r => r[iM.users] > 1).length },
    aktivitasBarisDibuang: 0, transaksiBarisDibuang: 0,
  },
};

if (CEK) {
  const asli = JSON.parse(await readFile(TUJUAN, 'utf8'));
  const kurang = Object.keys(asli).filter(k => !(k in payload));
  const kurV = Object.keys(asli.verifikasi).filter(k => !(k in payload.verifikasi));
  const kurM = Object.keys(asli.idx.m).filter(k => !(k in payload.idx.m));
  console.log([`key tingkat atas: asli=${Object.keys(asli).length} contoh=${Object.keys(payload).length} kurang=${kurang.join(',') || 'tidak ada'}`,
    `verifikasi kurang: ${kurV.join(',') || 'tidak ada'}`, `idx.m kurang: ${kurM.join(',') || 'tidak ada'}`,
    `kolom m: asli=${asli.tables.mCols.length} contoh=${payload.tables.mCols.length}`,
    `kolom r1: asli=${asli.tables.r1Cols.length} contoh=${payload.tables.r1Cols.length}`,
    `kolom t: asli=${asli.tables.tCols.length} contoh=${payload.tables.tCols.length}`,
    `baris contoh: m=${payload.tables.m.length} r1=${r1.length} r2=${r2.length} r3=${r3.length} r4=${r4.length} t=${tAgg.length}`].join('\n'));
  process.exit(kurang.length || kurV.length || kurM.length ? 1 : 0);
}

let sudahAda = null;
try { sudahAda = JSON.parse(await readFile(TUJUAN, 'utf8')); } catch { }
if (sudahAda && !String(sudahAda.meta?.catatan || '').includes('CONTOH') && !PAKSA) {
  console.log('DITOLAK: data/dash.json berisi hasil build asli. Tambahkan --paksa hanya kalau Anda sengaja ingin menimpanya dengan data contoh.');
  process.exit(1);
}
await writeFile(TUJUAN, JSON.stringify(payload));
console.log(`data contoh ditulis ke ${TUJUAN}: ${merchant.length} merchant · ${pendaftaran.length} pendaftar · GMV ${gmvTotal.toLocaleString('id-ID')}`);
console.log('Semua nama/MID/MPAN di dalamnya dikarang. Untuk kembali ke angka asli: npm run data');
