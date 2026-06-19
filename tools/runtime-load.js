// Load every module (except main.js bootstrap) under DOM stubs to surface
// top-level evaluation errors and verify the import graph links.
import { readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const node = () => ({
  className: "", textContent: "", innerHTML: "", style: {}, dataset: {}, files: [],
  classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } },
  setAttribute() {}, getAttribute() { return null; }, addEventListener() {}, removeEventListener() {},
  appendChild(c) { return c; }, append() {}, prepend() {}, replaceChildren() {}, remove() {},
  querySelector() { return null; }, querySelectorAll() { return []; }, closest() { return null; },
  focus() {}, click() {}, play() { return Promise.resolve(); }, pause() {},
  get firstChild() { return null; },
});

globalThis.window = {
  addEventListener() {}, removeEventListener() {},
  location: { hash: "", pathname: "/", origin: "http://localhost", href: "", replace() {}, reload() {} },
  scrollTo() {}, scrollY: 0,
};
globalThis.document = {
  getElementById() { return node(); }, querySelector() { return null }, querySelectorAll() { return [] },
  createElement() { return node(); }, createTextNode() { return node(); }, body: node(), addEventListener() {},
};
globalThis.location = globalThis.window.location;
globalThis.history = { length: 1, back() {} };
globalThis.localStorage = { getItem() { return null }, setItem() {}, removeItem() {} };
try {
  Object.defineProperty(globalThis, "navigator", {
    value: { mediaDevices: { getUserMedia() { return Promise.resolve({}); } }, clipboard: { writeText() { return Promise.resolve(); } } },
    configurable: true,
  });
} catch { /* navigator already provided by runtime */ }
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.RTCPeerConnection = class { createOffer() {} };
globalThis.RTCSessionDescription = class {};
globalThis.RTCIceCandidate = class {};
globalThis.MediaStream = class { addTrack() {} getTracks() { return [] } getAudioTracks() { return [] } getVideoTracks() { return [] } };
globalThis.XMLHttpRequest = class { open() {} send() {} };
if (!globalThis.URL.createObjectURL) globalThis.URL.createObjectURL = () => "blob:x";
if (!globalThis.URL.revokeObjectURL) globalThis.URL.revokeObjectURL = () => {};

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const jsDir = join(root, "js");
function walk(dir) { let f = []; for (const e of readdirSync(dir)) { const p = join(dir, e); if (statSync(p).isDirectory()) f = f.concat(walk(p)); else if (e.endsWith(".js")) f.push(p); } return f; }

const files = walk(jsDir).filter((f) => !f.endsWith("/main.js"));
let failed = 0;
for (const f of files) {
  try { await import(pathToFileURL(f).href); console.log("ok   " + f.replace(root + "/", "")); }
  catch (e) { failed++; console.error("FAIL " + f.replace(root + "/", "") + "\n   " + (e && e.message)); }
}
console.log(`\n${files.length - failed}/${files.length} modules loaded.`);
process.exit(failed ? 1 : 0);
