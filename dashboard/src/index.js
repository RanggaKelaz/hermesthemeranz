export const PLUGIN_NAME = "hermesthemeranz";
const ACTIVE_CLASS = `${PLUGIN_NAME}-active`;

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
  const { useEffect, useState } = sdk.hooks;

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

  registry.registerSlot(PLUGIN_NAME, "backdrop", Backdrop);
  return true;
}

if (typeof window !== "undefined") installHermesThemeRanz(window);
