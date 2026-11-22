export const PLUGIN_NAME = "hermesthemeranz";
const SETTINGS_KEY = `${PLUGIN_NAME}:settings`;
const ACTIVE_CLASS = `${PLUGIN_NAME}-active`;
const DEFAULT_SETTINGS = Object.freeze({ enabled: true, paused: false });
const COMPATIBILITY_MESSAGE = "Host Hermes ini belum menyediakan bridge untuk mengirim ke sesi Chat aktif.";

function readSettings(targetWindow) {
  try {
    const stored = targetWindow?.localStorage?.getItem(SETTINGS_KEY);
    if (!stored) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(stored);
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : true,
      paused: typeof parsed.paused === "boolean" ? parsed.paused : false,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function createSettingsStore(targetWindow, targetDocument) {
  let settings = readSettings(targetWindow);
  const listeners = new Set();

  function syncMarker(enabled = settings.enabled) {
    const classList = targetDocument?.body?.classList;
    if (typeof classList?.toggle === "function") {
      classList.toggle(ACTIVE_CLASS, enabled);
    } else if (enabled) {
      classList?.add?.(ACTIVE_CLASS);
    } else {
      classList?.remove?.(ACTIVE_CLASS);
    }
  }

  function update(patch) {
    settings = { ...settings, ...patch };
    try {
      targetWindow?.localStorage?.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // The UI remains usable when browser storage is unavailable.
    }
    syncMarker();
    listeners.forEach((listener) => listener(settings));
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  syncMarker();
  return {
    get: () => settings,
    update,
    subscribe,
    syncMarker,
    removeMarker: () => targetDocument?.body?.classList?.remove?.(ACTIVE_CLASS),
  };
}

function prefersReducedMotion(targetWindow) {
  try {
    return Boolean(targetWindow?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  } catch {
    return false;
  }
}

export function installHermesThemeRanz(environment = globalThis.window) {
  const targetWindow = environment?.windowObject ?? environment;
  const targetDocument = environment?.documentObject ?? globalThis.document;
  const sdk = targetWindow?.__HERMES_PLUGIN_SDK__;
  const registry = targetWindow?.__HERMES_PLUGINS__;
  if (!sdk?.React?.createElement || !sdk?.hooks || typeof registry?.registerSlot !== "function") {
    return false;
  }

  const createElement = sdk.React.createElement;
  const { useEffect, useRef, useState } = sdk.hooks;
  const store = createSettingsStore(targetWindow, targetDocument);

  function useSettings() {
    const [settings, setSettings] = useState(() => store.get());
    useEffect(() => store.subscribe(setSettings), []);
    return [settings, store.update];
  }

  function settingsControls(settings, update, location) {
    return createElement(
      "div",
      { className: `htr-controls htr-controls--${location}` },
      createElement(
        "button",
        {
          type: "button",
          className: "htr-control",
          "aria-pressed": settings.enabled,
          "aria-label": settings.enabled ? "Nonaktifkan tema" : "Aktifkan tema",
          onClick: () => update({ enabled: !settings.enabled }),
        },
        settings.enabled ? "Tema aktif" : "Tema nonaktif",
      ),
      createElement(
        "button",
        {
          type: "button",
          className: "htr-control",
          "aria-pressed": settings.paused,
          "aria-label": settings.paused ? "Putar animasi" : "Jeda animasi",
          onClick: () => update({ paused: !settings.paused }),
        },
        settings.paused ? "Putar animasi" : "Jeda animasi",
      ),
    );
  }

  function Backdrop() {
    const [settings] = useSettings();
    const [reducedMotion, setReducedMotion] = useState(() => prefersReducedMotion(targetWindow));

    useEffect(() => {
      const media = targetWindow?.matchMedia?.("(prefers-reduced-motion: reduce)");
      if (!media) return undefined;
      const onChange = (event) => setReducedMotion(Boolean(event.matches));
      if (typeof media.addEventListener === "function") {
        media.addEventListener("change", onChange);
        return () => media.removeEventListener("change", onChange);
      }
      media.addListener?.(onChange);
      return () => media.removeListener?.(onChange);
    }, []);

    useEffect(() => {
      store.syncMarker(settings.enabled);
      return () => store.removeMarker();
    }, [settings.enabled]);

    if (!settings.enabled) return null;
    return createElement("div", {
      className: "htr-backdrop",
      "data-motion": settings.paused || reducedMotion ? "still" : "animated",
      "aria-hidden": true,
    });
  }

  function HeaderControls() {
    const [settings, update] = useSettings();
    return settingsControls(settings, update, "header");
  }

  function ChatTop() {
    const [settings, update] = useSettings();
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState("");
    const [status, setStatus] = useState("");
    const toggleRef = useRef(null);
    const inputRef = useRef(null);
    const wasOpen = useRef(false);
    const send = sdk.chat?.sendToActiveChat;
    const canSend = typeof send === "function" && Boolean(draft.trim());

    useEffect(() => {
      if (open && !wasOpen.current) inputRef.current?.focus?.();
      if (!open && wasOpen.current) toggleRef.current?.focus?.();
      wasOpen.current = open;
    }, [open]);

    function submit(event) {
      event.preventDefault();
      if (!draft.trim()) return;
      if (typeof send !== "function") {
        setStatus(COMPATIBILITY_MESSAGE);
        return;
      }
      let accepted = false;
      try {
        accepted = send(draft);
      } catch {
        accepted = false;
      }
      if (accepted) {
        setDraft("");
        setStatus("Pesan dikirim ke sesi Chat aktif.");
      } else {
        setStatus("Koneksi sesi Chat belum siap. Draf tetap tersimpan.");
      }
    }

    if (!settings.enabled) return null;

    return createElement(
      "section",
      { className: "htr-chat-row", "aria-label": "Composer kedua Hermes" },
      createElement(
        "button",
        {
          ref: toggleRef,
          id: "hermesthemeranz-composer-toggle",
          type: "button",
          className: "htr-logo-toggle",
          "aria-controls": "hermesthemeranz-composer",
          "aria-expanded": open,
          "aria-label": open ? "Tutup composer kedua" : "Buka composer kedua",
          title: open ? "Tutup composer kedua" : "Buka composer kedua",
          onClick: () => {
            setOpen((current) => !current);
            setStatus("");
          },
        },
        createElement("img", {
          src: "/favicon.ico",
          alt: "",
          width: 26,
          height: 26,
          className: "htr-logo-image",
        }),
      ),
      createElement(
        "form",
        {
          id: "hermesthemeranz-composer",
          className: "htr-composer",
          hidden: !open,
          onSubmit: submit,
        },
        createElement("label", { htmlFor: "hermesthemeranz-message", className: "htr-label" }, "Pesan ke sesi Chat aktif"),
        createElement(
          "div",
          { className: "htr-input-row" },
          createElement("input", {
            ref: inputRef,
            id: "hermesthemeranz-message",
            type: "text",
            value: draft,
            onChange: (event) => {
              setDraft(event.currentTarget.value);
              setStatus("");
            },
            onKeyDown: (event) => {
              if (event.key === "Enter" && (event.isComposing || event.keyCode === 229)) {
                event.preventDefault();
              }
            },
            placeholder: "Tulis pesan untuk sesi ini",
            autoComplete: "off",
            spellCheck: true,
            className: "htr-input",
          }),
          createElement(
            "button",
            {
              type: "submit",
              className: "htr-send",
              disabled: !canSend,
            },
            "Kirim",
          ),
        ),
        createElement(
          "p",
          { className: "htr-status", role: "status", "aria-live": "polite" },
          status || (typeof send === "function" ? "" : COMPATIBILITY_MESSAGE),
        ),
      ),
      settingsControls(settings, update, "chat"),
    );
  }

  registry.registerSlot(PLUGIN_NAME, "backdrop", Backdrop);
  registry.registerSlot(PLUGIN_NAME, "header-right", HeaderControls);
  registry.registerSlot(PLUGIN_NAME, "chat:top", ChatTop);
  return true;
}

if (typeof window !== "undefined") installHermesThemeRanz(window);
