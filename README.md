# Hermes Theme Ranz

Tema dashboard Hermes ini menambahkan dua tampilan untuk percakapan yang sama: **Terminal** dan **Bubble**. Terminal tetap menjadi mode awal. Bubble memakai sesi, PTY, writer, dan event feed Hermes yang sedang aktif, bukan membuat chat atau koneksi baru.

## Fitur

- Bubble menampilkan riwayat user dan assistant, composer, serta status aktivitas dari event Hermes.
- Progress numerik hanya ditampilkan bila Hermes mengirim nilai `percent` valid antara 0 dan 100. Tanpa nilai tersebut, indikator tetap indeterminate.
- Tool args dan hasil internal tidak ditampilkan sebagai pesan. Jika riwayat atau event feed tidak tersedia, Bubble menjelaskan masalah dan menyediakan jalan kembali ke Terminal.
- Logo Hermes dan sapaan hanya muncul setelah riwayat sesi berhasil dimuat dan terbukti kosong.
- GIF black-hole, panel transparan, font Nunito Sans, selector mode yang dapat dipakai dengan keyboard, dan garis aktivitas putih dipertahankan. Garis bergerak hanya saat ada event nyata dan berhenti pada pengaturan reduced motion.
- Pilihan Terminal atau Bubble disimpan di browser. Berpindah tampilan tidak melepas atau menyambungkan ulang PTY aktif.

## Instalasi satu perintah

Jalankan perintah ini sebagai pengguna Hermes yang akan memakai plugin:

```sh
installer="$(mktemp)"
trap 'rm -f "$installer"' EXIT
if curl -fsSL --proto '=https' --proto-redir '=https' \
  -o "$installer" https://raw.githubusercontent.com/RanggaKelaz/hermesthemeranz/main/install.sh; then
  bash "$installer"
else
  printf 'Installer tidak dapat diunduh.\n' >&2
  false
fi
```

Perintah ini mengunduh installer ke berkas sementara dan menjalankan `bash` hanya jika `curl` berhasil; jangan gunakan `curl | bash`. Installer lebih dulu memeriksa bahwa bundle JS yang dirujuk oleh `web_dist/index.html` memiliki `chatBridgeVersion: 1`. Jika marker tidak ditemukan, proses berhenti sebelum mengunduh arsip plugin atau mengubah berkas. Arsip diunduh melalui HTTPS, divalidasi, disiapkan, lalu dipasang hanya ke folder plugin pada `${HERMES_HOME:-$HOME/.hermes}`. Build dashboard host (`web_dist`) tidak pernah diubah.

Jika plugin bernama sama atau `config.yaml` sudah ada, salinan lama disimpan dengan nama backup unik sebelum CLI Hermes mengaktifkan plugin. Backup tidak ditimpa atau dihapus. Installer tidak menggunakan `sudo` dan tidak merestart dashboard aktif. Untuk instalasi pada profile tertentu, atur `HERMES_HOME` ke home profile tersebut sebelum menjalankan perintah. Bila dashboard sedang terbuka, muat ulang atau rescan plugin hanya pada waktu yang aman untuk sesi aktif.

## Pengembangan dan tes

```sh
pnpm test
pnpm build
```

Build menulis hanya ke `dashboard/dist`. Tes visual responsif memakai Chrome dari `/usr/bin/google-chrome` atau `CHROME_BIN`; tes tersebut dilewati jika Chrome tidak tersedia. Tes installer memakai Hermes dan `curl` tiruan di direktori sementara, tanpa mengubah instalasi aktif.

Tes host dan pemeriksaan tipe dijalankan dari checkout Hermes:

```sh
pnpm --dir web exec vitest run src/plugins/activeChatBridge.test.ts src/plugins/registry.test.ts src/components/ChatSidebar.test.tsx src/pages/ChatPage.test.tsx src/pages/ChatPage.a11y.test.tsx
pnpm --dir web run typecheck
```

## Atribusi

Visualisasi black-hole binary dibuat oleh NASA Goddard Space Flight Center, Jeremy Schnittman, dan Brian P. Powell. Sumber: [NASA Scientific Visualization Studio, 14132](https://svs.gsfc.nasa.gov/14132/). GIF asli: [BHW Binary Black Holes Accretion Disk](https://svs.gsfc.nasa.gov/vis/a010000/a014100/a014132/BHW_Binary_Black_Holes_Accretion_Disk.gif).
