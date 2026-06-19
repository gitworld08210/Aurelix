// Runtime configuration for Aurelix.
//
// The app needs YOUR Firebase project + Cloudinary details. There are two ways
// to provide them:
//
//  1) RECOMMENDED for deploys: create js/config.local.js (git-ignored) that sets
//     window.AURELIX_CONFIG = { firebase: {...}, cloudinary: {...} };
//     and add <script src="./js/config.local.js"></script> before main.js in index.html.
//
//  2) ZERO-FILE option: just open the app — the built-in Setup screen lets you
//     paste your Firebase config + Cloudinary preset once. It is stored in this
//     browser's localStorage (key below). Great for trying it instantly.
//
// No keys are committed to the repo, and there is NO demo/placeholder data.

const STORAGE_KEY = "aurelix.config.v1";

const REQUIRED_FIREBASE = ["apiKey", "authDomain", "projectId", "appId"];

export function getConfig() {
  // window.AURELIX_CONFIG wins if present (from config.local.js)
  if (typeof window !== "undefined" && window.AURELIX_CONFIG) {
    return normalize(window.AURELIX_CONFIG);
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch { /* ignore */ }
  return null;
}

function normalize(cfg) {
  return {
    firebase: cfg.firebase || {},
    cloudinary: cfg.cloudinary || {},
  };
}

export function saveConfig(cfg) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function clearConfig() {
  localStorage.removeItem(STORAGE_KEY);
}

export function isFirebaseConfigured(cfg = getConfig()) {
  if (!cfg || !cfg.firebase) return false;
  return REQUIRED_FIREBASE.every((k) => typeof cfg.firebase[k] === "string" && cfg.firebase[k].trim().length > 0);
}

export function isCloudinaryConfigured(cfg = getConfig()) {
  return !!(cfg && cfg.cloudinary && cfg.cloudinary.cloudName && cfg.cloudinary.uploadPreset);
}

// Firebase SDK version loaded from the official CDN (runs in the user's browser).
export const FIREBASE_VERSION = "10.12.5";
