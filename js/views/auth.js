// Authentication screens: login, signup, forgot password, complete profile.
import { el, toast } from "../utils.js";
import { mountFull } from "../shell.js";
import { auth, fb, db } from "../firebase.js";
import { navigate } from "../router.js";
import { createUserProfile, isUsernameAvailable } from "../services/users.js";

function authErrorMessage(code = "") {
  const map = {
    "auth/invalid-email": "That email address looks invalid.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Incorrect email or password.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/email-already-in-use": "An account already exists with that email. Try logging in.",
    "auth/weak-password": "Password should be at least 6 characters.",
    "auth/too-many-requests": "Too many attempts. Try again later.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "auth/operation-not-allowed": "Email/password sign-in is not enabled. Go to Firebase Console → Authentication → Sign-in method → enable Email/Password.",
    "auth/configuration-not-found": "Firebase project config error. Check API key and project ID.",
    "auth/invalid-api-key": "Invalid Firebase API key.",
    "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "Invalid Firebase API key.",
    "auth/admin-restricted-operation": "Email/Password sign-in is not enabled in Firebase. Go to Firebase Console → Authentication → Sign-in method → enable Email/Password.",
  };
  return map[code] || "";
}

function shell(children) {
  return el("div", { class: "auth-wrap" }, [
    el("div", { class: "auth-card glass" }, [
      el("div", { class: "brand", text: "Aurelix" }),
      ...children,
    ]),
  ]);
}

function busy(btn, on, labelIdle) {
  btn.disabled = on;
  btn.innerHTML = "";
  if (on) { btn.appendChild(el("span", { class: "spinner sm" })); }
  else btn.textContent = labelIdle;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════════════════════
export function renderLogin() {
  const email = el("input", { class: "input", type: "email", placeholder: "you@example.com", autocomplete: "email" });
  const pass = el("input", { class: "input", type: "password", placeholder: "Password", autocomplete: "current-password" });
  const err = el("div", { class: "error-text" });
  const submit = el("button", { class: "btn primary full mt", text: "Log in" });

  const doLogin = async () => {
    err.textContent = "";
    if (!email.value.trim() || !pass.value) { err.textContent = "Enter your email and password."; return; }
    busy(submit, true);
    try {
      await fb.signInWithEmailAndPassword(auth, email.value.trim(), pass.value);
    } catch (e) {
      const msg = authErrorMessage(e.code);
      err.textContent = msg || e.message || "Login failed. Check console for details.";
      console.error("Login error:", e.code, e.message);
      busy(submit, false, "Log in");
    }
  };
  submit.addEventListener("click", doLogin);
  pass.addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });

  mountFull(shell([
    el("div", { class: "tagline", text: "Welcome back" }),
    el("div", { class: "field" }, [el("label", { text: "Email" }), email]),
    el("div", { class: "field" }, [el("label", { text: "Password" }), pass]),
    el("div", { class: "row", style: { justifyContent: "flex-end" } }, [
      el("a", { class: "link", text: "Forgot password?", onClick: () => navigate("/forgot") }),
    ]),
    err,
    submit,
    el("div", { class: "auth-switch" }, ["New to Aurelix? ", el("a", { text: "Create account", onClick: () => navigate("/signup") })]),
  ]));
}

// ═══════════════════════════════════════════════════════════════════════════════
// SIGNUP
// ═══════════════════════════════════════════════════════════════════════════════
export function renderSignup() {
  const name = el("input", { class: "input", placeholder: "Your name", autocomplete: "name" });
  const username = el("input", { class: "input", placeholder: "username", autocomplete: "off", spellcheck: false });
  const email = el("input", { class: "input", type: "email", placeholder: "you@example.com", autocomplete: "email" });
  const pass = el("input", { class: "input", type: "password", placeholder: "Password (min 6 chars)", autocomplete: "new-password" });
  const err = el("div", { class: "error-text" });
  const submit = el("button", { class: "btn primary full mt", text: "Create account" });

  username.addEventListener("input", () => {
    username.value = username.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
  });

  const doSignup = async () => {
    err.textContent = "";
    const uname = username.value.trim();
    if (!name.value.trim()) return (err.textContent = "Please enter your name.");
    if (uname.length < 3) return (err.textContent = "Username must be at least 3 characters.");
    if (!email.value.trim()) return (err.textContent = "Please enter your email.");
    if (pass.value.length < 6) return (err.textContent = "Password must be at least 6 characters.");

    busy(submit, true);
    try {
      // ── Step 1: Test if Firestore is reachable BEFORE creating the Auth account ──
      // This avoids the situation where Auth succeeds but the profile write fails.
      err.textContent = "Checking connection...";
      const firestoreOk = await testFirestoreConnection();
      if (!firestoreOk) {
        err.textContent = "";
        err.innerHTML = "";
        err.appendChild(el("div", { style: { marginBottom: "8px" }, text: "❌ Cannot connect to Firestore database." }));
        err.appendChild(el("div", { text: "Fix this in Firebase Console:" }));
        err.appendChild(el("div", { style: { marginTop: "6px", fontSize: "0.85rem", lineHeight: "1.6" }, html:
          "1. Go to <b>Firebase Console → Build → Firestore Database</b><br>" +
          "2. Click <b>Create database</b> (if not created yet)<br>" +
          "3. Select <b>Start in test mode</b><br>" +
          "4. Pick any location → click Enable<br>" +
          "5. Come back here and try again"
        }));
        busy(submit, false, "Create account");
        return;
      }
      err.textContent = "";

      // ── Step 2: Create the Firebase Auth account ──
      const cred = await fb.createUserWithEmailAndPassword(auth, email.value.trim(), pass.value);
      await fb.updateProfile(cred.user, { displayName: name.value.trim() });

      // ── Step 3: Create the Firestore profile ──
      // Small delay to let the auth token propagate
      await new Promise((r) => setTimeout(r, 800));
      try {
        await createUserProfile(cred.user.uid, {
          username: uname,
          displayName: name.value.trim(),
          email: email.value.trim(),
        });
      } catch (profileErr) {
        console.warn("Profile write failed, retrying:", profileErr.message);
        await new Promise((r) => setTimeout(r, 2000));
        try {
          await createUserProfile(cred.user.uid, {
            username: uname,
            displayName: name.value.trim(),
            email: email.value.trim(),
          });
        } catch (retryErr) {
          console.error("Profile retry failed:", retryErr);
          // Auth was created — the "complete profile" flow will catch this on next load
        }
      }
      toast("Welcome to Aurelix! 🎉", "success");
    } catch (e) {
      console.error("Signup error:", e.code, e.message, e);
      if (e.code === "auth/email-already-in-use") {
        err.innerHTML = "";
        err.appendChild(el("span", { text: "This email is already registered. " }));
        err.appendChild(el("a", { class: "link", text: "Log in instead →", onClick: () => navigate("/login") }));
      } else {
        const msg = authErrorMessage(e.code);
        err.textContent = msg || e.message || "Signup failed. Check browser console for details.";
      }
      busy(submit, false, "Create account");
    }
  };
  submit.addEventListener("click", doSignup);
  pass.addEventListener("keydown", (e) => { if (e.key === "Enter") doSignup(); });

  mountFull(shell([
    el("div", { class: "tagline", text: "Create your account" }),
    el("div", { class: "field" }, [el("label", { text: "Name" }), name]),
    el("div", { class: "field" }, [el("label", { text: "Username" }), username]),
    el("div", { class: "field" }, [el("label", { text: "Email" }), email]),
    el("div", { class: "field" }, [el("label", { text: "Password" }), pass]),
    err,
    submit,
    el("div", { class: "auth-switch" }, ["Already have an account? ", el("a", { text: "Log in", onClick: () => navigate("/login") })]),
  ]));
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORGOT PASSWORD
// ═══════════════════════════════════════════════════════════════════════════════
export function renderForgot() {
  const email = el("input", { class: "input", type: "email", placeholder: "you@example.com", autocomplete: "email" });
  const err = el("div", { class: "error-text" });
  const ok = el("div", { class: "hint", style: { color: "var(--accent-3)" } });
  const submit = el("button", { class: "btn primary full mt", text: "Send reset link" });

  const doReset = async () => {
    err.textContent = ""; ok.textContent = "";
    if (!email.value.trim()) return (err.textContent = "Enter your email address.");
    busy(submit, true);
    try {
      await fb.sendPasswordResetEmail(auth, email.value.trim());
      ok.textContent = "Check your inbox for a password reset link.";
      busy(submit, false, "Send reset link");
    } catch (e) {
      err.textContent = authErrorMessage(e.code) || e.message || "Could not send reset email.";
      busy(submit, false, "Send reset link");
    }
  };
  submit.addEventListener("click", doReset);
  email.addEventListener("keydown", (e) => { if (e.key === "Enter") doReset(); });

  mountFull(shell([
    el("div", { class: "tagline", text: "Reset your password" }),
    el("div", { class: "field" }, [el("label", { text: "Email" }), email]),
    err, ok,
    submit,
    el("div", { class: "auth-switch" }, [el("a", { text: "Back to login", onClick: () => navigate("/login") })]),
  ]));
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPLETE PROFILE (shown when auth exists but profile doc doesn't)
// ═══════════════════════════════════════════════════════════════════════════════
export function renderCompleteProfile() {
  const name = el("input", { class: "input", placeholder: "Your name", value: auth.currentUser?.displayName || "" });
  const username = el("input", { class: "input", placeholder: "username", spellcheck: false });
  const err = el("div", { class: "error-text" });
  const submit = el("button", { class: "btn primary full mt", text: "Finish setup" });
  const diagBtn = el("button", { class: "btn full mt", text: "🔧 Run diagnostics", onClick: runDiagnostics });

  username.addEventListener("input", () => { username.value = username.value.toLowerCase().replace(/[^a-z0-9_]/g, ""); });

  async function runDiagnostics() {
    err.innerHTML = "";
    err.style.whiteSpace = "pre-wrap";
    err.style.fontSize = "0.8rem";
    err.style.lineHeight = "1.5";
    err.textContent = "Running diagnostics...\n";
    const log = (msg) => { err.textContent += msg + "\n"; };

    log("✓ Firebase Auth: connected (you are logged in)");
    log("  UID: " + (auth.currentUser?.uid || "none"));
    log("  Email: " + (auth.currentUser?.email || "none"));
    log("");
    log("Testing Firestore connection...");

    const ok = await testFirestoreConnection();
    if (ok) {
      log("✓ Firestore: connected! Try clicking Finish setup.");
      err.style.color = "var(--accent-3)";
    } else {
      log("✗ Firestore: CANNOT CONNECT");
      log("");
      log("FIX THIS:");
      log("1. Open Firebase Console (console.firebase.google.com)");
      log("2. Select project: nexus-a9d8d");
      log("3. Go to Build → Firestore Database");
      log("4. If you see 'Create database' → click it");
      log("5. Choose 'Start in test mode'");
      log("6. Pick location → Enable");
      log("7. Come back and reload this page");
    }
  }

  submit.addEventListener("click", async () => {
    err.textContent = "";
    err.style.color = "";
    err.style.whiteSpace = "";
    err.style.fontSize = "";
    const uname = username.value.trim();
    if (!name.value.trim()) return (err.textContent = "Please enter your name.");
    if (uname.length < 3) return (err.textContent = "Username must be at least 3 characters.");
    busy(submit, true);
    try {
      // Test Firestore first
      const ok = await testFirestoreConnection();
      if (!ok) {
        err.textContent = "Firestore is not reachable. Click 'Run diagnostics' below for help.";
        busy(submit, false, "Finish setup");
        return;
      }
      await createUserProfile(auth.currentUser.uid, { username: uname, displayName: name.value.trim(), email: auth.currentUser.email || "" });
      location.reload();
    } catch (e) {
      console.error("Complete profile error:", e);
      err.textContent = e.message || "Could not save profile. Click 'Run diagnostics' below.";
      busy(submit, false, "Finish setup");
    }
  });

  mountFull(shell([
    el("div", { class: "tagline", text: "Finish setting up your profile" }),
    el("div", { class: "field" }, [el("label", { text: "Name" }), name]),
    el("div", { class: "field" }, [el("label", { text: "Username" }), username]),
    err,
    submit,
    diagBtn,
    el("div", { class: "auth-switch mt" }, [
      el("a", { class: "link", text: "Log out and start fresh", onClick: () => fb.signOut(auth).then(() => navigate("/login")) }),
    ]),
  ]));
}

// ═══════════════════════════════════════════════════════════════════════════════
// FIRESTORE CONNECTION TEST
// ═══════════════════════════════════════════════════════════════════════════════
/**
 * Attempts a lightweight Firestore read with a 10-second timeout.
 * Returns true if Firestore is reachable, false otherwise.
 */
async function testFirestoreConnection() {
  try {
    // Try to read a nonexistent doc — will return "not found" if connected,
    // or throw "offline"/"unavailable" if Firestore can't be reached.
    const testRef = fb.doc(db, "__connection_test__", "ping");
    const result = await Promise.race([
      fb.getDoc(testRef).then(() => true).catch((e) => {
        // "permission-denied" means Firestore IS reachable (it denied us, but it responded)
        if (e.code === "permission-denied" || (e.message && e.message.includes("permission"))) return true;
        // "not-found" means Firestore IS reachable
        if (e.code === "not-found") return true;
        // "unavailable" or "offline" means it's NOT reachable
        console.warn("Firestore test error:", e.code, e.message);
        return false;
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 10000)),
    ]);
    return result === true;
  } catch (e) {
    console.warn("Firestore connection test failed:", e.message);
    return false;
  }
}
