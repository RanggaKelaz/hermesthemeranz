# Hermes Theme Ranz Chat Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambahkan mode Terminal dan Bubble pada chat Hermes yang sama, dengan transcript, status, progress, dan installer satu perintah.

**Architecture:** Hermes host menyediakan bridge kecil untuk scope sesi, event terstruktur, status feed, dan pilihan tampilan. Plugin merender selector serta Bubble, membaca riwayat melalui API sesi, dan mengirim pesan melalui writer PTY aktif. Tampilan mengikuti rancangan yang disetujui: GIF black-hole, logo Hermes, panel transparan, teks Nunito Sans yang lembut, dan garis aktivitas putih. Design Read: Hermes dashboard chat untuk pengguna Hermes, ENERGY 2 / RHYTHM 2 / MOTION 2. Transparansi mempertahankan GIF, panel gelap menjaga kontras, dan garis hanya bergerak pada aktivitas nyata.

**Tech Stack:** Hermes web React/TypeScript dan Vitest; plugin JavaScript, CSS, Node test runner, esbuild; installer Bash.

**Spec:** `docs/superpowers/specs/2026-11-23-hermes-chat-bubbles-design.md`

## Global Constraints

- Pertahankan koneksi, sesi, PTY, writer, dan event feed yang sudah ada. Jangan membuat chat, sesi, PTY, socket, atau WebSocket tambahan, dan jangan melepas atau menyambungkan ulang chat saat mode berganti.
- Mode awal adalah `terminal`; simpan pilihan `terminal` atau `bubble` di localStorage profil browser. Jangan membaca tampilan xterm atau mem-parsing ANSI.
- Gunakan GIF black-hole dan logo Hermes yang sudah tersedia, serta font Nunito Sans. Jangan membuat aset baru.
- Jangan menambah pemilih tema, kontrol jeda animasi, atau composer/chat kedua. Bubble memakai writer aktif yang sama.
- Pertahankan seluruh perubahan lokal, file, konfigurasi, sesi, dan backup yang sudah ada pada kedua repo. Jangan mengubah `web_dist` Hermes atau memuat ulang dashboard aktif.
- Build yang direncanakan hanya menghasilkan `dashboard/dist` milik plugin. Gunakan profil pada `$HERMES_HOME`, atau `~/.hermes` jika variabel itu tidak disetel; aktifkan plugin lewat `hermes plugins enable hermesthemeranz` agar entri konfigurasi lain tetap terjaga.
- Installer harus memeriksa bridge host sebelum menulis, memakai staging dan backup unik, tidak memakai `sudo`, tidak menghapus backup, dan tidak me-restart dashboard.
- Jangan membuat commit. Jangan mulai implementasi sampai pemilik meninjau rencana dan memilih pendekatan eksekusi.

## Review Focus

1. Perubahan channel/profil atau `stored_session_id` yang terlambat tidak boleh membocorkan event sesi lama. Tes pemilik: `ignores stale-channel events after scope switch` di `activeChatBridge.test.ts` dan `ChatSidebar.test.tsx`.
2. Riwayat latest-first yang berisi pesan identik harus tetap mempertahankan tiap kemunculan dan peran aslinya. Tes pemilik: `preserves repeated identical prompts while normalizing latest-first history` di `chat-state.test.js`.
3. `tool.progress` dengan `percent` 0, 100, hilang, atau di luar rentang harus menampilkan hanya nilai sah; nilai tak tersedia tetap indeterminate. Tes pemilik: `uses only valid explicit percentages and stays indeterminate without one` di `chat-state.test.js`.
4. Feed terputus, riwayat gagal, atau host tanpa bridge tidak boleh membuat Bubble kosong tanpa penjelasan. Tes pemilik: `offers terminal fallback when event feed or message history fails` di `index.test.js`.
5. Host tak kompatibel atau instalasi bernama sama tidak boleh merusak plugin/config yang sudah ada. Tes pemilik: `stops on an incompatible host and keeps existing same-name plugin/config backups` di `scripts/install.test.mjs`.

---

## File Map and Interfaces

- `web/src/plugins/activeChatBridge.ts` akan memiliki snapshot sesi, dispatch update, filter channel aktif, state mode, dan subscriber.
- `web/src/plugins/registry.ts` akan menerbitkan API bridge melalui `sdk.chat`; pertahankan `sendToActiveChat` yang ada dan tambahkan penanda kompatibilitas `chatBridgeVersion: 1`.
- `web/src/plugins/sdk.d.ts` akan mendeklarasikan API publik yang sama tanpa mengekspos modul internal Hermes.
- `web/src/components/ChatSidebar.tsx` dan `ChatSidebar.test.tsx` akan meneruskan event terpilih serta status koneksi dari `EventsFeedClient` yang sudah ada.
- `web/src/pages/ChatPage.tsx` akan mengelola scope/mode, slot permukaan Bubble, dan atribut aksesibilitas xterm. Tesnya berada di `ChatPage.test.tsx` serta `ChatPage.a11y.test.tsx`.
- `dashboard/src/chat-state.js` dan `chat-state.test.js` akan mengurutkan riwayat dan memvalidasi progress. `dashboard/src/index.js` dan `index.test.js` akan mengurus selector, Bubble, greeting, composer, dan fallback.
- `dashboard/manifest.json` akan mendaftarkan `chat:top` dan `chat:surface`; `dashboard/src/style.css` dan `style.browser.test.js` akan mengatur serta memeriksa tampilan responsif.
- `install.sh`, `scripts/install.test.mjs`, `package.json`, dan `README.md` akan menguji, mendokumentasikan, dan memasang plugin. `scripts/build.mjs` tetap membangun hanya ke `dashboard/dist`; hasil `dashboard/dist/index.js` dan `style.css` harus ikut dalam arsip GitHub agar host tidak memerlukan Node/pnpm.

Kontrak bridge: `type ChatViewMode = "terminal" | "bubble"`; `type ActiveChatSession = { channel: string; profile: string; storedSessionId: string | null }`; `type ActiveChatEvent = { type: "message.start" | "message.delta" | "message.complete" | "tool.start" | "tool.progress" | "tool.complete"; payload: unknown; session_id?: string }`. `ActiveChatUpdate` berbentuk union `{ kind: "session"; session: ActiveChatSession | null } | { kind: "event"; event: ActiveChatEvent } | { kind: "feed-state"; state: ConnectionState } | { kind: "mode"; mode: ChatViewMode }`. Fungsi host: `setActiveChatScope(scope: ActiveChatSession)`, `setActiveChatSessionId(channel: string, storedSessionId: string | null)`, `publishActiveChatEvent(channel: string, event: ActiveChatEvent)`, `publishChatFeedState(channel: string, state: ConnectionState)`, `getActiveChatSession(): ActiveChatSession | null`, `subscribeActiveChat(listener: (update: ActiveChatUpdate) => void): () => void`, dan `setChatViewMode(mode: ChatViewMode)`. API plugin menyediakan `chatBridgeVersion: 1`, `sendToActiveChat(text: string): boolean`, `getActiveChatSession(): ActiveChatSession | null`, `subscribeActiveChat(listener: (update: ActiveChatUpdate) => void): () => void`, dan `setChatViewMode(mode: ChatViewMode)`.

### Task 1: Tambahkan bridge chat aktif yang bertipe

**Files:**
- Create: `web/src/plugins/activeChatBridge.ts`
- Create: `web/src/plugins/activeChatBridge.test.ts`
- Modify: `web/src/plugins/registry.ts`, `web/src/plugins/registry.test.ts`, `web/src/plugins/sdk.d.ts`

**Interfaces:**
- Consumes: `sendToActiveChat(text: string): boolean` dan writer aktif yang sudah terdaftar.
- Produces: kontrak `ChatViewMode`, `ActiveChatSession`, `ActiveChatEvent`, `ActiveChatUpdate` dan fungsi bridge pada File Map. Snapshot hanya menerima event dari channel aktif; perubahan scope membersihkan session id lama.

- [ ] **Step 1: Tulis tes gagal untuk bridge.** Tambahkan `ignores stale-channel events after scope switch` untuk membuktikan event dan feed state channel lama tidak sampai ke listener, serta `publishes session, mode and feed state updates and unsubscribes cleanly` untuk membuktikan snapshot dan cleanup subscriber. Di `registry.test.ts`, buktikan SDK menerbitkan bridge versi 1 tanpa mengubah writer aktif.
- [ ] **Step 2: Pastikan tes gagal karena API belum tersedia.** Jalankan `pnpm --dir web exec vitest run src/plugins/activeChatBridge.test.ts src/plugins/registry.test.ts`. Expected: FAIL pada import/assertion bridge yang belum ada.
- [ ] **Step 3: Implementasikan bridge dan ekspor API SDK.** Tambahkan `chatBridgeVersion: 1`, perbarui tipe deklarasi, dan pertahankan semantik `sendToActiveChat` tanpa perubahan.
- [ ] **Step 4: Verifikasi tes dan tipe.** Jalankan ulang perintah Vitest di Step 2 lalu `pnpm --dir web run typecheck`. Expected: tes PASS dan TypeScript tidak melaporkan kesalahan.

### Task 2: Hubungkan ChatPage dan feed yang sudah berjalan

**Files:**
- Modify: `web/src/components/ChatSidebar.tsx`, `web/src/components/ChatSidebar.test.tsx`
- Modify: `web/src/pages/ChatPage.tsx`, `web/src/pages/ChatPage.test.tsx`, `web/src/pages/ChatPage.a11y.test.tsx`

**Interfaces:**
- Consumes: fungsi bridge Task 1 dan instance `EventsFeedClient` yang saat ini dimiliki `ChatSidebar`.
- Produces: props `onActiveChatEvent` dan `onEventsFeedState`; `ChatPage` menerbitkan scope channel/profil, `stored_session_id`, event terpilih dan status feed ke bridge.

- [ ] **Step 1: Tulis tes gagal integrasi.** Tambahkan `forwards the allowlisted chat activity from the existing events feed` dan `stops forwarding when channel or profile changes` di `ChatSidebar.test.tsx`. Tambahkan `switching chat mode keeps the same PTY and terminal usable` di `ChatPage.test.tsx` serta tes `ChatPage.a11y.test.tsx` bahwa Bubble menyembunyikan xterm dari accessibility tree tanpa melepasnya; pastikan jumlah socket/session tidak bertambah dan xterm tetap terpasang setelah kembali ke Terminal.
- [ ] **Step 2: Pastikan tes gagal pada perilaku yang belum ada.** Jalankan `pnpm --dir web exec vitest run src/components/ChatSidebar.test.tsx src/pages/ChatPage.test.tsx src/pages/ChatPage.a11y.test.tsx`. Expected: tes baru gagal karena event callback dan mode belum terhubung.
- [ ] **Step 3: Sambungkan callback ke feed dan host.** Daftarkan hanya event allowlist pada feed yang sama. Tambahkan `PluginSlot name="chat:surface"` di panel terminal dan gunakan slot `chat:top` yang sudah ada untuk kontrol. Ketika Bubble aktif, buat xterm `aria-hidden` dan `inert`, tetapi tetap mounted dan berukuran agar PTY tidak berubah.
- [ ] **Step 4: Verifikasi alur dan aksesibilitas.** Jalankan ulang perintah Vitest di Step 2 lalu `pnpm --dir web run typecheck`. Expected: semua tes terkait PASS; mode kembali ke Terminal tetap mengirim melalui PTY semula.

### Task 3: Buat state dan perilaku Bubble

**Files:**
- Create: `dashboard/src/chat-state.js`, `dashboard/src/chat-state.test.js`
- Modify: `dashboard/src/index.js`, `dashboard/src/index.test.js`, `dashboard/manifest.json`

**Interfaces:**
- Consumes: `sdk.chat` Task 1, update host Task 2, `sdk.api.getSessionMessages(sessionId, profile)`, dan `sdk.chat.sendToActiveChat(text)`.
- Produces: `orderSessionMessages(response)` untuk riwayat API latest-first dan `explicitProgress(payload)` yang hanya menerima `percent` finite dalam rentang 0 sampai 100.

- [ ] **Step 1: Tulis tes gagal untuk transcript dan progress.** Tambahkan tes untuk riwayat latest-first dengan prompt user identik, peran asli, `percent` valid/tidak valid, serta kondisi tanpa persentase. Di `index.test.js`, uji mode awal Terminal, persistensi Bubble, greeting hanya setelah riwayat kosong terkonfirmasi, submit melalui writer, dan fallback Terminal ketika feed atau API gagal.
- [ ] **Step 2: Pastikan tes gagal karena helper dan slot belum ada.** Jalankan `pnpm test`. Expected: tes baru FAIL karena helper, selector, atau surface belum tersedia.
- [ ] **Step 3: Implementasikan state dan komponen.** Tampilkan hanya pesan user/assistant sebagai bubble. Tampilkan tool/system sebagai status, bukan sebagai pembicara yang ditebak, dan jangan merender tool args/results. Pakai snapshot `getSessionMessages`; setelah `message.complete`, muat ulang lalu ganti transcript dengan riwayat otoritatif, tanpa deduplikasi berdasarkan teks. Jangan tampilkan greeting sebelum riwayat selesai dimuat dan terbukti kosong. Simpan mode dengan key `hermesthemeranz:chat-mode`; mode selain `bubble` atau nilai storage rusak berarti Terminal.
- [ ] **Step 4: Tangani status, progress, dan fallback.** Tampilkan `tool.progress.message` yang nyata; gunakan bar determinate hanya untuk `percent` sah, selain itu indeterminate tanpa menghitung persentase dari `progress/total`. Tampilkan fallback yang menjelaskan masalah dan tombol `Switch to Terminal` saat feed/history tak tersedia. Composer menggunakan writer aktif yang sama dan memberi error bila writer menolak input.
- [ ] **Step 5: Jalankan tes plugin.** Jalankan `pnpm test` di `/workspace/hermesthemeranz`. Expected: tes transcript dan plugin PASS; tes browser boleh SKIP hanya jika Chrome memang tidak tersedia.

### Task 4: Selesaikan tampilan, responsif, dan aksesibilitas

**Files:**
- Modify: `dashboard/src/style.css`, `dashboard/src/style.browser.test.js`
- Modify: `web/src/pages/ChatPage.a11y.test.tsx`

**Interfaces:**
- Consumes: atribut `data-chat-mode` dari ChatPage dan kelas/state aktivitas dari komponen Task 3.
- Produces: panel Bubble transluen, permukaan yang mempertahankan keterbacaan di atas GIF, dan garis aktivitas yang hanya menyapu pada update nyata.

- [ ] **Step 1: Tulis tes browser gagal.** Tambahkan pemeriksaan Chrome untuk Bubble/Terminal, xterm yang tetap berukuran saat tersembunyi, tidak ada overflow pada lebar ponsel/tablet/desktop, target kontrol minimal 44px, kontras teks pada titik GIF paling terang, dan garis yang berhenti setelah event.
- [ ] **Step 2: Pastikan tes gagal pada selector Bubble yang belum ada.** Jalankan `pnpm test` di repo plugin. Expected: tes baru FAIL pada aturan Bubble dan ukuran/layout yang belum diterapkan.
- [ ] **Step 3: Terapkan CSS dari arah visual yang disetujui.** Pertahankan GIF, logo dan font; gunakan satu permukaan gelap transluen agar GIF masih terlihat dan teks tetap mencapai WCAG AA. Susun pesan user/assistant, status, dan composer agar mengalir pada layar sempit; kontrol tetap bernama, fokus terlihat, dan area sentuh minimal 44px.
- [ ] **Step 4: Batasi motion dan aksesibilitas.** Jalankan sweep putih hanya ketika event/progress sungguhan berubah, hentikan setelah transisi singkat, dan matikan sweep saat `prefers-reduced-motion: reduce`. Status diumumkan melalui `role="status"`/`aria-live="polite"` tanpa memindahkan fokus; tidak menambah kontrol jeda.
- [ ] **Step 5: Verifikasi CSS dan a11y.** Jalankan `pnpm test` di repo plugin dan `pnpm --dir web exec vitest run src/pages/ChatPage.a11y.test.tsx`. Expected: tes PASS, tanpa overflow atau kontrol yang hilang dari keyboard.

### Task 5: Sediakan installer curl yang aman dan dokumentasi

**Files:**
- Create: `install.sh`, `scripts/install.test.mjs`
- Modify: `package.json`, `README.md`
- Generate/publish: `dashboard/dist/index.js`, `dashboard/dist/style.css`

**Interfaces:**
- Consumes: manifest dan bundle plugin Task 3; marker `sdk.chat.chatBridgeVersion === 1` dari Hermes host.
- Produces: satu perintah pemasangan, backup same-name yang unik, aktivasi melalui CLI Hermes, serta pesan gagal yang tidak mengubah instalasi pada host yang tak kompatibel.

- [ ] **Step 1: Tulis tes installer gagal tanpa jaringan.** Gunakan direktori sementara dan command palsu untuk menguji install ke `HERMES_HOME` terpilih, backup plugin/config yang sudah ada tanpa menimpa backup lama, bundle host tanpa marker, dan bundle plugin yang belum memiliki `dist`.
- [ ] **Step 2: Pastikan tes gagal karena installer belum ada.** Jalankan `node --test scripts/install.test.mjs`. Expected: FAIL karena `install.sh` belum dibuat.
- [ ] **Step 3: Implementasikan preflight dan staging.** Verifikasi `chatBridgeVersion: 1` di bundle `web_dist` yang ditemukan lewat paket Hermes sebelum menulis apa pun. Unduh arsip HTTPS ke direktori sementara, validasi nama manifest dan file dist, tolak path/symlink di luar paket, stage lalu pasang hanya ke `$HERMES_HOME/plugins/hermesthemeranz`, dan simpan salinan target/config lama ke backup unik. Jangan menulis atau membangun `web_dist`.
- [ ] **Step 4: Aktifkan dengan CLI dan dokumentasikan.** Panggil `hermes plugins enable hermesthemeranz` di profil yang sama, bukan mengedit YAML langsung. Dokumentasikan unduhan installer ke tempfile melalui HTTPS dan jalankan Bash hanya setelah `curl` berhasil, beserta perilaku backup/kompatibilitas. Jangan gunakan `curl | bash` atau restart dashboard.
- [ ] **Step 5: Jalankan seluruh verifikasi terisolasi.** Ubah script test package menjadi `node --test dashboard/src/*.test.js scripts/*.test.mjs`, lalu jalankan `pnpm test`, `pnpm build`, `node --test scripts/install.test.mjs`, `pnpm --dir web run typecheck`, dan Vitest host untuk bridge, ChatSidebar, ChatPage, serta a11y. Expected: PASS; hasil build hanya ada di `dashboard/dist`, `web_dist` tetap tidak berubah, dan tidak ada commit atau reload dashboard.
