#!/usr/bin/env bash
set -Eeuo pipefail

PLUGIN_NAME="hermesthemeranz"
ARCHIVE_URL="https://codeload.github.com/RanggaKelaz/hermesthemeranz/tar.gz/refs/heads/main"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
export HERMES_HOME

fail() {
  printf 'Hermes Theme Ranz installer: %s\n' "$1" >&2
  exit 1
}
plugins_dir="$HERMES_HOME/plugins"
[[ ! -L "$plugins_dir" ]] || fail "plugins directory is a symbolic link; refusing to write through it"
for tool in hermes readlink dirname basename sed head awk grep find tar python3 curl mktemp cp mv date rm; do
  command -v "$tool" >/dev/null 2>&1 || fail "required command not found: $tool"
done

find_web_dist() {
  local command_path current directory candidate depth wrapper_target
  command_path="$(command -v hermes)"
  current="$(readlink -f -- "$command_path" 2>/dev/null || printf '%s' "$command_path")"

  for depth in 1 2 3 4; do
    if [[ -f "$current" ]]; then
      wrapper_target="$(sed -nE 's/^[[:space:]]*exec[[:space:]]+([^[:space:]]+)[[:space:]]+"\$@"[[:space:]]*$/\1/p' "$current" | head -n 1)"
      if [[ "$wrapper_target" == /* && -f "$wrapper_target" ]]; then
        current="$(readlink -f -- "$wrapper_target" 2>/dev/null || printf '%s' "$wrapper_target")"
      fi
    fi
    directory="$(dirname -- "$current")"
    for candidate in \
      "$directory/hermes_cli/web_dist" \
      "$directory/../hermes_cli/web_dist" \
      "$directory/lib/python"*/site-packages/hermes_cli/web_dist \
      "$directory/../lib/python"*/site-packages/hermes_cli/web_dist; do
      if [[ -d "$candidate" ]]; then
        printf '%s\n' "$(cd "$candidate" && pwd -P)"
        return 0
      fi
    done
    current="$directory/../hermes"
    current="$(readlink -f -- "$current" 2>/dev/null || printf '%s' "$current")"
  done
  return 1
}

if ! web_dist="$(find_web_dist)"; then
  fail "could not locate the installed Hermes package web_dist; no files were changed"
fi
if ! python3 - "$web_dist" <<'PY'
import html.parser
import pathlib
import re
import sys
import urllib.parse

root = pathlib.Path(sys.argv[1]).resolve()
marker = re.compile(r'"?chatBridgeVersion"?\s*:\s*1(?:[^0-9]|$)')

class ScriptSources(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.sources = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() == "script":
            src = dict(attrs).get("src")
            if src:
                self.sources.append(src)

try:
    parser = ScriptSources()
    parser.feed((root / "index.html").read_text(encoding="utf-8"))
except (OSError, UnicodeError):
    raise SystemExit(1)

for src in parser.sources:
    parsed = urllib.parse.urlsplit(src)
    if parsed.scheme or src.startswith("//") or not parsed.path:
        continue
    bundle = (root / urllib.parse.unquote(parsed.path).lstrip("/")).resolve()
    try:
        bundle.relative_to(root)
    except ValueError:
        continue
    try:
        if bundle.is_file() and marker.search(bundle.read_text(encoding="utf-8")):
            raise SystemExit(0)
    except (OSError, UnicodeError):
        continue
raise SystemExit(1)
PY
then
  fail "this Hermes host does not expose chatBridgeVersion 1; update Hermes first. No files were changed"
fi

work="$(mktemp -d "${TMPDIR:-/tmp}/${PLUGIN_NAME}.install.XXXXXXXX")"
stage_root=""
cleanup() {
  if [[ -n "$stage_root" && -d "$stage_root" ]]; then
    rm -rf -- "$stage_root"
  fi
  if [[ -n "$work" && -d "$work" ]]; then
    rm -rf -- "$work"
  fi
}
trap cleanup EXIT

archive="$work/plugin.tar.gz"
extract="$work/extracted"
mkdir -p "$extract"
curl -fsSL --proto '=https' --proto-redir '=https' "$ARCHIVE_URL" -o "$archive" || fail "could not download the plugin archive"

tar -tzf "$archive" > "$work/archive-members" || fail "download is not a readable tar archive"
while IFS= read -r member; do
  case "$member" in
    /*|..|../*|*/../*|*/..|*\\*) fail "archive contains an unsafe path" ;;
  esac
done < "$work/archive-members"
if tar -tvzf "$archive" | awk 'substr($1, 1, 1) != "-" && substr($1, 1, 1) != "d" { found = 1 } END { exit !found }'; then
  fail "archive contains a link or special file; refusing to install it"
fi
tar --no-same-owner --no-same-permissions -xzf "$archive" -C "$extract" || fail "could not extract the plugin archive"

mapfile -t manifests < <(find "$extract" -maxdepth 4 -type f -name manifest.json -print)
[[ "${#manifests[@]}" -eq 1 ]] || fail "archive must contain exactly one dashboard manifest"
package_root="$(dirname -- "${manifests[0]}")"
[[ "$(basename -- "$package_root")" == dashboard ]] || fail "manifest is not inside the dashboard package"
if find "$package_root" -type l -print -quit | grep -q .; then
  fail "dashboard package contains a symbolic link"
fi
python3 - "$package_root" <<'PY' || fail "dashboard package is incomplete or has an invalid manifest"
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
try:
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
except (OSError, ValueError):
    raise SystemExit(1)
if manifest.get("name") != "hermesthemeranz":
    raise SystemExit(1)
if manifest.get("entry") != "dist/index.js" or manifest.get("css") != "dist/style.css":
    raise SystemExit(1)
for relative in ("dist/index.js", "dist/style.css"):
    path = root / relative
    if not path.is_file() or path.is_symlink() or path.stat().st_size == 0:
        raise SystemExit(1)
PY

target="$plugins_dir/$PLUGIN_NAME"
[[ ! -L "$plugins_dir" ]] || fail "plugins directory is a symbolic link; refusing to write through it"
mkdir -p "$plugins_dir"
stage_root="$(mktemp -d "$plugins_dir/.${PLUGIN_NAME}.stage.XXXXXXXX")"
cp -a -- "$package_root/." "$stage_root/"

unique_backup_path() {
  local base="$1" stamp candidate suffix
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  candidate="${base}.backup.${stamp}.$$"
  suffix=1
  while [[ -e "$candidate" || -L "$candidate" ]]; do
    candidate="${base}.backup.${stamp}.$$.${suffix}"
    suffix=$((suffix + 1))
  done
  printf '%s\n' "$candidate"
}

config_path="$HERMES_HOME/config.yaml"
if [[ -e "$config_path" || -L "$config_path" ]]; then
  config_backup="$(unique_backup_path "$config_path")"
  cp -aL -- "$config_path" "$config_backup" || fail "could not back up the active Hermes config"
  printf 'Saved config backup: %s\n' "$config_backup"
fi

plugin_backup=""
if [[ -e "$target" || -L "$target" ]]; then
  plugin_backup="$(unique_backup_path "$target")"
  mv -- "$target" "$plugin_backup" || fail "could not preserve the existing plugin"
  printf 'Saved plugin backup: %s\n' "$plugin_backup"
fi
if ! mv -- "$stage_root" "$target"; then
  if [[ -n "$plugin_backup" && ( -e "$plugin_backup" || -L "$plugin_backup" ) && ! -e "$target" && ! -L "$target" ]]; then
    mv -- "$plugin_backup" "$target" || true
  fi
  fail "could not move the staged plugin into place; previous files were kept"
fi
stage_root=""

if ! hermes plugins enable "$PLUGIN_NAME"; then
  fail "plugin files are installed, but Hermes could not enable the plugin; backups were kept and the dashboard was not restarted"
fi
printf 'Installed and enabled %s. The active dashboard was not restarted.\n' "$PLUGIN_NAME"
