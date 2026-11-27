// Loads the content block out of public/index.html so scripts can check it without a browser.
import { readFileSync } from "node:fs";
import vm from "node:vm";

export const HTML_PATH = new URL("../public/index.html", import.meta.url).pathname;

export function loadContent(path = HTML_PATH) {
  const html = readFileSync(path, "utf8");
  const m = html.match(/<script id="cw-content">([\s\S]*?)<\/script>/);
  if (!m) throw new Error("no <script id=\"cw-content\"> block in " + path);
  const sandbox = { module: { exports: {} } };
  vm.runInNewContext(m[1], sandbox, { filename: "cw-content" });
  return sandbox.module.exports;
}

// Right answer, the shuffled-away wrong ones, and plain text for reports.
export const optText = o => o.replace(/^\*/, "");
export const isRight = o => o.startsWith("*");
