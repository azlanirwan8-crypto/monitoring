# Katalog identitas numerik & mode gagal

Setiap baris = satu asersi yang bisa diubah jadi pemeriksaan. Urut dari yang paling sering salah.

## Tingkat 3 — semantik (paling menipu)

| Identitas / aturan | Mode gagal | Cara tangkap |
|---|---|---|
| Tahap corong harus **subset** tahap sebelumnya, bukan cuma lebih kecil | "punya transaksi" dihitung atas seluruh merchant → bilah terakhir membesar | `n30txn <= n30` per baris agregat; periksa label "… dan" |
| Dua widget bertetangga wajib satu sumber | "Nilai transaksi" Rp 891,67 M vs Rp 13,79 T pada satu dashboard | bandingkan GMV lintas jalur (mart vs tabel merchant) |
| Delta butuh jendela yang sama rata | Kohort bulan berjalan = parsial → badge "+340%" | tolak delta antar kohort bila bulan terakhir < snapshot |
| Populasi ≠ irisan | 269.598 pendaftar vs 31.371 merchant aktivitas; irisan 2.692 → "aktivasi" tidak terdefinisi | bandingkan himpunan kunci, bukan baris |
| Pembagian "per bulan" | pakai 12 bulan padahal jendela sumber 8,77 | median(Nilai / rata_bulan) sebagai identitas |
| Rata-rata tertimbang ≠ rata-rata sederhana | `avg(rata_bulan) ≠ sum(nilai)/jendela` | hitung dua-duanya, tampilkan yang tertimbang |
| Persen dari persen | `share(top10)` vs `top10 dari share wilayah` | selalu bawa `nBasis` di payload |
| Nol penyebut | `a/0 → Infinity` ikut ke `toFixed` → "Infinity" di kartu | guard + pemeriksaan string `NaN|Infinity` di DOM |

## Tingkat 2 — rumus

Uji **selalu** dengan data sintetis yang diketahui jawabannya, bukan cuma data asli.

| Rumus | Nilai uji wajib |
|---|---|
| Gini (peringkat): `2·Σ(i·xᵢ)/(n·Σx) − (n+1)/n`, x ascending | seragam → 0; satu pemegang → (n−1)/n |
| Gini (luas Lorenz): `1 − 2·Σ((Lᵢ₋₁+Lᵢ)/2·Δp)` | harus sama dengan versi peringkat ±0,002 |
| HHI: `Σ(share%)²` | seragam n=100 → 100; monopoli → 10.000 |
| "Setara N merchant sama besar" | `10.000/HHI`, dan harus ≤ n |
| Median | tentukan konvensi (tengah bawah vs rata dua tengah) — bedanya terlihat pada n genap |
| Kuantil untuk choropleth | jumlah kelas × lebar interval; cek ambang tidak tumpang tindih |
| Bucket umur `<30 / 31–90 / 91–180 / 6–12 bln / >12 bln` | uji tanggal tepi: 30, 31, 90, 91, 180, 365, 366 |
| Pertumbuhan kumulatif cohort | `Σ per bulan == total`; bulan tak terekspor ≠ nol |
| Tanggal 3 format (`2026-04-01`, `1/1/2026 4:09`, `7/29/2025`) | bukti format dari hari >12; tanggal > snapshot = 0 baris |
| Keying/encoding MPAN 19 digit | jangan `try_cast` — notasi ilmiah menghancurkan digit terakhir |

## Tingkat 1 — aritmetika & integritas data

- `Σ bagian == total` untuk tiap dimensi (wilayah, kategori, tipe, bulan, status).
- `COUNT(*) == COUNT(DISTINCT kunci)` pada tabel yang jadi dasar grafik; bila gagal, pisahkan
  placeholder (mis. `(tanpa MID)`) dari duplikat asli — kalau tidak, audit menjerit palsu.
- Akuntansi baris: `mentah − tanpa kunci − duplikat = faktual`, dan tiap yang dibuang tercatat.
- `LEFT JOIN` agregat tidak boleh mengubah `Σ n` (fan-out = penggandaan rupiah).
- Tidak ada nilai negatif pada besaran uang/jumlah; tidak ada tanggal masa depan.
- Kolom turunan sumber harus cocok dengan kolom aslinya: `nilai/jumlah ≈ rata_per_transaksi`.
  Yang meleset = **pertentangan dalam file**, tandai WASIS dan buka di UI, jangan diam-diam dipilih.
- Kode kamus: tiap indeks < panjang daftarnya; sumbu waktu (`bulanUrut`) ascending ketat.
- UTF-8/encoding dan pemisah desimal: `1.234,5` vs `1,234.5` — satu parse salah = selisih jutaan.

## Kalimat verdict yang jujur

> "59 pemeriksaan: 55 cocok pada dua jalur bebas, 4 ditandai bukan karena salah hitung melainkan
> karena sumbernya sendiri bertentangan / basis populasinya beda, dan itu kini disebut di layar.
> Yang tidak bisa dihitung dari ekspor ini: tingkat aktivasi, tren harian, dan laju gagal."
