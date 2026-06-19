// App bootstrap: config check, Firebase init, auth state, routing, global watchers.
// Performance contract:
//   - ZERO Firestore reads before auth succeeds.
//   - Show the app shell IMMEDIATELY after auth confirms a user.
//   - Profile + watchers load in the background (non-blocking).
//   - Timing logs for every step.
import { isFirebaseConfigured } from "./config.js";
import { route, setNotFound, navigate, startRouter, parseHash } from "./router.js";
import { state, setAuthUser, setProfile, setReady, setUnreadNotifs, setUnreadChats, on } from "./state.js";
import { el, mount, toast } from "./utils.js";

const APP_VERSION = "2.7.0";
const T0 = performance.now();
const t = (label) => console.log(`%c⏱ ${label}: ${Math.round(performance.now() - T0)}ms`, "color:#4d8dff");
console.log(`%cAurelix v${APP_VERSION} loaded`, "color:#4d8dff;font-weight:bold");

const PUBLIC_ROUTES = ["/login", "/signup", "/forgot", "/setup"];
let firebaseReady = false;
let globalUnsubs = [];

function showBootError(message) {
  mount(document.getElementById("app"), el("div", { class: "auth-wrap" }, [
    el("div", { class: "auth-card glass" }, [
      el("div", { class: "brand", text: "Aurelix" }),
      el("div", { class: "tagline", text: "Connection problem" }),
      el("p", { class: "muted center", text: message }),
      el("button", { class: "btn primary full mt", text: "Open setup", onClick: () => { location.hash = "#/setup"; location.reload(); } }),
    ]),
  ]));
}

// ── Route table ──────────────────────────────────────────────────────────────
function registerRoutes() {
  route("/setup", async () => { (await import("./views/setup.js")).renderSetup(); });
  route("/login", async () => { redirectIfAuthed() || (await import("./views/auth.js")).renderLogin(); });
  route("/signup", async () => { redirectIfAuthed() || (await import("./views/auth.js")).renderSignup(); });
  route("/forgot", async () => { redirectIfAuthed() || (await import("./views/auth.js")).renderForgot(); });

  route("/", guard(async (ctx) => (await import("./views/feed.js")).renderFeed(ctx)));
  route("/search", guard(async (ctx) => (await import("./views/search.js")).renderSearch(ctx)));
  route("/reels", guard(async (ctx) => (await import("./views/reels.js")).renderReels(ctx)));
  route("/reels/:id", guard(async (ctx) => (await import("./views/reels.js")).renderReels(ctx)));
  route("/notifications", guard(async (ctx) => (await import("./views/notifications.js")).renderNotifications(ctx)));
  route("/messages", guard(async (ctx) => (await import("./views/messages.js")).renderConversations(ctx)));
  route("/messages/:cid", guard(async (ctx) => (await import("./views/chat.js")).renderChat(ctx)));
  route("/dashboard", guard(async (ctx) => (await import("./views/dashboard.js")).renderDashboard(ctx)));
  route("/premium", guard(async (ctx) => (await import("./views/premium.js")).renderPremium(ctx)));
  route("/verify", guard(async (ctx) => (await import("./views/verification.js")).renderVerification(ctx)));
  route("/settings", guard(async (ctx) => (await import("./views/settings.js")).renderSettings(ctx)));
  route("/settings/edit", guard(async (ctx) => (await import("./views/editProfile.js")).renderEditProfile(ctx)));
  route("/post/:id", guard(async (ctx) => (await import("./views/post.js")).renderPostDetail(ctx)));
  route("/u/:handle", guard(async (ctx) => (await import("./views/profile.js")).renderProfile(ctx)));
  route("/u/:handle/:tab", guard(async (ctx) => (await import("./views/profile.js")).renderProfile(ctx)));

  setNotFound(async () => {
    if (!state.authUser) return navigate("/login", { replace: true });
    const { ensureShell } = await import("./shell.js");
    const { header, emptyState } = await import("./components.js");
    const main = ensureShell();
    mount(main, header("Not found", { back: true }), emptyState("Page not found", "That page doesn't exist.",
      el("button", { class: "btn primary", text: "Go home", onClick: () => navigate("/") })));
  });
}

function guard(handler) {
  return async (ctx) => {
    if (!firebaseReady) return;
    if (!state.authUser) { navigate("/login", { replace: true }); return; }
    // Don't block on profile — if it hasn't loaded yet, show "complete profile" only
    // if we've confirmed it doesn't exist (profile === null AND profileChecked).
    if (state.profileChecked && !state.profile) {
      (await import("./views/auth.js")).renderCompleteProfile();
      return;
    }
    return handler(ctx);
  };
}

function redirectIfAuthed() {
  if (state.authUser) { navigate("/", { replace: true }); return true; }
  return false;
}

// ── Global watchers (Firestore subscriptions) ────────────────────────────────
// Started lazily in background after auth succeeds. Never block the UI.
async function startGlobalWatchers(uid) {
  stopGlobalWatchers();
  const t0 = performance.now();

  const [
    { watchUser },
    { watchUnreadCount },
    { watchUnreadConversations },
    { watchIncomingCalls },
    { mountIncomingCall },
  ] = await Promise.all([
    import("./services/users.js"),
    import("./services/notifications.js"),
    import("./services/messages.js"),
    import("./services/calls.js"),
    import("./views/incomingCall.js"),
  ]);

  console.log(`%c⏱ watcher modules imported: ${Math.round(performance.now() - t0)}ms`, "color:#4d8dff");

  // Single profile watcher — this is the ONLY Firestore read that feeds the profile.
  // It fires once immediately (current doc) then keeps it live.
  globalUnsubs.push(watchUser(uid, (profile) => {
    if (profile) {
      const wasNull = !state.profile;
      setProfile(profile);
      if (wasNull) {
        t("profile loaded (first)");
        // If we were waiting on profile to render a guarded route, re-render now.
        import("./router.js").then((r) => r.refresh());
      }
    } else {
      // Profile doesn't exist → mark as checked so guard shows "complete profile"
      state.profileChecked = true;
      setProfile(null);
      import("./router.js").then((r) => r.refresh());
    }
  }));

  // Badge watchers — lightweight, just counts.
  globalUnsubs.push(watchUnreadCount(uid, (n) => setUnreadNotifs(n)));
  globalUnsubs.push(watchUnreadConversations(uid, (n) => setUnreadChats(n)));

  // Incoming calls — fires only when someone rings this user.
  globalUnsubs.push(watchIncomingCalls(uid, (calls) => mountIncomingCall(calls)));

  t("global watchers active");
}

function stopGlobalWatchers() {
  globalUnsubs.forEach((u) => { try { u(); } catch {} });
  globalUnsubs = [];
}

// ── Auth state handler ───────────────────────────────────────────────────────
// PERFORMANCE CRITICAL: No Firestore reads here. Show app instantly.
let routerStarted = false;
async function onAuthChanged(user) {
  t("onAuthStateChanged fired");
  const firstRun = !routerStarted;

  if (user) {
    // ── IMMEDIATE: set auth user + show the app ──
    setAuthUser(user);
    setReady(true);
    state.profileChecked = false; // reset — will be set by watcher

    if (firstRun) { routerStarted = true; startRouter(); }
    t("router started (app visible)");

    const { path } = parseHash();
    if (PUBLIC_ROUTES.includes(path)) navigate("/", { replace: true });
    else { const { refresh } = await import("./router.js"); refresh(); }

    // ── BACKGROUND: load profile + start watchers (non-blocking) ──
    // This does NOT block the user from seeing the app shell / feed.
    startGlobalWatchers(user.uid).catch((e) => console.warn("Watchers init error:", e));

  } else {
    // ── Signed out ──
    stopGlobalWatchers();
    setAuthUser(null);
    setProfile(null);
    state.profileChecked = false;
    setReady(true);

    if (firstRun) { routerStarted = true; startRouter(); }
    const { path } = parseHash();
    if (!PUBLIC_ROUTES.includes(path)) navigate("/login", { replace: true });
    else { const { refresh } = await import("./router.js"); refresh(); }
  }
}

// ── Boot ─────────────────────────────────────────────────────────────────────
async function boot() {
  t("boot() start");
  registerRoutes();

  if (!isFirebaseConfigured()) {
    startRouter();
    const { path } = parseHash();
    if (path !== "/setup") navigate("/setup", { replace: true });
    else { const { refresh } = await import("./router.js"); refresh(); }
    t("no config — setup screen shown");
    return;
  }

  try {
    const { initFirebase } = await import("./firebase.js");
    t("firebase.js imported");
    const { auth, fb } = await initFirebase();
    t("Firebase SDK initialized");
    firebaseReady = true;

    // Non-blocking connectivity check (for debugging only, doesn't delay anything)
    runConnectivitySelfTest();

    // Auth listener — first callback fires synchronously if a persisted session exists.
    fb.onAuthStateChanged(auth, onAuthChanged);
    t("onAuthStateChanged registered");
  } catch (e) {
    console.error("Firebase init failed:", e);
    showBootError(e.message || "Could not initialize Firebase. Check your configuration.");
  }
}

/** Non-blocking connectivity self-test (debug only). */
function runConnectivitySelfTest() {
  const test = async (label, url) => {
    const t0 = Date.now();
    try {
      await fetch(url, { method: "GET", mode: "no-cors", cache: "no-store" });
      console.log(`%c✓ ${label} reachable (${Date.now() - t0}ms)`, "color:#46e3c0");
    } catch (e) {
      console.log(`%c✗ ${label} NOT reachable: ${e.message}`, "color:#ff4d6d");
    }
  };
  console.log("%cConnectivity self-test (non-blocking)…", "color:#9aa0ad");
  test("Firebase Auth (identitytoolkit)", "https://identitytoolkit.googleapis.com/");
  test("Firestore", "https://firestore.googleapis.com/");
}

window.addEventListener("error", (e) => console.error("Global error:", e.error || e.message));
window.addEventListener("unhandledrejection", (e) => console.error("Unhandled promise rejection:", e.reason));

boot();
