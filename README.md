# Hermes Theme Ranz

Plugin ringan untuk tema dashboard Hermes: GIF black hole sebagai latar, panel terminal dashboard yang sedikit tembus pandang, dan font UI sans-serif yang lembut. Terminal Chat tetap terminal asli Hermes—tanpa composer kedua, kontrol tema/jeda, WebSocket, PTY, atau sesi tambahan.

## Yang diubah

Plugin memasang satu slot `backdrop` dan mengaktifkan tema selama plugin diizinkan. Setelan lama `enabled` atau `paused` yang mungkin tersimpan di browser diabaikan; berkas penyimpanannya tidak disentuh. GIF tetap dipakai dalam kondisi biasa, sedangkan `prefers-reduced-motion` menggunakan gambar diam. CSS mengubah font UI dan latar pembungkus panel terminal; font monospace, warna ANSI, isi, serta perilaku xterm tidak ditimpa.

Latar panel terminal dibuat 90% opak sebagai perubahan halus, dengan nilai cadangan untuk browser yang belum mendukung `color-mix()`. Latar konten terminal/xterm sendiri tidak dibuat transparan.

Pada host yang masih memiliki composer dan kontrol jeda dari tema lama, plugin menyembunyikan kontrol tersebut dan lapisan latar lama hanya selama plugin aktif. Berkas host dan fungsi terminal tidak diubah.

## Font terminal

Plugin ini **tidak mengubah font xterm**. Hermes mengatur xterm melalui `fontFamily: TERMINAL_FONT_FAMILY` di `web/src/pages/ChatPage.tsx` (saat ini baris 523). Stack yang dipakai didefinisikan di `web/src/lib/terminal-font-refit.ts` (baris 6–10); saat ini dimulai dengan JetBrains Mono yang dibundel host.

Untuk mengganti font terminal dengan font monospace yang lebih lembut tanpa mengubah warna atau perilaku, penyesuaian perlu dilakukan di host: bundel font yang dipilih (misalnya IBM Plex Mono) di `web/src/index.css`, taruh nama font tersebut di urutan pertama `TERMINAL_FONT_FAMILY`, dan perbarui `BUNDLED_FACES` agar refit xterm menunggu face yang sama. `ChatPage` dapat tetap mengirim opsi tersebut ke xterm tanpa perubahan lain. Jangan hanya menimpa CSS `.xterm`—renderernya menggambar melalui canvas/WebGL dan ukuran sel harus dihitung ulang. Host aktif dan build-nya tidak diubah oleh plugin ini.

## Pasang plugin

Pasang repo ini di folder `plugins` milik Hermes yang digunakan dashboard. Biasanya:

```sh
HERMES_ROOT="${HERMES_HOME:-$HOME/.hermes}"
mkdir -p "$HERMES_ROOT/plugins"
git clone https://github.com/RanggaKelaz/hermesthemeranz.git \
  "$HERMES_ROOT/plugins/hermesthemeranz"
```

Untuk instalasi berbasis profil, gunakan Hermes home profil tersebut. Tambahkan `hermesthemeranz` ke daftar `plugins.enabled` pada konfigurasi profil, dengan mempertahankan entri yang sudah ada. Di dashboard, buka **Plugins** dan gunakan kontrol refresh/rescan setelah menambahkan berkas, lalu buka kembali dashboard pada waktu yang aman. Jika plugin belum termuat, mulai ulang proses dashboard dan buka lagi. Hindari me-refresh tab Chat saat sesi sedang aktif.

Untuk beberapa server Hermes terpisah, pasang plugin di tiap Hermes home. Jika semua perangkat memakai satu server bersama, cukup pasang sekali di server itu.

Jalankan `pnpm test` untuk tes plugin. Tes visual CSS menggunakan Chrome di `/usr/bin/google-chrome` atau lokasi dari `CHROME_BIN`; jika tidak tersedia, tes visual dilewati.

## Bridge lama

Tema saat ini tidak memerlukan jembatan aktif-chat. Patch historis [`patches/hermes-active-chat-bridge.patch`](patches/hermes-active-chat-bridge.patch) tetap disimpan sebagai artefak kompatibilitas dari versi composer sebelumnya, tetapi **jangan menerapkannya hanya untuk mengaktifkan tema ini**. Ia tidak diperlukan untuk latar, transparansi panel, atau font UI.

## Atribusi

Visualisasi black-hole binary: NASA Goddard Space Flight Center, Jeremy Schnittman, dan Brian P. Powell. Sumber: [NASA Scientific Visualization Studio, 14132](https://svs.gsfc.nasa.gov/14132/). GIF asli: [BHW Binary Black Holes Accretion Disk](https://svs.gsfc.nasa.gov/vis/a010000/a014100/a014132/BHW_Binary_Black_Holes_Accretion_Disk.gif).
