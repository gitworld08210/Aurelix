// Hash-based router. Routes are registered as patterns like "/u/:handle".
const routes = [];
let notFound = null;
let currentCleanup = null;

export function route(pattern, handler) {
  const keys = [];
  const regex = new RegExp(
    "^" + pattern.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return "([^/]+)"; }) + "$"
  );
  routes.push({ regex, keys, handler });
}

export function setNotFound(fn) { notFound = fn; }

export function parseHash() {
  let hash = location.hash.slice(1) || "/";
  const [path, queryStr = ""] = hash.split("?");
  const query = Object.fromEntries(new URLSearchParams(queryStr));
  return { path: decodeURIComponent(path), query, raw: hash };
}

export function navigate(to, { replace = false } = {}) {
  const target = "#" + (to.startsWith("/") ? to : "/" + to);
  if (replace) location.replace(target);
  else location.hash = target;
}

export function back(fallback = "/") {
  if (history.length > 1) history.back();
  else navigate(fallback, { replace: true });
}

async function resolve() {
  const { path, query, raw } = parseHash();

  // run cleanup from previous view (unsubscribe listeners etc.)
  if (typeof currentCleanup === "function") {
    try { currentCleanup(); } catch (e) { console.error(e); }
  }
  currentCleanup = null;

  for (const r of routes) {
    const m = path.match(r.regex);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      const ctx = { params, query, path, raw };
      try {
        const cleanup = await r.handler(ctx);
        if (typeof cleanup === "function") currentCleanup = cleanup;
      } catch (e) {
        console.error("Route error:", e);
      }
      window.scrollTo(0, 0);
      return;
    }
  }
  if (notFound) notFound({ path, query });
}

let started = false;
export function startRouter() {
  if (started) return;
  started = true;
  window.addEventListener("hashchange", resolve);
  resolve();
}

export function refresh() { resolve(); }
