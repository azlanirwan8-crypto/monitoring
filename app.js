/* Wondr Merchant — dashboard analitik. Semua angka berasal dari data/dash.json (mart DuckDB),
   dan angka turunan selalu dihitung dari set baris yang sama dengan widget di sebelahnya. */

const S = {
  tab: 'wawasan', bulan: '*', prov: '*', seg: '*', tipe: '*', cari: '',
  peta: 'n', petaMode: 'choro', petaLabel: 'no', petaZoom: 1,
  kab: 'n', rec: 30, pareto: '200', jam: '2026', kurve: 'survival', celah: '30', daftar: 'txn',
  sort: { key: 15, dir: -1 }, midPilih: '', nav: 'side', lipat: 0,
};
let D, iR1, iR2, iR3, iR4, iM, iT;
const CH = {};
let PENGAMAT;

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const el = id => document.getElementById(id);
const TUAMOTION = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ================= format ================= */
const idnum = n => (n == null || !isFinite(n)) ? '—' : Math.round(n).toLocaleString('id-ID');
const rp = n => {
  if (n == null || !isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e12) return 'Rp ' + (n / 1e12).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' triliun';
  if (a >= 1e9) return 'Rp ' + (n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' miliar';
  if (a >= 1e6) return 'Rp ' + (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' juta';
  return 'Rp ' + idnum(n);
};
const short = n => {
  if (n == null || !isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e12) return (n / 1e12).toFixed(1).replace('.', ',') + ' triliun';
  if (a >= 1e9) return (n / 1e9).toFixed(1).replace('.', ',') + ' miliar';
  if (a >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + ' juta';
  if (a >= 1e3) return Math.round(n / 1e3) + ' ribu';
  return idnum(n);
};
const pc = (a, b) => (b ? (a / b) * 100 : 0);
const pctS = (x, d = 1) => (x == null || !isFinite(x) ? '—' : x.toLocaleString('id-ID', { maximumFractionDigits: d, minimumFractionDigits: d }) + '%');
const namaBulan = i => D?.dims.bulan[i] || '';
const namaBulanTxn = i => D?.dims.bulanTxn[i] || '';
const namaBulanLogin = i => D?.dims.bulanLogin[i] || '';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ================= filter ================= */
const okBulan = i => {
  if (S.bulan === '*') return true;
  const b = namaBulan(i);
  return S.bulan === 'pra2026' ? !!b && b < '2026-01' : b === S.bulan;
};
const okProv = i => S.prov === '*' || D.dims.provinsi[i] === S.prov;
const okSeg = i => S.seg === '*' || D.dims.segmen[i] === S.seg;
const okTipe = i => S.tipe === '*' || D.dims.tipe[i] === S.tipe;
/* Baris tanpa MID tetap bisa dipilih di tabel: MID + nama satu-satunya penggabung yang tersedia di sisi penyaji. */
const kunciBaris = r => r[iM.mid] + ' | ' + r[iM.nama];

/* Tipe merchant adalah kolom agregat di mart.agg_daerah, jadi filter ini berlaku di kedua basis. */
const rowsR1 = () => D.tables.r1.filter(r => okBulan(r[iR1.bulan]) && okProv(r[iR1.provinsi]) && okTipe(r[iR1.tipe]));
const rowsR2 = () => D.tables.r2.filter(r => okBulan(r[iR2.bulan]) && okProv(r[iR2.provinsi]));
const rowsR3 = () => D.tables.r3.filter(r => okBulan(r[iR3.bulan]));
const rowsR4 = () => D.tables.r4.filter(r => okBulan(r[iR4.bulan]));
/* Segmen tidak tersedia pada data pendaftaran, jadi hanya tabel merchant yang tersaring segmen. */
const rowsM = () => D.tables.m.filter(r => okBulan(r[iM.bulanDaftar]) && okProv(r[iM.prov]) && okSeg(r[iM.seg]) && okTipe(r[iM.tipe]));

const jum = (rows, col) => rows.reduce((a, r) => a + r[col], 0);
function kelompok(rows, col, ukuran) {
  const out = new Map();
  for (const r of rows) {
    const k = r[col];
    let o = out.get(k);
    if (!o) { o = ukuran.map(() => 0); out.set(k, o); }
    ukuran.forEach((c, j) => { o[j] += c === null ? 1 : r[c]; });
  }
  return out;
}
const urut = (m, j = 0) => [...m.entries()].sort((a, b) => b[1][j] - a[1][j]);
const totalOf = (g, j = 0) => [...g.values()].reduce((a, o) => a + o[j], 0);
const med = a => { const v = a.filter(x => isFinite(x)).sort((x, y) => x - y); return v.length ? v[(v.length - 1) >> 1] : null; };
const kuantil = (a, p) => { const v = a.filter(x => isFinite(x)).sort((x, y) => x - y); return v.length ? v[Math.min(v.length - 1, Math.floor(p * (v.length - 1)))] : null; };

const BUCKET = [
  { max: 1, l: '0–1 hari' }, { max: 7, l: '2–7 hari' }, { max: 30, l: '8–30 hari' }, { max: 90, l: '31–90 hari' },
  { max: 180, l: '91–180 hari' }, { max: 365, l: '6–12 bulan' }, { max: Infinity, l: '> 12 bulan' },
];
const bucketOf = d => (!(d >= 0)) ? -1 : BUCKET.findIndex(b => d <= b.max);

/* ================= tema Velzon (galaxy, terang) ================= */
const INK = '#141414', INK2 = '#4e4e4e', INK3 = '#8c8c8c', LINE = '#e5e7eb';
const PR = '#3aa8a0', PR2 = '#2c7e78', SC = '#71dbd3', SU = '#008a00', SF = '#5ccfc5', SW = '#ff8500', SD = '#e60000';
/* SWT & PR2: varian gelap untuk teks/angka di atas putih — merek aslinya terlalu terang (lihat rasio di styles.css). */
const SWT = '#a65600';
const AKSEN = PR;
const KATEGORI = [PR, SC, '#deef5a', SW, SF, '#d65c5c', '#a7ece8', INK2, SU, '#3fd8d4'];
const RAMP = ['#d9f4f1', '#c2f0ec', '#a7ece8', '#71dbd3', '#5ccfc5', '#3fd8d4', '#3aa8a0'];
const AXIS = {
  axisLine: { lineStyle: { color: '#dadada' } }, axisTick: { show: false },
  axisLabel: { color: INK3, fontSize: 10.5 }, splitLine: { lineStyle: { color: '#f0f0f0', type: 'solid' } },
  nameTextStyle: { color: INK3, fontSize: 10.5, align: 'left' },
};
const GRID = { left: 4, right: 10, top: 30, bottom: 2, containLabel: true };
const TIP = {
  backgroundColor: '#fff', borderColor: LINE, borderWidth: 1, confine: true, padding: [7, 10],
  textStyle: { color: INK, fontSize: 12 }, extraCssText: 'border-radius:12px;box-shadow:0 5px 10px rgba(14,14,14,.14)',
};
const LEG = { top: 0, right: 0, itemWidth: 8, itemHeight: 8, itemGap: 10, icon: 'circle', textStyle: { fontSize: 11, color: INK2 } };
/* Semua grafik masuk sini supaya satu render tab tidak membangun puluhan instans sekaligus. */
const ANIM = {
  animation: true, animationDuration: 620, animationEasing: 'cubicOut',
  animationDurationUpdate: 420, animationEasingUpdate: 'cubicOut',
  animationDelay: i => Math.min(i * 9, 340), animationDelayUpdate: i => Math.min(i * 5, 160),
};

/** Grafik dibangun satu per satu di luar alur klik; rAF tidak jalan pada tab tersembunyi. */
const ANTRE = [];
const HOOK = {};           // pasang event per instans, dipanggil saat instans pertama kali dibuat
let jalur = false, sejak = 0;
const jadwalkan = fn => (document.hidden ? setTimeout(fn, 16) : requestAnimationFrame(fn));
function chart(id, opt) {
  const node = el(id);
  if (!node) return;
  for (let k = ANTRE.length - 1; k >= 0; k--) if (ANTRE[k][0] === id) ANTRE.splice(k, 1);
  ANTRE.push([id, node, {
    ...ANIM, ...opt, color: opt.color || KATEGORI,
    textStyle: { fontFamily: 'inherit', ...(opt.textStyle || {}) },
  }]);
  if (!jalur) { jalur = true; sejak = Math.max(1, ANTRE.length); jadwalkan(gambarBerikutnya); }
}
function gambarBerikutnya() {
  // Tab tersembunyi di-clamp 1 detik per tick: selesaikan sekaligus, tidak ada yang melihat.
  const ambang = document.hidden ? Infinity : performance.now() + 8;
  while (ANTRE.length && performance.now() < ambang) {
    const [id, node, opt] = ANTRE.shift();
    let c = CH[id], baru = false;
    if (!c || c.isDisposed()) {
      c = CH[id] = echarts.init(node); baru = true;
      if (HOOK[id]) HOOK[id](c);
    }
    c.setOption(opt, true);
    if (!node.dataset.ro) { node.dataset.ro = '1'; PENGAMAT.observe(node); }
  }
  jalur = false;
  if (ANTRE.length) { jalur = true; jadwalkan(gambarBerikutnya); maju((sejak - ANTRE.length) / sejak); }
  else maju(1);
}
function maju(rasio) {
  const b = el('qbar'); if (!b) return;
  if (rasio >= 1) { b.style.width = '100%'; b.style.opacity = '0'; setTimeout(() => { b.style.width = '0'; }, 260); return; }
  b.style.opacity = '1'; b.style.width = Math.max(6, Math.round(rasio * 100)) + '%';
}

/* ---------- keping visual kecil ---------- */
function spark(nilai, opsi = {}) {
  const v = nilai.filter(x => x != null);
  if (v.length < 2) return '<span class="spark"></span>';
  const W = 74, H = 26, p = 2;
  const min = Math.min(...v), max = Math.max(...v), r = max - min || 1;
  const pts = nilai.map((x, i) => x == null ? null : [p + i * (W - 2 * p) / (nilai.length - 1), H - p - ((x - min) / r) * (H - 2 * p)]);
  const garis = pts.filter(Boolean).map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)},${q[1].toFixed(1)}`).join('');
  const akhir = pts.filter(Boolean).slice(-1)[0];
  const warna = opsi.warna || PR;
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true">
    <path d="${garis}L${(akhir[0]).toFixed(1)},${H} L${pts.find(Boolean)[0].toFixed(1)},${H}Z" fill="${warna}" opacity=".09"/>
    <path class="dr" d="${garis}" fill="none" stroke="${warna}" stroke-width="1.5" stroke-linejoin="round"/>
    <circle cx="${akhir[0].toFixed(1)}" cy="${akhir[1].toFixed(1)}" r="1.9" fill="${warna}"/></svg>`;
}
function delta(kini, lalu) {
  if (lalu == null || !isFinite(lalu) || lalu === 0) return '<span class="delta flat">—</span>';
  const d = (kini - lalu) / Math.abs(lalu) * 100;
  const kelas = d > 0.5 ? 'up' : d < -0.5 ? 'down' : 'flat';
  const tanda = d > 0 ? '+' : d < 0 ? '−' : '±';
  return `<span class="delta ${kelas}" title="kelompok pendaftar bulan sebelumnya: ${idnum(lalu)}">${tanda}${Math.abs(d).toFixed(1)}%</span>`;
}
const FMT = { id: idnum, rp, short, pct: x => pctS(x), hari: x => idnum(x) + ' hari' };
/* Luminansi WCAG: teks di atas isian berwarna dipilih otomatis supaya palet merek yang terang tidak bikin angka hilang. */
const luma = h => { const v = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(c => c <= .03928 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
const tinta = c => luma(c) > .34 ? INK : '#fff';

/* ================= init ================= */
async function init() {
  const t0 = performance.now();
  // Hosting statis (mis. Vercel) hanya membawa kode + contoh: kalau data/dash.json hasil build
  // asli tidak ada, pakai dash.contoh.json supaya halaman tetap tampil, bukan kosong.
  const ambilJson = async (utama, cadangan) => {
    try { const r = await fetch(utama); if (r.ok) return await r.json(); } catch { /* jatuh ke contoh */ }
    return (await fetch(cadangan)).json();
  };
  const [dash, peta] = await Promise.all([
    ambilJson('data/dash.json', 'data/dash.contoh.json'),
    fetch('data/peta.json').then(r => r.json()),
  ]);
  D = dash;
  ({ r1: iR1, r2: iR2, r3: iR3, r4: iR4, m: iM, t: iT } = D.idx);
  GEO.peta = peta;
  echarts.registerMap('indonesia', peta);
  PENGAMAT = new ResizeObserver(es => {
    for (const e of es) { const c = CH[e.target.id]; if (c && !c.isDisposed() && e.contentRect.width > 0) c.resize(); }
  });
  S.nav = localStorage.getItem('wondr.nav') || 'side';
  S.lipat = +(localStorage.getItem('wondr.lipat') || 0);
  pasangKerangka();
  el('snap').textContent = D.meta.snapshot;
  el('snapSide').textContent = D.meta.snapshot;
  el('penandaContoh').hidden = !/CONTOH/.test(String(D.meta.catatan || ''));
  // Badge asal data jadi pintasan ke tab Mutu data (riwayat + panel audit), dengan tooltip kapan terakhir sinkron.
  const pill = el('pillSumber');
  if (pill) {
    const sinkron = D.meta.dibuatPada ? new Date(D.meta.dibuatPada).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : 'tidak diketahui';
    pill.title = `Sinkron terakhir: ${sinkron} · klik untuk melihat asal & riwayat data`;
    const ke = () => pindahTab('mutu');
    pill.addEventListener('click', ke);
    pill.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ke(); } });
  }
  isiFilter();
  pasangEvent();
  pasangTambah();
  hitungBadge();
  el('foot').innerHTML = [
    `DuckDB <span class="mono">${D.meta.db.replace(/\\/g, '/')}</span>`,
    `${idnum(D.tables.m.length)} baris merchant · ${idnum(D.tables.r1.length)} sel ringkasan`,
    D.meta.lisensiPeta,
    `build ${D.meta.dibuatPada.slice(0, 16).replace('T', ' ')}`,
    `muat ${(performance.now() - t0).toFixed(0)} ms`,
    `render terakhir <b id="ms">—</b> ms`,
  ].join('<span class="sep">·</span>');
  render();
}

function hitungBadge() {
  const K = D.kpi;
  const provIso = Object.keys(D.provGeo).length;
  el('cntWawasan').textContent = '6';
  el('cntRingkasan').textContent = short(K.terdaftar);
  el('cntWilayah').textContent = provIso + ' prov';
  el('cntAktivitas').textContent = short(K.merchantBeraktivitas);
  el('cntTransaksi').textContent = short(K.punyaTransaksi);
  el('cntMutu').textContent = String(D.issues.length + 1);
  const pct = pc(provIso, D.dims.provinsi.filter(p => p !== '(tidak ada)').length);
  el('pctLengkap').textContent = pctS(pct, 0);
  el('barLengkap').style.width = Math.min(100, pct) + '%';
}

/* ---------- kerangka: dua versi menu ---------- */
function pasangKerangka() {
  const root = document.documentElement, body = document.body;
  body.dataset.nav = root.dataset.nav = S.nav;
  body.dataset.collapsed = S.lipat ? '1' : '0';
  el('icNav').outerHTML = S.nav === 'side'
    ? `<svg viewBox="0 0 24 24" id="icNav"><rect x="3" y="4" width="5" height="16" rx="1.4"/><rect x="10" y="4" width="11" height="4" rx="1.4"/><rect x="10" y="11" width="11" height="9" rx="1.4"/></svg>`
    : `<svg viewBox="0 0 24 24" id="icNav"><rect x="3" y="3.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.2"/></svg>`;
  el('btnNav').title = S.nav === 'side' ? 'Pakai menu atas' : 'Pakai menu samping';
  el('navHint').textContent = S.nav === 'side' ? '' : 'menu versi atas';
}

function pindahTab(tab) {
  if (S.tab === tab) return;
  S.tab = tab;
  $$('.vitem').forEach(b => b.dataset.tab === tab ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  $$('#topnav button').forEach(b => b.dataset.tab === tab ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  $$('main section').forEach(s => { s.hidden = s.id !== 'tab-' + tab; });
  el('crumbNow').textContent = (el('topnav').querySelector(`[data-tab="${tab}"]`)?.textContent || tab).trim();
  render();
}

function isiFilter() {
  el('fBulan').innerHTML = `<option value="*">Semua</option><option value="pra2026">Sebelum 2026</option>`
    + D.bulanUrut.filter(b => b >= '2026-01').map(b => `<option value="${b}">${b}</option>`).join('');
  const prov = D.dims.provinsi.filter(p => p !== '(tidak ada)').sort((a, b) => a.localeCompare(b, 'id'));
  el('fProv').innerHTML = `<option value="*">Semua provinsi</option>` + prov.map(p => `<option>${p}</option>`).join('');
  const seg = D.dims.segmen.filter(s => s && s !== '(tidak ada)');
  el('fSeg').innerHTML = `<option value="*">Semua segmen</option>` + seg.map(s => `<option>${s}</option>`).join('');
  el('fSeg').title = 'Segmen hanya tersedia pada data aktivitas dan transaksi.';
  el('fTipe').innerHTML = `<option value="*">Semua tipe</option>` + D.dims.tipe.map(t => `<option>${t}</option>`).join('');
  el('fTipe').title = 'Tipe merchant ada di file pendaftaran dan aktivitas, tidak ada di file transaksi.';
}

function pasangEvent() {
  el('fBulan').onchange = e => { S.bulan = e.target.value; render(); };
  el('fProv').onchange = e => { S.prov = e.target.value; render(); };
  el('fSeg').onchange = e => { S.seg = e.target.value; render(); };
  el('fTipe').onchange = e => { S.tipe = e.target.value; render(); };
  el('btnReset').onclick = () => {
    S.bulan = S.prov = S.seg = S.tipe = '*'; S.cari = ''; S.midPilih = '';
    el('fBulan').value = el('fProv').value = el('fSeg').value = el('fTipe').value = '*';
    el('q').value = '';
    render();
  };

  $$('.vitem, #topnav button').forEach(b => b.onclick = () => pindahTab(b.dataset.tab));
  el('btnNav').onclick = () => {
    S.nav = S.nav === 'side' ? 'top' : 'side';
    localStorage.setItem('wondr.nav', S.nav);
    pasangKerangka(); setelahTataUlang();
  };
  el('btnCollapse').onclick = () => {
    S.lipat = S.lipat ? 0 : 1;
    localStorage.setItem('wondr.lipat', String(S.lipat));
    document.body.dataset.collapsed = S.lipat ? '1' : '0';
    setTimeout(sebelumResize, 300);
  };
  el('zIn').onclick = () => zumPeta(1.45);
  el('zOut').onclick = () => zumPeta(1 / 1.45);
  el('zReset').onclick = () => { S.petaZoom = 1; render(); };

  pasangCari();
  window.addEventListener('resize', sebelumResize);
  document.addEventListener('keydown', e => {
    if (e.key === '/' && document.activeElement !== el('q')) { e.preventDefault(); el('q').focus(); }
    if (e.key === 'Escape') { el('sugg').classList.remove('on'); el('q').blur(); }
  });
}
function setelahTataUlang() {
  // Lebar konten berubah. Sengaja setTimeout, bukan rAF: rAF tidak pernah jalan pada tab tersembunyi.
  setTimeout(sebelumResize, 340);
}
function sebelumResize() {
  for (const [id, c] of Object.entries(CH)) { const n = el(id); if (c && !c.isDisposed() && n && n.offsetParent) c.resize(); }
}

/* ================= kartu & kontrol ================= */
function kontrol(nodeId, opsi, aktif, pilih) {
  const n = el(nodeId);
  if (!n) return;
  n.innerHTML = opsi.map(o => `<button data-v="${o.v}" aria-pressed="${String(o.v === String(aktif))}">${o.l}${o.n != null ? `<span class="v">${o.n}</span>` : ''}</button>`).join('');
  n.onclick = e => { const b = e.target.closest('button'); if (b) pilih(b.dataset.v); };
}

function kartu(nodeId, daftar) {
  el(nodeId).innerHTML = daftar.map(k => `<div class="kpi ${k.kelas || ''}" style="--c:${k.c || 'var(--primary)'}">
    <div class="l">${k.l}${k.tip ? `<span class="info" tabindex="0" role="note" aria-label="Cara menghitung"><i>i</i><span class="tipbox">${k.tip}</span></span>` : ''}</div>
    <div class="row"><div class="v" ${k.n != null ? `data-num="${k.n}" data-fmt="${k.f || 'id'}"` : ''}>${k.v}</div>${k.spark || ''}</div>
    <div class="s">${k.s || ''} ${k.delta || ''}</div></div>`).join('');
  hiturNaik(el(nodeId));
}
function hiturNaik(wadah) {
  if (TUAMOTION || document.hidden) return;
  for (const node of wadah.querySelectorAll('[data-num]')) naikkan(node);
}
function naikkan(node) {
  const target = +node.dataset.num, fmt = FMT[node.dataset.fmt] || idnum;
  if (!isFinite(target)) return;
  const dur = 620, t0 = performance.now();
  node.textContent = fmt(0);
  const maju = () => {
    const p = Math.min(1, (performance.now() - t0) / dur);
    node.textContent = fmt(target * (1 - Math.pow(1 - p, 3)));
    if (p < 1 && node.isConnected) requestAnimationFrame(maju); else node.textContent = fmt(target);
  };
  requestAnimationFrame(maju);
}

function chipsFilter() {
  const i = iM, aktif = [];
  if (S.bulan !== '*') aktif.push(['Bulan', S.bulan, 'bulan']);
  if (S.prov !== '*') aktif.push(['Provinsi', S.prov, 'prov']);
  if (S.seg !== '*') aktif.push(['Segmen', S.seg, 'seg']);
  if (S.tipe !== '*') aktif.push(['Tipe', S.tipe, 'tipe']);
  if (S.cari) aktif.push(['Cari', S.cari, 'cari']);
  el('chips').innerHTML = aktif.map(a => `<span class="chip">${a[0]}: <b>${esc(a[1])}</b><button data-clear="${a[2]}" title="Hapus saringan">×</button></span>`).join('');
  el('chips').onclick = e => {
    const b = e.target.closest('[data-clear]'); if (!b) return;
    const k = b.dataset.clear;
    if (k === 'bulan') { S.bulan = '*'; el('fBulan').value = '*'; }
    if (k === 'prov') { S.prov = '*'; el('fProv').value = '*'; }
    if (k === 'seg') { S.seg = '*'; el('fSeg').value = '*'; }
    if (k === 'tipe') { S.tipe = '*'; el('fTipe').value = '*'; }
    if (k === 'cari') { S.cari = ''; el('q').value = ''; }
    render();
  };
  const ruang = [S.bulan === '*' ? null : (S.bulan === 'pra2026' ? 'sebelum 2026' : 'pendaftar ' + S.bulan),
    S.prov === '*' ? null : S.prov, S.seg === '*' ? null : S.seg, S.tipe === '*' ? null : S.tipe, S.cari ? `nama “${S.cari}”` : null].filter(Boolean);
  el('ruangLingkup').textContent = ruang.length ? ruang.join(' · ') : 'seluruh data';
}

function render() {
  const t0 = performance.now();
  ANTRE.length = 0;
  chipsFilter();
  const d = { R1: rowsR1(), R2: rowsR2(), R3: rowsR3(), R4: rowsR4(), M: rowsM() };
  ({ wawasan: renderWawasan, ringkasan: renderRingkasan, wilayah: renderWilayah, aktivitas: renderAktivitas, transaksi: renderTransaksi, mutu: renderMutu })[S.tab](d);
  const ms = ((el('ms') || {}).textContent = (performance.now() - t0).toFixed(0));
  return ms;
}

/* ============ helpers bersama ============ */
function deretBulan(perBulan, idxB, mon2026, col) {
  return mon2026.map(mo => { const o = perBulan.get(idxB.get(mo)); return o ? o[col] : null; });
}
const POKOK = () => ({
  idxB: new Map(D.dims.bulan.map((b, k) => [b, k])),
  mon2026: D.bulanUrut.filter(b => b >= '2026-01'),
});
const akhir = a => { const v = a.filter(x => x != null); return v.length ? v[v.length - 1] : null; };
const sebelum = a => { const v = a.filter(x => x != null); return v.length > 1 ? v[v.length - 2] : null; };
const AMBANG_MIKRO_TAHUN = 2e9;
const terbesarDari = (rows, i) => rows.length ? rows.reduce((a, r) => (a && a[i.gmv] >= r[i.gmv]) ? a : r, null) : null;

/* ================= WAWASAN — sudut pandang analis ================= */
function renderWawasan({ R1, M }) {
  const i = iM, j = iR1, W = D.meta.jendelaTransaksiBulan;
  const { idxB, mon2026 } = POKOK();
  const totM = M.length;
  const login = M.filter(r => r[i.punyaLogin]);
  const a30 = login.filter(r => r[i.loginDays] <= 30).length;
  const a90 = login.filter(r => r[i.loginDays] <= 90).length;
  const txn = M.filter(r => r[i.punyaTxn] && r[i.gmv] > 0);
  const gm = txn.reduce((a, r) => a + r[i.gmv], 0);
  const terdaf = jum(R1, j.n);
  /* konsentrasi dihitung di sini supaya kartu skor, kurva Lorenz, dan kaki grafiknya satu sumber */
  const gmvUrut = txn.map(r => r[i.gmv]).sort((a, b) => b - a);
  const nG = gmvUrut.length;
  const top10f = gmvUrut.slice(0, 10).reduce((a, v) => a + v, 0);
  const top1Persen = gmvUrut.slice(0, Math.max(1, Math.round(nG / 100))).reduce((a, v) => a + v, 0);
  const terbesar = terbesarDari(txn, i);

  /* --- 0. ringkasan untuk pimpinan: bahasa manusia, bukan label grafik --- */
  const laju = gm / W;
  const dorman = M.filter(r => r[i.loginDays] > 180).length;
  el('execTanggal').textContent = `per ${D.meta.snapshot} · ${idnum(totM)} merchant terukur`;
  el('execIsi').innerHTML = [
    { c: PR2, n: rp(gm), t: 'beredar lewat aplikasi', s: `dalam ${W} bulan · ${short(laju)} per bulan · dari ${idnum(txn.length)} merchant yang membayar` },
    { c: SD, n: pctS(pc(dorman, totM)), t: 'dari yang terekam, sudah berhenti login', s: `${idnum(dorman)} dari ${idnum(totM)} merchant yang tercatat aktivitasnya tidak membuka aplikasi lebih dari 180 hari` },
    { c: SWT, n: pctS(pc(top10f, gm)), t: 'nilai di sepuluh merchant saja', s: `${pctS(gmvUrut.length ? pc(gmvUrut[0], gm) : 0)} di antaranya datang dari satu nama. Satu perpindahan akun mengubah laporan.` },
  ].map(x => `<div class="ex">
      <div class="exn" style="color:${x.c}">${x.n}</div>
      <div class="ext"><b>${x.t}</b><span>${x.s}</span></div></div>`).join('');

  /* --- 1. skor kesehatan --- */
  const komponen = [
    { l: 'Login dalam 30 hari', v: pc(a30, totM), target: 25, c: PR, ket: idnum(a30) + ' dari ' + idnum(totM) + ' merchant yang terekam aktivitasnya — bukan dari seluruh pendaftar' },
    { l: 'Turun jadi pembayar', v: pc(txn.length, totM), target: 60, c: SC, ket: 'punya nilai transaksi > 0' },
    { l: 'Retensi 90 hari', v: pc(a90, totM), target: 40, c: SU, ket: 'login dalam 90 hari terakhir' },
    { l: 'Diversifikasi nilai', v: 100 - pc(top10f, gm), target: 75, c: SF, ket: '100 dikurangi bagian 10 merchant terbesar' },
  ];
  const nilai = komponen.map(k => Math.max(0, Math.min(1, k.v / k.target)) * 100);
  const BERAT = [.3, .25, .25, .2];
  const skor = nilai.reduce((a, v, k) => a + v * BERAT[k], 0);
  el('wSub').textContent = `dihitung dari ${idnum(totM)} merchant beraktivitas dalam saringan aktif · sasaran masih asumsi tim, ubah di array komponen()`;
  el('subSkor').textContent = skor >= 75 ? 'sehat' : skor >= 55 ? 'perlu perhatian' : 'kritis';
  el('skorNilai').dataset.num = Math.round(skor);
  el('skorNilai').dataset.fmt = 'id';
  el('skorNilai').textContent = Math.round(skor);
  if (!TUAMOTION && !document.hidden) naikkan(el('skorNilai'));
  el('mSkor').innerHTML = komponen.map((k, x) => `<div class="meter">
    <div class="mt"><span>${k.l} <span class="note-sm">— ${k.ket}</span></span><b>${pctS(k.v)} <span class="note-sm">/ sasaran ${k.target}%</span></b></div>
    <div class="track" style="--c:${k.c};--w:${Math.min(100, nilai[x]).toFixed(0)}%"><i></i></div></div>`).join('');
  chart('cSkor', {
    ...ANIM, animationDuration: 1000,
    series: [{
      type: 'gauge', startAngle: 90, endAngle: -270, radius: '100%', center: ['50%', '50%'],
      pointer: { show: false }, progress: { show: true, overlap: false, roundCap: true, clip: false, itemStyle: { color: skor >= 75 ? SU : skor >= 55 ? SW : SD }, width: 11 },
      axisLine: { lineStyle: { width: 11, color: [[1, '#f0f0f0']] } }, splitNumber: 1, axisTick: { show: false }, axisLabel: { show: false },
      anchor: { show: false }, title: { show: false }, detail: { show: false }, data: [{ value: skor }],
    }],
  });

  /* --- 2. Lorenz + HHI — semuanya dari set `txn` yang sama dengan kartu skor di sebelahnya --- */
  let cums = 0;
  const pts = [[0, 0]];
  const langkah = Math.max(1, Math.floor(nG / 160));
  for (let k = 0; k < nG; k++) {
    cums += gmvUrut[k];
    if ((k + 1) % langkah === 0 || k === nG - 1) pts.push([+((k + 1) / nG * 100).toFixed(2), +(cums / gm * 100).toFixed(2)]);
  }
  /* Angka Gini dari rumus peringkat (eksak untuk 13 ribu baris); kurva di atas hanya untuk bentuknya. */
  let bobot = 0;
  const naik = gmvUrut.slice().sort((a, b) => a - b);
  for (let k = 0; k < naik.length; k++) bobot += (k + 1) * naik[k];
  const gini = (2 * bobot / (nG * gm) - (nG + 1) / nG) * 100;
  const hhi = gmvUrut.reduce((a, v) => a + Math.pow(v / gm * 100, 2), 0);
  const ekuivalen = hhi > 0 ? 1e4 / hhi : null;
  chart('cLorenz', {
    ...ANIM, animationDuration: 900,
    tooltip: { ...TIP, trigger: 'axis', formatter: p => `${pctS(p[0].value[0])} merchant teratas<br>menguasai <b>${pctS(p[0].value[1])}</b> dari nilai transaksi` },
    grid: { left: 4, right: 12, top: 22, bottom: 2, containLabel: true },
    xAxis: { type: 'value', max: 100, name: 'merchant (kumulatif)', ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: '{value}%' } },
    yAxis: { type: 'value', max: 100, name: 'nilai (kumulatif)', ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: '{value}%' } },
    series: [
      { type: 'line', data: [[0, 0], [100, 100]], symbol: 'none', lineStyle: { width: 1, type: 'dashed', color: INK3 }, tooltip: { show: false }, name: 'merata' },
      {
        type: 'line', data: pts, symbol: 'none', smooth: true, name: 'kenyataan',
        lineStyle: { width: 2.2, color: PR }, areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 1, y2: 1, colorStops: [{ offset: 0, color: 'rgba(113,219,211,.34)' }, { offset: 1, color: 'rgba(113,219,211,.02)' }] } },
      }],
  });
  el('hintLorenz').innerHTML = `${idnum(nG)} merchant pembayar · ketimpangan Gini <b>${pctS(gini)}</b> · HHI <b>${idnum(hhi)}</b> — kalau dibagi rata, ini setara <b>${ekuivalen ? ekuivalen.toFixed(0) : '—'}</b> merchant berukuran sama; nilai terbesar sendiri sudah ${terbesar ? pctS(pc(terbesar[i.gmv], gm)) : '—'}`;
  el('kakiLorenz').innerHTML = [
    terbesar ? `<span class="sw"><i style="background:${SD}"></i>1 merchant = ${pctS(pc(terbesar[i.gmv], gm))} nilai</span>` : '',
    `<span class="sw"><i style="background:${SW}"></i>10 teratas = ${pctS(pc(top10f, gm))}</span>`,
    `<span class="sw"><i style="background:${PR}"></i>1% teratas = ${pctS(pc(top1Persen, gm))}</span>`,
    terbesar ? `<span class="note-sm">terbesar: <b>${esc(terbesar[i.nama])}</b> MID ${terbesar[i.mid]}</span>` : '',
  ].join('');

  /* --- 2b. empat golongan merchant: dua sumbu yang sama persis dengan kartu di atas ---
     login30 = punya login & hari_since_login 0..30 (predikat n_login30); bayar = punya transaksi & nilai>0
     (predikat `txn`). Empat sel ini saling eksklusif dan menutupi seluruh M, jadi jumlahnya selalu = totM. */
  const login30q = r => r[i.punyaLogin] === 1 && r[i.loginDays] >= 0 && r[i.loginDays] <= 30;
  const bayarq = r => r[i.punyaTxn] === 1 && r[i.gmv] > 0;
  const Q = [
    { c: SU, nama: 'Rajin & membayar', uji: r => bayarq(r) && login30q(r), arti: 'Buka aplikasi ≤30 hari dan punya transaksi — tulang punggung portofolio.' },
    { c: SW, nama: 'Membayar, tak buka aplikasi', uji: r => bayarq(r) && !login30q(r), arti: 'Terus menerima QRIS tapi tidak login — bisa lepas tanpa terasa.' },
    { c: PR, nama: 'Rajin login, belum bayar', uji: r => !bayarq(r) && login30q(r), arti: 'Aktif di aplikasi tapi belum ada transaksi — prospek onboarding pembayaran.' },
    { c: SD, nama: 'Sepi', uji: r => !bayarq(r) && !login30q(r), arti: 'Tidak transaksi dan tidak login akhir-akhir ini — kandidat pemeliharaan.' },
  ];
  const hitQ = Q.map(x => { const g = M.filter(x.uji); return { ...x, n: g.length, nilai: g.reduce((a, r) => a + r[i.gmv], 0) }; });
  el('subKuadran').textContent = `${idnum(totM)} merchant · saringan aktif`;
  el('hintKuadran').innerHTML = `Dua sumbu: <b>login 30 hari terakhir</b> dan <b>transaksi bernilai</b> — predikat yang sama dengan skor kesehatan dan kurva ketimpangan di atas. Keempat kotak membagi seluruh merchant tanpa tumpang tindih.`;
  el('kuadranGrid').innerHTML = hitQ.map(x => `<div class="q" style="--qc:${x.c}">
    <div class="qn">${idnum(x.n)}</div>
    <div class="qt">${x.nama}</div>
    <div class="qs">${pctS(pc(x.n, totM))} dari merchant · ${short(x.nilai)} nilai</div>
    <div class="qm">${x.arti}</div></div>`).join('');

  /* --- 2c. unduhan aplikasi: deret global, TIDAK ikut saringan merchant (tidak ada kunci MID) --- */
  const und = (D.meta.unduhan || []).filter(x => x && isFinite(x.jumlah));
  const cU = el('cUnduhan');
  if (!und.length) {
    el('subUnduhan').textContent = 'belum ada data';
    el('hintUnduhan').innerHTML = 'Belum ada berkas unduhan di folder sumber. Tekan <b>Ambil dari Google Sheet</b> di tab Mutu data, atau letakkan ekspor unduhan lalu bangun ulang.';
    cU.hidden = true;
  } else {
    cU.hidden = false;
    const trk = und[und.length - 1], sblm = und.length > 1 ? und[und.length - 2] : null;
    const dSel = sblm && sblm.jumlah ? (trk.jumlah - sblm.jumlah) / sblm.jumlah * 100 : null;
    el('subUnduhan').textContent = `${idnum(trk.jumlah)} unduhan · ${trk.periode}`;
    el('hintUnduhan').innerHTML = [
      'Android saja — konsol Apple belum menyediakan ekspor unduhan.',
      dSel == null ? '' : `periode sebelumnya ${idnum(sblm.jumlah)} → <b style="color:${dSel >= 0 ? SU : SD}">${dSel >= 0 ? '+' : '−'}${pctS(Math.abs(dSel))}</b>`,
      'Lebar tiap periode bisa berbeda, jadi batang untuk melihat arah, bukan untuk membagi laju harian.',
    ].filter(Boolean).join(' · ');
    chart('cUnduhan', {
      ...ANIM, animationDuration: 700,
      tooltip: { ...TIP, trigger: 'axis', formatter: p => `<b>${p[0].name}</b><br>${idnum(p[0].value)} unduhan` },
      grid: { ...GRID, top: 18 },
      xAxis: { type: 'category', data: und.map(x => x.periode), ...AXIS, splitLine: { show: false }, axisLabel: { ...AXIS.axisLabel, fontSize: 10 } },
      yAxis: { type: 'value', ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: v => idnum(v) } },
      series: [{
        type: 'bar', barMaxWidth: 46,
        data: und.map((x, k) => ({ value: x.jumlah, itemStyle: { borderRadius: [3, 3, 0, 0], color: k === und.length - 1 ? PR : SF } })),
        label: { show: true, position: 'top', fontSize: 10, color: INK3, formatter: p => idnum(p.value) },
      }],
    });
  }

  /* --- 3. rekomendasi tindakan --- */
  const winback = M.filter(r => r[i.punyaTxn] && r[i.loginDays] > 180);
  const nilaiWinback = winback.reduce((a, r) => a + r[i.gmv], 0) / W;
  const belumBayar = login.filter(r => r[i.loginDays] <= 30 && !r[i.punyaTxn]);
  const salahLabel = M.filter(r => D.dims.segmen[r[i.seg]] === 'Usaha Mikro' && r[i.gmv] > AMBANG_MIKRO_TAHUN * W / 12);
  /* Celah kohort diambil dari agregat pendaftaran — sama seperti kartu di tab Ringkasan,
     karena tabel merchant hanya memuat yang punya jejak aktivitas (kohort 2026 masih tipis). */
  const perKohortReg = kelompok(R1, j.bulan, [j.n, j.nLogin30, j.nTxn]);
  const deret = mon2026.map(mo => {
    const o = perKohortReg.get(idxB.get(mo));
    return o && o[0] ? { mo, n: o[0], ak: pc(o[1], o[0]), kt: pc(o[2], o[0]) } : { mo, n: 0, ak: null, kt: null };
  });
  const kohortLemah = deret.filter(x => x.n >= 500 && x.ak != null).sort((a, b) => a.ak - b.ak);
  const byProvM = kelompok(M, i.prov, [null, i.punyaTxn, i.gmv]);
  const prospek = [...byProvM.entries()].map(([k, o]) => {
    const tanpa = o[0] - o[1], nilaiPerTxn = o[1] ? o[2] / o[1] / W : 0;
    return { prov: D.dims.provinsi[k], tanpa, perTxn: nilaiPerTxn, potensi: tanpa * nilaiPerTxn, n: o[0] };
  }).filter(x => x.prov && x.n > 40).sort((a, b) => b.potensi - a.potensi);
  const k1 = kohortLemah[0];

  const AKSI = [
    { c: SD, t: `Hidupkan kembali ${idnum(winback.length)} merchant tidak aktif yang pernah membayar`, d: `tidak login sejak 180 hari lalu`, k: `${short(nilaiWinback)}`, s: 'rupiah/bulan yang berhenti', q: 'Panggil kembali 90 hari', x: `Nilai mereka ${pctS(pc(nilaiWinback, gm / W))} dari laju bulanan. Lebih murah memanggil yang sudah tahu produk daripada akuisisi buta.` },
    { c: SWT, t: `Ubah ${idnum(belumBayar.length)} merchant rajin login tapi nol transaksi`, d: 'sudah buka aplikasi ≤ 30 hari', k: `${pctS(pc(belumBayar.length, totM))}`, s: 'dari portofolio', q: 'Onboarding pembayaran', x: 'Mereka tidak keberatan dengan aplikasinya — yang macet adalah jalur menuju pembayaran pertama.' },
    { c: PR2, t: 'Amankan 10 merchant terbesar', d: `${pctS(pc(top10f, gm))} nilai ada di sepuluh nama`, k: terbesar ? pctS(pc(terbesar[i.gmv], gm)) : '—', s: terbesar ? 'pada satu merchant' : '—', q: 'Program retensi kunci', x: `Kehilangan ${terbesar ? esc(terbesar[i.nama]) : 'satu merchant terbesar'} saja menghapus ${terbesar ? pctS(pc(terbesar[i.gmv], gm)) : '—'} dari nilai transaksi. Perlu kontrak dan penanggung jawab named.` },
    { c: SC, t: k1 ? `Perbaiki onboarding pendaftar ${k1.mo}` : 'Perbaiki onboarding pendaftar terbaru', d: k1 ? `aktivasi ${pctS(k1.ak)} — ${idnum(k1.n)} merchant masuk bulan itu` : 'belum cukup bulan daftar terukur', k: k1 ? pctS(k1.ak) : '—', s: 'aktivasi 30 hari kelompok terlemah', q: 'Audit alur verifikasi', x: 'Kelompok yang sama di bulan sebelumnya punya angka lebih baik, jadi ini proses, bukan pasar.' },
    { c: SF, t: `Koreksi label segmen pada ${idnum(salahLabel.length)} merchant`, d: 'berlabel usaha mikro, omzet di atas ambang', k: `${short(salahLabel.reduce((a, r) => a + r[i.gmv], 0) / W)}`, s: 'rupiah/bulan yang salah kelas', q: 'Reklasifikasi + audit master', x: 'Program bantuan dan tarif yang salah sasaran tidak akan kelihatan dari laporan ringkasan.' },
    { c: SU, t: `Turunkan tenaga penjual ke ${prospek[0] ? prospek[0].prov : 'provinsi prioritas'}`, d: prospek[0] ? `${idnum(prospek[0].tanpa)} merchant belum membayar, nilai per merchant ${rp(prospek[0].perTxn)} / bulan` : 'butuh saringan wilayah', k: prospek[0] ? short(prospek[0].potensi) : '—', s: 'rupiah/bulan yang bisa disentuh', q: 'Rencana wilayah', x: 'Bukan provinsi terbanyak merchant, tapi yang isi kantong per merchant-nya paling besar.' },
  ];
  el('hintAct').textContent = `${AKSI.length} tindakan, masing-masing bisa dilacak: jumlah merchant, rupiah sebulan, dan alasan urutannya.`;
  el('actList').innerHTML = AKSI.map((a, k) => `<div class="a" style="--c:${a.c};--cs:${a.c}14">
    <div class="no" style="color:${tinta(a.c)}">${k + 1}</div>
    <div><div class="t">${a.t}</div><div class="d">${a.d} · <b>${a.q}</b> — ${a.x}</div></div>
    <div class="q"><b style="color:${a.c}">${a.k}</b><span>${a.s}</span></div></div>`).join('');

  /* --- 4. celah aktivasi antar kohort (deret sudah dihitung dari agregat pendaftaran di atas) --- */
  kontrol('segCelah', [{ v: '30', l: 'Login ≤30 hari' }, { v: 'txn', l: 'Punya transaksi' }], S.celah, v => { S.celah = v; render(); });
  const pilihKolom = S.celah === '30' ? 'ak' : 'kt';
  const sah = deret.map(x => x[pilihKolom]).filter(x => x != null);
  const garis = med(sah);
  el('hintCelah').innerHTML = sah.length
    ? `nilai tengah ${pilihKolom === 'ak' ? 'aktivasi 30 hari' : 'konversi transaksi'} = <b>${pctS(garis)}</b> · kelompok pendaftar di bawah garis butuh perhatian · penyebutnya ringkasan pendaftaran, sama seperti kartu di tab Ringkasan`
    : `tidak ada bulan daftar yang punya data ${pilihKolom === 'ak' ? 'login ≤30 hari' : 'transaksi'} pada saringan ini`;
  chart('cCelah', {
    tooltip: { ...TIP, trigger: 'axis', formatter: p => `<b>${p[0].axisValue}</b><br>${p[0].value == null ? 'bulan itu tidak terekspor' : pctS(p[0].value) + ' · ' + idnum(deret[p[0].dataIndex].n) + ' merchant'}` },
    grid: { ...GRID, top: 20 },
    xAxis: { type: 'category', data: deret.map(x => x.mo), ...AXIS, splitLine: { show: false }, axisLabel: { ...AXIS.axisLabel, fontSize: 10 } },
    yAxis: { type: 'value', ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: '{value}%' } },
    series: [{
      type: 'bar', data: deret.map(x => x[pilihKolom] == null ? null : +x[pilihKolom].toFixed(2)), barMaxWidth: 34,
      itemStyle: { borderRadius: [3, 3, 0, 0], color: p => (garis != null && p.value != null && p.value < garis) ? SD : PR },
      label: { show: true, position: 'top', fontSize: 10, color: INK3, formatter: p => p.value == null ? '' : p.value + '%' },
      markLine: garis == null ? undefined : { silent: true, symbol: 'none', data: [{ yAxis: +garis.toFixed(1) }], lineStyle: { color: INK3, type: 'dashed', width: 1 }, label: { show: false } },
    }],
  });

  /* --- 5. penetrasi vs kontribusi nilai --- */
  const totN = jum(R1, j.n), totG = jum(R1, j.gmv);
  const byP = kelompok(R1, j.provinsi, [j.n, j.gmv]);
  const quad = [...byP.entries()].map(([k, o]) => ({
    prov: D.dims.provinsi[k], x: +pc(o[0], totN).toFixed(2), y: +pc(o[1], totG).toFixed(2), n: o[0], gmv: o[1],
  })).filter(x => x.prov !== '(tidak ada)');
  const maks = Math.max(...quad.map(q => Math.max(q.x, q.y)), 1);
  chart('cQuad', {
    tooltip: { ...TIP, formatter: p => `<b>${p.data.prov}</b><br>${pctS(p.data.x)} merchant · ${pctS(p.data.y)} nilai<br>nilai tengah per merchant: ${rp(p.data.n ? p.data.gmv / p.data.n : 0)}` },
    grid: { ...GRID, top: 18 },
    xAxis: { type: 'value', max: Math.ceil(maks), name: '% merchant', ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: '{value}%' } },
    yAxis: { type: 'value', max: Math.ceil(maks), name: '% nilai', ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: '{value}%' } },
    series: [{
      type: 'scatter', data: quad.map(q => ({ ...q, value: [q.x, q.y] })),
      symbolSize: d => Math.max(7, Math.min(38, Math.sqrt(d.n) * .34)),
      itemStyle: { color: p => p.data.y > p.data.x ? 'rgba(0,138,0,.45)' : 'rgba(58,168,160,.5)', borderColor: '#fff', borderWidth: 1 },
      label: { show: true, formatter: p => p.data.n > totN * .03 ? p.data.prov : '', fontSize: 9.5, color: INK2, position: 'top' },
      markLine: {
        silent: true, symbol: 'none', lineStyle: { color: INK3, type: 'dashed', width: 1 },
        data: [[{ coord: [0, 0] }, { coord: [maks, maks] }]], label: { show: false },
      },
      markArea: { silent: true, data: [[{ coord: [0, 0] }, { coord: [maks, maks] }]], itemStyle: { color: 'rgba(0,0,0,.012)' } },
    }],
  });

  /* --- 6. kolam win-back --- */
  const WB = [{ l: '6–12 bulan', a: 181, b: 365 }, { l: '1–2 tahun', a: 366, b: 730 }, { l: '> 2 tahun', a: 731, b: Infinity }];
  const kolam = WB.map(x => {
    const g = winback.filter(r => r[i.loginDays] >= x.a && r[i.loginDays] <= x.b);
    return { ...x, n: g.length, perBulan: g.reduce((a, r) => a + r[i.gmv], 0) / W };
  });
  el('subWin').textContent = `${idnum(winback.length)} merchant · ${short(nilaiWinback)} / bulan`;
  chart('cWinback', {
    tooltip: { ...TIP, trigger: 'axis', formatter: p => `<b>${p[0].name}</b><br>${idnum(kolam[p[0].dataIndex].n)} merchant<br>nilai historis ${rp(kolam[p[0].dataIndex].perBulan)} / bulan` },
    grid: { ...GRID, top: 16 },
    xAxis: { type: 'category', data: kolam.map(x => x.l), ...AXIS, splitLine: { show: false } },
    yAxis: { type: 'value', ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: short } },
    series: [{
      type: 'bar', data: kolam.map(x => x.n), barMaxWidth: 62, itemStyle: { color: p => ['#deef5a', '#ff8500', '#e60000'][p.dataIndex], borderRadius: [4, 4, 0, 0] },
      label: { show: true, position: 'top', fontSize: 10.5, lineHeight: 13, color: INK2, formatter: p => `${idnum(p.value)} merchant\n${short(kolam[p.dataIndex].perBulan)} / bulan` },
    }],
  });
  const winTop = winback.slice().sort((a, b) => b[i.gmv] - a[i.gmv]).slice(0, 12);
  el('tWin').innerHTML = `<thead><tr><th>#</th><th>Merchant</th><th>Provinsi</th><th class="num">Usia login</th><th class="num">Transaksi</th><th class="num">Nilai / bulan</th></tr></thead><tbody>` +
    winTop.map((r, k) => `<tr><td><span class="rk">${k + 1}</span></td><td class="name" title="MID ${r[i.mid]}">${esc(r[i.nama])}</td>
      <td>${D.dims.provinsi[r[i.prov]]}</td><td class="num">${idnum(r[i.loginDays])} hari</td>
      <td class="num">${idnum(r[i.txns])}</td><td class="num strong">${rp(r[i.gmv] / W)}</td></tr>`).join('') + '</tbody>';

  /* --- 7. label segmen vs omzet nyata --- */
  const salahUrut = M.filter(r => r[i.gmv] > AMBANG_MIKRO_TAHUN * W / 12)
    .map(r => ({ r, tahunan: r[i.gmv] / W * 12, seg: D.dims.segmen[r[i.seg]] }))
    .sort((a, b) => b.tahunan - a.tahunan);
  const ambang = { 'Usaha Mikro': 2e9, 'Usaha Kecil': 25e9, 'Usaha Menengah': 100e9 };
  const salahBySeg = kelompok(salahUrut.filter(x => ambang[x.seg] && x.tahunan > ambang[x.seg]).map(x => x.r), i.seg, [null, i.gmv]);
  el('tMismatch').innerHTML = `<thead><tr><th>Merchant</th><th>Provinsi</th><th>Label sekarang</th><th class="num">Omzet setara / tahun</th><th class="num">Kelipatan</th></tr></thead><tbody>` +
    salahUrut.filter(x => ambang[x.seg] && x.tahunan > ambang[x.seg]).slice(0, 14).map(x => `<tr>
      <td class="name" title="MID ${x.r[i.mid]}">${esc(x.r[i.nama])}</td><td>${D.dims.provinsi[x.r[i.prov]]}</td>
      <td><span class="tag warn">${x.seg}</span></td><td class="num strong">${rp(x.tahunan)}</td>
      <td class="num">${(x.tahunan / ambang[x.seg]).toFixed(1)} kali</td></tr>`).join('') + '</tbody>';
  el('kakiMismatch').innerHTML = [...salahBySeg.entries()].map(([k, o]) =>
    `<span class="sw"><i style="background:${SD}"></i>${D.dims.segmen[k]}: <b>${idnum(o[0])}</b> merchant · ${short(o[1] / W)} / bulan</span>`).join('') || '';

  /* --- 8. prioritas tenaga penjual --- */
  const bd = prospek.slice(0, 12);
  chart('cBd', {
    color: [PR, SU],
    tooltip: { ...TIP, trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: p => `<b>${p[0].name}</b><br>${p.map(x => `${x.marker}${x.seriesName}: <b>${x.seriesIndex === 0 ? idnum(x.value) : rp(x.value)}</b>`).join('<br>')}` },
    legend: LEG, grid: { ...GRID, top: 26, right: 56 },
    xAxis: { type: 'value', ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: short } },
    yAxis: { type: 'category', inverse: true, data: bd.map(x => x.prov), ...AXIS, splitLine: { show: false }, axisLabel: { ...AXIS.axisLabel, fontSize: 11, color: INK2 } },
    series: [
      { name: 'Merchant belum bertransaksi', type: 'bar', data: bd.map(x => x.tanpa), barWidth: 9, itemStyle: { borderRadius: 3, color: PR } },
      { name: 'Nilai tengah per merchant aktif', type: 'scatter', xAxisIndex: 0, symbolSize: 9, data: bd.map(x => Math.round(x.perTxn)), itemStyle: { color: SU, borderColor: '#fff', borderWidth: 1 } },
    ],
  });
  el('subBd').textContent = `${bd.length} provinsi teratas dari ${prospek.length}`;

  /* --- 9. hal yang harus disebut di rapat --- */
  const V = D.verifikasi;
  el('wCalls').innerHTML = [
    { k: 'risk', t: `Tidak ada tren bulanan untuk nilai transaksi. Ekspor hanya memuat satu angka per merchant pada jendela tetap ${W} bulan, jadi “naik/turun bulan ini” tidak bisa dihitung — yang bisa dihitung hanya laju.`, },
    { k: 'warn', t: `${(D.meta.bulanTanpaPendaftaran || []).join(', ') || 'Satu bulan'} tidak punya baris pendaftaran walaupun file aktivitas memuat merchant dari bulan itu. Semua perbandingan bulan itu bolong, bukan nol.` },
    { k: 'info', t: `File pendaftaran hanya memuat pendaftar 2026 dan sebagian 2025; file aktivitas dan transaksi memuat merchant lama. Rasio “aktivasi” antar file jadi batas bawah, bukan angka sejati.` },
    { k: 'warn', t: `MPAN rusak di sumber: ${idnum(V.mpanNotasiIlmiah || 0)} baris tersimpan sebagai notasi ilmiah. Semua penggabungan memakai MID, dan ${idnum(V.MIDberulang)} baris MID berulang diselesaikan dengan aturan ekspor terbaru menang — ${idnum(V.duplikatBedaNilai || 0)} di antaranya membawa atribut yang berbeda.` },
    { k: 'info', t: `${idnum(V.userAktifSatu || 0)} merchant melaporkan 1 user aktif, sehingga “jumlah user” tidak berguna sebagai ukuran keterlibatan.` },
  ].map(x => `<div class="row" style="grid-template-columns:auto"><span class="k"><span class="callout ${x.k}" style="border:0;background:none;padding:0"><svg viewBox="0 0 24 24"><path d="M12 8v5m0 3.2v.1M10.3 3.9 2.8 17.4A1.9 1.9 0 0 0 4.5 20.3h15a1.9 1.9 0 0 0 1.7-2.9L13.7 3.9a1.9 1.9 0 0 0-3.4 0Z"/></svg><span>${x.t}</span></span></span></div>`).join('');

  /* --- 8. distribusi status NYATA --- kolom tahap/approver tidak ada di sumber, jadi ini bukan
     funnel "Draft→Approver→Rejected", melainkan komposisi 4 status akhir yang benar-benar terisi. */
  const WARNA_STATUS = { 'Aktif': SU, 'Tidak Aktif': SW, 'Ditutup': INK3, 'Diblokir': SD };
  const byStatus = [...kelompok(M, i.status, [null]).entries()].sort((a, b) => b[1][0] - a[1][0]);
  const totS = M.length;
  chart('cStatus', {
    ...ANIM, animationDuration: 800,
    tooltip: { ...TIP, formatter: p => `<b>${p.name}</b><br>${idnum(p.value)} merchant · ${pctS(pc(p.value, totS))}` },
    legend: { ...LEG, orient: 'vertical', left: 4, top: 'center', itemGap: 8 },
    series: [{
      type: 'pie', radius: ['50%', '74%'], center: ['70%', '52%'], avoidLabelOverlap: true, label: { show: false }, labelLine: { show: false },
      itemStyle: { borderColor: '#fff', borderWidth: 2 },
      data: byStatus.map(([k, o]) => ({ name: D.dims.status[k], value: o[0], itemStyle: { color: WARNA_STATUS[D.dims.status[k]] || PR } })),
    }],
  });
  el('subStatus').textContent = `${idnum(M.length)} merchant · saringan aktif`;
  el('hintStatus').innerHTML = 'Empat status akhir dari file sumber. Alur <b>Draft → Approver 1 → Approver 2 → Rejected</b> sengaja tidak dibuat — kolom tahap/penahap tidak ada di ekspor (lihat Mutu data · Kelengkapan kolom).';

  /* --- 9. Merchant perlu perhatian: pernah membayar, tapi login-nya sudah lama. Urut rupiah. */
  const poolPrh = M.filter(r => r[i.punyaTxn] && r[i.gmv] > 0 && r[i.loginDays] > 60);
  const perhatian = poolPrh.slice().sort((a, b) => (b[i.gmv] / W) - (a[i.gmv] / W)).slice(0, 12);
  el('subPerhatian').textContent = `${idnum(perhatian.length)} dari ${idnum(poolPrh.length)} merchant`;
  el('hintPerhatian').innerHTML = 'Diuurut dari rupiah per bulan terbesar: merchant yang <b>pernah membayar</b> tapi login-nya sudah <b>lewat 60 hari</b>. Ini peringatan dini, bukan daftar gagal bayar — data kegagalan tidak ada di sumber.';
  el('tPerhatian').innerHTML = `<thead><tr><th>Merchant</th><th>Ref No</th><th>Status</th><th>Wilayah</th><th class="num">Usia login</th><th class="num">Nilai/bln</th></tr></thead><tbody>` +
    (perhatian.length ? perhatian.map(r => `<tr>
      <td class="name" title="${esc(r[i.nama])}">${esc(r[i.nama])}</td>
      <td class="mono">${r[i.punyaMid] ? esc(r[i.mid]) : '—'}</td>
      <td><span class="tag">${D.dims.status[r[i.status]]}</span></td>
      <td>${D.dims.provinsi[r[i.prov]]}</td>
      <td class="num">${idnum(r[i.loginDays])} hari</td>
      <td class="num strong">${rp(r[i.gmv] / W)}</td></tr>`).join('')
      : `<tr><td colspan="6" class="kosong">Tidak ada merchant yang pernah membayar lalu berhenti login pada saringan ini.</td></tr>`) + '</tbody>';
}

/* ================= RINGKASAN ================= */
function renderRingkasan({ R1, R2 }) {
  const i = iR1;
  const n = jum(R1, i.n), nl = jum(R1, i.nLogin), nl30 = jum(R1, i.nLogin30), nt = jum(R1, i.nTxn);
  const nl30t = jum(R1, i.nLogin30Txn);
  const gm = jum(R1, i.gmv), tx = jum(R1, i.txns);
  const { idxB, mon2026 } = POKOK();
  const perBulan = kelompok(R1, i.bulan, [i.n, i.nLogin, i.nLogin30, i.nTxn, i.gmv, i.txns]);
  const deret = col => deretBulan(perBulan, idxB, mon2026, col);
  const rataTxn = mon2026.map(m => { const o = perBulan.get(idxB.get(m)); return o && o[5] ? o[4] / o[5] : null; });

  el('scopeNote').textContent = S.bulan === '*' && S.prov === '*'
    ? `${idnum(n)} merchant pendaftaran 2026 · jendela transaksi ${D.meta.jendelaTransaksiBulan} bulan`
    : 'Filter aktif berlaku pada seluruh kartu dan grafik di halaman ini.';

  kartu('kpis', [
    { l: 'Merchant terdaftar', v: idnum(n), n, f: 'id', s: mon2026.length + ' bulan terekspor, ' + mon2026[mon2026.length - 1] + ' baru sampai ' + D.meta.snapshot, tip: 'Ringkasan pendaftaran (mart.agg_daerah).', c: PR },
    { l: 'Muncul di file aktivitas', v: idnum(nl), n: nl, f: 'id', s: pctS(pc(nl, n)) + ' dari terdaftar — hanya yang muncul di kedua file', spark: spark(deret(1)), tip: 'Bukan tingkat aktivasi: file aktivitas tidak memuat merchant tanpa jejak, jadi sisanya tidak bisa disimpulkan tidak aktif.', c: SC },
    { l: 'Login ≤ 30 hari', v: idnum(nl30), n: nl30, f: 'id', s: pctS(pc(nl30, n)) + ' dari terdaftar', kelas: 'warn', spark: spark(deret(2), { warna: SD }), tip: 'Usia login terakhir maksimum 30 hari terhadap ' + D.meta.snapshot + '.', c: SD },
    { l: 'Punya transaksi (kaum terdaftar)', v: idnum(nt), n: nt, f: 'id', s: pctS(pc(nt, n)) + ' dari terdaftar', spark: spark(deret(3)), tip: 'Dari ' + idnum(n) + ' pendaftar; di luar itu ' + idnum(D.tables.m.filter(r => !r[iM.diRegistry]).length) + ' merchant bertransaksi yang tidak ada di file pendaftaran.', c: SU },
    { l: 'Nilai transaksi kaum terdaftar', v: rp(gm), n: gm, f: 'rp', s: short(gm / D.meta.jendelaTransaksiBulan) + ' / bulan · ' + pctS(pc(gm, jum(D.tables.m, iM.gmv))) + ' dari yang terekam', spark: spark(deret(4)), tip: 'Dasar hitungannya ringkasan pendaftaran: hanya ' + idnum(jum(R1, i.nTxn)) + ' pendaftar yang punya transaksi. Bandingkan dengan kartu "Nilai transaksi tererekam" di tab Transaksi yang memakai seluruh file aktivitas+transaksi.', c: PR },
    { l: 'Rata-rata per transaksi', v: rp(gm / (tx || 1)), n: gm / (tx || 1), f: 'rp', s: idnum(tx) + ' transaksi', spark: spark(rataTxn), tip: 'Nilai dibagi jumlah transaksi pada rentang filter.', c: SF },
  ]);

  const vals = deret(0), konv = mon2026.map((m, k) => { const o = perBulan.get(idxB.get(m)); return o && o[0] ? +pc(o[3], o[0]).toFixed(2) : null; });
  chart('cCohort', {
    tooltip: { ...TIP, trigger: 'axis', formatter: p => `<b>${p[0].axisValue}</b><br>` + p.map(x => `${x.marker}${x.seriesName}: <b>${x.value == null ? 'tidak ikut terekspor' : (x.seriesName.startsWith('%') ? x.value + '%' : idnum(x.value))}</b>`).join('<br>') },
    legend: LEG, grid: GRID,
    xAxis: { type: 'category', data: mon2026, ...AXIS, splitLine: { show: false }, axisLabel: { ...AXIS.axisLabel, fontSize: 10 } },
    yAxis: [{ type: 'value', ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: short } },
      { type: 'value', ...AXIS, splitLine: { show: false }, axisLabel: { ...AXIS.axisLabel, formatter: '{value}%' } }],
    series: [
      { name: 'Terdaftar', type: 'bar', data: vals, barMaxWidth: 40, itemStyle: { color: p => p.value == null ? '#f0f0f0' : { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: '#71dbd3' }, { offset: 1, color: PR }] }, borderRadius: [3, 3, 0, 0] } },
      { name: '% punya transaksi', type: 'line', yAxisIndex: 1, data: konv, connectNulls: false, symbolSize: 6, lineStyle: { width: 2, color: SU }, itemStyle: { color: SU } }],
  });
  el('subCohort').textContent = idnum(n) + ' merchant';

  const tahap = [['Terdaftar (ekspor pendaftaran)', n], ['Muncul di file aktivitas', nl], ['… dan login ≤ 30 hari', nl30], ['… dan transaksi di 30 hari itu', nl30t]];
  el('hintFunnel').textContent = 'Ekspor ini populasinya beda besar: ' + idnum(n) + ' MID pada file pendaftaran, tetapi file aktivitas hanya memuat ' + idnum(D.tables.m.length) + ' merchant dan ' + idnum(nl) + ' di antaranya pendaftar itu. ' + idnum(D.tables.m.filter(r => !r[iM.diRegistry]).length) + ' merchant beraktivitas justru tidak ada di file pendaftaran, jadi kolom ini menghitung merchant yang ada di kedua file — bukan tingkat aktivasi seluruh pendaftar.';
  chart('cFunnel', {
    tooltip: { ...TIP, formatter: p => `${p[1]}<br><b>${idnum(p.value)}</b> · ${pctS(pc(p.value, n))} dari terdaftar` },
    grid: { ...GRID, top: 8, left: 4, right: 56 },
    xAxis: { type: 'value', show: false },
    yAxis: { type: 'category', inverse: true, data: tahap.map(t => t[0]), ...AXIS, splitLine: { show: false }, axisLabel: { ...AXIS.axisLabel, fontSize: 11.5, color: INK2 } },
    series: [{
      type: 'bar', data: tahap.map((t, k) => ({ value: t[1], itemStyle: { color: [PR, '#5ccfc5', '#a7ece8', SU][k], borderRadius: [0, 3, 3, 0] } })),
      barWidth: 22, label: { show: true, position: 'right', fontSize: 11, color: INK, formatter: p => `${idnum(p.value)}  ·  ${pctS(pc(p.value, n), 1)}` },
    }],
  });

  const st = kelompok(R1, i.status, [i.n]);
  const shareStatus = nama => pctS(pc((st.get(D.dims.status.indexOf(nama)) || [0])[0], n));
  el('subStatus').textContent = `${shareStatus('Ditutup')} ditutup · ${shareStatus('Diblokir')} diblokir`;
  const statusPasangan = urut(st).map(([k, o]) => [D.dims.status[k], o[0]]);
  barH('cStatus', statusPasangan, { warna: statusPasangan.map(([nama]) => WARNA_STATUS[nama] || PR) });
  const fam = urut(kelompok(R2, iR2.keluarga, [iR2.n]), 0).slice(0, 10);
  barH('cKeluarga', fam.map(([k, o]) => [D.dims.keluarga[k], o[0]]));
}
const WARNA_STATUS = { Aktif: PR, Diblokir: SD, Ditutup: '#c6c6c6', 'Tidak Aktif': SW };

function barH(id, pasangan, opsi = {}) {
  const max = Math.max(...pasangan.map(p => p[1]), 1);
  chart(id, {
    tooltip: { ...TIP, formatter: p => `${p[1]}<br><b>${(opsi.fmt || idnum)(p[0].value)}</b> · ${pctS(pc(p[0].value, pasangan.reduce((a, b) => a + b[1], 0)))}` },
    grid: { top: 4, bottom: 4, left: 4, right: Math.max(58, String(short(max)).length * 8), containLabel: true },
    xAxis: { type: 'value', show: false },
    yAxis: { type: 'category', inverse: true, data: pasangan.map(p => p[0]), ...AXIS, splitLine: { show: false }, axisLabel: { ...AXIS.axisLabel, width: 132, overflow: 'truncate', fontSize: 11, color: INK2 } },
    series: [{
      type: 'bar', data: pasangan.map((p, k) => ({ value: p[1], itemStyle: { color: opsi.warna ? (opsi.warna[k % opsi.warna.length] || PR) : PR, borderRadius: [0, 3, 3, 0] } })),
      barMaxWidth: 14, showBackground: true, backgroundStyle: { color: '#f0f0f0', borderRadius: 3 },
      label: { show: true, position: 'right', fontSize: 10.5, color: INK2, formatter: p => short(p.value) },
    }],
  });
}

/* ================= WILAYAH ================= */
const METRIK_PETA = [
  { v: 'n', l: 'Terdaftar', col: 'n', f: idnum }, { v: 'gmv', l: 'Nilai', col: 'gmv', f: rp },
  { v: 'ntx', l: 'Transaksi', col: 'nTxn', f: idnum }, { v: 'n30', l: 'Login ≤30 hari', col: 'nLogin30', f: idnum },
];
const GEO = { peta: null, pusat: null };

/** Titik berat wilayah dihitung dari geojson agar mode bubble tidak perlu berkas tambahan. */
function pusatProvinsi() {
  if (GEO.pusat) return GEO.pusat;
  const out = new Map();
  for (const f of GEO.peta.features) {
    const nama = f.properties.name;
    let best = null;
    const pol = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const ring of pol) {
      const r = ring[0];
      let a2 = 0, cx = 0, cy = 0;
      for (let k = 0, m = r.length - 1; k < r.length; m = k++) {
        const f2 = r[m][0] * r[k][1] - r[k][0] * r[m][1];
        a2 += f2; cx += (r[m][0] + r[k][0]) * f2; cy += (r[m][1] + r[k][1]) * f2;
      }
      if (!a2) continue;
      const luas = Math.abs(a2 / 2);
      if (!best || luas > best.luas) best = { luas, x: cx / (3 * a2), y: cy / (3 * a2) };
    }
    if (best) out.set(nama, [best.x, best.y]);
  }
  return (GEO.pusat = out);
}

function kelasKuantil(nilai, k = 6) {
  const v = nilai.filter(x => x > 0).sort((a, b) => a - b);
  if (!v.length) return [];
  const batas = [0];
  for (let i = 1; i <= k; i++) batas.push(v[Math.min(v.length - 1, Math.ceil(i * v.length / k) - 1)]);
  const unik = [...new Set(batas.map(x => Math.round(x * 100) / 100))];
  if (unik.length < 2) return [{ gte: 0, lte: v[v.length - 1], i: 0 }];
  return unik.slice(1).map((hi, x) => ({ gt: x === 0 ? -Infinity : unik[x], lte: hi, i: x }));
}

function renderWilayah({ R1 }) {
  const i = iR1;
  const kolom = [i.n, i.gmv, i.nTxn, i.nLogin30];
  const byP = kelompok(R1, i.provinsi, kolom);
  const m = METRIK_PETA.find(x => x.v === S.peta);
  const jK = kolom.indexOf(i[m.col]);
  const totN = jum(R1, i.n), totMetric = totalOf(byP, jK);
  const uang = m.col === 'gmv';
  const fmt = uang ? rp : idnum;
  el('scopeWil').textContent = `${idnum(totN)} merchant terdaftar dalam saringan · ${byP.size} provinsi terisi · dihitung dari ringkasan pendaftaran`;

  kontrol('segPeta', METRIK_PETA.map((o, k) => ({ v: o.v, l: o.l, n: short(totalOf(byP, k)) })), S.peta, v => { S.peta = v; render(); });
  kontrol('segPetaMode', [{ v: 'choro', l: 'Kelas sama banyak' }, { v: 'bubble', l: 'Bubble' }], S.petaMode, v => { S.petaMode = v; render(); });
  kontrol('segPetaLabel', [{ v: 'no', l: 'Tanpa label' }, { v: 'nama', l: 'Nama' }, { v: 'nilai', l: 'Nilai' }], S.petaLabel, v => { S.petaLabel = v; render(); });
  const provAda = provCount(byP);
  el('hintPeta').textContent = `${provAda} provinsi berisi data · klik wilayah untuk menyaring · 4 provinsi pemekaran Papua belum ada pada ekspor ini · kelas warna membagi provinsi jadi kelompok sama banyak (kuantil) pada nilai yang terlihat sekarang`;

  const isi = [...byP.entries()].map(([k, o]) => ({ idx: k, name: D.provGeo[k], value: o[jK] })).filter(d => d.name && d.value > 0);
  const kelas = kelasKuantil(isi.map(x => x.value), 6);
  const warnaKelas = x => RAMP[Math.min(RAMP.length - 1, 1 + x)];
  const fKelas = v => (uang ? short(v) : idnum(v));
  const pieces = kelas.map((k, x) => ({
    ...k, color: warnaKelas(k.i),
    label: x === 0 ? '≤ ' + fKelas(k.lte) : fKelas(kelas[x - 1].lte + 1) + ' – ' + fKelas(k.lte),
  }));

  const petaDasar = {
    type: 'map', map: 'indonesia', nameProperty: 'name', roam: true, aspectScale: 1,
    scaleLimit: { min: 1, max: 9 }, zlevel: 0,
    left: 6, right: 6, top: 6, bottom: 6,
    itemStyle: { areaColor: '#f0f0f0', borderColor: '#fff', borderWidth: 1 },
    emphasis: { label: { show: true, fontSize: 11.5, fontWeight: 600, color: INK, textBorderWidth: 0 }, itemStyle: { areaColor: SW, borderColor: '#fff', borderWidth: 1.2 } },
    select: { disabled: true },
  };

  if (S.petaMode === 'choro') {
    chart('cMap', {
      ...ANIM, animationDuration: 700,
      tooltip: { ...TIP, formatter: p => `${p.name}<br>${m.l}: <b>${fmt(p.value || 0)}</b> · ${pctS(pc(p.value || 0, totMetric))}${p.value ? `<br><span class="note-sm">klik untuk menyaring ke provinsi ini</span>` : ''}` },
      visualMap: {
        type: 'piecewise', left: 12, bottom: 12, orient: 'vertical', itemWidth: 12, itemHeight: 13, itemGap: 4,
        textStyle: { fontSize: 10.5, color: INK2 }, pieces,
        seriesIndex: 0,
      },
      series: [{
        ...petaDasar, zoom: S.petaZoom,
        label: { show: S.petaLabel !== 'no', fontSize: 9.5, color: INK2, formatter: p => (S.petaLabel === 'nilai' ? short(p.value || 0) : p.name) },
        data: isi.map(x => ({ name: x.name, value: x.value, itemStyle: { areaColor: S.prov === D.dims.provinsi[x.idx] ? '#deef5a' : undefined } })),
      }],
    });
  } else {
    const pusat = pusatProvinsi();
    const pts = isi.map(x => ({ name: x.name, value: [...(pusat.get(x.name) || [0, 0]), x.value, D.dims.provinsi[x.idx]] }));
    const maks = Math.max(...pts.map(p => p.value[2]), 1);
    const top = [...pts].sort((a, b) => b.value[2] - a.value[2]).slice(0, 6);
    chart('cMap', {
      ...ANIM, animationDuration: 700,
      tooltip: { ...TIP, formatter: p => `${p.name}<br>${m.l}: <b>${fmt(p.value ? p.value[2] : 0)}</b> · ${pctS(pc(p.value ? p.value[2] : 0, totMetric))}` },
      geo: {
        map: 'indonesia', nameProperty: 'name', roam: true, aspectScale: 1, zoom: S.petaZoom, scaleLimit: { min: 1, max: 9 },
        left: 6, right: 6, top: 6, bottom: 6, itemStyle: { areaColor: '#f4f6f7', borderColor: '#dadada', borderWidth: .8 },
        emphasis: { label: { show: false }, itemStyle: { areaColor: '#c2f0ec' } }, select: { disabled: true },
      },
      series: [
        { type: 'scatter', coordinateSystem: 'geo', data: pts.filter(p => !top.includes(p)), symbolSize: d => 4 + Math.sqrt(d[2] / maks) * 26, itemStyle: { color: 'rgba(58,168,160,.55)', borderColor: '#fff', borderWidth: 1 }, label: { show: S.petaLabel === 'nama', formatter: p => p.name, position: 'top', fontSize: 9.5, color: INK2 } },
        { type: 'effectScatter', coordinateSystem: 'geo', data: top, symbolSize: d => 6 + Math.sqrt(d[2] / maks) * 26, rippleEffect: { brushType: 'stroke', scale: 3.2 }, showEffectOn: 'render', itemStyle: { color: PR, shadowBlur: 6, shadowColor: 'rgba(58,168,160,.55)' }, label: { show: true, formatter: p => p.name, position: 'right', fontSize: 10, color: INK2 }, zlevel: 2 },
      ],
    });
  }

  /* klik wilayah = saring. Dipasang sebagai hook karena instansnya dibuat nanti di antrean. */
  HOOK.cMap = c => c.on('click', p => {
    const nama = p.data?.value?.[3] || namaDariGeo(p.name);
    if (!nama) return;
    S.prov = S.prov === nama ? '*' : nama;
    el('fProv').value = S.prov;
    render();
  });

  const batasan = kelas.length ? `${fKelas(kelas[0].gt === -Infinity ? 1 : kelas[0].gt)} – ${fKelas(kelas[kelas.length - 1].lte)}` : '—';
  const penjelasan = S.petaMode === 'choro'
    ? `kelas sama banyak pada ${fmt(totMetric)} total · rentang ${batasan}`
    : `luas lingkaran ∝ √${m.l.toLowerCase()} · ${isi.length} provinsi bernilai > 0 · total ${fmt(totMetric)}`;
  el('footPeta').innerHTML = (S.petaMode === 'choro'
    ? pieces.map(p => `<span class="sw"><i style="background:${p.color}"></i>${p.label}</span>`).join('')
    : `<span class="sw"><i style="background:rgba(58,168,160,.55)"></i>semua provinsi</span><span class="sw"><i style="background:${PR}"></i>6 teratas, berdenyut</span>`)
    + `<span class="note-sm" style="margin-left:auto">${penjelasan}</span>`;

  /* tabel peringkat dengan bar inline + selisih kohort bulan ini vs sebelumnya */
  const { idxB, mon2026 } = POKOK();
  const bulanIni = mon2026[mon2026.length - 1], bulanLalu = mon2026[mon2026.length - 2];
  const perProvBulan = new Map();
  for (const r of R1) { const k = r[i.provinsi] + '|' + r[i.bulan]; perProvBulan.set(k, (perProvBulan.get(k) || 0) + r[i.n]); }
  const rank = urut(byP, jK).map(([k, o]) => {
    const kini = perProvBulan.get(k + '|' + idxB.get(bulanIni)) || null;
    const lalu = perProvBulan.get(k + '|' + idxB.get(bulanLalu)) || null;
    return { nama: D.dims.provinsi[k], nilai: o[jK], share: pc(o[jK], totMetric), kini, lalu, n: o[0] };
  }).slice(0, 14);
  const maks = Math.max(...rank.map(r => r.nilai), 1);
  el('subRank').textContent = `diurutkan menurut ${m.l.toLowerCase()} · 14 teratas`;
  el('tProv').innerHTML = `<thead><tr><th>#</th><th>Provinsi</th><th>${m.l}</th><th style="width:24%">Bagian</th><th class="num">%</th><th class="num">Pendaftar ${bulanIni || '—'}</th><th class="num">Selisih vs ${bulanLalu || '—'}</th></tr></thead><tbody>` +
    rank.map((r, k) => `<tr><td><span class="rk">${k + 1}</span></td><td class="strong">${r.nama}</td>
      <td class="num">${uang ? rp(r.nilai) : idnum(r.nilai)}</td>
      <td><span class="inbar"><i></i><b style="width:${(r.nilai / maks * 100).toFixed(1)}%"></b></span></td>
      <td class="num">${pctS(r.share, 1)}</td>
      <td class="num">${r.kini == null ? '—' : idnum(r.kini)}</td>
      <td class="num">${r.kini == null || r.lalu == null || !r.lalu ? '—' : `<span class="delta ${r.kini > r.lalu ? 'up' : r.kini < r.lalu ? 'down' : 'flat'}">${r.kini > r.lalu ? '+' : '−'}${Math.abs(pc(r.kini, r.lalu) - 100).toFixed(0)}%</span>`}</td></tr>`).join('') + '</tbody>';

  const totG = jum(R1, i.gmv);
  const dv = [...byP.entries()].map(([k, o]) => [D.dims.provinsi[k], pc(o[0], totN), pc(o[1], totG)]).sort((a, b) => b[1] - a[1]).slice(0, 22);
  chart('cDiverge', {
    color: [PR, '#ff8500'],
    tooltip: { ...TIP, trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: p => `<b>${p[0].name}</b><br>` + p.map(x => `${x.marker}${x.seriesName}: ${pctS(x.value, 2)}`).join('<br>') + `<br>Selisih: <b>${pctS((p[0].value || 0) - (p[1]?.value || 0), 2)}</b>` },
    legend: LEG, grid: { ...GRID, left: 4, top: 26 },
    xAxis: { type: 'value', ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: '{value}%' } },
    yAxis: { type: 'category', inverse: true, data: dv.map(d => d[0]), ...AXIS, splitLine: { show: false }, axisLabel: { ...AXIS.axisLabel, fontSize: 11, color: INK2 } },
    series: [{ name: 'Bagian merchant', type: 'bar', data: dv.map(d => +d[1].toFixed(2)), barWidth: 6, itemStyle: { borderRadius: 3 } },
      { name: 'Bagian nilai', type: 'bar', data: dv.map(d => +d[2].toFixed(2)), barWidth: 6, itemStyle: { borderRadius: 3 } }],
  });

  const KAB = [{ v: 'n', l: 'Merchant', col: i.n, f: idnum }, { v: 'gmv', l: 'Nilai', col: i.gmv, f: rp }, { v: 'ntx', l: 'Transaksi', col: i.nTxn, f: idnum }];
  kontrol('segKab', KAB.map(o => ({ v: o.v, l: o.l })), S.kab, v => { S.kab = v; render(); });
  const mk = KAB.find(o => o.v === S.kab);
  const byK = urut(kelompok(R1.filter(r => r[i.n] > 0), i.kabupaten, [mk.col])).filter(([k]) => D.dims.kabupaten[k] !== '(tidak ada)').slice(0, 20);
  barH('cKab', byK.map(([k, o]) => [D.dims.kabupaten[k], o[0]]), { fmt: mk.f });

  const mons = D.bulanUrut.filter(b => b >= '2026-01');
  const sel = new Map();
  for (const r of R1) { const k = r[i.provinsi] + '|' + r[i.bulan]; sel.set(k, (sel.get(k) || 0) + r[i.n]); }
  const provs = urut(byP).map(([k]) => k);
  let mx = 1;
  const pts = [];
  provs.forEach((p, y) => mons.forEach((mo, x) => { const v = sel.get(p + '|' + idxB.get(mo)) || 0; if (v > mx) mx = v; pts.push([x, y, v]); }));
  chart('cHeat', {
    tooltip: { ...TIP, formatter: p => `${provs[p.value[1]] === undefined ? '' : D.dims.provinsi[provs[p.value[1]]]} · ${mons[p.value[0]]}<br><b>${idnum(p.value[2])}</b> merchant` },
    grid: { left: 4, right: 58, top: 26, bottom: 4, containLabel: true },
    xAxis: { type: 'category', data: mons, ...AXIS, splitLine: { show: false }, axisLabel: { ...AXIS.axisLabel, rotate: 45, fontSize: 9.5 } },
    yAxis: { type: 'category', inverse: true, data: provs.map(p => D.dims.provinsi[p]), ...AXIS, splitLine: { show: false }, axisLabel: { ...AXIS.axisLabel, fontSize: 10, color: INK2 } },
    visualMap: { type: 'continuous', right: 2, top: 'center', itemWidth: 11, itemHeight: 130, min: 0, max: mx, calculable: true, formatter: v => short(v), textStyle: { fontSize: 10, color: INK3 }, inRange: { color: ['#f9f9f9', '#d9f4f1', '#a7ece8', '#71dbd3', '#3aa8a0'] } },
    series: [{ type: 'heatmap', data: pts, itemStyle: { borderColor: '#fff', borderWidth: .8, borderRadius: 2 }, emphasis: { itemStyle: { borderColor: PR, borderWidth: 1.2 } } }],
  });
}
function namaDariGeo(namaGeo) {
  const k = D.provGeo.findIndex(g => g === namaGeo);
  return k >= 0 ? D.dims.provinsi[k] : null;
}
function zumPeta(f) {
  const c = CH.cMap; if (!c) return;
  const o = c.getOption();
  const sumber = o.series?.find(s => s.zoom != null) || o.geo?.[0];
  const z = Math.max(1, Math.min(9, (sumber?.zoom || 1) * f));
  S.petaZoom = z;
  const patch = { series: o.series.map(s => (s.type === 'map' || s.type === 'effectScatter' || s.type === 'scatter') ? { zoom: z } : {}) };
  if (o.geo) patch.geo = { zoom: z };
  c.setOption(patch);
}
const provCount = g => [...g.keys()].filter(k => D.provGeo[k]).length;

/* ================= AKTIVITAS ================= */
function renderAktivitas({ R3, R4, M }) {
  const i = iM;
  const login = M.filter(r => r[i.punyaLogin]);
  const tot = login.length;
  const b30 = login.filter(r => r[i.loginDays] <= 30).length;
  const b180 = login.filter(r => r[i.loginDays] > 180).length;
  const medLogin = med(login.map(r => r[i.loginDays]));
  const bulanSnap = D.meta.snapshot.slice(0, 7);
  const txnNow = M.filter(r => namaBulanTxn(r[i.bulanTxn]) === bulanSnap).reduce((a, r) => a + r[i.txns], 0);
  const { idxB, mon2026 } = POKOK();

  el('scopeAktiv').textContent = `${idnum(M.length)} merchant dengan jejak login atau transaksi · dihitung dari gabungan file aktivitas + transaksi`;
  const perBulanSemua = kelompok(M, i.bulanDaftar, [null]);
  const perBulan30 = kelompok(login.filter(r => r[i.loginDays] <= 30), i.bulanDaftar, [null]);
  const deretTerdaftar = mon2026.map(mo => (perBulanSemua.get(idxB.get(mo)) || [0])[0]);
  const deret30 = mon2026.map(mo => (perBulan30.get(idxB.get(mo)) || [0])[0]);

  kartu('kpisAktiv', [
    { l: 'Merchant beraktivitas', v: idnum(M.length), n: M.length, s: idnum(tot) + ' punya login', spark: spark(deretTerdaftar), tip: 'Deret mini disusun per bulan daftar, bukan antar bulan kalender; tanpa badge karena bulan pendaftaran terbaru belum lengkap.', c: PR },
    { l: 'Login ≤ 30 hari', v: idnum(b30), n: b30, s: pctS(pc(b30, tot)) + ' dari yang punya login', spark: spark(deret30), tip: 'Login terakhirnya maksimal 30 hari sebelum tanggal data — ukuran keterlibatan paling baru.', c: SC },
    { l: 'Tidak login > 180 hari', v: idnum(b180), n: b180, s: pctS(pc(b180, tot)), kelas: 'warn', tip: 'Kelompok yang paling realistis untuk ditindak.', c: SD },
    { l: 'Nilai tengah usia login', v: medLogin == null ? '—' : idnum(medLogin) + ' hari', n: medLogin, f: 'hari', s: 'setengah merchant di bawahnya', tip: 'Pakai nilai tengah, bukan rata-rata: sebarannya miring ekstrem.', c: SW },
    { l: 'Punya transaksi', v: idnum(jum(M, i.punyaTxn)), n: jum(M, i.punyaTxn), s: pctS(pc(jum(M, i.punyaTxn), M.length)) + ' dari beraktivitas', tip: 'Merchant dengan minimal satu transaksi bernilai pada jendela tetap 8,77 bulan.', c: SU },
    { l: `Transaksi ${bulanSnap}`, v: short(txnNow), n: txnNow, f: 'short', s: 'pada bulan data terakhir', tip: 'Perkiraan dari merchant yang bulan transaksi terakhirnya jatuh di bulan data — bukan tren bulanan sejati (sumber hanya satu angka per merchant).', c: SF },
  ]);

  kontrol('segRecency', [{ v: '7', l: '7 hari' }, { v: '30', l: '30 hari' }, { v: '90', l: '90 hari' }, { v: '365', l: '1 tahun' }], S.rec, v => { S.rec = +v; render(); });
  const lebar = S.rec, batas = lebar * 4;
  const bins = [];
  for (let a = 0; a < batas; a += lebar) bins.push({ a, b: a + lebar - 1, n: 0 });
  let lewat = 0;
  for (const r of login) { const k = Math.floor(r[i.loginDays] / lebar); if (k < bins.length) bins[k].n++; else lewat++; }
  bins.push({ a: batas, b: null, n: lewat });
  let acc = 0;
  const kum = bins.map(x => pc((acc += x.n), tot));
  el('hintRecency').textContent = `${idnum(tot)} merchant punya riwayat login · ${pctS(pc(lewat, tot))} usianya lewat ${idnum(batas)} hari`;
  chart('cRecency', {
    tooltip: { ...TIP, trigger: 'axis', formatter: p => `${p[0].name} hari<br>Merchant: <b>${idnum(p[0].value)}</b><br>Kumulatif: ${pctS(p[1].value)}` },
    legend: LEG, grid: GRID,
    xAxis: { type: 'category', data: bins.map(x => x.b == null ? `>${idnum(x.a)} hari` : `${x.a}–${x.b} hari`), ...AXIS, splitLine: { show: false }, axisLabel: { ...AXIS.axisLabel, rotate: 32, fontSize: 10 } },
    yAxis: [{ type: 'value', ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: short } },
      { type: 'value', max: 100, ...AXIS, splitLine: { show: false }, axisLabel: { ...AXIS.axisLabel, formatter: '{value}%' } }],
    series: [
      { name: 'Merchant', type: 'bar', data: bins.map(x => x.n), barWidth: '76%', itemStyle: { color: p => p.dataIndex === bins.length - 1 ? SD : PR, borderRadius: [2, 2, 0, 0] } },
      { name: 'Kumulatif', type: 'line', yAxisIndex: 1, data: kum, symbol: 'none', lineStyle: { width: 2, color: '#ff8500' } }],
  });

  const byLM = kelompok(M, i.bulanLogin, [null]);
  const lms = D.dims.bulanLogin.map((b, k) => [b, k]).filter(([b]) => b && b !== '(tidak ada)').sort((a, b) => a[0].localeCompare(b[0]));
  chart('cLoginMon', {
    tooltip: { ...TIP, trigger: 'axis', formatter: p => `${p[0].name}<br>Merchant login bulan itu: <b>${idnum(p[0].value)}</b>` },
    grid: GRID,
    xAxis: { type: 'category', data: lms.map(x => x[0]), ...AXIS, splitLine: { show: false }, axisLabel: { ...AXIS.axisLabel, rotate: 45, fontSize: 9.5, interval: 1 } },
    yAxis: { type: 'value', ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: short } },
    series: [{ type: 'bar', data: lms.map(([, k]) => (byLM.get(k) || [0])[0]), barWidth: '86%', itemStyle: { color: p => p.dataIndex === lms.length - 1 ? PR : 'rgba(58,168,160,.42)', borderRadius: [2, 2, 0, 0] } }],
  });

  kontrol('segKurve', [{ v: 'survival', l: '% masih login' }, { v: 'jumlah', l: 'Jumlah merchant' }], S.kurve, v => { S.kurve = v; render(); });
  const titik = [1, 7, 30, 90, 180, 365, 730];
  const kohort = mon2026.map(mo => {
    const k = idxB.get(mo);
    const gr = login.filter(r => r[i.bulanDaftar] === k);
    return { mo, n: gr.length, s: titik.map(t => gr.length ? (S.kurve === 'jumlah' ? gr.filter(r => r[i.loginDays] <= t).length : pc(gr.filter(r => r[i.loginDays] <= t).length, gr.length)) : null) };
  }).filter(x => x.n > 0);
  chart('cRetensiKurve', {
    color: KATEGORI,
    tooltip: { ...TIP, trigger: 'axis', formatter: p => `<b>${titik[p[0].dataIndex]} hari</b><br>` + p.filter(x => x.value != null).map(x => `${x.marker}${x.seriesName}: ${S.kurve === 'jumlah' ? idnum(x.value) : pctS(x.value)}`).join('<br>') },
    legend: { ...LEG, type: 'scroll', width: '70%' }, grid: { ...GRID, top: 34 },
    xAxis: { type: 'category', data: titik.map(t => t + ' hari'), ...AXIS, splitLine: { show: false } },
    yAxis: S.kurve === 'jumlah'
      ? { type: 'value', ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: short } }
      : { type: 'value', max: 100, ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: '{value}%' } },
    series: kohort.map(k => ({ name: k.mo, type: 'line', data: k.s, symbolSize: 5, lineStyle: { width: 1.8 }, emphasis: { focus: 'series' } })),
  });

  const sel = new Map(), perBaris = mon2026.map(() => 0);
  for (const r of login) {
    const b = bucketOf(r[i.loginDays]);
    const y = mon2026.indexOf(namaBulan(r[i.bulanDaftar]));
    if (b < 0 || y < 0) continue;
    sel.set(y + '|' + b, (sel.get(y + '|' + b) || 0) + 1);
    perBaris[y]++;
  }
  let mx = 1;
  const pts2 = [];
  mon2026.forEach((mo, y) => BUCKET.forEach((bk, x) => { const v = sel.get(y + '|' + x) || 0; if (v > mx) mx = v; pts2.push([x, y, v]); }));
  chart('cRetention', {
    tooltip: { ...TIP, formatter: p => `${mon2026[p.value[1]]} · ${BUCKET[p.value[0]].l}<br><b>${idnum(p.value[2])}</b> · ${pctS(pc(p.value[2], perBaris[p.value[1]]))} dari ${idnum(perBaris[p.value[1]])}` },
    grid: { left: 4, right: 62, top: 26, bottom: 4, containLabel: true },
    xAxis: { type: 'category', data: BUCKET.map(b => b.l), ...AXIS, splitLine: { show: false }, axisLabel: { ...AXIS.axisLabel, fontSize: 10 } },
    yAxis: { type: 'category', inverse: true, data: mon2026, ...AXIS, splitLine: { show: false }, axisLabel: { ...AXIS.axisLabel, fontSize: 10 } },
    visualMap: { type: 'continuous', right: 0, top: 'center', itemWidth: 11, itemHeight: 120, min: 0, max: mx, calculable: true, formatter: v => short(v), textStyle: { fontSize: 10, color: INK3 }, inRange: { color: ['#f9f9f9', '#ecf789', '#deef5a', '#3fd8d4', '#3aa8a0'] } },
    series: [{ type: 'heatmap', data: pts2, label: { show: true, fontSize: 9.5, color: INK2, formatter: p => p.value[2] ? short(p.value[2]) : '' }, itemStyle: { borderColor: '#fff', borderWidth: .8, borderRadius: 2 } }],
  });

  const bySeg = new Map(), segTot = new Map();
  for (const r of login) {
    const b = bucketOf(r[i.loginDays]);
    if (b < 0) continue;
    bySeg.set(r[i.seg] + '|' + b, (bySeg.get(r[i.seg] + '|' + b) || 0) + 1);
    segTot.set(r[i.seg], (segTot.get(r[i.seg]) || 0) + 1);
  }
  const segs = D.dims.segmen.map((s, k) => [s, k]).filter(([s]) => s && s !== '(tidak ada)').sort((a, b) => (segTot.get(b[1]) || 0) - (segTot.get(a[1]) || 0));
  chart('cSegRec', {
    color: RAMP,
    tooltip: {
      ...TIP, trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: p => { const t = segTot.get(segs[p[0].dataIndex][1]) || 0; return `<b>${p[0].name}</b> · ${idnum(t)} merchant<br>` + p.map(x => `${x.marker}${x.seriesName}: ${idnum(x.value)} (${pctS(pc(x.value, t))})`).join('<br>'); },
    },
    legend: { top: 0, itemWidth: 8, itemHeight: 8, textStyle: { fontSize: 10, color: INK2 } },
    grid: { ...GRID, top: 34 },
    xAxis: { type: 'value', ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: short } },
    yAxis: { type: 'category', inverse: true, data: segs.map(s => s[0]), ...AXIS, splitLine: { show: false }, axisLabel: { ...AXIS.axisLabel, fontSize: 11, color: INK2 } },
    series: BUCKET.map((bk, x) => ({ name: bk.l, type: 'bar', stack: 's', barWidth: 15, data: segs.map(([, k]) => bySeg.get(k + '|' + x) || 0), itemStyle: { borderColor: '#fff', borderWidth: .6 } })),
  });

  kontrol('segJam', [{ v: '2026', l: 'Pendaftar 2026' }, { v: 'semua', l: 'Semua bulan' }], S.jam, v => { S.jam = v; render(); });
  const barisJam = S.jam === '2026' ? R3.filter(r => (namaBulan(r[iR3.bulan]) || '') >= '2026-01') : R3;
  const byH = new Array(24).fill(0);
  for (const r of barisJam) { const h = +D.dims.jam[r[iR3.jam]]; if (h >= 0 && h < 24) byH[h] += r[iR3.n]; }
  const totH = byH.reduce((a, b) => a + b, 0);
  el('hintJam').textContent = `${pctS(pc(byH[3] + byH[4], totH))} pendaftaran tercipta pukul 03:00–04:59 — pola impor massal, bukan aktivitas merchant per jam.`;
  chart('cJam', {
    tooltip: { ...TIP, formatter: p => `${String(p.dataIndex).padStart(2, '0')}:00<br><b>${idnum(p.value)}</b> merchant · ${pctS(pc(p.value, totH))}` },
    grid: GRID,
    xAxis: { type: 'category', data: byH.map((_, h) => String(h).padStart(2, '0')), ...AXIS, splitLine: { show: false }, axisLabel: { ...AXIS.axisLabel, fontSize: 10 } },
    yAxis: { type: 'value', ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: short } },
    series: [{ type: 'bar', data: byH, barWidth: '74%', itemStyle: { borderRadius: [2, 2, 0, 0], color: p => (p.dataIndex === 3 || p.dataIndex === 4) ? SW : 'rgba(58,168,160,.7)' } }],
  });

  /* Tipe merchant & jumlah user — kolom yang selama ini ada di data tapi tidak pernah tampil */
  const TT = D.tables.t.filter(r => S.tipe === '*' || D.dims.tipe[r[iT.tipe]] === S.tipe);
  const namaTipe = r => D.dims.tipe[r[iT.tipe]];
  const totTipeGmv = TT.reduce((a, r) => a + r[iT.gmv], 0);
  el('subTipe').textContent = `${TT.length} tipe · ${idnum(M.length)} merchant`;
  chart('cTipe', {
    tooltip: { ...TIP, trigger: 'axis', formatter: p => { const r = TT[p[0].dataIndex]; return `<b>${namaTipe(r)}</b> · ${idnum(r[iT.n])} merchant<br>login ≤30 hari: ${idnum(r[iT.nLogin30])} (${pctS(pc(r[iT.nLogin30], r[iT.n]))})<br>punya transaksi: ${idnum(r[iT.nTxn])} (${pctS(pc(r[iT.nTxn], r[iT.n]))})<br>nilai: ${rp(r[iT.gmv])} · ${pctS(pc(r[iT.gmv], totTipeGmv))}<br>nilai tengah/merchant: ${rp(r[iT.n] ? r[iT.gmv] / r[iT.n] : 0)}`; } },
    grid: { ...GRID, top: 14 },
    xAxis: { type: 'category', data: TT.map(namaTipe), ...AXIS, splitLine: { show: false }, axisLabel: { ...AXIS.axisLabel, fontSize: 11, color: INK2 } },
    yAxis: { type: 'value', ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: short } },
    series: [{
      type: 'bar', data: TT.map(r => r[iT.n]), barMaxWidth: 74, itemStyle: { borderRadius: [4, 4, 0, 0], color: p => [PR, SC, '#c6c6c6'][p.dataIndex % 3] },
      label: { show: true, position: 'top', fontSize: 11, color: INK2, formatter: p => `${idnum(p.value)}\n${pctS(pc(TT[p.dataIndex][iT.gmv], totTipeGmv))} nilai`, lineHeight: 14 },
    }],
  });

  const distribusi = [[1, 1], [2, 2], [3, 3], [4, 5], [6, 10], [11, Infinity]].map(([a, b]) => {
    const g = M.filter(r => r[i.users] >= a && r[i.users] <= b);
    return { l: a === b ? String(a) : b === Infinity ? `${a}+` : `${a}–${b}`, n: g.length, gmv: g.reduce((s, r) => s + r[i.gmv], 0), login30: g.filter(r => r[i.loginDays] >= 0 && r[i.loginDays] <= 30).length };
  }).filter(x => x.n);
  const multi = M.filter(r => r[i.users] > 1);
  el('subUser').textContent = `${idnum(multi.length)} merchant punya lebih dari satu user`;
  chart('cUser', {
    color: [PR], tooltip: { ...TIP, formatter: p => `<b>${p[1]} user</b><br>${idnum(distribusi[p.dataIndex].n)} merchant<br>nilai ${rp(distribusi[p.dataIndex].gmv)} · rata-rata ${rp(distribusi[p.dataIndex].gmv / distribusi[p.dataIndex].n)}<br>login ≤30 hari: ${pctS(pc(distribusi[p.dataIndex].login30, distribusi[p.dataIndex].n))}` },
    grid: { top: 6, bottom: 4, left: 4, right: 62, containLabel: true },
    xAxis: { type: 'value', show: false },
    yAxis: { type: 'category', inverse: true, data: distribusi.map(x => x.l), ...AXIS, splitLine: { show: false }, axisLabel: { ...AXIS.axisLabel, fontSize: 11, color: INK2 } },
    series: [{ type: 'bar', data: distribusi.map(x => x.n), barMaxWidth: 16, showBackground: true, backgroundStyle: { color: '#f0f0f0', borderRadius: 3 }, itemStyle: { borderRadius: [0, 3, 3, 0] }, label: { show: true, position: 'right', fontSize: 10.5, color: INK2, formatter: p => short(p.value) } }],
  });

  const lifeB = D.dims.umurSaatTutup.filter(u => u !== 'tidak diketahui');
  const byU = kelompok(R4, iR4.umur, [iR4.n]);
  const totalChurn = totalOf(byU);
  el('subChurn').textContent = idnum(totalChurn) + ' merchant ditutup';
  chart('cChurn', {
    tooltip: { ...TIP, formatter: p => `${p[1]}<br><b>${idnum(p[0].value)}</b> · ${pctS(pc(p[0].value, totalChurn))}` },
    grid: { ...GRID, top: 14 },
    xAxis: { type: 'category', data: lifeB, ...AXIS, splitLine: { show: false }, axisLabel: { ...AXIS.axisLabel, fontSize: 10 } },
    yAxis: { type: 'value', ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: short } },
    series: [{ type: 'bar', data: lifeB.map((u, k) => (byU.get(D.dims.umurSaatTutup.indexOf(u)) || [0])[0]), barMaxWidth: 30, itemStyle: { color: '#5ccfc5', borderRadius: [3, 3, 0, 0] }, label: { show: true, position: 'top', fontSize: 10, color: INK2, formatter: p => idnum(p.value) } }],
  });

  const byTM = kelompok(M, i.bulanTxn, [null]);
  const tms = D.dims.bulanTxn.map((b, k) => [b, k]).filter(([b]) => b && b !== '(tidak ada)').sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
  const totTM = totalOf(byTM);
  el('subTxnMon').textContent = idnum(jum(M, i.punyaTxn)) + ' merchant';
  chart('cTxnMon', {
    tooltip: { ...TIP, formatter: p => `${p[1]}<br><b>${idnum(p[0].value)}</b> merchant · ${pctS(pc(p[0].value, totTM))}` },
    grid: { ...GRID, top: 14 },
    xAxis: { type: 'category', data: tms.map(x => x[0]), ...AXIS, splitLine: { show: false }, axisLabel: { ...AXIS.axisLabel, rotate: 45, fontSize: 9.5 } },
    yAxis: { type: 'value', ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: short } },
    series: [{ type: 'bar', data: tms.map(([, k]) => (byTM.get(k) || [0])[0]), barWidth: '82%', itemStyle: { color: p => p.dataIndex === tms.length - 1 ? SU : 'rgba(0,138,0,.32)', borderRadius: [2, 2, 0, 0] } }],
  });
}

/* ================= TRANSAKSI ================= */
function renderTransaksi({ R2, M }) {
  const i = iM;
  const bayar = r => r[i.punyaTxn] && r[i.gmv] > 0;
  const cocokCari = r => !S.cari || r[i.nama].toLowerCase().includes(S.cari.toLowerCase());
  const mt0 = M.filter(bayar);
  const mt = mt0.filter(cocokCari);
  const mtBelum = M.filter(r => !bayar(r) && cocokCari(r));
  const gm = mt.reduce((a, r) => a + r[i.gmv], 0), tx = mt.reduce((a, r) => a + r[i.txns], 0);
  const gmvUrut = mt.map(r => r[i.gmv]).sort((a, b) => b - a);
  const mGmv = med(gmvUrut);
  const top10 = gmvUrut.slice(0, 10).reduce((a, b) => a + b, 0);
  const W = D.meta.jendelaTransaksiBulan;
  const { idxB, mon2026 } = POKOK();
  const deretNilai = mon2026.map(mo => { const k = idxB.get(mo); return mt.filter(r => r[i.bulanDaftar] === k).reduce((a, r) => a + r[i.gmv], 0); });

  el('scopeTxn').textContent = `${idnum(mt.length)} merchant bernilai transaksi · jendela ${W} bulan${S.cari ? ` · pencarian “${S.cari}” membatasi seluruh panel ini` : ''}`;
  kartu('kpisTxn', [
    { l: 'Merchant bernilai transaksi', v: idnum(mt.length), n: mt.length, s: pctS(pc(mt.length, M.length)) + ' dari beraktivitas', tip: 'Merchant dengan transaksi bernilai > 0 pada jendela tetap 8,77 bulan.', c: PR },
    { l: 'Nilai transaksi tererekam', v: rp(gm), n: gm, f: 'rp', s: W + ' bulan · dari ' + idnum(mt.length) + ' merchant', tip: 'Seluruh file aktivitas + transaksi, bukan hanya pendaftar 2026.', c: SC },
    { l: 'Laju per bulan', v: rp(gm / W), n: gm / W, f: 'rp', s: 'rata-rata jendela tetap', tip: 'Nilai total dibagi 8,77 bulan (bukan bulan kalender) agar setara antar periode.', c: SU },
    { l: 'Transaksi', v: idnum(tx), n: tx, s: short(tx / W) + ' / bulan', tip: 'Jumlah transaksi seluruh merchant tersearing pada jendela tetap; angka "per bulan" memakai pembagian yang sama.', c: SF },
    { l: 'Nilai tengah per merchant', v: rp(mGmv), n: mGmv, f: 'rp', s: 'jauh di bawah rata-rata', tip: 'Rata-rata tertarik ke atas oleh segelintir merchant besar.', c: SW },
    { l: '10 merchant terbesar', v: pctS(pc(top10, gm)), s: 'dari seluruh nilai', kelas: 'warn', tip: 'Pangsa nilai yang dikuasai 10 merchant teratas — ukuran konsentrasi, bukan risiko gagal.', c: SD },
  ]);

  kontrol('segPareto', [{ v: '100', l: '100' }, { v: '200', l: '200' }, { v: '500', l: '500' }, { v: 'all', l: 'Semua' }], S.pareto, v => { S.pareto = v; render(); });
  const semua = S.pareto === 'all';
  let bilah, label, isi;
  if (semua) {
    const ukur = Math.ceil(gmvUrut.length / 220);
    bilah = []; label = []; isi = [];
    for (let k = 0; k < gmvUrut.length; k += ukur) {
      const p = gmvUrut.slice(k, k + ukur);
      bilah.push(p.reduce((a, b) => a + b, 0)); label.push(`${k + 1}–${k + p.length}`); isi.push(p.length);
    }
  } else {
    const a = gmvUrut.slice(0, +S.pareto);
    bilah = a; label = a.map((_, k) => String(k + 1)); isi = a.map(() => 1);
  }
  let acc = 0;
  const kum = bilah.map(v => pc((acc += v), gm));
  el('hintPareto').textContent = semua ? `${idnum(bilah.length)} bilah, tiap bilah merangkum ${isi[0]} merchant berperingkat berdekatan.` : `${idnum(bilah.length)} merchant teratas dari ${idnum(gmvUrut.length)}.`;
  chart('cPareto', {
    animation: false, color: [PR, '#ff8500'],
    tooltip: { ...TIP, trigger: 'axis', formatter: p => `peringkat ${label[p[0].dataIndex]}${isi[p[0].dataIndex] > 1 ? ` (${isi[p[0].dataIndex]} merchant)` : ''}<br>Nilai: <b>${rp(p[0].value)}</b><br>Kumulatif: ${pctS(p[1].value)}` },
    legend: LEG, grid: GRID,
    xAxis: { type: 'category', data: label, ...AXIS, splitLine: { show: false }, axisLabel: { ...AXIS.axisLabel, fontSize: 10, interval: semua ? 39 : 'auto' } },
    yAxis: [{ type: 'value', ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: short } },
      { type: 'value', max: 100, ...AXIS, splitLine: { show: false }, axisLabel: { ...AXIS.axisLabel, formatter: '{value}%' } }],
    series: [{ name: 'Nilai', type: 'bar', data: bilah, barWidth: semua ? '96%' : '70%', itemStyle: { color: PR, opacity: .88 } },
      { name: 'Kumulatif', type: 'line', yAxisIndex: 1, data: kum, symbol: 'none', lineStyle: { width: 2, color: '#ff8500' } }],
  });

  chart('cScatter', {
    animation: false,
    tooltip: { ...TIP, formatter: p => `${p.value[4]}<br>${p.value[3]}<br>${idnum(p.value[0])} transaksi · ${rp(p.value[1])} per transaksi<br>Nilai: <b>${rp(p.value[2])}</b>` },
    grid: GRID,
    xAxis: { type: 'log', name: 'jumlah transaksi →', ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: v => short(v) } },
    yAxis: { type: 'log', name: 'Rp / transaksi', nameTextStyle: { color: INK3, fontSize: 10.5 }, ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: v => short(v) } },
    series: [{ type: 'scatter', large: true, progressive: 4000, symbolSize: p => Math.max(3, Math.min(16, Math.log10(p[2] + 1) * 1.6)), data: mt.map(r => [r[i.txns], r[i.avgTxn] || 1, r[i.gmv], D.dims.provinsi[r[i.prov]], r[i.nama]]), itemStyle: { color: 'rgba(58,168,160,.36)' } }],
  });

  const segs = D.dims.segmen.filter(s => s && s !== '(tidak ada)');
  const pct = (a, p) => a.length ? a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))] : 0;
  const box = segs.map(s => {
    const v = mt.filter(r => D.dims.segmen[r[i.seg]] === s).map(r => r[i.gmv]).sort((a, b) => a - b);
    const lg = x => Math.log10(Math.max(x, 1));
    return { s, n: v.length, q: [lg(pct(v, .05)), lg(pct(v, .25)), lg(pct(v, .5)), lg(pct(v, .75)), lg(pct(v, .95))], asli: [pct(v, .05), pct(v, .25), pct(v, .5), pct(v, .75), pct(v, .95)] };
  });
  chart('cBox', {
    color: [PR],
    tooltip: { ...TIP, formatter: p => { const b = box[p.dataIndex]; return `<b>${b.s}</b> · ${idnum(b.n)} merchant<br>p95: ${rp(b.asli[4])}<br>atas (q3): ${rp(b.asli[3])}<br>nilai tengah: <b>${rp(b.asli[2])}</b><br>bawah (q1): ${rp(b.asli[1])}<br>p5: ${rp(b.asli[0])}`; } },
    grid: GRID,
    xAxis: { type: 'category', data: segs, ...AXIS, splitLine: { show: false }, axisLabel: { ...AXIS.axisLabel, fontSize: 10.5, color: INK2 } },
    yAxis: { type: 'value', min: 0, max: 13, interval: 2, ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: v => v === 0 ? '0' : short(10 ** v) } },
    series: [{ type: 'boxplot', data: box.map(b => b.q), boxWidth: [10, 34], itemStyle: { color: 'rgba(58,168,160,.1)', borderColor: PR, borderWidth: 1.3 }, emphasis: { itemStyle: { color: 'rgba(58,168,160,.22)' } } }],
  });

  const byF = urut(kelompok(R2, iR2.keluarga, [iR2.gmv, iR2.n]), 0).slice(0, 12);
  chart('cKatValue', {
    color: [PR, SU],
    tooltip: {
      ...TIP, trigger: 'axis',
      formatter: p => { const o = byF[p[0].dataIndex][1]; return `<b>${p[0].name}</b><br>Nilai transaksi: <b>${rp(o[0])}</b><br>Merchant terdaftar: <b>${idnum(o[1])}</b><br>Rata-rata per merchant: ${rp(o[0] / (o[1] || 1))}`; },
    },
    legend: LEG, grid: { ...GRID, left: 4, right: 56 },
    xAxis: [{ type: 'value', ...AXIS, axisLabel: { ...AXIS.axisLabel, formatter: short } },
      { type: 'value', position: 'top', ...AXIS, splitLine: { show: false }, axisLabel: { ...AXIS.axisLabel, formatter: short } }],
    yAxis: { type: 'category', inverse: true, data: byF.map(([k]) => D.dims.keluarga[k]), ...AXIS, splitLine: { show: false }, axisLabel: { ...AXIS.axisLabel, fontSize: 11, width: 150, overflow: 'truncate', color: INK2 } },
    series: [{ name: 'Nilai transaksi', type: 'bar', data: byF.map(([, o]) => Math.round(o[0])), barWidth: 9, itemStyle: { borderRadius: 3 } },
      { name: 'Merchant', type: 'scatter', xAxisIndex: 1, symbolSize: 8, data: byF.map(([, o]) => o[1]), itemStyle: { borderColor: '#fff', borderWidth: 1 } }],
  });

  /* Tabel bisa dibaca dua arah: siapa yang sudah menghasilkan, dan siapa yang belum — kolom 'Terakhir' ikut berganti makna. */
  const terakhir = S.daftar === 'txn' ? [i.bulanTxn, r => namaBulanTxn(r[i.bulanTxn])] : [i.bulanLogin, r => namaBulanLogin(r[i.bulanLogin])];
  const kolom = [['Merchant', i.nama, 0], ['Provinsi', i.prov, 0], ['Kab / kota', i.kab, 0], ['Kategori', i.cat, 0], ['Segmen', i.seg, 0], ['Tipe', i.tipe, 0],
    ['Transaksi', i.txns, 1], ['Nilai', i.gmv, 1], ['Rp / transaksi', i.avgTxn, 1], ['Usia login (hari)', i.loginDays, 1], [`Terakhir ${S.daftar === 'txn' ? 'transaksi' : 'login'}`, terakhir[0], 0], ['User', i.users, 1]];
  const LEBAR_KOLOM = [17, 8, 8, 15, 8, 8, 7, 9, 7, 6, 6, 1];
  kontrol('segDaftar', [{ v: 'txn', l: 'Bertransaksi', n: idnum(mt.length) }, { v: 'kosong', l: 'Belum bertransaksi', n: idnum(mtBelum.length) }], S.daftar, v => {
    S.daftar = v; S.sort = { key: v === 'txn' ? i.gmv : i.loginDays, dir: v === 'txn' ? -1 : 1 }; render();
  });
  const isiTabel = S.daftar === 'txn' ? mt : mtBelum;
  const terurut = isiTabel.slice().sort((a, b) => {
    const k = S.sort.key, A = a[k], B = b[k];
    if (typeof A === 'string') return S.sort.dir * A.localeCompare(B, 'id');
    return S.sort.dir * ((A ?? -1) - (B ?? -1));
  }).slice(0, 200);
  /* Kalau saringan menyisakan nol baris, katakan angkanya — jangan biarkan tabel diam tanpa sebab. */
  const srn = [S.tipe !== '*' && `tipe ${S.tipe}`, S.bulan !== '*' && (S.bulan === 'pra2026' ? 'pendaftar sebelum 2026' : `pendaftar ${S.bulan}`),
    S.prov !== '*' && S.prov, S.seg !== '*' && `segmen ${S.seg}`, S.cari && `nama “${S.cari}”`].filter(Boolean);
  const tanpaBaris = `<tr><td colspan="${kolom.length}" class="kosong"><b>Tidak ada merchant pada saringan ini.</b> ${idnum(M.length)} merchant tersearing${srn.length ? ' (' + srn.join(' · ') + ')' : ''}.` +
    (M.length && M.every(r => !r[i.punyaMid]) ? ` Seluruh baris ini MID-nya kosong di file sumber, jadi transaksinya tidak bisa ditautkan — ${idnum(M.filter(r => r[i.loginDays] >= 0 && r[i.loginDays] <= 30).length)} di antaranya tetap login dalam 30 hari terakhir.` : '') +
    ` <button class="btn" type="button" data-setulang>Set ulang saringan</button></td></tr>`;
  el('tTop').innerHTML = `<colgroup>${LEBAR_KOLOM.map(w => `<col style="width:${w}%">`).join('')}</colgroup><thead><tr>${kolom.map(c => `<th data-k="${c[1]}" class="${c[2] ? 'num' : ''}" ${S.sort.key === c[1] ? `aria-sort="${S.sort.dir < 0 ? 'descending' : 'ascending'}"` : ''}>${c[0]}${S.sort.key === c[1] ? `<span class="arrow">${S.sort.dir < 0 ? '↓' : '↑'}</span>` : ''}</th>`).join('')}</tr></thead><tbody>` +
    (terurut.length ? terurut.map(r => `<tr data-id="${kunciBaris(r)}"${S.midPilih === kunciBaris(r) ? ' class="sel"' : ''}>
      <td class="name" title="${esc(r[i.nama])} · MID ${r[i.punyaMid] ? r[i.mid] : 'kosong di sumber'} · NMID ${r[i.nmid]} · MPAN ${r[i.mpan]}">${S.cari ? sorot(r[i.nama], S.cari) : esc(r[i.nama])}${r[i.punyaMid] ? '' : ' <span class="tag warn">tanpa MID</span>'}</td>
      <td>${D.dims.provinsi[r[i.prov]]}</td><td>${D.dims.kabupaten[r[i.kab]]}</td>
      <td class="name" title="${esc(D.dims.kategori[r[i.cat]])}">${esc(D.dims.kategori[r[i.cat]])}</td>
      <td><span class="tag">${D.dims.segmen[r[i.seg]]}</span></td><td>${D.dims.tipe[r[i.tipe]]}</td>
      <td class="num">${idnum(r[i.txns])}</td><td class="num strong">${rp(r[i.gmv])}</td><td class="num">${idnum(r[i.avgTxn])}</td>
      <td class="num">${r[i.loginDays] >= 0 ? r[i.loginDays] : '—'}</td>
      <td title="${S.daftar === 'txn' ? 'transaksi terakhir ' + (r[i.tglTxn] || 'tidak diketahui') : 'login terakhir ' + (namaBulanLogin(r[i.bulanLogin]) || 'tidak diketahui')}">${terakhir[1](r) || '—'}</td>
      <td class="num">${idnum(r[i.users])}</td></tr>`).join('') : tanpaBaris) + '</tbody>';
  el('tTop').onclick = e => {
    if (e.target.closest('[data-setulang]')) { el('btnReset').click(); return; }
    const tr = e.target.closest('tbody tr');
    if (tr && tr.dataset.id) { S.midPilih = S.midPilih === tr.dataset.id ? '' : tr.dataset.id; render(); return; }
    const th = e.target.closest('th');
    if (!th) return;
    const k = +th.dataset.k;
    S.sort = { key: k, dir: S.sort.key === k ? -S.sort.dir : -1 };
    render();
  };
  el('subTop').textContent = `menampilkan ${idnum(terurut.length)} dari ${idnum(isiTabel.length)} merchant${S.cari ? ` · pencarian “${S.cari}”` : ''}`;
  renderDossier(isiTabel);
  el('btnCsv').onclick = () => unduhCsv(`wondr-merchant_${S.daftar === 'txn' ? 'bertransaksi' : 'belum-bertransaksi'}_${D.meta.snapshot}.csv`, csvMerchant(isiTabel));
}

/* Ekspor membawa seluruh baris saringan dan seluruh kolom sumber, bukan hanya yang muat di layar.
   Pemisah ; dan BOM: mengikuti pengaturan Excel Indonesia (koma sebagai desimal). */
const KOLOM_CSV = [
  ['Merchant', r => r[iM.nama]], ['MID', r => r[iM.punyaMid] ? r[iM.mid] : ''],
  ['NMID', r => r[iM.nmid] === '(tidak ada)' ? '' : r[iM.nmid]], ['MPAN', r => r[iM.mpan] === '(tidak ada)' ? '' : r[iM.mpan]],
  ['Status MPAN', r => D.dims.mpanStatus[r[iM.mpanStatus]]], ['Provinsi', r => D.dims.provinsi[r[iM.prov]]],
  ['Kabupaten', r => D.dims.kabupaten[r[iM.kab]]], ['Kategori usaha', r => D.dims.kategori[r[iM.cat]]],
  ['Keluarga kategori', r => D.dims.keluarga[r[iM.fam]]], ['Tipe merchant', r => D.dims.tipe[r[iM.tipe]]],
  ['Segmentasi UMKM', r => D.dims.segmen[r[iM.seg]]], ['Status merchant', r => D.dims.status[r[iM.status]]],
  ['Bulan daftar', r => namaBulan(r[iM.bulanDaftar])], ['Usia login (hari)', r => r[iM.loginDays] >= 0 ? r[iM.loginDays] : ''],
  ['Bulan login terakhir', r => namaBulanLogin(r[iM.bulanLogin])], ['Jam login terakhir', r => r[iM.jamLogin] >= 0 ? r[iM.jamLogin] : ''],
  ['Jumlah user aktif', r => r[iM.users]], ['Punya transaksi', r => r[iM.punyaTxn] ? 'ya' : 'tidak'],
  ['Jumlah transaksi', r => r[iM.txns]], ['Nilai penjualan (Rp)', r => r[iM.gmv]],
  ['Rata-rata per bulan dari file (Rp)', r => r[iM.rataBulan]], ['Rata-rata per transaksi (Rp)', r => r[iM.avgTxn]],
  ['Bulan transaksi terakhir', r => namaBulanTxn(r[iM.bulanTxn])], ['Tanggal transaksi terakhir', r => r[iM.tglTxn] || ''],
  ['Ada di file pendaftaran 2026', r => r[iM.diRegistry] ? 'ya' : 'tidak'], ['Data per', () => D.meta.snapshot],
];
function csvMerchant(rows) {
  const kutip = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return '\ufeff' + [KOLOM_CSV.map(k => kutip(k[0])).join(';'),
    ...rows.map(r => KOLOM_CSV.map(([, f]) => kutip(f(r))).join(';'))].join('\r\n');
}
function unduhCsv(nama, isi) {
  const a = document.createElement('a'), url = URL.createObjectURL(new Blob([isi], { type: 'text/csv;charset=utf-8' }));
  a.href = url; a.download = nama; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* Semua kolom sumber ditampilkan apa adanya di sini, supaya tidak ada field yang cuma lewat di belakang layar. */
function renderDossier(mt) {
  const i = iM, W = D.meta.jendelaTransaksiBulan;
  const ditunjuk = mt.find(r => kunciBaris(r) === S.midPilih) || null;
  const pilih = ditunjuk || mt.slice().sort((a, b) => b[i.gmv] - a[i.gmv] || a[i.loginDays] - b[i.loginDays])[0];
  const baris = (k, v, t) => `<div class="row"><span class="k">${k}</span><span class="val" title="${t || ''}">${v}</span></div>`;
  if (!pilih) { el('dDossier').innerHTML = `<div class="row"><span class="k">tidak ada merchant yang cocok dengan saringan ini</span></div>`; el('subDossier').textContent = ''; return; }
  const tan = !pilih[i.punyaTxn];
  const lajuHitung = pilih[i.gmv] / W;
  const selisih = pilih[i.rataBulan] ? (lajuHitung / pilih[i.rataBulan] - 1) * 100 : null;
  const ti = '<span class="tag warn">tidak ada barisnya di file transaksi</span>';
  el('subDossier').textContent = `${ditunjuk ? 'baris terpilih di tabel' : pilih[i.gmv] ? 'nilai terbesar dalam daftar ini' : 'login paling baru dalam daftar ini'} · ${pilih[i.punyaMid] ? 'MID ' + pilih[i.mid] : 'tanpa MID'}`;
  el('dDossier').innerHTML = [
    baris('Nama merchant', esc(pilih[i.nama])),
    baris('MID', pilih[i.punyaMid] ? `<span class="mono">${pilih[i.mid]}</span>` : `<span class="tag warn">kosong di file sumber</span>`, 'Kunci gabungan antar file.'),
    baris('NMID', `<span class="mono">${esc(pilih[i.nmid])}</span>`, 'Kolom NMID pada file aktivitas dan transaksi.'),
    baris('MPAN', `<span class="mono">${esc(pilih[i.mpan])}</span> <span class="tag ${pilih[i.mpanStatus] === 'utuh' ? 'ok' : 'warn'}">${D.dims.mpanStatus[pilih[i.mpanStatus]]}</span>`, 'MPAN pada file pendaftaran/transaksi rusak jadi notasi ilmiah; yang utuh berasal dari file aktivitas.'),
    baris('Tipe merchant', D.dims.tipe[pilih[i.tipe]]),
    baris('Segmentasi UMKM', D.dims.segmen[pilih[i.seg]]),
    baris('Status merchant', D.dims.status[pilih[i.status]]),
    baris('Provinsi / kabupaten', `${D.dims.provinsi[pilih[i.prov]]} · ${D.dims.kabupaten[pilih[i.kab]]}`),
    baris('Kategori usaha', esc(D.dims.kategori[pilih[i.cat]]), 'Asli dari kolom Kategori Usaha.'),
    baris('Keluarga kategori', esc(D.dims.keluarga[pilih[i.fam]]), 'Hasil ringkasan 273 kategori jadi 15 keluarga.'),
    baris('Tanggal daftar', namaBulan(pilih[i.bulanDaftar]) || '—'),
    baris('Login terakhir', `${namaBulanLogin(pilih[i.bulanLogin]) || '—'}${pilih[i.jamLogin] >= 0 ? ` · pukul ${String(pilih[i.jamLogin]).padStart(2, '0')}:xx` : ''}`),
    baris('Usia login', pilih[i.loginDays] >= 0 ? `${idnum(pilih[i.loginDays])} hari sebelum tanggal data` : 'tidak ada catatan login'),
    baris('Jumlah user aktif', idnum(pilih[i.users]), 'Kolom Jumlah User Aktif. 95% merchant nilainya 1.'),
    baris('Transaksi', tan ? ti : `${idnum(pilih[i.txns])} transaksi`),
    baris('Nilai penjualan', tan ? ti : rp(pilih[i.gmv]), 'Kolom Nilai Penjualan (Rp), satu angka untuk seluruh jendela.'),
    baris('Rata-rata per bulan — dari file', tan ? ti : rp(pilih[i.rataBulan]), 'Kolom Rata-rata per Bulan (Rp) apa adanya dari sumber.'),
    baris('Rata-rata per bulan — hitungan', tan ? ti : rp(lajuHitung) + (selisih == null ? '' : ` <span class="tag ${Math.abs(selisih) > 10 ? 'warn' : 'ok'}">selisih ${pctS(selisih)}</span>`), 'Nilai dibagi jendela tetap 8,77 bulan. Selisih besar berarti jendela file ini tidak sama dengan rata-ratanya.'),
    baris('Rata-rata per transaksi', tan ? ti : rp(pilih[i.avgTxn])),
    baris('Transaksi terakhir', pilih[i.tglTxn] || 'tidak ada di file transaksi', 'Tanggal harian, bukan hanya bulan.'),
    baris('Ada di file pendaftaran', pilih[i.diRegistry] ? 'ya (pendaftar 2026)' : 'tidak'),
  ].join('');
}
function sorot(teks, kata) {
  const i = teks.toLowerCase().indexOf(kata.toLowerCase());
  if (i < 0) return esc(teks);
  return esc(teks.slice(0, i)) + '<mark>' + esc(teks.slice(i, i + kata.length)) + '</mark>' + esc(teks.slice(i + kata.length));
}

/* ================= pencarian ================= */
function pasangCari() {
  const q = el('q'), sg = el('sugg');
  const hit = () => {
    const kueri = q.value.trim();
    if (kueri.length < 2) { sg.classList.remove('on'); return; }
    const b = kueri.toLowerCase();
    const prov = D.dims.provinsi.filter(p => p.toLowerCase().includes(b)).slice(0, 5).map(p => ({ t: 'Provinsi', n: p }));
    const kat = D.dims.kategori.filter(p => p.toLowerCase().includes(b)).slice(0, 4).map(p => ({ t: 'Kategori', n: p }));
    const mer = D.tables.m.filter(r => r[iM.nama].toLowerCase().includes(b)).slice(0, 8)
      .map(r => ({ t: 'Merchant · ' + D.dims.provinsi[r[iM.prov]], n: r[iM.nama], mid: r[iM.mid] }));
    const semua = [...mer, ...prov, ...kat];
    sg.innerHTML = semua.length ? semua.map((x, k) => `<div class="sg${k === 0 ? ' hot' : ''}" data-t="${x.t.split(' · ')[0]}" data-n="${esc(x.n)}">
      <span class="n">${sorot(x.n, kueri)}</span><span class="t">${x.t}</span></div>`).join('')
      : `<div class="sg"><span class="n">tidak ada yang cocok dengan “${esc(kueri)}”</span></div>`;
    sg.classList.add('on');
  };
  q.oninput = hit;
  q.onfocus = hit;
  sg.onclick = e => {
    const b = e.target.closest('.sg'); if (!b) return;
    const jenis = b.dataset.t, nama = b.dataset.n;
    sg.classList.remove('on');
    if (jenis === 'Provinsi') { S.prov = nama; el('fProv').value = nama; render(); }
    else { S.cari = nama; pindahTab('transaksi'); render(); }
  };
  q.onkeydown = e => {
    if (e.key === 'Enter') {
      const kueri = q.value.trim();
      if (kueri.length >= 2) { S.cari = kueri; sg.classList.remove('on'); pindahTab('transaksi'); render(); }
    }
  };
  document.addEventListener('click', e => { if (!e.target.closest('.search')) sg.classList.remove('on'); });
}

/* ================= MUTU DATA ================= */
const PAKAI_KOLOM = {
  'MID': 'kunci gabungan antar file · tabel merchant',
  'NMID': 'kartu identitas merchant',
  'MPAN': 'kartu identitas merchant + status kerusakan',
  'Nama Merchant': 'tabel merchant, pencarian, kartu identitas',
  'Tipe Merchant': 'saringan Tipe + grafik "Tipe merchant" di tab Aktivitas',
  'Kategori Usaha': 'kolom Kategori (302 nilai asli) + keluarga kategori',
  'Segmentasi UMKM': 'saringan Segmen + sebaran per segmen + audit label segmen',
  'Status': 'kartu status + grafik "Status merchant"',
  'Status Merchant': 'kartu status + grafik "Status merchant"',
  'Tanggal Daftar': 'per bulan daftar: grafik mini, retensi, matriks, heatmap',
  'Tanggal Dinonaktifkan': 'grafik "Umur merchant saat ditutup" (hanya terisi 1,2%)',
  'Provinsi': 'peta + peringkat wilayah',
  'Kabupaten/Kota': 'peringkat kabupaten',
  'Jumlah User Aktif': 'grafik "Jumlah user aktif" + kartu identitas',
  'Login Terakhir': 'usia login, bulan login, kurva retensi',
  'Hari Sejak Login Terakhir': 'sama — dicocokkan dengan kolom Login Terakhir',
  'Jumlah Transaksi': 'tabel merchant + laju transaksi bulanan',
  'Nilai Penjualan (Rp)': 'seluruh angka rupiah di dashboard',
  'Rata-rata per Bulan (Rp)': 'kartu identitas: pembanding laju hasil hitungan',
  'Rata-rata per Transaksi (Rp)': 'kolom "Rp / transaksi"',
  'Transaksi Terakhir': 'bulan transaksi terakhir + tanggal harian di kartu identitas',
};
const GLOSARIUM = [
  ['tanggal data (snapshot)', 'tanggal terakhir file ekspor dibuat; semua "hari sejak" dihitung dari tanggal ini'],
  ['jendela 8,77 bulan', 'nilai transaksi pada file adalah total satu periode tetap ±8,77 bulan, bukan total seumur hidup'],
  ['kohort (kelompok pendaftar)', 'merchant yang terdaftar pada bulan yang sama'],
  ['usia login', 'berapa hari sejak login terakhir; 0 = login pada hari data terakhir'],
  ['median (nilai tengah)', 'nilai di tengah barisan; dipakai karena rata-rata tertarik jauh ke atas oleh segelintir merchant besar'],
  ['kuantil', 'pembagian provinsi jadi kelompok sama banyak, bukan sama jarak — dipakai untuk warna peta'],
  ['Gini / kurva Lorenz', 'ukuran ketimpangan: 0% berarti semua merchant sama besar, 100% berarti satu merchant saja'],
  ['HHI', 'jumlah kuadrat pangsa pasar; 10.000 = hanya satu pemain. Juga dinyatakan sebagai "setara N merchant sama besar"'],
  ['panggil kembali (win-back)', 'merchant yang dulu membayar lalu berhenti login; paling mahal dipanggil setelah 6 bulan'],
  ['MID / NMID / MPAN', 'tiga identitas merchant. MID kunci utama; MPAN rusak di ekspor (jadi 9,36E+18) sehingga tidak dipakai menggabung'],
  ['merchant mandiri vs submerchant', 'mandiri punya akun sendiri; submerchant berada di bawah satu induk sehingga angka per-merchant-nya tidak sebanding'],
  ['aggregator', 'kumpulan merchant yang masuk lewat perantara, bukan daftar sendiri'],
  ['URE', 'kode segmentasi pada sumber untuk usaha yang tidak masuk kelas mikro/kecil/menengah/besar'],
];
/* ================= tambah data ================= */
const TAMBAH = { status: null, antre: [], sibuk: false };
const ukuranBerkas = b => b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';

async function lihatTambah() {
  try {
    const r = await fetch('/api/status', { cache: 'no-store' });
    TAMBAH.status = r.ok ? await r.json() : null;
  } catch { TAMBAH.status = null; }
  const s = TAMBAH.status;
  const bs = el('btnSheet'); if (bs) bs.disabled = !(s && s.bisaBangun);
  el('subTambah').textContent = s ? s.jumlah.csv + ' berkas di folder sumber · data per ' + (s.snapshot || '—') : 'peladen ini tanpa mesin build';
  el('hintTambah').textContent = !s
    ? 'Jalankan peladen dari folder proyek (node serve.mjs) supaya tombol ini ikut membangun ulang; tanpa itu berkas hanya bisa ditumpuk manual di folder sumber.'
    : s.bisaBangun
      ? 'Berkas masuk ke ' + s.sumber + ', lalu seluruh angka dibangun ulang dan diperiksa. Kalau pemeriksaan menolak, angka lama tetap tayang.'
      : 'Folder sumber ' + s.sumber + ' terbuka, tapi mesin build tidak ditemukan dari folder ini.';
}

function gambarAntrean() {
  el('antreanTambah').innerHTML = TAMBAH.antre.map((f, i) => `<div class="row">
    <span class="k">${esc(f.name)} <small>${ukuranBerkas(f.size)}</small></span>
    <span class="val"><span class="tag info" data-tag="${i}">menunggu</span></span></div>`).join('');
  const b = el('btnTambah');
  b.disabled = !TAMBAH.antre.length || TAMBAH.sibuk;
  b.textContent = TAMBAH.antre.length ? 'Unggah & bangun ulang (' + TAMBAH.antre.length + ')' : 'Unggah & bangun ulang';
}
const tandaiAntrean = (i, kelas, teks) => {
  const t = document.querySelector('#antreanTambah [data-tag="' + i + '"]');
  if (t) { t.className = 'tag ' + kelas; t.textContent = teks; }
};
const setLog = (teks, persen) => {
  el('logTambah').textContent = teks;
  const p = el('progTambah');
  if (p) { p.hidden = persen == null; p.firstElementChild.style.width = (persen || 0) + '%'; }
};

async function jalankanTambah() {
  if (!TAMBAH.antre.length || TAMBAH.sibuk) return;
  TAMBAH.sibuk = true;
  el('btnTambah').disabled = true;
  const masuk = [];
  const total = TAMBAH.antre.length + 1;
  for (let i = 0; i < TAMBAH.antre.length; i++) {
    const f = TAMBAH.antre[i];
    setLog('Unggah ' + (i + 1) + ' dari ' + TAMBAH.antre.length + ' · ' + f.name, Math.round(i / total * 100));
    try {
      const r = await fetch('/api/data?nama=' + encodeURIComponent(f.name), { method: 'POST', body: f });
      const j = await r.json();
      masuk.push({ nama: f.name, ...j });
      tandaiAntrean(i, j.ditolak ? 'warn' : j.sudahAda ? 'info' : 'ok', j.ditolak ? 'ditolak' : j.sudahAda ? 'sudah ada' : (j.jenis || 'tersimpan'));
    } catch {
      masuk.push({ nama: f.name, ditolak: 'tidak terkirim' });
      tandaiAntrean(i, 'warn', 'gagal');
    }
  }
  const baru = masuk.filter(x => x.tersimpan).length;
  setLog(baru ? 'Membangun ulang angka — ' + baru + ' berkas baru, ini memakan menit…' : 'Tidak ada berkas baru, angka diperiksa ulang…', Math.round(TAMBAH.antre.length / total * 100));
  let hasil = null, galat = '';
  try {
    const r = await fetch('/api/build', { method: 'POST' });
    hasil = await r.json();
    if (!r.ok || hasil.error) galat = hasil.error || 'kode ' + r.status;
  } catch { galat = 'peladen tidak menjawab'; }
  if (galat) {
    TAMBAH.sibuk = false;
    setLog('Build tidak ditayangkan.', null);
    el('antreanTambah').insertAdjacentHTML('afterbegin', '<div class="row"><span class="k">' + esc(galat) + '</span><span class="val"><span class="tag warn">gagal</span></span></div>');
    el('btnTambah').disabled = !TAMBAH.antre.length;
    return;
  }
  sessionStorage.setItem('wondr.hasilBuild', JSON.stringify({ audit: hasil.audit, snapshot: hasil.snapshot, masuk }));
  setLog('Angka baru sudah lolos pemeriksaan — memuat halaman', 100);
  setTimeout(() => location.reload(), 700);
}

async function jalankanSheet() {
  if (TAMBAH.sibuk) return;
  TAMBAH.sibuk = true;
  el('btnSheet').disabled = true; el('btnTambah').disabled = true;
  setLog('Mengambil ekspor unduhan dari Google Sheet…', 20);
  let hasil = null, galat = '';
  try {
    const r = await fetch('/api/sync-sheet', { method: 'POST', cache: 'no-store' });
    hasil = await r.json();
    if (!r.ok || hasil.error) galat = hasil.error || 'kode ' + r.status;
  } catch { galat = 'peladen tidak menjawab'; }
  if (galat) {
    TAMBAH.sibuk = false;
    setLog('Sheet tidak diambil.', null);
    el('antreanTambah').insertAdjacentHTML('afterbegin', '<div class="row"><span class="k">' + esc(galat) + '</span><span class="val"><span class="tag warn">gagal</span></span></div>');
    el('btnTambah').disabled = !TAMBAH.antre.length; el('btnSheet').disabled = false;
    return;
  }
  setLog(hasil.sudahAda ? 'Isi sheet sama dengan yang tersimpan — angka tetap diperiksa ulang…' : 'Berkas unduhan masuk — membangun ulang & memeriksa angka…', 70);
  sessionStorage.setItem('wondr.hasilBuild', JSON.stringify({ audit: hasil.audit, snapshot: hasil.snapshot, masuk: [{ nama: hasil.berkas, tersimpan: hasil.sudahAda ? null : hasil.berkas }] }));
  setLog('Selesai — memuat halaman', 100);
  setTimeout(() => location.reload(), 700);
}

function tampilkanHasilBuild(h) {
  const a = h.audit || {};
  const masukBaru = (h.masuk || []).filter(x => x.tersimpan).length;
  el('antreanTambah').insertAdjacentHTML('afterbegin', `<div class="row">
    <span class="k">Build terakhir tayang: ${masukBaru} berkas baru masuk · data per ${esc(h.snapshot || '—')}</span>
    <span class="val"><span class="tag ${a.beda ? 'warn' : 'ok'}">${a.total || 0} pemeriksaan · ${a.ok || 0} OK · ${a.wasis || 0} WASIS · ${a.beda || 0} BEDA</span></span></div>`);
}

function pasangTambah() {
  const drop = el('drop'), inp = el('fileTambah'), btn = el('btnTambah');
  if (!drop || !inp || !btn) return;
  const tambah = list => {
    const baru = [...list].filter(f => /\.(csv|xlsx)$/i.test(f.name) && !TAMBAH.antre.some(x => x.name === f.name && x.size === f.size));
    if (baru.length) TAMBAH.antre = TAMBAH.antre.concat(baru);
    gambarAntrean();
  };
  drop.addEventListener('click', () => inp.click());
  drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } });
  inp.addEventListener('change', () => { tambah(inp.files); inp.value = ''; });
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('seret'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => {
    e.preventDefault(); drop.classList.remove('seret');
    if (t === 'drop') tambah(e.dataTransfer.files);
  }));
  btn.addEventListener('click', jalankanTambah);
  const btnSheet = el('btnSheet');
  if (btnSheet) btnSheet.addEventListener('click', jalankanSheet);
  lihatTambah();
  const simpan = sessionStorage.getItem('wondr.hasilBuild');
  if (simpan) { sessionStorage.removeItem('wondr.hasilBuild'); try { tampilkanHasilBuild(JSON.parse(simpan)); } catch { } }
}

function renderMutu() {
  const V = D.verifikasi;
  el('mIssues').innerHTML = D.issues.map(x => `<div class="row">
    <span class="k">${x.label}</span>
    <span class="val"><span class="tag ${x.n ? 'warn' : 'info'}">${x.n ? idnum(x.n) + ' baris' : 'struktural'}</span> <span class="note-sm">${x.aksi}</span></span></div>`).join('');

  const baris = [
    ['Baris pendaftaran mentah dibaca', idnum(V.barisPendaftaranMentah)],
    ['Masuk ringkasan (MID unik, bukan kosong)', idnum(V.barisPendaftaran)],
    ['Baris tanpa MID', idnum(V.MIDtanpaIsi)],
    ['MID berulang antar ekspor (terbaru menang)', `${idnum(V.MIDberulang)} baris · ${idnum(V.duplikatBedaNilai || 0)} MID bawa atribut berbeda`],
    ['Kolom yang bertentangan pada MID ganda', (V.duplikatBedaRinci || []).map(r => `${r.kolom} ${idnum(r.n)}`).join(' · ') || 'tidak ada'],
    ['MPAN tidak terbaca sebagai angka (notasi ilmiah)', idnum(V.mpanNotasiIlmiah)],
    ['Tanggal daftar gagal dibaca', idnum(V.tanggalGagalDibaca)],
    ['Merchant beraktivitas (login atau transaksi)', idnum(V.merchantAktivitas)],
    ['Nama provinsi dikenali peta', V.provinsiDiGeojson],
    ['Usia login cocok dengan tanggal login', `${idnum(V.konsistensiHariLogin.cocok)} cocok / ${V.konsistensiHariLogin.beda} beda`],
    ['Tanggal daftar lebih baru daripada login terakhir', V.loginSebelumDaftar ? `${idnum(V.loginSebelumDaftar)} merchant — tanggal daftar baris ini diragukan, usia login tetap dihitung dari tanggal data` : '0 merchant'],
    ['Nilai segmen tanpa padanan', V.segmenTanpaMapping.length ? JSON.stringify(V.segmenTanpaMapping) : '0'],
    ['Konflik atribut login vs transaksi', V.konflikAtribut === 0 ? '0' : String(V.konflikAtribut)],
    ['Selisih GMV mart vs tabel merchant', V.selisihGmvPersen + '%'],
    ['Rasio Nilai ÷ rata-rata bulanan', V.rasioNilaiPerBulan.map(r => `${String(r[0]).replace('.', ',')} (${idnum(r[1])} baris)`).join(' · ')],
    ['Baris ringkasan / sel wilayah & kategori', `${idnum(V.rekonsiliasiMart.nMart)} baris · ${idnum(V.rekonsiliasiMart.selDaerah)} sel wilayah · ${idnum(V.rekonsiliasiMart.selKategori)} sel kategori`],
    ['Provinsi di peta tanpa data', V.geojsonTanpaData.join(', ') || '—'],
    ['Format berkas yang dibaca', (V.formatDibaca || []).join(', ') || 'csv'],
  ];
  el('mChecks').innerHTML = `<thead><tr><th>Pemeriksaan</th><th class="num">Hasil</th></tr></thead><tbody>` +
    baris.map(b => `<tr><td>${b[0]}</td><td class="num mono">${b[1]}</td></tr>`).join('') + '</tbody>';

  el('mSource').innerHTML = [
    ['Folder sumber', D.meta.sumber.folder],
    ['File pendaftaran', `${D.meta.sumber.filePendaftaran.length} file`],
    ['File aktivitas', D.meta.sumber.fileAktivitas[0]],
    ['File transaksi', D.meta.sumber.fileTransaksi[0]],
    ['Database', D.meta.db.replace(/\\/g, '/')],
    ['Sinkronkan berkas baru', 'npm run sync'],
    ['Cara kerja', 'tumpukkan .csv atau .xlsx ke folder sumber; jenis file dikenali dari header, bukan nama file'],
  ].map(r => `<div class="row"><span class="k">${r[0]}</span><span class="val mono">${r[1]}</span></div>`).join('');

  el('mLimits').innerHTML = [
    'Tidak ada baris transaksi individual: tren harian, jam transaksi, ukuran keranjang, dan rasio gagal bayar tidak dapat dihitung.',
    `Tingkat aktivasi tidak dapat dihitung: ekspor pendaftaran memuat ${idnum(V.barisPendaftaran)} MID, ekspor aktivitas hanya ${idnum((D.tables.m || []).length)} merchant, dan yang ada di keduanya hanya ${idnum(jum(rowsR1(), iR1.nLogin))}. Semua rasio "dari terdaftar" di tab Ringkasan mengukur kelompok itu, bukan perilaku seluruh pendaftar.`,
    'Tidak ada peristiwa aplikasi: yang terukur hanya usia login terakhir, bukan fitur yang dipakai merchant.',
    'Nilai transaksi satu angka total per merchant pada jendela tetap, sehingga naik-turun antar bulan tidak terlihat.',
    `Bulan ${(D.meta.bulanTanpaPendaftaran || []).join(', ') || '-'} tidak ada barisnya pada ekspor pendaftaran, walaupun file aktivitas memuat merchant yang terdaftar pada bulan itu.`,
    'Tidak ada koordinat: kabupaten/kota ditampilkan sebagai peringkat; titik bubble pada peta dihitung dari pusat massa geojson, bukan lokasi usaha.',
    'Segmen dan tipe berbeda cakupan: segmen hanya ada di file aktivitas/transaksi, tipe tidak ada di file transaksi.',
    'Peta memakai nama resmi Kemendagri; lima nama singkat pada CSV dipetakan lewat dim.provinsi.',
    'Sasaran pada skor kesehatan portofolio adalah asumsi awal, bukan kebijakan resmi — ubah konstantanya bila tim sudah punya target.',
  ].map(x => `<div class="row"><span class="k">${x}</span></div>`).join('');

  /* --- nasib tiap baris: tidak boleh ada angka yang hilang tanpa penjelasan --- */
  const AK = V.akuntansiMerchant || {};
  const M = D.tables.m, i = iM;
  const punyaLogin = M.filter(r => r[i.punyaLogin]).length, punyaTxn = M.filter(r => r[i.punyaTxn]).length;
  const susutReg = V.barisPendaftaranMentah - V.barisPendaftaran;
  el('subNasib').textContent = 'dihitung ulang setiap build, bukan disalin dari laporan sebelumnya';
  el('mNasib').innerHTML = `<thead><tr><th>File sumber</th><th class="num">Dibaca</th><th class="num">Dipakai</th><th class="num">Susut</th><th>Kenapa susut</th></tr></thead><tbody>` + [
    ['Pendaftaran (8 file)', V.barisPendaftaranMentah, V.barisPendaftaran,
      `${idnum(V.MIDtanpaIsi)} baris tanpa MID (tidak ada kunci untuk menggabung) + ${idnum(susutReg - V.MIDtanpaIsi)} baris MID berulang dari ekspor lebih lama`],
    ['Aktivitas', V.aktivitasBarisDibuang, punyaLogin,
      'nol susut sejak build ini — 33 baris tanpa MID yang dulu terbuang sudah dipulihkan'],
    ['Transaksi', V.transaksiBarisDibuang ?? punyaTxn, punyaTxn, 'nol susut: seluruh MID pada file ini unik'],
    ['Tabel merchant (gabungan)', punyaLogin + punyaTxn, AK.total ?? M.length,
      `${idnum(punyaLogin + punyaTxn - (AK.total ?? M.length))} merchant muncul di kedua file, dihitung sekali saja`],
  ].map(r => `<tr><td>${r[0]}</td><td class="num">${idnum(r[1])}</td><td class="num strong">${idnum(r[2])}</td>
    <td class="num">${r[1] === r[2] ? '<span class="tag ok">0</span>' : `<span class="tag warn">${idnum(r[1] - r[2])}</span>`}</td>
    <td class="note-sm">${r[3]}</td></tr>`).join('') + '</tbody>' +
    `<div class="map-foot" style="border-top:1px dashed var(--g300)">${[
      `<span class="sw"><i style="background:${SD}"></i>${idnum(AK.tanpaMid || 0)} merchant tanpa MID dipulihkan — semuanya bertipe <b>Aggregator</b></span>`,
      `<span class="sw"><i style="background:${PR}"></i>MPAN utuh ${idnum(AK.mpanUtuh || 0)} · rusak ${idnum(AK.mpanRusak || 0)}</span>`,
      `<span class="sw"><i style="background:${SC}"></i>multi-user ${idnum(AK.multiUser || 0)}</span>`,
    ].join('')}</div>`;

  /* --- kelengkapan kolom: tiap kolom sumber, seberapa penuh, dipakai di mana --- */
  const KEL = V.kelengkapan || [];
  const LV = [14, 24, 7, 7, 48];
  el('subKelengkapan').textContent = `${KEL.length} kolom sumber terpetakan · ${idnum(KEL.filter(x => x.persen < 100).length)} tidak penuh isinya`;
  el('mKelengkapan').innerHTML = `<colgroup>${LV.map(w => `<col style="width:${w}%">`).join('')}</colgroup>` +
    `<thead><tr><th>Jenis file</th><th>Kolom sumber</th><th class="num">Baris</th><th class="num">Isi</th><th>Dipakai di dashboard</th></tr></thead><tbody>` +
    KEL.map(x => `<tr><td><span class="tag ${x.jenis === 'pendaftaran' ? 'pr' : x.jenis === 'aktivitas' ? 'info' : 'ok'}">${x.jenis}</span></td>
      <td class="strong">${esc(x.kolom)}</td><td class="num">${idnum(x.baris)}</td>
      <td class="num"><span class="tag ${x.isi === 0 ? 'warn' : x.persen < 5 ? 'warn' : x.persen < 100 ? 'info' : 'ok'}">${x.persen}%</span></td>
      <td class="note-sm">${PAKAI_KOLOM[x.kolom] || '<i>tidak dipakai: kolom ini tidak ada padanannya di hasil normalisasi</i>'}</td></tr>`).join('') + '</tbody>';

  el('mGlosarium').innerHTML = GLOSARIUM.map(g => `<div class="row"><span class="k"><b>${g[0]}</b> — ${g[1]}</span></div>`).join('');
}

init();
