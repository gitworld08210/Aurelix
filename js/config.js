// Runtime configuration for Aurelix.
//
// The Firebase config is embedded below so the app works out-of-the-box on any
// deploy (Vercel, etc.) without a setup step. Cloudinary (for images/reels) can
// be added through the in-app Setup screen and is stored in localStorage.

const STORAGE_KEY = "aurelix.config.v1";
const REQUIRED_FIREBASE = ["apiKey", "authDomain", "projectId", "appId"];

// ---------------------------------------------------------------------------
// EMBEDDED FIREBASE CONFIG (your project: nexus-a9d8d)
// ---------------------------------------------------------------------------
const EMBEDDED = {
  firebase: {
    apiKey: "AIzaSyDjxMLvyL_c4zNDsY9rMF9L8ccNNPkPx3Y",
    authDomain: "nexus-a9d8d.firebaseapp.com",
    projectId: "nexus-a9d8d",
    storageBucket: "nexus-a9d8d.firebasestorage.app",
    messagingSenderId: "404148294813",
    appId: "1:404148294813:web:73743dd39450efda207074",
    measurementId: "G-ZGFY4H445T",
  },
  // Add your Cloudinary unsigned preset here OR via the in-app Setup screen
  // to enable photo/reel/avatar uploads.
  cloudinary: {
    cloudName: "",
    uploadPreset: "",
    folder: "aurelix",
  },
};

export function getConfig() {
  // window.AURELIX_CONFIG (from an optional config.local.js) overrides everything.
  if (typeof window !== "undefined" && window.AURELIX_CONFIG) {
    return normalize(window.AURELIX_CONFIG);
  }

  // Firebase is always the embedded config (so a corrupted/old localStorage entry
  // can never break the connection). Cloudinary can be augmented from localStorage.
  let storedCloudinary = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.cloudinary && parsed.cloudinary.cloudName) storedCloudinary = parsed.cloudinary;
    }
  } catch { /* ignore */ }

  return {
    firebase: { ...EMBEDDED.firebase },
    cloudinary: storedCloudinary || { ...EMBEDDED.cloudinary },
  };
}

function normalize(cfg) {
  return {
    firebase: cfg.firebase || {},
    cloudinary: cfg.cloudinary || {},
  };
}

/** Save only Cloudinary settings (Firebase is embedded). */
export function saveConfig(cfg) {
  const existing = getConfig();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    firebase: EMBEDDED.firebase,
    cloudinary: (cfg && cfg.cloudinary) || existing.cloudinary,
  }));
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
