// Authentication screens: login, signup, forgot password, complete profile.
// Firestore connection test is DISABLED. Signup creates the Auth account immediately.
// The user profile document is created AFTER signup succeeds (best-effort, with retry on next load).
import { el, toast } from "../utils.js";
import { mountFull } from "../shell.js";
import { auth, fb, db } from "../firebase.js";
import { navigate } from "../router.js";
import { createUserProfile } from "../services/users.js";

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
      let lastErr = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          err.textContent = attempt === 1 ? "" : `Network was slow — retrying (${attempt}/3)…`;
          await fb.signInWithEmailAndPassword(auth, email.value.trim(), pass.value);
          lastErr = null;
          break;
        } catch (attemptErr) {
          lastErr = attemptErr;
          console.warn(`Login attempt ${attempt} failed:`, attemptErr.code, attemptErr.message);
          if (attemptErr.code !== "auth/network-request-failed" && attemptErr.code !== "auth/timeout") break;
          if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
        }
      }
      if (lastErr) throw lastErr;
    } catch (e) {
      console.error("═══ LOGIN ERROR ═══");
      console.error("error.code:", e.code);
      console.error("error.message:", e.message);
      console.error("full error object:", e);
      console.error("═══════════════════");

      err.style.whiteSpace = "pre-wrap";
      err.style.fontSize = "0.82rem";
      err.textContent = `Error code: ${e.code || "none"}\nMessage: ${e.message || "unknown"}`;
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
// SIGNUP — No Firestore test. Auth first, profile write is best-effort after.
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
      // ── Step 1: Create Firebase Auth account (with retry on transient network failures) ──
      // Mobile networks frequently drop a single request (auth/network-request-failed).
      // We retry up to 3 times before surfacing the error.
      let cred = null;
      let lastErr = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          err.textContent = attempt === 1 ? "" : `Network was slow — retrying (${attempt}/3)…`;
          cred = await fb.createUserWithEmailAndPassword(auth, email.value.trim(), pass.value);
          lastErr = null;
          break;
        } catch (attemptErr) {
          lastErr = attemptErr;
          console.warn(`Signup attempt ${attempt} failed:`, attemptErr.code, attemptErr.message);
          // Only retry on network errors; fail fast on real errors (email-in-use, weak pw, etc.)
          if (attemptErr.code !== "auth/network-request-failed" && attemptErr.code !== "auth/timeout") break;
          if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
        }
      }
      if (lastErr) throw lastErr;

      err.textContent = "";
      await fb.updateProfile(cred.user, { displayName: name.value.trim() });

      // ── Step 2: Try to write user profile to Firestore (best-effort) ──
      createUserProfileSafe(cred.user.uid, uname, name.value.trim(), email.value.trim());

      toast("Account created! Welcome to Aurelix 🎉", "success");
      // The onAuthStateChanged listener in main.js will detect the new user
      // and either route to home (if profile was written) or to "complete profile."
    } catch (e) {
      // ── RAW ERROR DISPLAY — no custom messages, show exactly what Firebase returns ──
      console.error("═══ SIGNUP ERROR ═══");
      console.error("error.code:", e.code);
      console.error("error.message:", e.message);
      console.error("full error object:", e);
      console.error("═══════════════════");

      // Show the raw Firebase error on screen
      err.style.whiteSpace = "pre-wrap";
      err.style.fontSize = "0.82rem";
      err.style.lineHeight = "1.5";
      err.textContent = `Error code: ${e.code || "none"}\nMessage: ${e.message || "unknown"}\n\nFull: ${JSON.stringify({code: e.code, message: e.message, name: e.name, stack: e.stack?.split("\n")[0]}, null, 2)}`;

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

/**
 * Fire-and-forget profile creation. Retries in background.
 * If it fails completely, renderCompleteProfile() catches it on next page load.
 */
async function createUserProfileSafe(uid, username, displayName, email) {
  const attempts = [800, 2000, 4000]; // delays before each retry
  for (let i = 0; i < attempts.length; i++) {
    await new Promise((r) => setTimeout(r, attempts[i]));
    try {
      await createUserProfile(uid, { username, displayName, email });
      console.log("Profile created successfully on attempt", i + 1);
      return; // success — done
    } catch (e) {
      console.warn(`Profile creation attempt ${i + 1} failed:`, e.message);
    }
  }
  console.error("All profile creation attempts failed. User will see 'complete profile' on next load.");
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
// COMPLETE PROFILE (shown when auth exists but no Firestore profile yet)
// No Firestore pre-test. Just try to write. Show clear error if it fails.
// ═══════════════════════════════════════════════════════════════════════════════
export function renderCompleteProfile() {
  const name = el("input", { class: "input", placeholder: "Your name", value: auth.currentUser?.displayName || "" });
  const username = el("input", { class: "input", placeholder: "username", spellcheck: false });
  const err = el("div", { class: "error-text" });
  const submit = el("button", { class: "btn primary full mt", text: "Finish setup" });

  username.addEventListener("input", () => { username.value = username.value.toLowerCase().replace(/[^a-z0-9_]/g, ""); });

  submit.addEventListener("click", async () => {
    err.textContent = "";
    const uname = username.value.trim();
    if (!name.value.trim()) return (err.textContent = "Please enter your name.");
    if (uname.length < 3) return (err.textContent = "Username must be at least 3 characters.");
    busy(submit, true);
    try {
      await createUserProfile(auth.currentUser.uid, { username: uname, displayName: name.value.trim(), email: auth.currentUser.email || "" });
      toast("Profile saved!", "success");
      location.reload();
    } catch (e) {
      console.error("Complete profile error:", e.code, e.message, e);
      let msg = e.message || "Could not save profile.";
      if (msg.includes("offline") || msg.includes("unavailable")) {
        msg = "Cannot reach the database right now. Please check your internet connection and try again in a moment.";
      } else if (msg.includes("permission")) {
        msg = "Database permission denied. Make sure Firestore rules allow writes for authenticated users.";
      }
      err.textContent = msg;
      busy(submit, false, "Finish setup");
    }
  });

  mountFull(shell([
    el("div", { class: "tagline", text: "Finish setting up your profile" }),
    el("div", { class: "field" }, [el("label", { text: "Name" }), name]),
    el("div", { class: "field" }, [el("label", { text: "Username" }), username]),
    err,
    submit,
    el("div", { class: "auth-switch mt" }, [
      el("a", { class: "link", text: "Log out and start fresh", onClick: () => fb.signOut(auth).then(() => navigate("/login")) }),
    ]),
  ]));
}
