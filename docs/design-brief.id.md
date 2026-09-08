# SUBFLOOR — design brief

Versi Indonesia dari [`design-brief.md`](design-brief.md). Isinya sama; yang Inggris dipertahankan
karena repo ini publik saat submission dan juri yang membacanya.

String antarmuka, daftar kata terlarang, wireframe, dan nama komponen dibiarkan dalam bahasa
Inggris — itu teks yang benar-benar muncul di layar, jadi menerjemahkannya justru membuat dokumen
ini salah.

Apa yang ditampilkan tiap layar, di mana setiap elemen duduk, dan dibaca dari mana. Ditulis supaya
orang yang belum pernah membaca dokumen perencanaan bisa langsung mengambil satu layar dan
mengerjakannya.

Enam permukaan: lima layar pemilik dan satu halaman publik. Tidak ada yang lain di dalam scope —
lihat [Jangan dibangun](#jangan-dibangun) di bawah, yang sama pentingnya dengan sisanya.

---

## 0 — Dua aturan yang mengikat semua layar

**Uji desain.** Saat ini pengguna harus memahami lima hal sebelum uangnya bergerak: menyetor
inventory, menandatangani mandate di device, memasang floor, menurunkan floor, dan mencabut
kredensial. Itu terlalu banyak konsep, dan antarmuka ini ada justru untuk meringkasnya.

> **Kalau sebuah layar membuat pengguna memikirkan apa pun selain "harga terburuk apa yang mau saya
> terima", layar itu salah.**

Floor itu satu angka. Aqua, SwapVM, delegate key, token approval, bentuk EIP-712 dari mandate —
semuanya mesin di baliknya, dan mesin itu tetap tak terlihat sampai saatnya benar-benar penting. Di
tempat sebuah konsep memang tidak bisa disembunyikan — device *adalah* jaminannya, dan mesin yang
berdagang tidak boleh bisa menandatanganinya — konsep itu tidak dipecah jadi banyak field. Ia
menjadi satu ceremony yang disengaja.

Konkretnya: setor, mandate, dan floor pertama adalah **satu ceremony onboarding yang berakhir pada
satu tanda tangan device**; menaikkan floor cukup satu klik dan tidak pernah menyentuh device;
menurunkan floor adalah ceremony device kedua dan satu-satunya yang lain; pencabutan adalah satu
kontrol yang selalu ada. Dalam pemakaian normal pengguna bertemu device tepat dua kali, dan tombol
panik tidak pernah.

**Disiplin copy.** Kata-kata ini tidak boleh muncul di mana pun dalam antarmuka — tidak di tooltip,
tidak di aria-label, tidak di pesan error:

> limit · policy · permission · guardrail · cap · allowlist · firewall · zero-trust ·
> circuit breaker · spending · monitors · blocks · sentinel · warden · leash

Tujuh proyek sebelumnya atau lebih sudah memiliki register itu; pembaca yang langsung mencocokkan
SUBFLOOR sebagai "proyek agent-permissions yang lain lagi" tidak akan menoleh dua kali. **SUBFLOOR
bicara soal harga, bukan soal izin.** Penggantinya sudah ditetapkan — jangan mengarang sendiri yang
lebih buruk:

| Alih-alih | Tulis |
|---|---|
| spending limit / cap | **notional bound** |
| the guardrail worked | **the floor held** |
| blocked / prevented | **refused** |
| circuit breaker fired | **trading stops** |
| hardware-approved | **device-signed** |

`frontend/check-copy.mjs` menyisir seluruh `src/` di setiap build dan menggagalkan build begitu ada
yang kena. Komentar dikecualikan; string tidak.

**Yang tidak boleh diklaim layar mana pun.** Perlindungannya terbatas pada venue ini — harga, pada
fill yang lewat venue ini. Tidak ada layar yang boleh bilang "portofolio Anda terlindungi". Kalimat
jujurnya, dipakai apa adanya di mana pun cakupan disebut, ada di `copy.ts` sebagai `copy.scope`:

> the worst price on this venue is the one you set

---

## 1 — Permukaannya, dalam urutan pengguna menemuinya

```
kali pertama ──► layar floor ──► live view ──► (kartu penolakan datang di tape)
(ceremony)       (dari [adjust],    ↑ rumah setelah itu
                  lalu dari         │
                  live view)        └── tombol panik: selalu ada, kanan atas,
                                        di setiap layar pemilik, tidak pernah dicari

halaman publik — yang ditemui orang asing, sebagai ganti semuanya di atas
```

---

## 2 — Permukaan 01: kali pertama — empty state *itulah* onboarding-nya

Bukan kekosongan berbentuk dashboard. Bukan deretan stat tile berisi nol. Pengguna yang belum punya
vault melihat satu layar yang seluruh tugasnya adalah ceremony itu sendiri.

```
┌────────────────────────────────────────────────────────────────┐
│  S U B F L O O R                                               │
│  An agent trades your whole portfolio.                         │
│  The worst price is the one you set.                           │
│                                                                │
│  your inventory     [ 0.20 WETH ] [ 500 USDC ]   (from wallet) │
│                                                                │
│  your worst price   2,445.40 USDC per WETH                     │
│                     100 bps below the live reference  [adjust] │
│                                                                │
│  runs for 14 days · the agent trades inside this, nothing else │
│                                                                │
│              [ SIGN ON YOUR DEVICE ]                           │
│         the device will show you exactly these numbers         │
└────────────────────────────────────────────────────────────────┘
```

**Yang dilakukan pengguna:** memilih jumlah, menerima atau menyesuaikan satu angka itu (`[adjust]`
membuka layar floor secara inline), menekan satu aksi utama, lalu mengonfirmasi di device.

**Yang harus mereka pahami:** uang masuk, satu harga terburuk, satu tanda tangan, 14 hari. Itu
seluruh daftarnya.

**Yang sengaja disembunyikan** — bagian yang paling gampang salah, karena masing-masing gampang
dirender dan terasa membantu:

- alamat delegate — mandate sudah membawanya; antarmuka cukup menyebutnya "the agent"
- token approval — terbatas, hanya ke canonical Aqua, itu mesin di baliknya
- notional bound milik mandate — default-nya sebesar yang disetor, baru dimunculkan kalau pengguna
  menambah setoran belakangan
- struktur EIP-712
- semua alamat kontrak

**Baris di bawah tombol itu menanggung beban.** "the device will show you exactly these numbers"
menyiapkan clear-signing sebagai konfirmasi, bukan kejutan, sebelum device-nya menyala sama sekali.

### Kondisi gagal

| Kondisi | Yang dilakukan layar |
|---|---|
| **Device tidak ada** | Terdeteksi *sebelum* ceremony dimulai (enumerasi WebHID saat halaman dimuat). Satu baris jujur: "This needs your device. Everything else on this page works without it." Bukan form yang diisi sampai selesai lalu gagal di ujung. |
| **Ditolak di device** | Bukan kondisi error. Kembali ke layar ini dengan semua field utuh: "You declined on the device. Nothing moved." |
| **Wallet tidak ada isinya** | Jumlah terbaca nol, aksi utama tetap terlihat tapi mati, dengan "fund the wallet first". Tanpa modal, tanpa wizard. |

---

## 3 — Permukaan 02: layar floor — sebuah distribusi menjadi satu angka

Inti produknya. Layar ini membaca deviasi merugikan yang benar-benar terjadi dari index publik,
supaya manusianya tidak sedang menandatangani tebakan.

Masalah desainnya: input yang jujur berbentuk distribusi, dan orang non-kuant tidak bisa memilih
persentil. Jawabannya **satu sumbu, semuanya di atasnya** — fill, reference, penanda persentil, dan
handle floor semuanya hidup di sumbu harga horizontal yang sama. Jadi "fill sebenarnya mendarat di
mana" dan "floor saya di mana" adalah gambar yang sama, dan menggeser handle terlihat jelas sebagai
menjauh dari atau masuk ke gerombolan fill yang nyata.

```
┌────────────────────────────────────────────────────────────────┐
│  your worst price                                              │
│                                                                │
│  fills on this venue, last 7 days — 214 fills, from the        │
│  public index                                     [run query]  │
│                                                                │
│   ····・・・••••●●●●●●●●●●●●●●●●●●●●●●●・・・・··  ·   ·          │
│               │                    │            │              │
│           p50 −6 bps          p99 −41 bps       │              │
│  ───────────────────────────────────────────────█──────────    │
│  reference 2,470.10                        your floor          │
│  (Chainlink ETH/USD)                   2,445.40 · −100 bps     │
│                                                                │
│  fewer than 1 in 100 past fills landed beyond p99; your floor  │
│  sits 59 bps beyond that                                       │
│                                                                │
│  2,445.40 also holds on its own, whatever the reference does   │
│  if the reference feed goes quiet, trading stops until it      │
│  returns — nothing settles at an unknown price       [detail]  │
│                                                                │
│  [ RAISE SUBFLOOR ]   free · immediate · no device             │
│  lowering your floor needs your device                         │
└────────────────────────────────────────────────────────────────┘
```

### Aturan penempatan

**Angka absolut adalah judulnya; angka bps adalah subjudulnya.** Orang non-kuant memilih harga —
"saya tidak akan pernah menerima kurang dari 2.445,40 per WETH" — bukan deviasi. Keduanya berubah
seiring handle digeser: handle-nya bergerak di **ruang bps, dengan detent 25 bps**, karena itulah
yang disimpan registry, tapi tipografi besarnya selalu USDC-per-WETH.

**Kedua bentuk floor tampil sekaligus.** Floor relatif terhadap reference adalah handle-nya;
backstop absolut adalah satu baris tenang di bawah angka judul, diturunkan otomatis saat
penandatanganan, dan dikalimatkan sebagai penenang — bukan sebagai keputusan kedua.

**Batas staleness dirender sebagai kalimat fail-closed**, dengan angka terukurnya di balik
`[detail]` — angka asli dari sampler, tidak pernah karangan, dan ditarik ulang pada hari apa pun
sesuatu direkam:

> the reference typically updates about every 2½ minutes (p50 150s over 91 measured intervals);
> the longest quiet spell measured was 1,232s (~21 min)

### Default-nya, dan dari mana asalnya

**Floor default = p99 dari deviasi merugikan yang benar-benar terjadi selama 7 hari terakhir,
dibulatkan ke atas ke kelipatan 25 bps.** Alasannya, ditampilkan di expander `[detail]` dalam satu
kalimat: sebuah floor yang hampir tidak pernah tersentuh oleh riwayat venue ini — kurang dari 1 dari
100 fill sebelumnya — jadi jaminannya nyata tapi vault tetap bebas berdagang.

Persentilnya datang dari index. **Tidak pernah dari file konfigurasi.** Jumlah sampelnya selalu
dicetak di sebelahnya.

### Cold start

Di hari pertama riwayat venue baru berumur beberapa jam, dan persentil atas belasan fill itu bukan
statistik. Di bawah ambang sampel — **N < 100** — layarnya mengatakan:

> venue history too short to calibrate — house default shown

…dan default-nya adalah angka rumah (100 bps), dilabeli sebagai angka rumah. **Jangan pernah
merender p99 yang dihitung dari 12 fill seolah-olah itu strip 214 fill.** Afordansi `[run query]`
tetap ada dalam kondisi apa pun: query di balik strip itu sama persis dengan yang bisa dijalankan
orang asing terhadap index publik, dan itulah yang membuat angkanya bisa dipercaya alih-alih sekadar
dekoratif.

### Menaikkan versus menurunkan

Menarik handle **ke atas** (mendekati reference) mengaktifkan `[ RAISE SUBFLOOR ]` — satu klik, satu
transaksi murah, tanpa device, langsung berlaku. Menariknya **ke bawah** mengubah aksi utamanya jadi
`[ LOWER ON DEVICE ]` dan ceremony-nya mengambil alih.

Asimetri itu adalah desain produknya, dan **layar ini mengajarkannya lewat dua tombol yang berbeda,
bukan lewat penjelasan.**

---

## 4 — Permukaan 03: dua momen device

Tepat dua: **menandatangani mandate** (saat onboarding, dan diperbarui tiap 14 hari) dan
**menurunkan floor**. Keduanya di-clear-sign di device, jadi perangkatnya menampilkan makna
ekonomis, bukan hash.

Alurnya dirancang dengan asumsi device itu lambat dan fisik. **Kelambatan itu justru fiturnya**, dan
tugas layar adalah membuat penantiannya terasa seperti pertimbangan, bukan latensi.

Sebelum device menyala, layar menampilkan persis apa yang akan ditampilkan device:

```
┌────────────────────────────────────────────────┐
│  your device will display                      │
│                                                │
│    Lower WETH/USDC floor                       │
│    to 2.0% below reference                     │
│    delegate: agent-7                           │
│    expires: 14d                                │
│                                                │
│  confirm on the device only if it matches      │
│              [ CONTINUE ON DEVICE ]            │
└────────────────────────────────────────────────┘
```

Copy di web dan copy di device harus sama **persis kata per kata** — string yang sama, urutan yang
sama, dirender dari sumber descriptor yang sama. Itulah seluruh maksud clear-signing, dan baris
"only if it matches" sedang mengajarkan satu kebiasaan yang mematahkan frontend yang sudah dikuasai
penyerang. **Ketidakcocokan antara layar dan device adalah bug yang menghentikan semuanya, bukan bug
kosmetik.**

| Momen | Yang dilakukan layar |
|---|---|
| **Saat menunggu** | Layar penuh, ringkasannya diam. **Tanpa spinner, tanpa hitung mundur.** "Waiting for your device. Take your time — nothing happens until you press confirm." Tanpa timeout yang membatalkan ceremony: orang yang sedang membandingkan delapan baris teks di layar kecil tidak boleh dikejar waktu. |
| **Saat ditolak** | "You declined on the device. Nothing changed. Your floor is still 2,445.40." Kembali ke layar sebelumnya, state utuh. Penolakan adalah **keberhasilan sistem** — digayakan netral, tidak pernah sebagai error, tidak pernah dengan rengekan "coba lagi". |
| **Device tidak ada** | Terdeteksi sebelum ceremony ditawarkan, sama seperti di permukaan 01. |

**Aturan yang berlaku di mana-mana: menaikkan floor dan setiap pembacaan tidak pernah menyebut
device.** Device muncul tepat di momen-momen kritis-kepercayaan dan tidak di tempat lain. Kalau ia
muncul di titik lain, ia terbaca sebagai tempelan.

---

## 5 — Permukaan 04: live view — empat zona

Rumah pemilik selama agent berdagang. Satu aturan di atas semuanya:

> **Setiap angka di layar ini dibaca dari index — query yang sama persis dengan yang dijalankan
> halaman publik — supaya pemilik tidak pernah melihat angka yang tidak bisa dibuktikan index.**

```
┌────────────────────────────────────────────────────────────────┐
│  47 fills · median +9 bps vs CEX mid · worst fill +3 bps       │  ZONA 1
│  above floor · 2 refused · running since Sep 8      ● live     │
│                                                                │
│  the tape                       floor ┊ ref                    │  ZONA 2
│  14:02  sold 0.05 WETH   2,463.1   ───┊──●─     +72 bps above  │
│  13:47  bought 0.04 WETH 2,468.9   ───┊────●    +96 bps above  │
│  13:31  THE SUBFLOOR HELD — a fill at 2,391.6 was refused[card]│
│  13:12  sold 0.03 WETH   2,459.8   ───┊─●──     +58 bps above  │
│                                                                │
│  the agent now: quoting both sides ±35 bps, decaying ·         │  ZONA 3
│  TWAP exit 0.4 WETH over 6h · auction rebalance idle           │
│                                                                │
│  inventory  0.18 WETH · 512 USDC          floor 2,445.40       │  ZONA 4
│  the worst price on this venue is the one you set              │
└────────────────────────────────────────────────────────────────┘
```

**Zona 1 — strip angka.** Satu baris, bukan lima tile. Kalimat submission yang dirender langsung:
*"N fills, median X bps vs CEX mid, worst fill Y bps above floor, 2 attacks refused, running since
Sep 8."* Di pagi hari submission, kalimat itu dibaca dari layar ini, bukan dihitung semalam
sebelumnya. **Jumlah penolakan adalah statistik utama zona 1, tidak pernah dikubur — penolakan
adalah angka yang paling dibanggakan produk ini.**

**Zona 2 — tape.** Tiap fill membawa jaraknya dari floor, digambar sebagai batang di sumbu bersama:
**floor adalah tepi kiri yang tetap** dan **reference adalah tick putus-putus**. Floor adalah sumbu
seluruh produk, jadi ia adalah sumbu grafiknya. Penolakan masuk ke tape yang sama. Detail markout
(terhadap reference-at-block dan CEX mid) ada **satu klik di balik tiap fill**, bukan di permukaan.

**Zona 3 — agent.** Strategi yang sedang berjalan dalam bahasa biasa: "quoting both sides", "TWAP
exit", "auction rebalance". Diterjemahkan dari klasifikasi strategi yang sudah dihitung index.
**Tidak pernah bytecode, tidak pernah nama opcode.**

**Zona 4 — inventory dan floor yang sedang berlaku**, dengan kalimat cakupan sebagai perabot tetap,
bukan cetakan kecil.

---

## 6 — Permukaan 05: kartu penolakan

Datang sebagai sebuah state di dalam tape; bukan layar yang dituju siapa pun. Ketika venue menolak
sebuah fill, pemilik harus melihat **produknya bekerja, bukan sebuah error**.

Dibingkai persis seperti fill biasa — **tidak ada gaya alarm pada kartunya sendiri. Satu-satunya
merah di layar adalah harga yang dicoba**, karena harga yang dicoba itulah hal buruknya, dan
kartunya adalah hal baiknya.

```
┌─ THE SUBFLOOR HELD ────────────────────────────┐
│  a fill at 2,391.6 was refused                 │
│                                                │
│  attempted        2,391.6   (−318 bps vs ref)  │
│  your floor       2,445.40  (−100 bps)         │
│                                                │
│  reverted on Base mainnet · tx 0x9d…   [view]  │
│  balances unchanged                            │
└────────────────────────────────────────────────┘
```

Angka-angkanya adalah **argumen revert yang sudah didekode** — ada lima, dan bentuknya sudah
diketahui hari ini: `SettledBelowFloor(recipient, tokenIn, tokenOut, executionRate, floorRate)`.
`[view]` mendarat di halaman block explorer yang status Fail-nya terdekode menjadi dua angka yang
sama dengan yang ditampilkan kartu: satu kejadian, dua saksi.

**"Balances unchanged" adalah kalimat yang sebenarnya dicari pemilik yang sedang khawatir. Kalimat
itu memimpin; semua yang forensik menyusul.**

Satu fakta struktural yang membentuk jalur datanya: **fill yang ditolak tidak memancarkan log sama
sekali.** Revert tidak menghasilkan event dan subgraph digerakkan oleh log, jadi penolakan tidak
mungkin datang dari subgraph. Semuanya datang dari modul Substreams, yang membaca status transaksi.

---

## 7 — Permukaan 06: tombol panik

Satu kontrol yang selalu ada di **setiap layar pemilik, kanan atas**: `[ STOP THE AGENT ]`.

Satu aksi, dua efek dengan urutan tetap — dock lewat canonical Aqua dulu (tetap bekerja walaupun
router yang dimodifikasi sudah dikuasai atau rusak), lalu ring revocation, yang mematikan rahasia
milik delegate dari jarak jauh.

**Bisa dicapai dengan satu gerakan dari mana saja; mustahil terpicu tak sengaja: tekan-dan-tahan 1,5
detik dengan animasi isi yang terlihat — bukan modal konfirmasi.** Orang yang sedang panik tidak
seharusnya perlu membaca dialog, dan klik nyasar tidak boleh bisa memicunya.

**Tidak ada device di jalur ini, dan itu disengaja.** Dock hanya bisa menghentikan perdagangan,
tidak pernah memperburuk harga — dan tombol panik yang butuh hardware justru gagal tepat ketika
device-nya sedang di laci di tempat lain.

Setelah dipicu, satu kondisi akhir yang sederhana:

> Trading stopped. The agent's credential is revoked and cannot be restored — issuing a new one
> takes your device. Your funds are yours to withdraw.

Penarikan dana adalah jalur pemilik: selalu tersedia, tidak pernah di balik agent, tidak pernah di
balik ceremony.

---

## 8 — Halaman publik — satu halaman, dua kondisi

Live view milik pemilik **adalah** halaman publik ditambah zona khusus pemilik. Membangunnya seperti
itu membuat keduanya jujur secara konstruksi.

| | Publik | Pemilik |
|---|:--:|:--:|
| strip angka | ● | ● |
| tape, dengan jarak tiap fill dari floor | ● | ● |
| jumlah penolakan | ● | ● |
| penghitung fuzz, uptime | ● | ● |
| laporan kualitas eksekusi harian, **berikut query-nya** | ● | ● |
| halaman bounty adversarial, ditautkan | ● | ● |
| inventory | — | ● |
| status mandate | — | ● |
| tombol panik | — | ● |

**Di sebelah tiap angka utama: `[run query]`.** Jaminannya adalah query siapa pun, bukan klaim kami
— afordansi itu adalah kalimat tersebut yang dibuat bisa diklik.

**Orang asing tidak boleh melihat:** atribusi inventory, level floor yang terkait ke recipient yang
bisa dikenali, atau apa pun yang memetakan sebuah alamat ke ukuran posisi yang terekspos.

> **Batasan yang selalu berlaku: tidak ada halaman yang boleh menerbitkan papan peringkat berisi
> posisi yang teridentifikasi. Itu daftar sasaran, bukan produk.**

Selama baru ada satu vault ini memang belum relevan, tapi aturannya mengikat begitu ada pengguna
kedua — dan bentuk query-nya tidak boleh sudah melanggarnya sejak sekarang.

---

## Jangan dibangun

Ditandai supaya tidak ada yang membangun berlebihan. Masing-masing adalah hal yang dibutuhkan demo
tapi tidak dibutuhkan produk, atau hal yang tidak dibutuhkan keduanya:

- **Tidak ada panel isi-pikiran agent.** Split-screen injeksi — halaman yang diracun, log agent yang
  memutuskan menjual, disassembly programnya — itu tangkapan terminal di hari syuting, bukan
  permukaan dashboard.
- **Tidak ada pemilih pair.** Satu pair, WETH/USDC.
- **Tidak ada charting di luar strip fill dan batang di tape.**
- **Tidak ada layout mobile.** Videonya 16:9 desktop dan run-nya punya satu pemilik.
- **Tidak ada alur multi-pengguna.**
- **Mode teater untuk penghitung fuzz** cukup satu state tampilan CSS pada statistik yang sudah
  dipunyai dashboard — *bukan* layar baru.

Satu pengecualian yang disengaja ke arah sebaliknya: **kartu penolakan harus muncul tepat waktu,
beberapa detik setelah revert.** Index adalah catatan permanennya, tapi jedanya tidak cukup rapi
untuk koreografi — jalur cepat yang mengawasi receipt untuk transaksi kita sendiri bisa diterima,
karena angka di kartunya tetap datang dari revert yang didekode, dan index mengisi event yang sama
di belakang.

---

## Posisi build terhadap dokumen ini

Diperiksa terhadap `frontend/src` pada 8 Sep. **Sudah** berarti ada dan membaca dari sumber hidup.
**Belum** berarti permukaannya ada tapi disuapi `fixtures.ts`, atau memang belum ada.

| Permukaan | Status | Catatan |
|---|---|---|
| Tombol panik, tekan-tahan 1,5 dtk | **sudah** | `PanicButton.tsx`, `HOLD_MS = 1500` |
| Kartu penolakan | **sudah** | `RefusalCard.tsx`, dari argumen revert terdekode lewat `/api/refusals` |
| Tape dengan jarak tiap fill dari floor | **sudah** | `Tape.tsx`, `FillBar.tsx` — disuapi index |
| Layar floor, layout satu sumbu | **sudah** | `FloorDialog.tsx`, `PriceLadder.tsx`, `FloorHistogram.tsx` |
| Aturan cold start di layar floor | **sudah** | `coldStart = sampleCount < 100` |
| Ceremony device: ringkasan, menunggu, penolakan | **sudah** | `DeviceCeremony.tsx`, `DeviceScreen.tsx`, `DeviceSign.tsx` |
| Satu halaman, dua kondisi | **sudah** | prop `owner` di `LiveView`; `PublicAside.tsx` |
| Kalimat cakupan sebagai perabot tetap | **sudah** | `copy.scope` |
| Disiplin copy ditegakkan | **sudah** | `check-copy.mjs` atas seluruh `src/` |
| **Kalibrasi dibaca dari index** | **belum** | `p50Bps`, `p99Bps`, `fillsBps`, `houseDefaultBps`, `sampleCount` semuanya datang dari `fixtures.ts`. Index belum punya query kalibrasi sama sekali. Ini satu-satunya celah yang ditandai tidak bisa ditawar — seluruh alasan layar itu ada adalah supaya manusianya tidak menandatangani tebakan, dan tebakan yang dibaca dari file konfigurasi tetap tebakan. |
| **Zona 3, agent** | **belum** | `fixtures.agent` berisi tiga string keras. Index menghitung klasifikasi strategi; belum ada yang membacanya. |
| **Zona 1 sebagai satu baris** | **belum** | Saat ini lima stat tile (`Tiles.tsx`). Dokumen ini meminta kalimat submission sebagai satu baris. |
| **`[run query]`** | **separuh** | `onQuery` ada di `Tiles.tsx` dan belum tersambung ke apa pun. |
| **Permukaan 01 sebagai satu ceremony** | **sebagian** | `SetupDialog.tsx` merender checklist lima langkah — fund, floor, guardian, delegate, mandate. Empat dari lima itu adalah mesin yang menurut dokumen ini harus disembunyikan. Rantainya memang butuh beberapa transaksi; "satu ceremony" itu soal penyajian, jadi celahnya adalah mesinnya ada di permukaan alih-alih di balik satu angka dan satu tombol. |
| Penyimpanan mandate | **sementara** | Tinggal di `localStorage`, belum terverifikasi. Tempatnya di Key Ring. |
