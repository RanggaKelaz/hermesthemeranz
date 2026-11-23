# Hermes Theme Ranz: terminal and bubble chat modes

**Status:** approved design

## Intent

Add a choice inside the existing Hermes chat between its original terminal and a ChatGPT-style bubble view. Both views use the same Hermes session and active PTY connection. The plugin owns the visual treatment; a small host-side bridge gives the plugin a reliable way to render the existing conversation and send input.

## Goals

- Keep Terminal mode as the original Hermes TUI, with the current controls and behavior.
- Add Bubble mode with user messages on the right, assistant messages on the left, a composer, and real status and progress feedback.
- Keep the black-hole GIF visible through a translucent conversation surface. Preserve the Hermes logo and use the existing clear, soft, medium-sized type direction.
- Show the Hermes logo and a short welcome message only when the selected session has no messages yet.
- Add a compact, accessible mode selector. Persist the selection in the current browser profile.
- Show the white motion line on real activity updates. Each sweep is finite, stops when the update settles, and respects `prefers-reduced-motion`.
- Provide a single `curl` command to install and set up the published plugin on a compatible Hermes build.

## Approaches

1. **Host-assisted plugin, selected by the owner.** Add a small, stable chat-renderer and structured-event bridge to Hermes. The plugin supplies the bubble UI and uses the host's existing active chat writer. This supports accurate messages and status without reading terminal redraws.
2. **Plugin-only xterm parsing.** Hide the terminal and infer messages from its rendered buffer. Rejected because terminal redraws, custom role symbols, and tool output can duplicate or mislabel messages.
3. **Visual-only plugin.** Keep the GIF and translucent styling but leave the conversation as a terminal. Rejected because it does not provide the requested second mode.

## Proposed behavior

A labeled `Terminal` / `Bubble` selector sits in the chat header. On a fresh install it opens in Terminal mode to preserve the current default; the last selection is remembered in that browser profile. The owner can change modes without opening a session, PTY, or WebSocket, and without unmounting or reconnecting the current one. Terminal mode shows the ordinary xterm surface. Bubble mode hides its pixels while keeping the same chat alive; the composer sends through the already-registered active writer.

The bubble transcript uses structured events and the selected session's stored messages through the host bridge. It does not parse ANSI or xterm's redrawn screen. Real tool and system activity appears in full-width status rows instead of being assigned a guessed speaker. The progress indicator reports actual stages or tool activity. When Hermes has no numeric percentage, it shows indeterminate progress rather than inventing one. The live status is announced to assistive technology without moving focus. If the host cannot provide reliable message events, Bubble mode shows a clear fallback and offers the original terminal view rather than silently losing output.

An empty session shows the existing Hermes logo and a short greeting above the composer. Existing sessions do not receive a fabricated greeting. The chat surface stays translucent but gives text enough contrast over the black-hole GIF. The layout reflows for narrow screens, supports keyboard navigation, and keeps touch targets usable.

The white line sweeps in response to a real new activity or progress update, then rests. It does not run an endless loop, so there is no animation-pause control. Reduced-motion settings remove the sweep.

## Installer

After the implementation is ready in `RanggaKelaz/hermesthemeranz`, download the installer to a temporary file and run Bash only after a successful HTTPS download:

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

The script will download and install only the dashboard plugin into Hermes' user plugin location, preserve existing files by backing up a same-name copy before replacing it, and verify the installed plugin. It will check that Hermes provides the required chat bridge first. If the installed Hermes build lacks that bridge, it will stop with a clear message; it will not patch unknown Hermes source, overwrite a web build, or restart an active dashboard. The script itself will be kept in the public repository for review.

## Non-goals and constraints

- No second chat, session, PTY, or socket; no disconnecting or refreshing the active chat during development.
- No changes to Hermes tools, model behavior, session storage, or the original terminal mode.
- No theme selector, animation-pause control, or second chat composer.
- Preserve existing files, settings, sessions, local changes, and backups. Do not overwrite the active `web_dist` build.
- Keep the live dashboard untouched until an isolated build and behavior checks pass, and only inspect the live view if doing so cannot interrupt the active session.

## Acceptance checks

- Switching modes keeps the same session and PTY connection; the existing terminal still works after switching back.
- Bubble input reaches the same active Hermes session. Stored and live messages display once with their real roles.
- Tool/status rows and progress reflect real events. No fabricated percentage, message, or speaker appears.
- New-session greeting appears only for an empty session. Existing history stays intact.
- The GIF, Hermes logo, translucency, readable contrast, medium soft text, white activity sweep, and reduced-motion behavior all work.
- Keyboard, screen-reader status, and narrow-screen layout remain usable.
- The installer installs on a compatible Hermes build, preserves an existing same-name plugin copy, and exits safely on an incompatible build.
- Build and test in isolation. Do not claim live verification unless the live dashboard is actually checked without disrupting the active session.
