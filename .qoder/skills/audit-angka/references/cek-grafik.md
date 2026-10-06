# Memeriksa grafik & tata letak di browser

Semua resep di bawah **hanya-baca**: tidak menekan tombol simpan/setujui, tidak mengubah data.

## 1. Baca angka yang sungguh dipakai grafik

`getOption()` adalah sumber kebenaran antara "angka di kartu" dan "bilah di layar".

```js
const ins = echarts.getInstanceByDom(document.getElementById('cFunnel'));
const o = ins.getOption();
JSON.stringify({ kat: o.yAxis[0].data, nilai: (o.series[0].data||[]).map(d => d?.value ?? d) });
```

Yang dibandingkan:

- `series[].data` vs penjumlahan baris tabel sumber (payload) — kalau beda, grafik menyaring sendiri.
- urutan `yAxis/xAxis` kategori vs urutan kronologis (`bulanUrut`), bukan urutan kamus.
- korelasi/deret ganda: `yAxisIndex` benar-benar menunjuk sumbu yang dimaksud.
- label yang mengklaim arah (`naik`, `turun`, `+x%`) pada periode tak penuh.

## 2. Jebakan tab tersembunyi (browser in-app)

Tab pengukuran berjalan `document.hidden = true`:

- `requestAnimationFrame` **tidak pernah menyampel** → grafik ECharts bisa tampak kosong/abu walau
  datanya ada. Jangan simpulkan "grafik rusak" dari screenshot tab ini.
- `setTimeout` di-throttle ±1 detik per panggilan → antrean render tertunda; `await
  import()`/`new Worker` tetap jalan.
- Transisi & animasi CSS **membeku**: `getComputedStyle` mengembalikan nilai sebelum transisi
  (mis. lebar sidebar lama). Buktinya: suntik `<style>*{transition:none!important}</style>` lalu baca ulang.
- `evaluate_script` terpotong pada ±15 detik → sapu per tab, satu tab panggilan, polling pendek.
- Ukuran viewport terkunci kecil (di mesin ini 510×425). Layout dua kolom tidak aktif karena
  media query → **paksa** dulu sebelum mengukur:

```css
.grid.c2,.grid.c2e{grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important}
```

Selisih tinggi kartu tetap terukur; hanya kerapatan tipografi yang tidak bisa dinilai dari sini —
untuk itu minta screenshot pada lebar layar asli, jangan diklaim.

## 3. Ukur "lubang" di kartu

Sisa ruang kosong di bawah isi kartu = tanda dashboard belum rapi.

```js
const sisa = c => {
  const cs = getComputedStyle(c), k = [...c.children].filter(x => x.getBoundingClientRect().height > 0);
  return Math.round(c.getBoundingClientRect().bottom - parseFloat(cs.paddingBottom)
    - Math.max(...k.map(x => x.getBoundingClientRect().bottom)));
};
```

Perbaikan struktural (satu aturan, bukan tambal per kartu):

```css
.grid > .card { display: flex; flex-direction: column; }
.grid > .card > .chart, .grid > .card > .tablewrap, .grid > .card > .rows { flex: 1 1 auto; min-height: 0; }
```

Grafik ECharts ikut tumbuh karena `ResizeObserver` memanggil `resize()`; pastikan pengamatnya tidak
hanya memfilter perubahan lebar.

## 4. Bedakan "_bundle basi_ dari perbaikan belum jalan"

Sebelum menyimpulkan perbaikan tidak bekerja:

1. `curl` `/` dan bandingkan hash `assets/index-<hash>.js` dengan hasil build terakhir.
2. `grep` string yang **hanya ada** setelah edit (label baru) pada file yang disajikan.
3. baca DOM live untuk label lama — kalau masih muncul, tab user menjalankan kode lama (Ctrl+F5 sekali).
4. pastikan user tidak sedang membuka lingkungan lain (produksi vs dev).

## 5. Angka user bisa tertangkap tengah proses

Kalau laporan berbunyi "angkanya masih salah", ukur ulang endpoint/payload live sebelum ikut
menyimpulkan. Angka yang sedang dibangun ulang (crawl, sync) sering terlihat "kecil" atau "kosong".
Tapi tetap cari bagian yang sungguh salah — biasanya label, bukan nilainya.

## 6. Format & keterbacaan sel

- Sel tabel satu baris: `white-space: nowrap`; teks panjang ke `text-overflow: ellipsis` + `title`.
- Ukur pemotongan dengan `el.scrollWidth > el.clientWidth` dan hitung berapa sel yang terpotong.
- `table-layout: fixed` + `<colgroup>` diperlukan pada tabel ribu-an baris (terukur 783 ms → hilang).
- Uang pakai `tabular-nums`; persen dan jumlah jangan dicampur satu kolom.
