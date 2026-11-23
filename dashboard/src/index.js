import { explicitProgress, orderSessionMessages, reconcilePendingMessages, sessionMessageIdentity } from "./chat-state.js";

export const PLUGIN_NAME = "hermesthemeranz";
const ACTIVE_CLASS = `${PLUGIN_NAME}-active`;
const MODE_KEY = `${PLUGIN_NAME}:chat-mode`;
const CHAT_EVENT_TYPES = new Set([
  "message.start",
  "message.delta",
  "message.complete",
  "tool.start",
  "tool.progress",
  "tool.complete",
]);

function prefersReducedMotion(targetWindow) {
  try {
    return Boolean(targetWindow?.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  } catch {
    return false;
  }
}

function readChatMode(targetWindow) {
  try {
    return targetWindow?.localStorage?.getItem(MODE_KEY) === "bubble" ? "bubble" : "terminal";
  } catch {
    return "terminal";
  }
}

function storeChatMode(targetWindow, sdk, mode) {
  const nextMode = mode === "bubble" ? "bubble" : "terminal";
  try {
    targetWindow?.localStorage?.setItem(MODE_KEY, nextMode);
  } catch {
    // The host's in-memory mode still works if browser storage is unavailable.
  }
  sdk.chat?.setChatViewMode?.(nextMode);
  return nextMode;
}

function payloadObject(payload) {
  return payload && typeof payload === "object" ? payload : {};
}

function activityLabel(event) {
  const payload = payloadObject(event?.payload);
  switch (event?.type) {
    case "message.start":
      return "Hermes is thinking";
    case "message.delta":
      return "Hermes is responding";
    case "message.complete":
      return "Response complete";
    case "tool.start":
      return typeof payload.name === "string" && payload.name
        ? `Using ${payload.name}`
        : "Starting a tool";
    case "tool.progress":
      return typeof payload.message === "string" && payload.message
        ? payload.message
        : typeof payload.name === "string" && payload.name
          ? `Working with ${payload.name}`
          : "Tool in progress";
    case "tool.complete":
      return typeof payload.name === "string" && payload.name
        ? `Finished ${payload.name}`
        : "Tool finished";
    default:
      return "";
  }
}

function isChatEvent(event) {
  return Boolean(event && CHAT_EVENT_TYPES.has(event.type));
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
  const initialMode = readChatMode(targetWindow);
  sdk.chat?.setChatViewMode?.(initialMode);

  function Backdrop() {
    const [reducedMotion, setReducedMotion] = useState(() => prefersReducedMotion(targetWindow));

    useEffect(() => {
      const classList = targetDocument?.body?.classList;
      classList?.add?.(ACTIVE_CLASS);
      return () => classList?.remove?.(ACTIVE_CLASS);
    }, []);

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

    return createElement("div", {
      className: "htr-backdrop",
      "data-motion": reducedMotion ? "still" : "animated",
      "aria-hidden": true,
    });
  }

  function ModeSelector() {
    const [mode, setMode] = useState(() => readChatMode(targetWindow));

    useEffect(() => {
      if (typeof sdk.chat?.subscribeActiveChat !== "function") return undefined;
      return sdk.chat.subscribeActiveChat((update) => {
        if (update?.kind === "mode") setMode(update.mode === "bubble" ? "bubble" : "terminal");
      });
    }, []);

    const choose = (nextMode) => setMode(storeChatMode(targetWindow, sdk, nextMode));
    return createElement(
      "div",
      { className: "htr-mode-switch", role: "group", "aria-label": "Chat view" },
      createElement(
        "button",
        {
          type: "button",
          "aria-pressed": mode === "terminal",
          onClick: () => choose("terminal"),
        },
        "Terminal",
      ),
      createElement(
        "button",
        {
          type: "button",
          "aria-pressed": mode === "bubble",
          onClick: () => choose("bubble"),
        },
        "Bubble",
      ),
    );
  }

  function ChatSurface() {
    const [mode, setMode] = useState(() => readChatMode(targetWindow));
    const [session, setSession] = useState(() => sdk.chat?.getActiveChatSession?.() ?? null);
    const sessionRef = useRef(session);
    const [feedState, setFeedState] = useState("idle");
    const [activeEvent, setActiveEvent] = useState(null);
    const [activitySerial, setActivitySerial] = useState(0);
    const [messages, setMessages] = useState([]);
    const [historyState, setHistoryState] = useState("waiting");
    const [historyError, setHistoryError] = useState(false);
    const [historyRevision, setHistoryRevision] = useState(0);
    const [liveReply, setLiveReply] = useState("");
    const [draft, setDraft] = useState("");
    const [pendingMessages, setPendingMessages] = useState([]);
    const [sendError, setSendError] = useState("");
    const pendingSerial = useRef(0);

    useEffect(() => {
      if (typeof sdk.chat?.subscribeActiveChat !== "function") return undefined;
      return sdk.chat.subscribeActiveChat((update) => {
        if (!update || typeof update !== "object") return;
        if (update.kind === "session") {
          const nextSession = update.session ?? null;
          const previousSession = sessionRef.current;
          const sameScope = previousSession && nextSession &&
            previousSession.channel === nextSession.channel &&
            previousSession.profile === nextSession.profile;
          const sameConversation = sameScope &&
            (!previousSession.storedSessionId || previousSession.storedSessionId === nextSession.storedSessionId);
          sessionRef.current = nextSession;
          setSession(nextSession);
          if (sameConversation) return;
          setActiveEvent(null);
          setLiveReply("");
          setMessages([]);
          setPendingMessages([]);
          pendingSerial.current = 0;
          setHistoryError(false);
          setHistoryState(nextSession?.storedSessionId ? "loading" : "waiting");
          return;
        }
        if (update.kind === "feed-state") {
          setFeedState(update.state);
          return;
        }
        if (update.kind === "mode") {
          setMode(update.mode === "bubble" ? "bubble" : "terminal");
          return;
        }
        if (update.kind !== "event" || !isChatEvent(update.event)) return;
        const event = update.event;
        const payload = payloadObject(event.payload);
        setActiveEvent(event);
        setActivitySerial((serial) => serial + 1);
        if (event.type === "message.start") setLiveReply("");
        if (event.type === "message.delta" && typeof payload.text === "string") {
          setLiveReply((text) => text + payload.text);
        }
        if (event.type === "message.complete") {
          setLiveReply("");
          setHistoryRevision((revision) => revision + 1);
        }
      });
    }, []);

    const sessionId = session?.storedSessionId ?? null;
    const sessionProfile = session?.profile ?? "";
    const sessionChannel = session?.channel ?? "";
    useEffect(() => {
      if (mode !== "bubble") return undefined;
      if (!sessionId) {
        setMessages([]);
        setHistoryError(false);
        setHistoryState("waiting");
        return undefined;
      }
      const getMessages = sdk.api?.getSessionMessages;
      if (typeof getMessages !== "function") {
        setHistoryError(true);
        setHistoryState("error");
        return undefined;
      }

      let current = true;
      setHistoryError(false);
      setHistoryState("loading");
      let request;
      try {
        request = getMessages(sessionId, sessionProfile);
      } catch {
        request = Promise.reject(new Error("history request failed"));
      }
      Promise.resolve(request)
        .then((response) => {
          if (!current) return;
          if (!response || !Array.isArray(response.messages)) {
            throw new Error("history response is incomplete");
          }
          const orderedMessages = orderSessionMessages(response);
          setMessages(orderedMessages);
          setPendingMessages((pending) => reconcilePendingMessages(pending, orderedMessages));
          setHistoryError(false);
          setHistoryState("loaded");
        })
        .catch(() => {
          if (!current) return;
          setHistoryError(true);
          setHistoryState("error");
        });
      return () => {
        current = false;
      };
    }, [mode, sessionChannel, sessionId, sessionProfile, historyRevision]);

    if (mode !== "bubble") return null;

    const bridgeAvailable =
      sdk.chat?.chatBridgeVersion === 1 &&
      typeof sdk.chat?.subscribeActiveChat === "function" &&
      typeof sdk.chat?.sendToActiveChat === "function";
    const feedUnavailable = feedState === "closed" || feedState === "error";
    const fallbackReason = !bridgeAvailable
      ? "This Hermes host does not provide the live chat bridge."
      : feedUnavailable
        ? "The live chat feed is unavailable. Your Terminal chat is still available."
        : historyError
          ? "Bubble could not load chat history. Your Terminal chat is still available."
          : "";

    const switchToTerminal = () => {
      setMode(storeChatMode(targetWindow, sdk, "terminal"));
    };

    if (fallbackReason) {
      return createElement(
        "section",
        { className: "htr-bubble htr-bubble-fallback", role: "region", "aria-label": "Bubble chat unavailable" },
        createElement("p", null, fallbackReason),
        createElement(
          "button",
          { type: "button", onClick: switchToTerminal },
          "Switch to Terminal",
        ),
      );
    }

    const historyItems = messages
      .filter((message) =>
        (message?.role === "user" || message?.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.length > 0,
      )
      .map((message, index) =>
        createElement(
          "article",
          {
            key: `${index}-${message.role}`,
            className: `htr-message htr-message-${message.role}`,
            "data-role": message.role,
          },
          createElement("span", { className: "htr-message-role" }, message.role === "user" ? "You" : "Hermes"),
          createElement("p", { className: "htr-message-content" }, message.content),
        ),
      );
    const pendingItems = pendingMessages.map((message) =>
      createElement(
        "article",
        {
          key: `pending-${message.id}`,
          className: "htr-message htr-message-user htr-message-pending",
          "data-role": "user",
          "data-pending-message-id": message.id,
        },
        createElement("span", { className: "htr-message-role" }, "You"),
        createElement("p", { className: "htr-message-content" }, message.content),
        createElement("span", { className: "htr-message-pending-state" }, "Sending"),
      ),
    );
    if (liveReply) {
      historyItems.push(
        createElement(
          "article",
          { key: "live-reply", className: "htr-message htr-message-assistant", "data-role": "assistant" },
          createElement("span", { className: "htr-message-role" }, "Hermes"),
          createElement("p", { className: "htr-message-content" }, liveReply),
        ),
      );
    }

    const payload = payloadObject(activeEvent?.payload);
    const progress = activeEvent?.type === "tool.progress" ? explicitProgress(payload) : null;
    const statusText = activityLabel(activeEvent) ||
      (feedState !== "open"
        ? "Connecting to Hermes…"
        : historyState === "loading"
          ? "Loading conversation…"
          : historyState === "waiting"
            ? "Waiting for the Hermes session…"
            : "Chat is ready");
    const activity = activeEvent
      ? createElement(
          "div",
          { key: activitySerial, className: "htr-activity", role: "status", "aria-live": "polite", "data-activity-id": activitySerial },
          createElement("span", { className: "htr-activity-copy" }, statusText),
          activeEvent.type === "tool.progress"
            ? createElement(
                "div",
                {
                  className: "htr-progress-track",
                  role: "progressbar",
                  "aria-label": statusText,
                  ...(progress === null
                    ? { "aria-valuetext": "Progress not reported" }
                    : { "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": progress }),
                  "data-progress": progress === null ? "indeterminate" : "determinate",
                },
                createElement("span", {
                  className: "htr-progress-fill",
                  style: progress === null ? undefined : { width: `${progress}%` },
                }),
              )
            : null,
          createElement("span", { className: "htr-activity-line", "aria-hidden": true }),
        )
      : createElement("div", { className: "htr-activity", role: "status", "aria-live": "polite" }, statusText);

    const confirmedEmpty = historyState === "loaded" && messages.length === 0;
    const logoPath = `${targetWindow?.__HERMES_BASE_PATH__ ?? ""}/favicon.ico`;
    const welcome = confirmedEmpty
      ? createElement(
          "div",
          { className: "htr-welcome" },
          createElement("img", { className: "htr-hermes-logo", src: logoPath, alt: "", "aria-hidden": true }),
          createElement("h2", null, "Hermes"),
          createElement("p", null, "Welcome to Hermes. What would you like to work on?"),
        )
      : null;

    const submit = (event) => {
      event.preventDefault?.();
      const text = draft.replace(/[\r\n]+/g, " ").trim();
      if (!text) return;
      setSendError("");
      const accepted = sdk.chat.sendToActiveChat(text);
      if (accepted) {
        const id = ++pendingSerial.current;
        const seenIds = messages.map(sessionMessageIdentity).filter(Boolean);
        setPendingMessages((pending) => [...pending, { id, content: text, seenIds }]);
        setDraft("");
      }
      else setSendError("Hermes is not ready to receive a message. Your text is still here; try again or switch to Terminal.");
    };

    return createElement(
      "section",
      { className: "htr-bubble", role: "region", "aria-label": "Hermes chat" },
      createElement(
        "div",
        { className: "htr-transcript", role: "log", "aria-label": "Conversation", "aria-live": "off" },
        welcome,
        ...historyItems,
        ...pendingItems,
        activity,
      ),
      sendError ? createElement("p", { className: "htr-send-error", role: "alert" }, sendError) : null,
      createElement(
        "form",
        { className: "htr-composer", onSubmit: submit },
        createElement("label", { className: "htr-composer-label", htmlFor: "htr-message" }, "Message Hermes"),
        createElement("input", {
          id: "htr-message",
          type: "text",
          value: draft,
          "aria-label": "Message Hermes",
          onChange: (event) => {
            const value = event.currentTarget?.value ?? event.target?.value ?? "";
            setDraft(value.replace(/[\r\n]+/g, " "));
            setSendError("");
          },
        }),
        createElement(
          "button",
          { type: "submit", disabled: !draft.trim() || feedState !== "open" },
          "Send",
        ),
      ),
    );
  }

  registry.registerSlot(PLUGIN_NAME, "backdrop", Backdrop);
  registry.registerSlot(PLUGIN_NAME, "chat:top", ModeSelector);
  registry.registerSlot(PLUGIN_NAME, "chat:surface", ChatSurface);
  return true;
}

if (typeof window !== "undefined") installHermesThemeRanz(window);
