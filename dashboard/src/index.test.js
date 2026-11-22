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

test("registers only the three approved dashboard slots", () => {
  const runtime = createRuntime();
  installHermesThemeRanz(runtime);

  assert.deepEqual(
    runtime.registrations.map(([, plugin, slot]) => [plugin, slot]),
    [
      [PLUGIN_NAME, "backdrop"],
      [PLUGIN_NAME, "header-right"],
      [PLUGIN_NAME, "chat:top"],
    ],
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

test("sends only after explicit submit and clears the draft after success", () => {
  const sent = [];
  const runtime = createRuntime({ bridge: (text) => (sent.push(text), true) });
  installHermesThemeRanz(runtime);
  const ChatTop = registeredComponent(runtime, "chat:top");
  const renderer = createRenderer(runtime);

  let tree = renderer.render(ChatTop);
  assert.deepEqual(sent, []);
  findElement(tree, (element) => element.props["aria-controls"] === "hermesthemeranz-composer")
    .props.onClick();
  tree = renderer.render(ChatTop);
  const input = findElement(tree, (element) => element.type === "input");
  input.props.onChange({ currentTarget: { value: "hello  " } });
  tree = renderer.render(ChatTop);
  const form = findElement(tree, (element) => element.type === "form");
  let prevented = false;
  form.props.onSubmit({ preventDefault: () => (prevented = true) });

  assert.equal(prevented, true);
  assert.deepEqual(sent, ["hello  "]);
  tree = renderer.render(ChatTop);
  assert.equal(findElement(tree, (element) => element.type === "input")?.props.value, "");
});

test("Enter during IME composition never submits", () => {
  const sent = [];
  const runtime = createRuntime({ bridge: (text) => (sent.push(text), true) });
  installHermesThemeRanz(runtime);
  const ChatTop = registeredComponent(runtime, "chat:top");
  const renderer = createRenderer(runtime);
  let tree = renderer.render(ChatTop);
  findElement(tree, (element) => element.props["aria-controls"] === "hermesthemeranz-composer")
    .props.onClick();
  tree = renderer.render(ChatTop);
  const input = findElement(tree, (element) => element.type === "input");
  let prevented = false;
  input.props.onKeyDown({
    key: "Enter",
    keyCode: 229,
    isComposing: true,
    preventDefault: () => (prevented = true),
  });

  assert.equal(prevented, true);
  assert.deepEqual(sent, []);
});

test("keeps the draft and explains missing or unready host bridges", () => {
  for (const bridge of [undefined, () => false]) {
    const runtime = createRuntime({ bridge });
    installHermesThemeRanz(runtime);
    const ChatTop = registeredComponent(runtime, "chat:top");
    const renderer = createRenderer(runtime);
    let tree = renderer.render(ChatTop);
    findElement(tree, (element) => element.props["aria-controls"] === "hermesthemeranz-composer")
      .props.onClick();
    tree = renderer.render(ChatTop);
    const input = findElement(tree, (element) => element.type === "input");
    input.props.onChange({ currentTarget: { value: "keep this" } });
    tree = renderer.render(ChatTop);
    findElement(tree, (element) => element.type === "form").props.onSubmit({
      preventDefault() {},
    });
    tree = renderer.render(ChatTop);

    assert.equal(findElement(tree, (element) => element.type === "input")?.props.value, "keep this");
    assert.match(JSON.stringify(tree), /bridge|koneksi|dukungan/i);
    if (!bridge) {
      assert.equal(
        findElement(tree, (element) => element.type === "button" && element.props.type === "submit")
          ?.props.disabled,
        true,
      );
    }
  }
});

test("stores enabled and paused choices locally and restores the legacy UI when disabled", () => {
  const runtime = createRuntime();
  installHermesThemeRanz(runtime);
  const Header = registeredComponent(runtime, "header-right");
  const headerRenderer = createRenderer(runtime);
  const initial = headerRenderer.render(Header);
  const buttons = initial.children.filter((element) => element.type === "button");
  assert.equal(buttons.length, 2);

  buttons[1].props.onClick();
  const stored = JSON.parse(runtime.storage.get(SETTINGS_KEY));
  assert.equal(stored.paused, true);
  const backdropRenderer = createRenderer(runtime);
  const Backdrop = registeredComponent(runtime, "backdrop");
  const paused = backdropRenderer.render(Backdrop);
  assert.equal(
    findElement(paused, (element) => element.type === "div")?.props["data-motion"],
    "still",
  );

  const refreshedHeader = headerRenderer.render(Header);
  findElement(refreshedHeader, (element) => element.props["aria-label"] === "Nonaktifkan tema")
    .props.onClick();
  assert.equal(JSON.parse(runtime.storage.get(SETTINGS_KEY)).enabled, false);
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

test("manifest is slot-only and CSS keeps focus, touch targets, and narrow layouts", () => {
  const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
  const css = readFileSync(new URL("./style.css", import.meta.url), "utf8");

  assert.equal(manifest.name, PLUGIN_NAME);
  assert.equal(manifest.tab.hidden, true);
  assert.deepEqual(manifest.slots, ["backdrop", "header-right", "chat:top"]);
  assert.match(css, /:focus-visible/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(css, /@media\s*\(max-width:/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(css, /hermes-chat-xterm-host|\.xterm/);
});
