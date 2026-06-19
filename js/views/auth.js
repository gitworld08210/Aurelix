// Authentication screens using Firebase Auth REST API (primary) + SDK (fallback).
// The REST API uses plain fetch() which works on mobile networks that block the SDK.
import { el, toast } from "../utils.js";
import { mountFull } from "../shell.js";
import { auth, fb } from "../firebase.js";
import { navigate } from "../router.js";
import { createUserProfile } from "../services/users.js";
import { signUpWithEmail, signInWithEmail, updateDisplayName, sendPasswordReset } from "../authRest.js";

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
  if (on) btn.appendChild(el("span", { class: "spinner sm" }));
  else btn.textContent = labelIdle;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════════════════════
export function renderLogin() {
  const email = el("input", { class: "input", type: "email", placeholder: "you@example.com", autocomplete: "email" });
  const pass = el("input", { class: "input", type: "password", placeholder: "Password", autocomplete: "current-password" });
  const err = el("div", { class: "error-text", style: { whiteSpace: "pre-wrap", fontSize: "0.85rem" } });
  const submit = el("button", { class: "btn primary full mt", text: "Log in" });

  const doLogin = async () => {
    err.textContent = "";
    if (!email.value.trim() || !pass.value) { err.textContent = "Enter your email and password."; return; }
    busy(submit, true);
    try {
      // Primary: REST API (plain fetch, works on all networks)
      const result = await signInWithEmail(email.value.trim(), pass.value);
      console.log("REST login success, uid:", result.localId);
      // Now sign in with the SDK so onAuthStateChanged fires
      try {
        await fb.signInWithEmailAndPassword(auth, email.value.trim(), pass.value);
      } catch (sdkErr) {
        console.warn("SDK signIn failed (REST already succeeded):", sdkErr.code);
        // REST worked so the account exists — force reload to pick up auth state
        localStorage.setItem("aurelix.restAuth", JSON.stringify({ uid: result.localId, email: result.email, idToken: result.idToken, refreshToken: result.refreshToken }));
        location.reload();
      }
    } catch (e) {
      console.error("Login error:", e);
      err.textContent = e.message || "Login failed. Unknown error.";
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
  const err = el("div", { class: "error-text", style: { whiteSpace: "pre-wrap", fontSize: "0.85rem" } });
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
      // ── Step 1: Create account via REST API (plain fetch) ──
      err.textContent = "Creating account…";
      const result = await signUpWithEmail(email.value.trim(), pass.value);
      console.log("REST signup success, uid:", result.localId);

      // Set display name
      try { await updateDisplayName(result.idToken, name.value.trim()); } catch (e) { console.warn("displayName update:", e); }

      err.textContent = "Account created! Signing in…";

      // ── Step 2: Sign in with SDK so onAuthStateChanged fires ──
      try {
        await fb.signInWithEmailAndPassword(auth, email.value.trim(), pass.value);
      } catch (sdkErr) {
        console.warn("SDK signIn failed after REST signup:", sdkErr.code);
        // Store auth info and reload — the app will detect the user on next boot
        localStorage.setItem("aurelix.restAuth", JSON.stringify({ uid: result.localId, email: result.email, displayName: name.value.trim(), idToken: result.idToken, refreshToken: result.refreshToken }));
        location.reload();
        return;
      }

      // ── Step 3: Create Firestore profile (best-effort, background) ──
      createUserProfileSafe(result.localId, uname, name.value.trim(), email.value.trim());
      toast("Welcome to Aurelix! 🎉", "success");

    } catch (e) {
      console.error("Signup error:", e);
      err.textContent = e.message || "Signup failed. Unknown error.";
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

async function createUserProfileSafe(uid, username, displayName, email) {
  const attempts = [800, 2000, 4000];
  for (let i = 0; i < attempts.length; i++) {
    await new Promise((r) => setTimeout(r, attempts[i]));
    try {
      await createUserProfile(uid, { username, displayName, email });
      console.log("Profile created successfully on attempt", i + 1);
      return;
    } catch (e) {
      console.warn(`Profile creation attempt ${i + 1} failed:`, e.message);
    }
  }
  console.error("All profile creation attempts failed. Will retry on next load.");
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
      await sendPasswordReset(email.value.trim());
      ok.textContent = "Check your inbox for a password reset link.";
      busy(submit, false, "Send reset link");
    } catch (e) {
      err.textContent = e.message || "Could not send reset email.";
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
// COMPLETE PROFILE
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
      console.error("Complete profile error:", e);
      err.textContent = e.message || "Could not save profile. Try again.";
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
