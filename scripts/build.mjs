import { copyFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = resolve(root, "dashboard/src/index.js");
const sourceCss = resolve(root, "dashboard/src/style.css");
const dist = resolve(root, "dashboard/dist");

await mkdir(dist, { recursive: true });
await build({
  entryPoints: [source],
  bundle: true,
  format: "iife",
  globalName: "HermesThemeRanz",
  platform: "browser",
  target: "es2020",
  outfile: resolve(dist, "index.js"),
  minify: true,
  legalComments: "none",
});
await copyFile(sourceCss, resolve(dist, "style.css"));
