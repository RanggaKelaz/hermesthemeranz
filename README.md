# Hermes Theme Ranz

A Hermes dashboard plugin for the black-hole backdrop, a compact second composer, and a restrained black, white, blue, and gray theme.

The composer sits outside xterm and sends one line through the active Chat writer. It does not open a second WebSocket, PTY, terminal, or session. The GIF is only a dashboard backdrop. Hermes continues to render terminal ANSI colors and output as before.

## Compatibility

The theme can load without the host bridge, but the second composer stays disabled and explains why. To send messages, the host must expose `window.__HERMES_PLUGIN_SDK__.chat.sendToActiveChat(text)`.

The patch in [`patches/hermes-active-chat-bridge.patch`](patches/hermes-active-chat-bridge.patch) targets Hermes revision `caafe5389ae585ef77387a962aee05b1bcf17029`. It changes only the plugin SDK type, SDK registry, and ChatPage registration for the existing active PTY writer. It is not a Hermes fork.

After cloning the plugin below, if your Hermes checkout is at that exact revision, run these commands from its repository root. For a profile-specific plugin install, set `HERMES_HOME` to that profile's Hermes home first:

```sh
git rev-parse HEAD
PLUGIN_DIR="${HERMES_HOME:-$HOME/.hermes}/plugins/hermesthemeranz"
git apply --check "$PLUGIN_DIR/patches/hermes-active-chat-bridge.patch"
git apply "$PLUGIN_DIR/patches/hermes-active-chat-bridge.patch"
```

Check that `git rev-parse HEAD` prints the recorded revision before applying. If your version differs, stop and port the small bridge against that version with review. Do not force the patch or reset local changes.

Then verify the host from its `web/` directory:

```sh
pnpm exec vitest run src/plugins/registry.test.ts src/pages/ChatPage.test.tsx
pnpm typecheck
pnpm lint
pnpm build
```

If your host already provides the bridge, skip the patch.

## Install the plugin

Install the repository under the Hermes home used by the dashboard process. The usual home is `~/.hermes`; set `HERMES_HOME` first if your installation uses another root.

```sh
HERMES_ROOT="${HERMES_HOME:-$HOME/.hermes}"
mkdir -p "$HERMES_ROOT/plugins"
git clone https://github.com/RanggaKelaz/hermesthemeranz.git \
  "$HERMES_ROOT/plugins/hermesthemeranz"
```

For a profile-specific install, use that profile's Hermes home and its `plugins/` directory. Hermes also searches the root plugin directory when a process runs under a profile, so a plugin installed in the shared root can serve multiple profiles.

In the dashboard, open **Plugins** and use its refresh/rescan control after adding the files. Then open or reopen the dashboard at a safe time. If the plugin still does not load, restart the Hermes dashboard process and open it again. Avoid reloading Chat while an active session is in use.

The plugin is enabled by default. Its enabled and animation-pause choices are stored in that browser's local storage. They do not sync to other browsers or devices. Reduced-motion settings use the still image instead of the GIF.

## Separate hosts and shared servers

If each device runs its own Hermes server, apply the compatible host bridge and install the plugin on each server's Hermes home. A plugin copy on one server does not add the bridge to another server.

If several devices connect to one shared Hermes server, install the bridge and plugin once on that server. The plugin will be available to each connected browser, but theme and pause choices remain local to each browser.

## Trust and attribution

Hermes loads the plugin's JavaScript and CSS in the dashboard. Install plugins only from code you trust. The composer sends only after you submit it, and it retains the draft if the active Chat writer is unavailable.

Black-hole binary visualization: NASA Goddard Space Flight Center, Jeremy Schnittman, and Brian P. Powell. Source: [NASA Scientific Visualization Studio, 14132](https://svs.gsfc.nasa.gov/14132/). The original GIF is [available here](https://svs.gsfc.nasa.gov/vis/a010000/a014100/a014132/BHW_Binary_Black_Holes_Accretion_Disk.gif).
