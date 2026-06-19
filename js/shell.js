// Persistent app shell: left sidebar (desktop) + bottom tab bar (mobile).
import { el, mount, clear } from "./utils.js";
import { icon } from "./icons.js";
import { avatar, nameWithBadges } from "./components.js";
import { navigate, parseHash } from "./router.js";
import { state, on, me } from "./state.js";

const NAV = [
  { key: "home", label: "Home", path: "/", icon: "home", iconFill: "homeFill" },
  { key: "search", label: "Search", path: "/search", icon: "search", iconFill: "search" },
  { key: "reels", label: "Reels", path: "/reels", icon: "reels", iconFill: "reels" },
  { key: "notifications", label: "Notifications", path: "/notifications", icon: "bell", iconFill: "bellFill", badge: "notifs" },
  { key: "messages", label: "Messages", path: "/messages", icon: "mail", iconFill: "mailFill", badge: "chats" },
  { key: "dashboard", label: "Creator", path: "/dashboard", icon: "chart", iconFill: "chart", desktopOnly: true },
  { key: "premium", label: "Premium", path: "/premium", icon: "crown", iconFill: "crown", desktopOnly: true },
];

const MOBILE_TABS = ["home", "search", "reels", "notifications", "profile"];

let shellMounted = false;
let mainColEl = null;

export function getMainCol() { return mainColEl; }
export function isShellMounted() { return shellMounted; }

/** Mount a full-screen view (auth, setup, reels) — no shell chrome. */
export function mountFull(node) {
  shellMounted = false;
  mainColEl = null;
  const appRoot = document.getElementById("app");
  mount(appRoot, node);
}

/** Ensure the shell exists and return the center column element to render into. */
export function ensureShell() {
  if (shellMounted && mainColEl) return mainColEl;
  const appRoot = document.getElementById("app");
  const main = el("main", { class: "main-col", id: "main-col" });
  const shell = el("div", { class: "app-shell" }, [
    buildSidebar(),
    main,
    buildRightbar(),
  ]);
  mount(appRoot, shell, buildTabbar(), buildFab());
  mainColEl = main;
  shellMounted = true;
  updateActive();
  updateBadges();
  return main;
}

function profilePath() {
  const u = me();
  return u?.username ? "/u/" + u.username : "/settings";
}

function buildSidebar() {
  const items = NAV.map((n) =>
    el("button", { class: "nav-item", dataset: { nav: n.key }, onClick: () => navigate(n.path) }, [
      el("span", { class: "ic", html: icon(n.icon) }),
      el("span", { class: "grow", text: n.label }),
      n.badge ? el("span", { class: "badge-dot hidden", dataset: { badge: n.badge } }) : null,
    ])
  );
  const profileBtn = el("button", { class: "nav-item", dataset: { nav: "profile" }, onClick: () => navigate(profilePath()) }, [
    el("span", { class: "ic", html: icon("user") }),
    el("span", { class: "grow", text: "Profile" }),
  ]);
  const settingsBtn = el("button", { class: "nav-item", dataset: { nav: "settings" }, onClick: () => navigate("/settings") }, [
    el("span", { class: "ic", html: icon("settings") }),
    el("span", { class: "grow", text: "Settings" }),
  ]);

  const meCard = el("button", { class: "me-card", dataset: { mecard: "1" }, onClick: () => navigate(profilePath()) });
  renderMeCard(meCard);
  on("profile", () => renderMeCard(meCard));

  return el("aside", { class: "sidebar" }, [
    el("div", { class: "brand", text: "Aurelix" }),
    ...items,
    profileBtn,
    settingsBtn,
    el("button", { class: "compose-btn", text: "Create", onClick: openComposer }),
    meCard,
  ]);
}

function renderMeCard(card) {
  const u = me();
  if (!u) { clear(card); return; }
  mount(card,
    avatar(u, ""),
    el("div", { class: "grow col", style: { minWidth: 0 } }, [
      nameWithBadges(u),
      el("div", { class: "muted ellipsis", text: "@" + (u.username || "") }),
    ]),
  );
}

function buildRightbar() {
  const searchBox = el("div", { class: "glass search-box", style: { borderRadius: "var(--radius)", padding: "4px" } }, [
    el("div", { class: "search-input-wrap" }, [
      el("span", { class: "ic", html: icon("search") }),
      el("input", { class: "input", placeholder: "Search Aurelix", onKeydown: (e) => {
        if (e.key === "Enter" && e.target.value.trim()) navigate("/search?q=" + encodeURIComponent(e.target.value.trim()));
      } }),
    ]),
  ]);
  return el("aside", { class: "rightbar" }, [
    searchBox,
    el("div", { class: "glass", style: { borderRadius: "var(--radius)", padding: "16px" } }, [
      el("div", { style: { fontWeight: "800", marginBottom: "8px" }, text: "Welcome to Aurelix" }),
      el("div", { class: "muted", style: { fontSize: ".9rem", lineHeight: "1.5" },
        text: "Post moments, share reels, message friends and jump on voice or video calls — all in one place." }),
    ]),
    el("div", { class: "faint", style: { fontSize: ".8rem", padding: "0 6px" }, text: "Aurelix · built with Firebase + WebRTC" }),
  ]);
}

function buildTabbar() {
  const tabs = MOBILE_TABS.map((key) => {
    if (key === "profile") {
      return el("button", { class: "tab-btn", dataset: { tab: "profile" }, "aria-label": "Profile", onClick: () => navigate(profilePath()) }, [
        el("span", { class: "ic", html: icon("user") }),
      ]);
    }
    const n = NAV.find((x) => x.key === key);
    return el("button", { class: "tab-btn", dataset: { tab: key }, "aria-label": n.label, onClick: () => navigate(n.path) }, [
      el("span", { class: "ic", html: icon(n.icon) }),
      n.badge ? el("span", { class: "badge-dot hidden", dataset: { badge: n.badge } }) : null,
    ]);
  });
  return el("nav", { class: "tabbar" }, tabs);
}

function buildFab() {
  return el("button", { class: "fab", "aria-label": "Create", html: icon("plus"), onClick: openComposer });
}

export async function openComposer() {
  const mod = await import("./views/compose.js");
  mod.openComposer();
}

export function updateActive() {
  if (!shellMounted) return;
  const { path } = parseHash();
  let key = "home";
  if (path === "/" ) key = "home";
  else if (path.startsWith("/search")) key = "search";
  else if (path.startsWith("/reels")) key = "reels";
  else if (path.startsWith("/notifications")) key = "notifications";
  else if (path.startsWith("/messages")) key = "messages";
  else if (path.startsWith("/dashboard")) key = "dashboard";
  else if (path.startsWith("/premium")) key = "premium";
  else if (path.startsWith("/settings")) key = "settings";
  else if (path.startsWith("/u/")) key = "profile";

  document.querySelectorAll("[data-nav]").forEach((n) => n.classList.toggle("active", n.dataset.nav === key));
  document.querySelectorAll("[data-tab]").forEach((n) => n.classList.toggle("active", n.dataset.tab === key));
}

export function updateBadges() {
  const map = { notifs: state.unreadNotifs, chats: state.unreadChats };
  document.querySelectorAll("[data-badge]").forEach((b) => {
    const n = map[b.dataset.badge] || 0;
    b.textContent = n > 99 ? "99+" : String(n);
    b.classList.toggle("hidden", n <= 0);
  });
}

// keep shell reactive
on("badges", updateBadges);
window.addEventListener("hashchange", updateActive);
