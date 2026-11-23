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

test("Bubble stays readable, responsive, accessible, and only animates on real activity", { skip: !existsSync(chrome), timeout: 90000 }, () => {
  const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");
  const widths = [360, 768, 1280];

  function render(width, reducedMotion = false, hasActivity = true) {
    const directory = mkdtempSync(join(tmpdir(), "hermes-bubble-css-test-"));
    try {
      const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>
        html, body { margin: 0; min-height: 100%; }
        body { background: white; }
        .chat-frame { position: relative; display: flex; flex-direction: column; gap: 8px; width: 100vw; height: 620px; overflow: hidden; }
        .hermes-chat-bubble-view { min-height: 0; flex: 1; }
        .hermes-chat-xterm-host { height: 100%; width: 100%; visibility: hidden; }
        ${css}
      </style></head><body class="hermesthemeranz-active">
        <main class="chat-frame" data-chat-mode="bubble">
          <div class="htr-mode-switch" role="group" aria-label="Chat view">
            <button type="button" aria-pressed="false">Terminal</button>
            <button type="button" aria-pressed="true">Bubble</button>
          </div>
          <div class="hermes-chat-workspace" hidden><div class="hermes-chat-xterm-host" aria-hidden="true" inert></div></div>
          <div class="hermes-chat-bubble-view">
            <section class="htr-bubble" role="region" aria-label="Hermes chat">
              <div class="htr-transcript">
                <div class="htr-message htr-message-assistant"><span class="htr-message-role">Hermes</span><p>Readable text over a bright background.</p></div>
                <div class="htr-activity" role="status" aria-live="polite"><span>Running a real task</span>${hasActivity ? '<span class="htr-activity-line" aria-hidden="true"></span>' : ""}</div>
              </div>
              <form class="htr-composer"><label for="message">Message Hermes</label><input id="message" type="text"><button type="submit">Send</button></form>
            </section>
          </div>
        </main><pre id="result"></pre><script>
          const q = (selector) => document.querySelector(selector);
          const color = (value) => value.match(/[\\d.]+/g).map(Number);
          const bg = color(getComputedStyle(q('.htr-bubble')).backgroundColor);
          const fg = color(getComputedStyle(q('.htr-bubble')).color);
          const alpha = bg.length > 3 ? bg[3] : 1;
          const composite = bg.slice(0, 3).map((channel) => channel * alpha + 255 * (1 - alpha));
          const luminance = (rgb) => {
            const channels = rgb.map((channel) => channel / 255).map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
            return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
          };
          const l1 = luminance(composite), l2 = luminance(fg.slice(0, 3));
          const buttons = [...document.querySelectorAll('.htr-mode-switch button, .htr-composer input, .htr-composer button')];
          const activityLine = q('.htr-activity-line');
          const line = activityLine ? getComputedStyle(activityLine, '::after') : null;
          const bubbleRect = q('.htr-bubble').getBoundingClientRect();
          const wrapperRect = q('.hermes-chat-bubble-view').getBoundingClientRect();
          q('#message').focus();
          const focusRule = [...document.styleSheets]
            .flatMap((sheet) => [...sheet.cssRules])
            .find((rule) => rule.selectorText?.includes('.htr-bubble input:focus-visible'));
          q('#result').textContent = btoa(JSON.stringify({
            viewport: innerWidth,
            docOverflow: document.documentElement.scrollWidth > innerWidth + 1,
            bubbleOverflow: q('.htr-bubble').scrollWidth > q('.htr-bubble').clientWidth + 1,
            bubbleWidth: q('.htr-bubble').getBoundingClientRect().width,
            bubbleWrapperOffsetTop: bubbleRect.top - wrapperRect.top,
            bubbleWrapperOffsetLeft: bubbleRect.left - wrapperRect.left,
            bubbleWrapperWidthDelta: bubbleRect.width - wrapperRect.width,
            bubbleWrapperHeightDelta: bubbleRect.height - wrapperRect.height,
            minControlHeight: Math.min(...buttons.map((button) => button.getBoundingClientRect().height)),
            contrast: (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05),
            focusOutlineStyle: focusRule?.style.outlineStyle ?? "none",
            focusOutlineWidth: focusRule?.style.outlineWidth ?? "0px",
            focusOutlineColor: focusRule?.style.outlineColor ?? "transparent",
            lineExists: Boolean(activityLine),
            lineAnimation: line?.animationName ?? "none",
            lineDuration: line?.animationDuration ?? "0s",
            lineIterations: line?.animationIterationCount ?? "1",
            reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
          }));
        </script></body></html>`;
      const path = join(directory, "fixture.html");
      writeFileSync(path, html);
      const flags = [
        "--headless", "--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage", "--no-first-run",
        `--window-size=${width},900`, `--user-data-dir=${join(directory, "profile")}`,
      ];
      if (reducedMotion) flags.push("--force-prefers-reduced-motion=reduce");
      const output = execFileSync(chrome, [...flags, "--dump-dom", pathToFileURL(path).href], { encoding: "utf8", timeout: 25000, stdio: ["ignore", "pipe", "ignore"] });
      const match = output.match(/<pre id="result">([A-Za-z0-9+/=]+)<\/pre>/);
      assert.ok(match, "browser did not return the Bubble fixture result");
      return JSON.parse(Buffer.from(match[1], "base64").toString());
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }

  for (const width of widths) {
    const result = render(width);
    assert.equal(result.docOverflow, false, `document overflowed at ${width}px`);
    assert.equal(result.bubbleOverflow, false, `Bubble overflowed at ${width}px`);
    assert.ok(result.bubbleWidth <= result.viewport + 1, `Bubble exceeded ${width}px viewport`);
    assert.ok(Math.abs(result.bubbleWrapperOffsetTop) <= 1, "Bubble must start at the host wrapper, below the mode selector");
    assert.ok(Math.abs(result.bubbleWrapperOffsetLeft) <= 1, "Bubble must align with its host wrapper");
    assert.ok(Math.abs(result.bubbleWrapperWidthDelta) <= 1, "Bubble must fill only its host wrapper");
    assert.ok(Math.abs(result.bubbleWrapperHeightDelta) <= 1, "Bubble must fill only its host wrapper");
    assert.ok(result.minControlHeight >= 44, "mode and composer controls need 44px targets");
    assert.ok(result.contrast >= 4.5, `Bubble text contrast was ${result.contrast}:1 over a bright background`);
    assert.equal(result.focusOutlineStyle, "solid", "keyboard focus needs a visible outline");
    assert.ok(parseFloat(result.focusOutlineWidth) >= 3, "focus outline needs enough width to see");
    assert.match(result.focusOutlineColor, /255/);
    assert.equal(result.lineExists, true);
    assert.notEqual(result.lineAnimation, "none", "real activity should animate the white sweep");
    assert.ok(parseFloat(result.lineDuration) <= 1.5, "activity sweep must be finite and brief");
    assert.equal(result.lineIterations, "1", "activity sweep must not loop");
  }

  const reduced = render(360, true);
  assert.equal(reduced.reduced, true, "Chrome did not enable reduced motion");
  assert.equal(reduced.lineAnimation, "none", "reduced motion must stop the sweep");

  const idle = render(360, false, false);
  assert.equal(idle.lineExists, false, "the sweep must not exist before a real activity event");
  assert.equal(idle.lineAnimation, "none");
});
