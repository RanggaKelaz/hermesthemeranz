import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { installHermesThemeRanz, PLUGIN_NAME } from "./index.js";

const SETTINGS_KEY = "hermesthemeranz:settings";
const MODE_KEY = "hermesthemeranz:chat-mode";
const ACTIVE_CLASS = "hermesthemeranz-active";

function createRenderer(runtime) {
  let cursor = 0;
  let state = [];
  let effects = [];
  let hookDeps = [];
  const cleanups = new Map();

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
    useEffect(effect, deps) {
      const index = cursor++;
      const previous = hookDeps[index];
      const changed =
        !deps ||
        !previous ||
        deps.length !== previous.length ||
        deps.some((value, i) => !Object.is(value, previous[i]));
      if (changed) {
        hookDeps[index] = deps;
        effects.push({ index, effect });
      }
    },
    useCallback(callback) {
      cursor++;
      return callback;
    },
    useMemo(factory) {
      cursor++;
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
    for (const { index, effect } of effects) {
      cleanups.get(index)?.();
      const cleanup = effect();
      if (typeof cleanup === "function") cleanups.set(index, cleanup);
      else cleanups.delete(index);
    }
    return tree;
  }

  function unmount() {
    cleanups.forEach((cleanup) => cleanup());
    cleanups.clear();
  }

  return { render, unmount };
}

function createRuntime({ bridge, chat, api, settings, chatMode, reducedMotion = false } = {}) {
  const registrations = [];
  const classNames = new Set();
  const storage = new Map();
  if (settings) storage.set(SETTINGS_KEY, JSON.stringify(settings));
  if (chatMode !== undefined) storage.set(MODE_KEY, String(chatMode));
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
    api: api ?? {},
    chat: chat ?? (bridge ? { sendToActiveChat: bridge } : undefined),
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
    api: sdk.api,
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

function allText(node) {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object") return "";
  return (node.children ?? []).map(allText).join("");
}

function chatStub({ session, sendResult = true } = {}) {
  const listeners = new Set();
  const sent = [];
  const modes = [];
  return {
    sent,
    modes,
    publish(update) {
      for (const listener of listeners) listener(update);
    },
    api: null,
    chat: {
      chatBridgeVersion: 1,
      getActiveChatSession: () => session ?? null,
      subscribeActiveChat(listener) {
        listeners.add(listener);
        listener({ kind: "session", session: session ?? null });
        listener({ kind: "feed-state", state: "open" });
        listener({ kind: "mode", mode: "bubble" });
        return () => listeners.delete(listener);
      },
      setChatViewMode(mode) {
        modes.push(mode);
        for (const listener of listeners) listener({ kind: "mode", mode });
      },
      sendToActiveChat(text) {
        sent.push(text);
        return sendResult;
      },
    },
  };
}

test("registers the backdrop, chat mode selector, and bubble surface slots", () => {
  const runtime = createRuntime();
  installHermesThemeRanz(runtime);

  assert.deepEqual(
    runtime.registrations.map(([, plugin, slot]) => [plugin, slot]),
    [
      [PLUGIN_NAME, "backdrop"],
      [PLUGIN_NAME, "chat:top"],
      [PLUGIN_NAME, "chat:surface"],
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
  assert.deepEqual(manifest.slots, ["backdrop", "chat:top", "chat:surface"]);
  assert.match(css, /--theme-font-sans:\s*"Nunito Sans"/);
  assert.match(css, /color-mix\(in srgb, var\(--theme-terminal-background/);
  assert.match(css, /\.htr-composer/);
  assert.doesNotMatch(css, /\.htr-control/);
  assert.match(css, /prefers-reduced-motion/);
  assert.doesNotMatch(css, /\.xterm-viewport|\.xterm-screen/);
});

test("defaults to Terminal and persists the Bubble mode choice", () => {
  const stub = chatStub();
  const runtime = createRuntime({ chat: stub.chat });
  installHermesThemeRanz(runtime);
  stub.modes.length = 0;
  const ModeSelector = registeredComponent(runtime, "chat:top");
  const renderer = createRenderer(runtime);
  const tree = renderer.render(ModeSelector);
  const terminalButton = findElement(
    tree,
    (element) => element.type === "button" && allText(element) === "Terminal",
  );
  const bubbleButton = findElement(
    tree,
    (element) => element.type === "button" && allText(element) === "Bubble",
  );

  assert.equal(tree.props.role, "group");
  assert.equal(tree.props["aria-label"], "Chat view");
  assert.equal(terminalButton?.props.type, "button");
  assert.equal(bubbleButton?.props.type, "button");
  assert.equal(terminalButton?.props["aria-pressed"], true);
  assert.equal(bubbleButton?.props["aria-pressed"], false);
  bubbleButton?.props.onClick();
  assert.equal(runtime.storage.get(MODE_KEY), "bubble");
  assert.deepEqual(stub.modes, ["bubble"]);
});

test("shows the welcome message only after an empty session is confirmed", async () => {
  const session = { channel: "test-channel", profile: "test-profile", storedSessionId: "empty-session" };
  let resolveHistory;
  const runtime = createRuntime({
    chatMode: "bubble",
    api: {
      getSessionMessages: () => new Promise((resolve) => { resolveHistory = resolve; }),
    },
    chat: chatStub({ session }).chat,
  });
  runtime.windowObject.__HERMES_PLUGIN_SDK__.api = runtime.api;
  installHermesThemeRanz(runtime);
  const BubbleSurface = registeredComponent(runtime, "chat:surface");
  const renderer = createRenderer(runtime);

  let tree = renderer.render(BubbleSurface);
  assert.doesNotMatch(allText(tree), /Welcome to Hermes/);
  tree = renderer.render(BubbleSurface);
  assert.doesNotMatch(allText(tree), /Welcome to Hermes/);
  resolveHistory({ session_id: "empty-session", messages: [] });
  await Promise.resolve();
  tree = renderer.render(BubbleSurface);
  assert.match(allText(tree), /Welcome to Hermes/);
  renderer.unmount();
});

test("submits Bubble composer text through the active chat writer", async () => {
  const session = { channel: "test-channel", profile: "test-profile", storedSessionId: "empty-session" };
  const stub = chatStub({ session });
  const runtime = createRuntime({
    chatMode: "bubble",
    api: { getSessionMessages: async () => ({ session_id: "empty-session", messages: [] }) },
    chat: stub.chat,
  });
  runtime.windowObject.__HERMES_PLUGIN_SDK__.api = runtime.api;
  installHermesThemeRanz(runtime);
  const BubbleSurface = registeredComponent(runtime, "chat:surface");
  const renderer = createRenderer(runtime);

  renderer.render(BubbleSurface);
  await Promise.resolve();
  let tree = renderer.render(BubbleSurface);
  await Promise.resolve();
  tree = renderer.render(BubbleSurface);
  const input = findElement(tree, (element) => element.type === "input");
  const transcript = findElement(tree, (element) => element.props?.role === "log");
  const label = findElement(tree, (element) => element.type === "label" && element.props.htmlFor === input?.props.id);
  assert.equal(transcript?.props["aria-label"], "Conversation");
  assert.equal(transcript?.props["aria-live"], "off");
  assert.equal(label && allText(label), "Message Hermes");
  assert.equal(input?.props["aria-label"], "Message Hermes");
  input?.props.onChange({ currentTarget: { value: "Hello Hermes" } });
  tree = renderer.render(BubbleSurface);
  const form = findElement(tree, (element) => element.type === "form");
  form?.props.onSubmit({ preventDefault() {} });

  assert.deepEqual(stub.sent, ["Hello Hermes"]);
  renderer.unmount();
});

test("keeps an accepted prompt visible until history returns its stable message identity", async () => {
  const session = { channel: "test-channel", profile: "test-profile", storedSessionId: "active-session" };
  const stub = chatStub({ session });
  let historyCalls = 0;
  let resolveHistory;
  const runtime = createRuntime({
    chatMode: "bubble",
    api: {
      getSessionMessages: () => {
        historyCalls += 1;
        if (historyCalls === 1) return Promise.resolve({ session_id: "active-session", messages: [] });
        return new Promise((resolve) => { resolveHistory = resolve; });
      },
    },
    chat: stub.chat,
  });
  runtime.windowObject.__HERMES_PLUGIN_SDK__.api = runtime.api;
  installHermesThemeRanz(runtime);
  const BubbleSurface = registeredComponent(runtime, "chat:surface");
  const renderer = createRenderer(runtime);

  renderer.render(BubbleSurface);
  await Promise.resolve();
  renderer.render(BubbleSurface);
  const input = findElement(renderer.render(BubbleSurface), (element) => element.type === "input");
  input?.props.onChange({ currentTarget: { value: "Accepted prompt" } });
  let tree = renderer.render(BubbleSurface);
  findElement(tree, (element) => element.type === "form")?.props.onSubmit({ preventDefault() {} });

  tree = renderer.render(BubbleSurface);
  assert.match(allText(tree), /Accepted prompt/);
  assert.ok(findElement(tree, (element) => element.props?.className?.includes("htr-message-pending")));
  assert.deepEqual(stub.sent, ["Accepted prompt"]);

  stub.publish({ kind: "event", event: { type: "message.complete", payload: {} } });
  renderer.render(BubbleSurface);
  resolveHistory({
    session_id: "active-session",
    messages: [{ role: "user", content: "Accepted prompt", message_uid: "persisted-user-1" }],
  });
  await new Promise((resolve) => setImmediate(resolve));
  tree = renderer.render(BubbleSurface);

  assert.equal((allText(tree).match(/Accepted prompt/g) ?? []).length, 1);
  assert.equal(findElement(tree, (element) => element.props?.className?.includes("htr-message-pending")), undefined);
  renderer.unmount();
});

test("Bubble composer is single-line and normalizes pasted newlines to one command", async () => {
  const session = { channel: "test-channel", profile: "test-profile", storedSessionId: "empty-session" };
  const stub = chatStub({ session });
  const runtime = createRuntime({
    chatMode: "bubble",
    api: { getSessionMessages: async () => ({ session_id: "empty-session", messages: [] }) },
    chat: stub.chat,
  });
  runtime.windowObject.__HERMES_PLUGIN_SDK__.api = runtime.api;
  installHermesThemeRanz(runtime);
  const BubbleSurface = registeredComponent(runtime, "chat:surface");
  const renderer = createRenderer(runtime);

  renderer.render(BubbleSurface);
  await Promise.resolve();
  let tree = renderer.render(BubbleSurface);
  await Promise.resolve();
  tree = renderer.render(BubbleSurface);
  const input = findElement(tree, (element) => element.type === "input");
  assert.equal(input?.props.type, "text");
  input?.props.onChange({ currentTarget: { value: "first\nsecond" } });
  tree = renderer.render(BubbleSurface);
  const form = findElement(tree, (element) => element.type === "form");
  form?.props.onSubmit({ preventDefault() {} });

  assert.deepEqual(stub.sent, ["first second"]);
  renderer.unmount();
});

test("offers a Terminal fallback when history cannot be loaded", async () => {
  const session = { channel: "test-channel", profile: "test-profile", storedSessionId: "broken-session" };
  const stub = chatStub({ session });
  const runtime = createRuntime({
    chatMode: "bubble",
    api: { getSessionMessages: async () => { throw new Error("history unavailable"); } },
    chat: stub.chat,
  });
  runtime.windowObject.__HERMES_PLUGIN_SDK__.api = runtime.api;
  installHermesThemeRanz(runtime);
  const BubbleSurface = registeredComponent(runtime, "chat:surface");
  const renderer = createRenderer(runtime);

  renderer.render(BubbleSurface);
  await Promise.resolve();
  let tree = renderer.render(BubbleSurface);
  await Promise.resolve();
  tree = renderer.render(BubbleSurface);
  assert.match(allText(tree), /could not load chat history/i);
  const fallback = findElement(
    tree,
    (element) => element.type === "button" && allText(element) === "Switch to Terminal",
  );
  assert.ok(fallback);
  fallback.props.onClick();
  assert.equal(runtime.storage.get(MODE_KEY), "terminal");
  assert.deepEqual(stub.modes.at(-1), "terminal");
  renderer.unmount();
});

test("shows real tool progress without inventing a percentage or exposing tool data", () => {
  const session = { channel: "test-channel", profile: "test-profile", storedSessionId: "active-session" };
  const listeners = new Set();
  const chat = chatStub({ session }).chat;
  chat.subscribeActiveChat = (listener) => {
    listeners.add(listener);
    listener({ kind: "session", session });
    listener({ kind: "feed-state", state: "open" });
    listener({ kind: "mode", mode: "bubble" });
    return () => listeners.delete(listener);
  };
  const runtime = createRuntime({
    chatMode: "bubble",
    api: { getSessionMessages: async () => ({ session_id: "active-session", messages: [] }) },
    chat,
  });
  runtime.windowObject.__HERMES_PLUGIN_SDK__.api = runtime.api;
  installHermesThemeRanz(runtime);
  const BubbleSurface = registeredComponent(runtime, "chat:surface");
  const renderer = createRenderer(runtime);
  renderer.render(BubbleSurface);
  for (const listener of listeners) {
    listener({
      kind: "event",
      event: {
        type: "tool.progress",
        payload: {
          name: "shell",
          message: "Running checks",
          progress: 4,
          total: 8,
          args: { secret: "must not render" },
          result: "must not render either",
        },
      },
    });
  }

  const tree = renderer.render(BubbleSurface);
  const progressbar = findElement(tree, (element) => element.props?.role === "progressbar");
  assert.match(allText(tree), /Running checks/);
  assert.doesNotMatch(allText(tree), /must not render/);
  assert.equal(progressbar?.props["data-progress"], "indeterminate");
  assert.equal(Object.hasOwn(progressbar?.props ?? {}, "aria-valuenow"), false);
  renderer.unmount();
});

test("creates and restarts the activity sweep only for real feed events", async () => {
  const session = { channel: "test-channel", profile: "test-profile", storedSessionId: "active-session" };
  const listeners = new Set();
  const chat = chatStub({ session }).chat;
  chat.subscribeActiveChat = (listener) => {
    listeners.add(listener);
    listener({ kind: "session", session });
    listener({ kind: "feed-state", state: "open" });
    listener({ kind: "mode", mode: "bubble" });
    return () => listeners.delete(listener);
  };
  const runtime = createRuntime({
    chatMode: "bubble",
    api: { getSessionMessages: async () => ({ session_id: "active-session", messages: [] }) },
    chat,
  });
  runtime.windowObject.__HERMES_PLUGIN_SDK__.api = runtime.api;
  installHermesThemeRanz(runtime);
  const BubbleSurface = registeredComponent(runtime, "chat:surface");
  const renderer = createRenderer(runtime);
  renderer.render(BubbleSurface);
  await Promise.resolve();
  let tree = renderer.render(BubbleSurface);
  const linePredicate = (element) => element.props?.className === "htr-activity-line";
  assert.equal(findElement(tree, linePredicate), undefined);

  const publish = (type) => {
    for (const listener of listeners) listener({ kind: "event", event: { type, payload: {} } });
  };
  publish("message.start");
  tree = renderer.render(BubbleSurface);
  const firstActivity = findElement(tree, (element) => element.props?.role === "status");
  assert.ok(findElement(tree, linePredicate));
  const firstKey = firstActivity?.props.key;
  publish("message.delta");
  tree = renderer.render(BubbleSurface);
  const nextActivity = findElement(tree, (element) => element.props?.role === "status");
  assert.notEqual(nextActivity?.props.key, firstKey);
  renderer.unmount();
});

test("keeps a new live reply when a completed-history refresh resolves late", async () => {
  const session = { channel: "test-channel", profile: "test-profile", storedSessionId: "active-session" };
  const listeners = new Set();
  const chat = chatStub({ session }).chat;
  chat.subscribeActiveChat = (listener) => {
    listeners.add(listener);
    listener({ kind: "session", session });
    listener({ kind: "feed-state", state: "open" });
    listener({ kind: "mode", mode: "bubble" });
    return () => listeners.delete(listener);
  };
  let historyCalls = 0;
  let resolveRefresh;
  const runtime = createRuntime({
    chatMode: "bubble",
    api: {
      getSessionMessages: () => {
        historyCalls += 1;
        if (historyCalls === 1) return Promise.resolve({ session_id: "active-session", messages: [] });
        return new Promise((resolve) => { resolveRefresh = resolve; });
      },
    },
    chat,
  });
  runtime.windowObject.__HERMES_PLUGIN_SDK__.api = runtime.api;
  installHermesThemeRanz(runtime);
  const BubbleSurface = registeredComponent(runtime, "chat:surface");
  const renderer = createRenderer(runtime);

  renderer.render(BubbleSurface);
  await new Promise((resolve) => setImmediate(resolve));
  renderer.render(BubbleSurface);
  for (const listener of listeners) listener({ kind: "event", event: { type: "message.complete", payload: {} } });
  renderer.render(BubbleSurface);
  for (const listener of listeners) listener({ kind: "event", event: { type: "message.start", payload: {} } });
  for (const listener of listeners) listener({ kind: "event", event: { type: "message.delta", payload: { text: "New reply still visible" } } });

  resolveRefresh({ session_id: "active-session", messages: [] });
  await new Promise((resolve) => setImmediate(resolve));
  const tree = renderer.render(BubbleSurface);
  assert.match(allText(tree), /New reply still visible/);
  renderer.unmount();
});

test("offers Terminal fallback when the event feed becomes unavailable", () => {
  const session = { channel: "test-channel", profile: "test-profile", storedSessionId: "active-session" };
  const listeners = new Set();
  const chat = chatStub({ session }).chat;
  chat.subscribeActiveChat = (listener) => {
    listeners.add(listener);
    listener({ kind: "session", session });
    listener({ kind: "feed-state", state: "open" });
    listener({ kind: "mode", mode: "bubble" });
    return () => listeners.delete(listener);
  };
  const runtime = createRuntime({
    chatMode: "bubble",
    api: { getSessionMessages: async () => ({ session_id: "active-session", messages: [] }) },
    chat,
  });
  runtime.windowObject.__HERMES_PLUGIN_SDK__.api = runtime.api;
  installHermesThemeRanz(runtime);
  const BubbleSurface = registeredComponent(runtime, "chat:surface");
  const renderer = createRenderer(runtime);
  renderer.render(BubbleSurface);
  for (const listener of listeners) listener({ kind: "feed-state", state: "error" });

  const tree = renderer.render(BubbleSurface);
  assert.match(allText(tree), /live chat feed is unavailable/i);
  assert.match(allText(tree), /Switch to Terminal/);
  renderer.unmount();
});
