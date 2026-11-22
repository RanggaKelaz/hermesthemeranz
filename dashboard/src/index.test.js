import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { installHermesThemeRanz, PLUGIN_NAME } from "./index.js";

const SETTINGS_KEY = "hermesthemeranz:settings";
const ACTIVE_CLASS = "hermesthemeranz-active";

function createRenderer(runtime) {
  let cursor = 0;
  let state = [];
  let effects = [];
  let cleanups = [];

  const hooks = {
    useState(initial) {
      const index = cursor++;
      if (!(index in state)) {
        state[index] = typeof initial === "function" ? initial() : initial;
      }
      return [
        state[index],
        (next) => {
          state[index] = typeof next === "function" ? next(state[index]) : next;
        },
      ];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = { current: initial };
      return state[index];
    },
    useEffect(effect) {
      effects.push(effect);
    },
    useCallback(callback) {
      return callback;
    },
    useMemo(factory) {
      return factory();
    },
  };

  function render(Component) {
    cursor = 0;
    effects = [];
    const previousHooks = runtime.hookContext.current;
    runtime.hookContext.current = hooks;
    let tree;
    try {
      tree = Component();
    } finally {
      runtime.hookContext.current = previousHooks;
    }
    cleanups.forEach((cleanup) => cleanup());
    cleanups = effects
      .map((effect) => effect())
      .filter((cleanup) => typeof cleanup === "function");
    return tree;
  }

  function unmount() {
    cleanups.forEach((cleanup) => cleanup());
    cleanups = [];
  }

  return { render, unmount };
}

function createRuntime({ bridge, settings, reducedMotion = false } = {}) {
  const registrations = [];
  const classNames = new Set();
  const storage = new Map();
  if (settings) storage.set(SETTINGS_KEY, JSON.stringify(settings));
  const classList = {
    add(name) {
      classNames.add(name);
    },
    remove(name) {
      classNames.delete(name);
    },
    contains(name) {
      return classNames.has(name);
    },
    toggle(name, force) {
      const next = force === undefined ? !classNames.has(name) : Boolean(force);
      if (next) classNames.add(name);
      else classNames.delete(name);
      return next;
    },
  };
  const React = {
    createElement(type, props, ...children) {
      return {
        type,
        props: props ?? {},
        children: children.flat(Infinity).filter((child) => child != null && child !== false),
      };
    },
  };
  const hookContext = { current: null };
  const hooks = Object.fromEntries(
    ["useState", "useRef", "useEffect", "useCallback", "useMemo"].map((name) => [
      name,
      (...args) => hookContext.current[name](...args),
    ]),
  );
  const sdk = {
    React,
    hooks,
    chat: bridge ? { sendToActiveChat: bridge } : undefined,
  };
  const windowObject = {
    __HERMES_PLUGIN_SDK__: sdk,
    __HERMES_PLUGINS__: {
      register: (...args) => registrations.push(["tab", ...args]),
      registerSlot: (...args) => registrations.push(["slot", ...args]),
    },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
    },
    matchMedia: () => ({
      matches: reducedMotion,
      addEventListener() {},
      removeEventListener() {},
    }),
  };
  const documentObject = { body: { classList } };
  return {
    registrations,
    storage,
    windowObject,
    documentObject,
    classNames,
    hookContext,
  };
}

function registeredComponent(runtime, slot) {
  const entry = runtime.registrations.find(
    ([kind, plugin, registeredSlot]) =>
      kind === "slot" && plugin === PLUGIN_NAME && registeredSlot === slot,
  );
  assert.ok(entry, `expected ${slot} slot registration`);
  return entry[3];
}

function findElement(node, predicate) {
  if (!node || typeof node !== "object") return undefined;
  if (predicate(node)) return node;
  for (const child of node.children ?? []) {
    const match = findElement(child, predicate);
    if (match) return match;
  }
  return undefined;
}

test("registers only the dashboard backdrop slot", () => {
  const runtime = createRuntime();
  installHermesThemeRanz(runtime);

  assert.deepEqual(
    runtime.registrations.map(([, plugin, slot]) => [plugin, slot]),
    [[PLUGIN_NAME, "backdrop"]],
  );
});

test("enables the theme by default and removes its marker when unloaded", () => {
  const runtime = createRuntime();
  installHermesThemeRanz(runtime);
  const Backdrop = registeredComponent(runtime, "backdrop");
  const renderer = createRenderer(runtime);

  const tree = renderer.render(Backdrop);
  assert.equal(runtime.classNames.has(ACTIVE_CLASS), true);
  assert.equal(
    findElement(tree, (element) => element.type === "div")?.props["data-motion"],
    "animated",
  );
  renderer.unmount();
  assert.equal(runtime.classNames.has(ACTIVE_CLASS), false);
});

test("keeps the theme active despite stale disabled and paused settings", () => {
  const runtime = createRuntime({ settings: { enabled: false, paused: true } });
  installHermesThemeRanz(runtime);
  const Backdrop = registeredComponent(runtime, "backdrop");
  const renderer = createRenderer(runtime);
  const tree = renderer.render(Backdrop);

  assert.equal(runtime.classNames.has(ACTIVE_CLASS), true);
  assert.equal(
    findElement(tree, (element) => element.type === "div")?.props["data-motion"],
    "animated",
  );
  assert.equal(runtime.storage.get(SETTINGS_KEY), JSON.stringify({ enabled: false, paused: true }));
  renderer.unmount();
  assert.equal(runtime.classNames.has(ACTIVE_CLASS), false);
});

test("reduced motion selects the still image", () => {
  const runtime = createRuntime({ reducedMotion: true });
  installHermesThemeRanz(runtime);
  const Backdrop = registeredComponent(runtime, "backdrop");
  const tree = createRenderer(runtime).render(Backdrop);

  assert.equal(
    findElement(tree, (element) => element.type === "div")?.props["data-motion"],
    "still",
  );
});

test("manifest and stylesheet retain only the dashboard backdrop styling", () => {
  const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
  const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");

  assert.equal(manifest.name, PLUGIN_NAME);
  assert.equal(manifest.tab.hidden, true);
  assert.deepEqual(manifest.slots, ["backdrop"]);
  assert.match(css, /--theme-font-sans:\s*"Nunito Sans"/);
  assert.match(css, /color-mix\(in srgb, var\(--theme-terminal-background/);
  assert.doesNotMatch(css, /\.htr-composer|\.htr-control/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(css, /\.xterm-viewport|\.xterm-screen/);
});
