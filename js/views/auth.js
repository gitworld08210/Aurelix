// Authentication screens: login, signup, forgot password.
import { el, toast } from "../utils.js";
import { mountFull } from "../shell.js";
import { auth, fb } from "../firebase.js";
import { navigate } from "../router.js";
import { createUserProfile, isUsernameAvailable } from "../services/users.js";

function authErrorMessage(code = "") {
  const map = {
    "auth/invalid-email": "That email address looks invalid.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Incorrect email or password.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/email-already-in-use": "An account already exists with that email.",
    "auth/weak-password": "Password should be at least 6 characters.",
    "auth/too-many-requests": "Too many attempts. Try again later.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "auth/operation-not-allowed": "Email/password sign-in is disabled in Firebase. Enable it in Authentication → Sign-in method.",
  };
  return map[code] || "Something went wrong. Please try again.";
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
      // main.js auth listener handles redirect
    } catch (e) {
      err.textContent = authErrorMessage(e.code);
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

export function renderSignup() {
  const name = el("input", { class: "input", placeholder: "Your name", autocomplete: "name" });
  const username = el("input", { class: "input", placeholder: "username", autocomplete: "off", spellcheck: false });
  const email = el("input", { class: "input", type: "email", placeholder: "you@example.com", autocomplete: "email" });
  const pass = el("input", { class: "input", type: "password", placeholder: "Password (min 6 chars)", autocomplete: "new-password" });
  const err = el("div", { class: "error-text" });
  const uHint = el("div", { class: "hint" });
  const submit = el("button", { class: "btn primary full mt", text: "Create account" });

  username.addEventListener("input", () => {
    username.value = username.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
  });

  const doSignup = async () => {
    err.textContent = ""; uHint.textContent = "";
    const uname = username.value.trim();
    if (!name.value.trim()) return (err.textContent = "Please enter your name.");
    if (uname.length < 3) return (err.textContent = "Username must be at least 3 characters.");
    if (!email.value.trim()) return (err.textContent = "Please enter your email.");
    if (pass.value.length < 6) return (err.textContent = "Password must be at least 6 characters.");

    busy(submit, true);
    try {
      const available = await isUsernameAvailable(uname);
      if (!available) { err.textContent = "That username is taken."; busy(submit, false, "Create account"); return; }

      const cred = await fb.createUserWithEmailAndPassword(auth, email.value.trim(), pass.value);
      await fb.updateProfile(cred.user, { displayName: name.value.trim() });
      await createUserProfile(cred.user.uid, {
        username: uname,
        displayName: name.value.trim(),
        email: email.value.trim(),
      });
      toast("Welcome to Aurelix!", "success");
      // main.js auth listener will load the profile and route home
    } catch (e) {
      console.error(e);
      err.textContent = e.code ? authErrorMessage(e.code) : (e.message || "Could not create account.");
      busy(submit, false, "Create account");
    }
  };
  submit.addEventListener("click", doSignup);
  pass.addEventListener("keydown", (e) => { if (e.key === "Enter") doSignup(); });

  mountFull(shell([
    el("div", { class: "tagline", text: "Create your account" }),
    el("div", { class: "field" }, [el("label", { text: "Name" }), name]),
    el("div", { class: "field" }, [el("label", { text: "Username" }), username, uHint]),
    el("div", { class: "field" }, [el("label", { text: "Email" }), email]),
    el("div", { class: "field" }, [el("label", { text: "Password" }), pass]),
    err,
    submit,
    el("div", { class: "auth-switch" }, ["Already have an account? ", el("a", { text: "Log in", onClick: () => navigate("/login") })]),
  ]));
}

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
      err.textContent = authErrorMessage(e.code);
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


// Shown when an authenticated user has no profile document yet (e.g. interrupted signup).
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
      if (!(await isUsernameAvailable(uname))) { err.textContent = "That username is taken."; busy(submit, false, "Finish setup"); return; }
      await createUserProfile(auth.currentUser.uid, { username: uname, displayName: name.value.trim(), email: auth.currentUser.email || "" });
      location.reload();
    } catch (e) {
      err.textContent = e.message || "Could not finish setup.";
      busy(submit, false, "Finish setup");
    }
  });

  mountFull(shell([
    el("div", { class: "tagline", text: "Finish setting up your profile" }),
    el("div", { class: "field" }, [el("label", { text: "Name" }), name]),
    el("div", { class: "field" }, [el("label", { text: "Username" }), username]),
    err,
    submit,
  ]));
}
