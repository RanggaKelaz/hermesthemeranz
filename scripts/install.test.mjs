import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

const repo = resolve(new URL("..", import.meta.url).pathname);

function writeExecutable(path, content) {
  writeFileSync(path, content);
  chmodSync(path, 0o755);
}

function makeArchive(root, { bundle = true, symlink = false } = {}) {
  const packageRoot = join(root, "archive-source", "hermesthemeranz-main", "dashboard");
  mkdirSync(join(packageRoot, "dist"), { recursive: true });
  mkdirSync(join(packageRoot, "assets"), { recursive: true });
  writeFileSync(join(packageRoot, "manifest.json"), JSON.stringify({
    name: "hermesthemeranz",
    entry: "dist/index.js",
    css: "dist/style.css",
    slots: ["backdrop", "chat:top", "chat:surface"],
  }));
  if (bundle) {
    writeFileSync(join(packageRoot, "dist", "index.js"), "window.pluginInstalled = true;\n");
    writeFileSync(join(packageRoot, "dist", "style.css"), ".plugin-installed {}\n");
    writeFileSync(join(packageRoot, "assets", "blackhole-binary-nasa.gif"), "gif");
  }
  if (symlink) symlinkSync("../../outside", join(packageRoot, "escape"));
  const archive = join(root, "plugin.tar.gz");
  execFileSync("tar", ["-czf", archive, "-C", join(root, "archive-source"), "hermesthemeranz-main"]);
  return archive;
}

function setup(root, { compatible = true, bundle = true, symlink = false, existing = true } = {}) {
  const bin = join(root, "bin");
  const hermesRoot = join(root, "hermes-package");
  const hermesBin = join(hermesRoot, "bin");
  const home = join(root, "hermes-home");
  mkdirSync(bin, { recursive: true });
  mkdirSync(hermesBin, { recursive: true });
  mkdirSync(join(hermesRoot, "hermes_cli", "web_dist"), { recursive: true });
  mkdirSync(home, { recursive: true });
  writeFileSync(
    join(hermesRoot, "hermes_cli", "web_dist", "index.js"),
    compatible ? "const sdk = {chatBridgeVersion:1};\n" : "const sdk = {chatBridgeVersion:0};\n",
  );
  writeFileSync(join(hermesRoot, "hermes_cli", "web_dist", "index.html"), '<script src="index.js"></script>\n');
  const hostBundle = readFileSync(join(hermesRoot, "hermes_cli", "web_dist", "index.js"), "utf8");
  const commandLog = join(root, "hermes-commands.log");
  const curlLog = join(root, "curl.log");
  const archive = makeArchive(root, { bundle, symlink });

  writeExecutable(join(hermesBin, "hermes"), "#!/bin/sh\nprintf '%s\\n' \"$*\" >> \"$HERMES_COMMAND_LOG\"\n");
  writeExecutable(join(bin, "hermes"), `#!/bin/sh\nexec ${join(hermesBin, "hermes")} "$@"\n`);
  writeExecutable(join(bin, "curl"), [
    "#!/bin/sh",
    "printf '%s\\n' \"$*\" >> \"$CURL_LOG\"",
    "out=",
    "while [ \"$#\" -gt 0 ]; do",
    "  if [ \"$1\" = '-o' ]; then shift; out=$1; fi",
    "  shift",
    "done",
    "[ -n \"$out\" ] || exit 2",
    "cp \"$PLUGIN_ARCHIVE\" \"$out\"",
    "if [ -n \"$CURL_SYMLINK_PLUGINS\" ]; then mkdir -p \"$CURL_SYMLINK_TARGET\"; ln -s \"$CURL_SYMLINK_TARGET\" \"$CURL_SYMLINK_PLUGINS\"; fi",
    "",
  ].join("\n"));

  if (existing) {
    mkdirSync(join(home, "plugins", "hermesthemeranz"), { recursive: true });
    writeFileSync(join(home, "plugins", "hermesthemeranz", "old-plugin.txt"), "keep this plugin\n");
    writeFileSync(join(home, "config.yaml"), "plugins:\n  enabled: [existing-plugin]\n");
  }

  return {
    archive,
    bin,
    hermesBin,
    commandLog,
    curlLog,
    home,
    hostBundle,
    hostBundlePath: join(hermesRoot, "hermes_cli", "web_dist", "index.js"),
    root,
  };
}

function runInstaller(context, extraEnv = {}) {
  const env = {
    ...process.env,
    PATH: `${context.bin}:${context.hermesBin}:/usr/local/bin:/usr/bin:/bin`,
    HOME: context.root,
    HERMES_HOME: context.home,
    HERMES_COMMAND_LOG: context.commandLog,
    CURL_LOG: context.curlLog,
    PLUGIN_ARCHIVE: context.archive,
    ...extraEnv,
  };
  return spawnSync("bash", [join(repo, "install.sh")], { env, encoding: "utf8", timeout: 30000 });
}

test("stops on an incompatible host before writing, downloading, or enabling", () => {
  const root = mkdtempSync(join(tmpdir(), "hermesthemeranz-installer-incompatible-"));
  try {
    const context = setup(root, { compatible: false, existing: false });
    const result = runInstaller(context);
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(`${result.stdout}\n${result.stderr}`, /chatBridgeVersion|compatible host/i);
    assert.equal(existsSync(context.curlLog), false, "must check compatibility before downloading");
    assert.equal(existsSync(join(context.home, "plugins")), false, "must not create the plugins directory");
    assert.equal(existsSync(context.commandLog), false, "must not invoke Hermes on an incompatible host");
    assert.equal(readFileSync(context.hostBundlePath, "utf8"), context.hostBundle, "must not change web_dist");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("checks compatibility only in JavaScript bundles referenced by index.html", () => {
  const root = mkdtempSync(join(tmpdir(), "hermesthemeranz-installer-unreferenced-marker-"));
  try {
    const context = setup(root, { compatible: false, existing: false });
    writeFileSync(join(context.hostBundlePath, "../unreferenced.js"), "const stale = {chatBridgeVersion:1};\n");
    const result = runInstaller(context);
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(`${result.stdout}\n${result.stderr}`, /chatBridgeVersion|compatible host/i);
    assert.equal(existsSync(context.curlLog), false, "an unreferenced marker must not pass compatibility validation");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("refuses a plugins symlink before invoking curl", () => {
  const root = mkdtempSync(join(tmpdir(), "hermesthemeranz-installer-plugins-symlink-"));
  try {
    const context = setup(root, { existing: false });
    const outside = join(root, "outside");
    mkdirSync(outside);
    symlinkSync(outside, join(context.home, "plugins"));
    const result = runInstaller(context);
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(`${result.stdout}\n${result.stderr}`, /plugins.*symbolic link/i);
    assert.equal(existsSync(context.curlLog), false, "curl must not run when plugins is already a symlink");
    assert.deepEqual(readdirSync(outside), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rechecks plugins for a symlink created while downloading", () => {
  const root = mkdtempSync(join(tmpdir(), "hermesthemeranz-installer-symlink-race-"));
  try {
    const context = setup(root, { existing: false });
    const outside = join(root, "outside");
    const plugins = join(context.home, "plugins");
    const result = runInstaller(context, {
      CURL_SYMLINK_PLUGINS: plugins,
      CURL_SYMLINK_TARGET: outside,
    });
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(`${result.stdout}\n${result.stderr}`, /plugins.*symbolic link/i);
    assert.equal(existsSync(context.curlLog), true, "the test creates the symlink from the curl stub");
    assert.deepEqual(readdirSync(outside), [], "must not stage through a symlink created during download");
    assert.equal(existsSync(context.commandLog), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("keeps same-name plugin and config backups unique across installs", () => {
  const root = mkdtempSync(join(tmpdir(), "hermesthemeranz-installer-backups-"));
  try {
    const context = setup(root);
    const first = runInstaller(context);
    assert.equal(first.status, 0, `${first.stdout}\n${first.stderr}`);
    assert.equal(readFileSync(join(context.home, "plugins", "hermesthemeranz", "dist", "index.js"), "utf8"), "window.pluginInstalled = true;\n");
    assert.equal(readFileSync(join(context.home, "config.yaml"), "utf8"), "plugins:\n  enabled: [existing-plugin]\n");

    writeFileSync(join(context.home, "plugins", "hermesthemeranz", "dist", "index.js"), "first install\n");
    const second = runInstaller(context);
    assert.equal(second.status, 0, `${second.stdout}\n${second.stderr}`);

    const pluginDirNames = readdirSync(join(context.home, "plugins"));
    const pluginBackups = pluginDirNames.filter((name) => name.startsWith("hermesthemeranz.backup."));
    const configBackups = readdirSync(context.home).filter((name) => name.startsWith("config.yaml.backup."));
    assert.equal(pluginBackups.length, 2, "each previous plugin tree must remain in a unique backup");
    assert.equal(configBackups.length, 2, "each previous config must remain in a unique backup");
    assert.equal(new Set(pluginBackups).size, pluginBackups.length);
    assert.equal(new Set(configBackups).size, configBackups.length);
    assert.ok(pluginBackups.some((name) => existsSync(join(context.home, "plugins", name, "old-plugin.txt")) && readFileSync(join(context.home, "plugins", name, "old-plugin.txt"), "utf8") === "keep this plugin\n"));
    assert.ok(pluginBackups.some((name) => existsSync(join(context.home, "plugins", name, "dist", "index.js")) && readFileSync(join(context.home, "plugins", name, "dist", "index.js"), "utf8") === "first install\n"));
    assert.ok(configBackups.every((name) => readFileSync(join(context.home, name), "utf8") === "plugins:\n  enabled: [existing-plugin]\n"));
    assert.deepEqual(readFileSync(context.hostBundlePath, "utf8"), context.hostBundle);
    assert.deepEqual(readFileSync(context.commandLog, "utf8").trim().split("\n"), [
      "plugins enable hermesthemeranz",
      "plugins enable hermesthemeranz",
    ]);
    assert.equal(readFileSync(context.curlLog, "utf8").trim().split("\n").length, 2);
    assert.match(readFileSync(context.curlLog, "utf8"), /--proto =https .*--proto-redir =https/);
    assert.doesNotMatch(readFileSync(join(repo, "install.sh"), "utf8"), /\bsudo\b/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects an archive without built dashboard files before touching existing files", () => {
  const root = mkdtempSync(join(tmpdir(), "hermesthemeranz-installer-no-dist-"));
  try {
    const context = setup(root, { bundle: false });
    const result = runInstaller(context);
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(`${result.stdout}\n${result.stderr}`, /dist|bundle|built|incomplete/i);
    assert.equal(readFileSync(join(context.home, "plugins", "hermesthemeranz", "old-plugin.txt"), "utf8"), "keep this plugin\n");
    assert.equal(readFileSync(join(context.home, "config.yaml"), "utf8"), "plugins:\n  enabled: [existing-plugin]\n");
    assert.deepEqual(readdirSync(join(context.home, "plugins")), ["hermesthemeranz"]);
    assert.equal(existsSync(context.commandLog), false, "must not enable an invalid archive");
    assert.equal(readFileSync(context.hostBundlePath, "utf8"), context.hostBundle);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects archive symlinks before replacing the existing plugin", () => {
  const root = mkdtempSync(join(tmpdir(), "hermesthemeranz-installer-symlink-"));
  try {
    const context = setup(root, { symlink: true });
    const result = runInstaller(context);
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(`${result.stdout}\n${result.stderr}`, /link|special file/i);
    assert.equal(readFileSync(join(context.home, "plugins", "hermesthemeranz", "old-plugin.txt"), "utf8"), "keep this plugin\n");
    assert.equal(readFileSync(join(context.home, "config.yaml"), "utf8"), "plugins:\n  enabled: [existing-plugin]\n");
    assert.deepEqual(readdirSync(join(context.home, "plugins")), ["hermesthemeranz"]);
    assert.equal(existsSync(context.commandLog), false, "must not enable a package containing a symlink");
    assert.equal(readFileSync(context.hostBundlePath, "utf8"), context.hostBundle);
    assert.equal(existsSync(join(root, "archive-source", "outside")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
