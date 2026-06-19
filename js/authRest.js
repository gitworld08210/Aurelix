// Firebase Auth via REST API — bypasses the SDK's internal transport entirely.
// Uses a simple fetch() POST, which works on networks where the SDK's
// XMLHttpRequest/WebChannel approach gets blocked by carrier proxies.
//
// API docs: https://firebase.google.com/docs/reference/rest/auth

import { getConfig } from "./config.js";

const AUTH_BASE = "https://identitytoolkit.googleapis.com/v1";

function apiKey() {
  const cfg = getConfig();
  return cfg?.firebase?.apiKey || "";
}

function url(endpoint) {
  return `${AUTH_BASE}/${endpoint}?key=${apiKey()}`;
}

async function post(endpoint, body) {
  const resp = await fetch(url(endpoint), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  if (!resp.ok) {
    const code = data?.error?.message || "UNKNOWN_ERROR";
    const err = new Error(mapErrorMessage(code));
    err.code = "auth/" + code.toLowerCase().replace(/_/g, "-");
    err.serverMessage = code;
    throw err;
  }
  return data;
}

function mapErrorMessage(code) {
  const map = {
    "EMAIL_EXISTS": "This email is already registered.",
    "INVALID_EMAIL": "Invalid email address.",
    "WEAK_PASSWORD": "Password must be at least 6 characters.",
    "EMAIL_NOT_FOUND": "No account found with this email.",
    "INVALID_PASSWORD": "Incorrect password.",
    "INVALID_LOGIN_CREDENTIALS": "Incorrect email or password.",
    "USER_DISABLED": "This account has been disabled.",
    "TOO_MANY_ATTEMPTS_TRY_LATER": "Too many attempts. Try again later.",
    "OPERATION_NOT_ALLOWED": "Email/Password sign-in is not enabled in Firebase Console.",
    "ADMIN_ONLY_OPERATION": "Email/Password sign-in is not enabled in Firebase Console.",
  };
  return map[code] || code;
}

/**
 * Create a new account with email + password.
 * Returns { idToken, email, refreshToken, localId (uid), displayName }
 */
export async function signUpWithEmail(email, password) {
  return post("accounts:signUp", {
    email,
    password,
    returnSecureToken: true,
  });
}

/**
 * Sign in with email + password.
 * Returns { idToken, email, refreshToken, localId (uid), displayName }
 */
export async function signInWithEmail(email, password) {
  return post("accounts:signInWithPassword", {
    email,
    password,
    returnSecureToken: true,
  });
}

/**
 * Update the display name on an existing account.
 */
export async function updateDisplayName(idToken, displayName) {
  return post("accounts:update", {
    idToken,
    displayName,
    returnSecureToken: false,
  });
}

/**
 * Send a password reset email.
 */
export async function sendPasswordReset(email) {
  return post("accounts:sendOobCode", {
    requestType: "PASSWORD_RESET",
    email,
  });
}

/**
 * Exchange a refresh token for a new ID token (keeps the session alive).
 */
export async function refreshIdToken(refreshToken) {
  const cfg = getConfig();
  const resp = await fetch(`https://securetoken.googleapis.com/v1/token?key=${apiKey()}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || "Token refresh failed");
  return { idToken: data.id_token, refreshToken: data.refresh_token, uid: data.user_id };
}
