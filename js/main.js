// App bootstrap: config check, Firebase init, auth state, routing, global watchers.
import { isFirebaseConfigured } from "./config.js";
import { route, setNotFound, navigate, startRouter, parseHash } from "./router.js";
import { state, setAuthUser, setProfile, setReady, setUnreadNotifs, setUnreadChats, on } from "./state.js";
import { el, mount, toast } from "./utils.js";

const APP_VERSION = "2.4.0";
console.log("%cAurelix v" + APP_VERSION + " loaded", "color:#4d8dff;font-weight:bold");

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

// ---- Route table (dynamic imports keep first paint light) ----
function registerRoutes() {
  // Public
  route("/setup", async () => { (await import("./views/setup.js")).renderSetup(); });
  route("/login", async () => { redirectIfAuthed() || (await import("./views/auth.js")).renderLogin(); });
  route("/signup", async () => { redirectIfAuthed() || (await import("./views/auth.js")).renderSignup(); });
  route("/forgot", async () => { redirectIfAuthed() || (await import("./views/auth.js")).renderForgot(); });

  // Guarded app routes
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
    if (!state.profile) { (await import("./views/auth.js")).renderCompleteProfile(); return; }
    return handler(ctx);
  };
}

function redirectIfAuthed() {
  if (state.authUser && state.profile) { navigate("/", { replace: true }); return true; }
  return false;
}

async function startGlobalWatchers(uid) {
  stopGlobalWatchers();
  const { watchUser } = await import("./services/users.js");
  const { watchUnreadCount } = await import("./services/notifications.js");
  const { watchUnreadConversations } = await import("./services/messages.js");
  const { watchIncomingCalls } = await import("./services/calls.js");
  const { mountIncomingCall } = await import("./views/incomingCall.js");

  globalUnsubs.push(watchUser(uid, (profile) => { if (profile) setProfile(profile); }));
  globalUnsubs.push(watchUnreadCount(uid, (n) => setUnreadNotifs(n)));
  globalUnsubs.push(watchUnreadConversations(uid, (n) => setUnreadChats(n)));
  globalUnsubs.push(watchIncomingCalls(uid, (calls) => mountIncomingCall(calls)));
}

function stopGlobalWatchers() {
  globalUnsubs.forEach((u) => { try { u(); } catch {} });
  globalUnsubs = [];
}

let routerStarted = false;
async function onAuthChanged(user) {
  const firstRun = !routerStarted;
  if (user) {
    setAuthUser(user);
    const { getUser } = await import("./services/users.js");
    let profile = null;
    try { profile = await getUser(user.uid); } catch (e) { console.error(e); }
    setProfile(profile);
    setReady(true);
    if (profile) await startGlobalWatchers(user.uid);

    if (firstRun) { routerStarted = true; startRouter(); }
    const { path } = parseHash();
    if (PUBLIC_ROUTES.includes(path)) navigate("/", { replace: true });
    else if (!profile) { (await import("./views/auth.js")).renderCompleteProfile(); }
    else { const { refresh } = await import("./router.js"); refresh(); }
  } else {
    stopGlobalWatchers();
    setAuthUser(null);
    setProfile(null);
    setReady(true);
    if (firstRun) { routerStarted = true; startRouter(); }
    const { path } = parseHash();
    if (!PUBLIC_ROUTES.includes(path)) navigate("/login", { replace: true });
    else { const { refresh } = await import("./router.js"); refresh(); }
  }
}

async function boot() {
  registerRoutes();

  if (!isFirebaseConfigured()) {
    // No config yet → force the setup screen.
    startRouter();
    const { path } = parseHash();
    if (path !== "/setup") navigate("/setup", { replace: true });
    else { const { refresh } = await import("./router.js"); refresh(); }
    return;
  }

  try {
    const { initFirebase } = await import("./firebase.js");
    const { auth, fb } = await initFirebase();
    firebaseReady = true;
    // Router starts after the first auth result (in onAuthChanged) to avoid a flash.
    fb.onAuthStateChanged(auth, onAuthChanged);
  } catch (e) {
    console.error("Firebase init failed:", e);
    showBootError(e.message || "Could not initialize Firebase. Check your configuration.");
  }
}

window.addEventListener("error", (e) => console.error("Global error:", e.error || e.message));
window.addEventListener("unhandledrejection", (e) => console.error("Unhandled promise rejection:", e.reason));

boot();
