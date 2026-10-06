-- Wondr Merchant · skema DuckDB
-- Sumber: CSV hasil ekspor query di C:\dt. Idempoten: boleh dijalankan berulang.
-- Semua kolom dibaca sebagai teks (all_varchar) lalu dinormalkan di sini, supaya aturan
-- normalisasi cuma punya satu rumah dan bisa diaudit lewat SQL.
--
-- Placeholder diisi oleh scripts/build-db.mjs: {{REG_LIST}} {{ACT}} {{TXN}} {{SNAPSHOT}}

create schema if not exists raw;
create schema if not exists dim;
create schema if not exists fact;
create schema if not exists mart;

-- ------------------------------------------------------------------ makro

-- Tanggal datang dalam tiga format:
--   2026-04-01 03:29:01   ISO
--   1/1/2026 4:09         Amerika, dengan jam
--   7/29/2025             Amerika, tanpa jam
-- Komponen pertama pasti bulan: terbukti dari 7/29/2025 dan 12/24/2025 (29 dan 24 bukan bulan).
create or replace macro tgl(s) as case
  when s is null or trim(s) = '' then null
  when regexp_matches(s, '^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}') then cast(left(s, 10) as date)
  when regexp_matches(s, '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}') then
    cast(strptime(regexp_extract(s, '^([0-9]{1,2}/[0-9]{1,2}/[0-9]{4})', 1), '%m/%d/%Y') as date)
  else null
end;

create or replace macro jam(s) as try_cast(regexp_extract(coalesce(s, ''), '[ T]([0-9]{1,2}):', 1) as integer);

create or replace macro bln(d) as
  case when d is null then null else strftime(cast(d as date), '%Y-%m') end;

create or replace macro angka(s) as try_cast(replace(replace(s, ',', ''), ' ', '') as double);

-- Kode segmen berbeda antara file aktivitas (Usaha Mikro) dan file transaksi (UMI).
create or replace macro segmen(s) as case trim(coalesce(s, ''))
  when 'UMI' then 'Usaha Mikro'
  when 'UKE' then 'Usaha Kecil'
  when 'UME' then 'Usaha Menengah'
  when 'UBE' then 'Usaha Besar'
  when 'URE' then 'URE'
  when 'Usaha Mikro' then 'Usaha Mikro'
  when 'Usaha Kecil' then 'Usaha Kecil'
  when 'Usaha Menengah' then 'Usaha Menengah'
  when 'Usaha Besar' then 'Usaha Besar'
  else 'Tidak tersegmentasi'
end;

-- 273 nilai kategori mentah diringkas ke keluarga. Aturan generik (STORES/SHOP/RETAIL)
-- harus paling akhir: kalau tidak, "FAMILY CLOTHING STORES" tertangkap ritel umum.
create or replace macro keluarga(s) as case
  when regexp_matches(s, 'EATING PLACES|FAST FOOD|RESTAURANT|CATERER|BAKER|COFFEE|DRINK|CANDY|SNACK|DESSERT') then 'Kuliner & Restoran'
  when regexp_matches(s, 'GROCERY|SUPERMARKET|CONVENIENCE|MISCELLANEOUS FOOD|MEAT|FISH|FRUIT|VEGETABLE|MARKET') then 'Toko Bahan Makanan'
  when regexp_matches(s, 'PHARMAC|DRUG STORE|HOSPITAL|MEDICAL|DENTAL|CLINIC|BEAUTY|BARBER|SALON|COSMETIC') then 'Kesehatan & Kecantikan'
  when regexp_matches(s, 'CLOTH|WEAR|APPAREL|SHOE|BOOT|OPTIK|OPTICAL|JEWELL?ERY|WATCH|LEATHER|ACCESSORY|UNIFORM') then 'Pakaian & Aksesoris'
  when regexp_matches(s, 'HOTEL|LODGING|MOTEL|RESORT|TRAVEL|TOUR|AIRLINE|CRUISE') then 'Hotel & Wisata'
  when regexp_matches(s, 'TAXI|COURIER|SHIPPING|TRANSPORT|AUTOMOTIVE|MOTOR|FUEL|PETROL|SPBU|PARKING|RIDE|TIRE') then 'Transportasi & Logistik'
  when regexp_matches(s, 'LUMBER|BUILDING|HARDWARE|FURNITURE|HOME FURNISH|APPLIANCE|PLUMBING|CONSTRUCT|CONTRACTOR|PAINT') then 'Bangunan & Perabot'
  when regexp_matches(s, 'SCHOOL|EDUCAT|UNIVERSIT|TRAINING|LIBRARY') then 'Pendidikan & Pelatihan'
  when regexp_matches(s, 'TELECOMMUNICATION|SOFTWARE|INTERNET|MOBILE|CELLULAR|ELECTRONIC|DIGITAL') then 'Layanan Digital & Telekomunikasi'
  when regexp_matches(s, 'ENTERTAIN|BAND|ARTIST|AMUSEMENT|GAME|SPORT|FITNESS|CLUB|KARAOKE|CINEMA|HOBBY|TOY') then 'Hiburan & Rekreasi'
  when regexp_matches(s, 'GOVERNMENT|CHARITABLE|RELIGIOUS|SOCIAL SERVICE|POLITICAL|ORGANIZATION') then 'Pemerintah & Sosial'
  when regexp_matches(s, 'UTILIT|ELECTRIC|GAS|WATER|SANITARY|LAUNDRY|DRY CLEAN|CLEANING|WASTE|FUNERAL') then 'Utilitas & Rumah Tangga'
  when regexp_matches(s, 'PROFESSIONAL|LEGAL|ACCOUNTING|CONSULT|BANK|INSURANCE|REAL ESTATE|ADVERTISING|AGENTS|SERVICE') then 'Layanan Profesional & Bisnis'
  when regexp_matches(s, 'RETAIL|STORES|SHOP|DEALER|OUTLET|BOUTIQUE|VARIETY') then 'Ritel Lainnya'
  else 'Lainnya / tidak terklasifikasi'
end;

create or replace macro umur_bucket(d) as case
  when d is null then 'tidak diketahui'
  when d <= 30 then '<=30 hari'
  when d <= 90 then '31-90 hari'
  when d <= 180 then '91-180 hari'
  when d <= 365 then '6-12 bulan'
  else '>12 bulan'
end;

-- ------------------------------------------------------------------ mentah

-- MID dianggap kunci: baris pertama untuk satu MID dipakai, duplikatnya dicatat terpisah.
-- Sumber diisi oleh scripts/build-db.mjs sebagai UNION ALL BY NAME dari read_csv()/read_xlsx(),
-- lengkap dengan kolom sumber berisi nama file. Berarti file .xlsx baru cukup ditumpuk ke folder.
create or replace table raw.pendaftaran as
with b as (
  select *, row_number() over (partition by trim(MID) order by sumber desc) as rn,
          count(*) over (partition by trim(MID)) as banyak
  from ({{REG_SRC}})
)
select
  trim(MID)                                                    as mid,
  nullif(trim(MPAN), '')                                       as mpan,
  coalesce(nullif(trim("Nama Merchant"), ''), '(tanpa nama)')   as nama,
  coalesce(nullif(trim("Tipe Merchant"), ''), '(tidak ada)')    as tipe,
  coalesce(nullif(trim("Kategori Usaha"), ''), '(tidak ada)')   as kategori,
  coalesce(nullif(trim(Status), ''), '(tidak ada)')             as status,
  tgl("Tanggal Daftar")                                        as tgl_daftar,
  tgl("Tanggal Dinonaktifkan")                                 as tgl_nonaktif,
  jam("Tanggal Daftar")                                        as jam_daftar,
  coalesce(nullif(trim(Provinsi), ''), '(tidak ada)')           as provinsi,
  coalesce(nullif(trim("Kabupaten/Kota"), ''), '(tidak ada)')   as kabupaten,
  sumber, rn, banyak
from b;

create or replace table raw.aktivitas as
with b as (
  -- Baris tanpa MID tetap dipakai: kunci penggantinya unik per baris supaya tidak saling menimpa.
  select *, coalesce(nullif(trim(MID), ''), 'NO-MID-' || lpad(cast(row_number() over () as varchar), 6, '0')) as kunci
  from ({{ACT_SRC}})
), c as (
  select *, row_number() over (partition by kunci order by "Login Terakhir" desc) as rn from b
)
select
  mid_asli                                                      as mid,
  kunci,
  case when mid_asli = '(tanpa MID)' then 0 else 1 end           as punya_mid,
  coalesce(nullif(trim(NMID), ''), '(tidak ada)')                as nmid,
  nullif(trim(MPAN), '')                                         as mpan,
  coalesce(nullif(trim("Nama Merchant"), ''), '(tanpa nama)')    as nama,
  coalesce(nullif(trim("Tipe Merchant"), ''), '(tidak ada)')     as tipe,
  coalesce(nullif(trim("Kategori Usaha"), ''), '(tidak ada)')    as kategori,
  segmen("Segmentasi UMKM")                                     as segmen,
  coalesce(nullif(trim("Status Merchant"), ''), '(tidak ada)')   as status,
  tgl("Tanggal Daftar")                                         as tgl_daftar,
  coalesce(nullif(trim(Provinsi), ''), '(tidak ada)')            as provinsi,
  coalesce(nullif(trim("Kabupaten/Kota"), ''), '(tidak ada)')    as kabupaten,
  coalesce(angka("Jumlah User Aktif"), 0)                        as user_aktif,
  tgl("Login Terakhir")                                          as tgl_login,
  jam("Login Terakhir")                                          as jam_login,
  coalesce(try_cast("Hari Sejak Login Terakhir" as integer),
           date_diff('day', tgl("Login Terakhir"), DATE {{SNAPSHOT}})) as hari_since_login
from (select *, coalesce(nullif(trim(MID), ''), '(tanpa MID)') as mid_asli from c) d where rn = 1;

create or replace table raw.transaksi as
with b as (
  select *, coalesce(nullif(trim(MID), ''), 'NO-MID-' || lpad(cast(row_number() over () as varchar), 6, '0')) as kunci,
           row_number() over (partition by trim(MID) order by 1) as rn
  from ({{TXN_SRC}})
)
select
  coalesce(nullif(trim(MID), ''), '(tanpa MID)')                  as mid,
  case when nullif(trim(MID), '') is not null then 1 else 0 end    as punya_mid,
  coalesce(nullif(trim(NMID), ''), '(tidak ada)')                as nmid,
  nullif(trim(MPAN), '')                                         as mpan,
  coalesce(nullif(trim("Nama Merchant"), ''), '(tanpa nama)')    as nama,
  cast(null as varchar)                                         as tipe,
  coalesce(nullif(trim("Kategori Usaha"), ''), '(tidak ada)')    as kategori,
  segmen("Segmentasi UMKM")                                     as segmen,
  coalesce(nullif(trim("Status Merchant"), ''), '(tidak ada)')   as status,
  tgl("Tanggal Daftar")                                         as tgl_daftar,
  coalesce(nullif(trim(Provinsi), ''), '(tidak ada)')            as provinsi,
  coalesce(nullif(trim("Kabupaten/Kota"), ''), '(tidak ada)')    as kabupaten,
  coalesce(angka("Jumlah User Aktif"), 0)                        as user_aktif,
  tgl("Login Terakhir")                                          as tgl_login,
  coalesce(angka("Jumlah Transaksi"), 0)                         as jumlah_transaksi,
  coalesce(angka("Nilai Penjualan (Rp)"), 0)                     as nilai,
  coalesce(angka("Rata-rata per Bulan (Rp)"), 0)                 as rata_bulan,
  coalesce(angka("Rata-rata per Transaksi (Rp)"), 0)             as rata_transaksi,
  tgl("Transaksi Terakhir")                                      as tgl_transaksi
from b where rn = 1;

-- ------------------------------------------------------------------ dimensi

create or replace table dim.provinsi as
select * from (values
  ('DI Yogyakarta', 'Daerah Istimewa Yogyakarta'),
  ('Nusa Tenggara Timur (NTT)', 'Nusa Tenggara Timur'),
  ('Nusa Tenggara Barat (NTB)', 'Nusa Tenggara Barat'),
  ('Nanggroe Aceh Darussalam (NAD)', 'Aceh'),
  ('Bangka Belitung', 'Kepulauan Bangka Belitung')
) as p(provinsi, geo_name);

-- ------------------------------------------------------------------ fakta

create or replace table fact.pendaftaran as
select
  mid, mpan, provinsi, kabupaten, kategori, keluarga(kategori) as keluarga, tipe, status,
  tgl_daftar, bln(tgl_daftar) as bulan_daftar, jam_daftar, tgl_nonaktif,
  case when tgl_daftar is not null and tgl_nonaktif is not null
       then date_diff('day', cast(tgl_daftar as date), cast(tgl_nonaktif as date)) end as umur_hari
from raw.pendaftaran
where rn = 1 and mid <> '';

create or replace table fact.merchant as
select
  coalesce(a.mid, t.mid)                                          as mid,
  coalesce(a.punya_mid, t.punya_mid, 0)                           as punya_mid,
  coalesce(a.nmid, t.nmid, '(tidak ada)')                         as nmid,
  coalesce(a.mpan, t.mpan)                                        as mpan,
  case when coalesce(a.mpan, t.mpan) is null then 'tidak ada'
       when length(coalesce(a.mpan, t.mpan)) = 19 then 'utuh'
       else 'rusak: notasi ilmiah' end                            as mpan_status,
  coalesce(a.nama, t.nama)                                        as nama,
  coalesce(a.provinsi, t.provinsi)                                as provinsi,
  coalesce(a.kabupaten, t.kabupaten)                              as kabupaten,
  coalesce(a.kategori, t.kategori)                                as kategori,
  keluarga(coalesce(a.kategori, t.kategori))                      as keluarga,
  coalesce(a.tipe, t.tipe, r.tipe, '(tidak ada)' )                as tipe,
  coalesce(a.status, t.status)                                    as status,
  coalesce(a.segmen, t.segmen)                                    as segmen,
  coalesce(a.tgl_daftar, t.tgl_daftar)                            as tgl_daftar,
  bln(coalesce(a.tgl_daftar, t.tgl_daftar))                       as bulan_daftar,
  a.tgl_login,
  coalesce(a.hari_since_login, date_diff('day', t.tgl_login, DATE {{SNAPSHOT}})) as hari_since_login,
  coalesce(a.user_aktif, t.user_aktif, 0)                         as user_aktif,
  case when a.mid is not null then 1 else 0 end                   as punya_login,
  case when t.mid is not null then 1 else 0 end                   as punya_transaksi,
  coalesce(t.jumlah_transaksi, 0)                                 as jumlah_transaksi,
  coalesce(t.nilai, 0)                                            as nilai,
  coalesce(t.rata_transaksi, 0)                                   as rata_transaksi,
  coalesce(t.rata_bulan, 0)                                       as rata_bulan,
  bln(t.tgl_transaksi)                                            as bulan_transaksi,
  t.tgl_transaksi,
  a.jam_login,
  case when r.mid is not null then 1 else 0 end                   as di_pendaftaran_2026
from raw.aktivitas a
full outer join raw.transaksi t using (mid)
left join (select mid, any_value(tipe) as tipe from fact.pendaftaran group by mid) r on r.mid = coalesce(a.mid, t.mid)
where coalesce(a.mid, t.mid) <> '';

-- ------------------------------------------------------------------ mart
-- n_login30 sengaja ikut ke mart (bukan dihitung ulang di browser) supaya kartu,
-- funnel, dan peta membaca dari angka yang sama.
-- n_login30_txn adalah IRISAN, bukan hitungan terpisah: tahap corong harus bersarang
-- (subset dari tahap sebelumnya) atau bilahnya bisa membesar di bawah — itu salah baca.

create or replace table mart.agg_daerah as
select
  p.bulan_daftar, p.provinsi, p.kabupaten, p.tipe, p.status,
  count(*)                                                    as n,
  count_if(m.punya_login = 1)                                 as n_login,
  count_if(m.hari_since_login between 0 and 30)               as n_login30,
  count_if(m.punya_transaksi = 1)                             as n_transaksi,
  sum(coalesce(m.nilai, 0))                                   as nilai,
  sum(coalesce(m.jumlah_transaksi, 0))                        as jumlah_transaksi,
  count_if(m.hari_since_login between 0 and 30 and m.punya_transaksi = 1) as n_login30_txn
from fact.pendaftaran p
left join fact.merchant m using (mid)
group by 1, 2, 3, 4, 5;

create or replace table mart.agg_kategori as
select
  p.bulan_daftar, p.provinsi, p.kategori, p.keluarga,
  count(*)                                                    as n,
  count_if(m.punya_login = 1)                                 as n_login,
  count_if(m.hari_since_login between 0 and 30)               as n_login30,
  count_if(m.punya_transaksi = 1)                             as n_transaksi,
  sum(coalesce(m.nilai, 0))                                   as nilai,
  sum(coalesce(m.jumlah_transaksi, 0))                        as jumlah_transaksi,
  count_if(m.hari_since_login between 0 and 30 and m.punya_transaksi = 1) as n_login30_txn
from fact.pendaftaran p
left join fact.merchant m using (mid)
group by 1, 2, 3, 4;

-- Tipe Merchant dan Jumlah User Aktif hanya ada di file aktivitas, jadi diringkas
-- dari tabel merchant (bukan dari pendaftaran) supaya angkanya bisa ditelusuri.
create or replace table mart.agg_tipe as
select
  tipe,
  count(*)                                                      as n,
  count_if(punya_login = 1)                                     as n_login,
  count_if(hari_since_login between 0 and 30)                   as n_login30,
  count_if(punya_transaksi = 1)                                 as n_transaksi,
  sum(coalesce(nilai, 0))                                       as nilai,
  sum(coalesce(jumlah_transaksi, 0))                            as jumlah_transaksi,
  sum(coalesce(user_aktif, 0))                                  as total_user,
  count_if(user_aktif > 1)                                      as n_multi_user,
  count_if(punya_mid = 0)                                       as n_tanpa_mid,
  count_if(hari_since_login between 0 and 30 and punya_transaksi = 1) as n_login30_txn
from fact.merchant group by 1;

create or replace table mart.agg_jam as
select bulan_daftar as bulan, coalesce(cast(jam_daftar as varchar), '(tanpa jam)') as jam, count(*) as n
from fact.pendaftaran group by 1, 2;

create or replace table mart.churn as
select bulan_daftar as bulan, umur_bucket(umur_hari) as umur, count(*) as n
from fact.pendaftaran where status = 'Ditutup' group by 1, 2;

create or replace table mart.bulan as
select distinct b as bulan from (
  select bulan_daftar as b from fact.pendaftaran
  union all select bulan_daftar from fact.merchant
  union all select bln(tgl_login) from fact.merchant
  union all select bulan_transaksi from fact.merchant
) where b is not null order by b;
