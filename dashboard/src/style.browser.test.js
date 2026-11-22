import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const chrome = process.env.CHROME_BIN || "/usr/bin/google-chrome";

test("theme hides legacy host controls without hiding the terminal", { skip: !existsSync(chrome), timeout: 30000 }, () => {
  const directory = mkdtempSync(join(tmpdir(), "hermes-theme-css-test-"));
  try {
    const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");
    const html = `<!doctype html><html><head><style>
      [data-layout-variant]:has([data-chat-active="true"] .hermes-chat-scene[data-blackhole]) {
        background-image: linear-gradient(black, blue);
      }
      ${css}
    </style></head><body>
      <div data-layout-variant="standard"><div data-chat-active="true">
        <div class="hermes-chat-scene" data-blackhole="true">
          <div class="hermes-chat-workspace">
            <div id="legacy-controls"><button id="chat-composer-toggle">Logo</button>
              <button aria-label="Pause black hole animation">Jeda animasi</button>
              <button aria-label="Play black hole animation">Putar animasi</button></div>
            <aside id="chat-composer-panel">Composer</aside>
            <div class="hermes-chat-xterm-host" style="height:40px">Terminal asli</div>
          </div>
        </div>
      </div></div><pre id="result"></pre>
      <script>
        const q = (selector) => document.querySelector(selector);
        const state = () => ({
          controls: getComputedStyle(q('#legacy-controls')).display,
          composer: getComputedStyle(q('#chat-composer-panel')).display,
          terminalHeight: q('.hermes-chat-xterm-host').getBoundingClientRect().height,
          hostBackground: getComputedStyle(q('[data-layout-variant]')).backgroundImage,
        });
        const before = state();
        document.body.classList.add('hermesthemeranz-active');
        const active = state();
        document.body.classList.remove('hermesthemeranz-active');
        q('#result').textContent = btoa(JSON.stringify({before, active, after: state()}));
      </script></body></html>`;
    const path = join(directory, "fixture.html");
    writeFileSync(path, html);
    const output = execFileSync(chrome, ["--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--no-first-run", `--user-data-dir=${join(directory, "profile")}`, "--dump-dom", pathToFileURL(path).href], { encoding: "utf8", timeout: 25000, stdio: ["ignore", "pipe", "ignore"] });
    const match = output.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/);
    assert.ok(match, "browser did not return the fixture result");
    const { before, active, after } = JSON.parse(Buffer.from(match[1], "base64").toString());
    assert.notEqual(before.controls, "none");
    assert.notEqual(before.composer, "none");
    assert.notEqual(before.hostBackground, "none");
    assert.equal(active.controls, "none");
    assert.equal(active.composer, "none");
    assert.equal(active.hostBackground, "none");
    assert.ok(active.terminalHeight > 0);
    assert.deepEqual(after, before);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
