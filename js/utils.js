// Small DOM + formatting helpers shared across the app.

/** Create a DOM element. attrs supports: class, html, text, dataset, style, on{Event}, and direct props. */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k === "text") node.textContent = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k === "style" && typeof v === "object") Object.assign(node.style, v);
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in node) {
      try { node[k] = v; } catch { node.setAttribute(k, v); }
    } else node.setAttribute(k, v);
  }
  appendChildren(node, children);
  return node;
}

function appendChildren(node, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const c of list) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
  }
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
export function mount(node, ...children) { clear(node); appendChildren(node, children); return node; }
export function qs(sel, root = document) { return root.querySelector(sel); }
export function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

export function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Linkify @mentions and #hashtags, escaping everything else. Returns HTML string. */
export function richText(text = "") {
  const safe = escapeHtml(text);
  return safe
    .replace(/(^|\s)@([a-zA-Z0-9_]{2,30})/g, '$1<a class="link" href="#/u/$2">@$2</a>')
    .replace(/(^|\s)#([a-zA-Z0-9_]{1,40})/g, '$1<a class="link" href="#/search?q=%23$2">#$2</a>')
    .replace(/(https?:\/\/[^\s]+)/g, '<a class="link" href="$1" target="_blank" rel="noopener">$1</a>');
}

export function timeAgo(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 5) return "now";
  if (secs < 60) return secs + "s";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return mins + "m";
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + "h";
  const days = Math.floor(hrs / 24);
  if (days < 7) return days + "d";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function fullDate(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString(undefined, { hour: "2-digit", minute: "2-digit", month: "short", day: "numeric", year: "numeric" });
}

export function clockTime(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function formatCount(n = 0) {
  n = Number(n) || 0;
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(n % 1000 >= 100 ? 1 : 0).replace(/\.0$/, "") + "K";
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
}

export function initials(name = "?") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

let toastTimer;
export function toast(message, type = "") {
  const host = document.getElementById("toast-host");
  if (!host) return;
  const t = el("div", { class: `toast glass ${type}`, text: message });
  host.appendChild(t);
  setTimeout(() => {
    t.style.transition = "opacity .25s ease, transform .25s ease";
    t.style.opacity = "0";
    t.style.transform = "translateY(8px)";
    setTimeout(() => t.remove(), 260);
  }, type === "error" ? 4200 : 2600);
}

/** Confirm dialog returning a promise<boolean>. */
export function confirmDialog({ title = "Are you sure?", message = "", confirmText = "Confirm", danger = false } = {}) {
  return new Promise((resolve) => {
    const close = (val) => { backdrop.remove(); resolve(val); };
    const backdrop = el("div", { class: "modal-backdrop", onClick: (e) => { if (e.target === backdrop) close(false); } }, [
      el("div", { class: "modal glass" }, [
        el("h2", { text: title }),
        message ? el("p", { class: "muted", text: message }) : null,
        el("div", { class: "row mt", style: { justifyContent: "flex-end" } }, [
          el("button", { class: "btn ghost", text: "Cancel", onClick: () => close(false) }),
          el("button", { class: `btn ${danger ? "danger" : "primary"}`, text: confirmText, onClick: () => close(true) }),
        ]),
      ]),
    ]);
    document.body.appendChild(backdrop);
  });
}

/** Generic modal. Returns { close }. content is a DOM node. */
export function openModal(content, { onClose } = {}) {
  const close = () => { backdrop.remove(); onClose?.(); };
  const backdrop = el("div", { class: "modal-backdrop", onClick: (e) => { if (e.target === backdrop) close(); } }, [
    el("div", { class: "modal glass" }, [content]),
  ]);
  document.body.appendChild(backdrop);
  return { close, backdrop };
}

/** Bottom-sheet style action list. items: [{label, icon, danger, onClick}] */
export function openSheet(items = []) {
  const close = () => backdrop.remove();
  const list = el("div", { class: "sheet-list" },
    items.map((it) => el("div", { class: `sheet-item ${it.danger ? "danger" : ""}`, onClick: () => { close(); it.onClick?.(); } }, [
      it.icon ? el("span", { class: "ic", html: it.icon }) : null,
      el("span", { text: it.label }),
    ]))
  );
  const backdrop = el("div", { class: "modal-backdrop", onClick: (e) => { if (e.target === backdrop) close(); } }, [
    el("div", { class: "modal glass", style: { maxWidth: "420px" } }, [list]),
  ]);
  document.body.appendChild(backdrop);
  return { close };
}

export function fileToObjectURL(file) { return URL.createObjectURL(file); }

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
