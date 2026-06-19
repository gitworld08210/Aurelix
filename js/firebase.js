// Firebase bootstrap. The SDK is loaded from the official gstatic CDN at runtime
// (in the user's browser), so no npm install / bundling is required.
import { getConfig, FIREBASE_VERSION } from "./config.js";

const V = FIREBASE_VERSION;
const base = `https://www.gstatic.com/firebasejs/${V}`;

// Re-export the parts of the SDK the app uses, so other modules import from here.
export let app = null;
export let auth = null;
export let db = null;
export let fb = null; // namespace bag of imported functions

let initPromise = null;

export function initFirebase() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    const cfg = getConfig();
    if (!cfg || !cfg.firebase) throw new Error("Firebase is not configured.");

    const [appMod, authMod, fsMod] = await Promise.all([
      import(`${base}/firebase-app.js`),
      import(`${base}/firebase-auth.js`),
      import(`${base}/firebase-firestore.js`),
    ]);

    app = appMod.initializeApp(cfg.firebase);

    // ── App Check: DISABLED for development ──────────────────────────────────
    // If App Check is enabled in the Firebase Console, it rejects requests from
    // web apps that don't present a valid token (error: auth/firebase-app-check-
    // token-is-invalid). We activate the DEBUG provider so the SDK sends a debug
    // token that Firebase accepts without reCAPTCHA verification.
    //
    // TO FULLY DISABLE: Go to Firebase Console → App Check → Apps tab →
    // click the overflow menu (⋮) on your web app → select "Unenforce" or
    // "Unregister". That stops the server from requiring tokens entirely.
    try {
      const appCheckMod = await import(`${base}/firebase-app-check.js`);
      // Setting this global tells the SDK to use a debug token instead of reCAPTCHA.
      if (typeof self !== "undefined") self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      appCheckMod.initializeAppCheck(app, {
        provider: new appCheckMod.ReCaptchaEnterpriseProvider("FAKE_DEBUG_KEY"),
        isTokenAutoRefreshEnabled: true,
      });
      console.log("App Check: debug mode enabled (bypasses enforcement)");
    } catch (e) {
      // If the App Check module fails to load or init, that's fine —
      // it means App Check isn't enforced and we don't need it.
      console.warn("App Check init skipped:", e.message);
    }

    auth = authMod.getAuth(app);

    // Persistent login session across reloads/tabs.
    try {
      await authMod.setPersistence(auth, authMod.browserLocalPersistence);
    } catch (e) {
      console.warn("Could not set auth persistence:", e);
    }

    // ── Firestore transport fix ──────────────────────────────────────────────
    // Force long-polling so Firestore works on mobile carriers/proxies that
    // block WebChannel streaming.
    try {
      db = fsMod.initializeFirestore(app, {
        experimentalForceLongPolling: true,
        useFetchStreams: false,
      });
    } catch (e) {
      console.warn("initializeFirestore fallback:", e.message);
      db = fsMod.getFirestore(app);
    }

    // Bag of every Firestore/Auth function the services need.
    fb = {
      // auth
      createUserWithEmailAndPassword: authMod.createUserWithEmailAndPassword,
      signInWithEmailAndPassword: authMod.signInWithEmailAndPassword,
      sendPasswordResetEmail: authMod.sendPasswordResetEmail,
      signOut: authMod.signOut,
      onAuthStateChanged: authMod.onAuthStateChanged,
      updateProfile: authMod.updateProfile,
      // firestore
      collection: fsMod.collection,
      collectionGroup: fsMod.collectionGroup,
      doc: fsMod.doc,
      getDoc: fsMod.getDoc,
      getDocs: fsMod.getDocs,
      setDoc: fsMod.setDoc,
      addDoc: fsMod.addDoc,
      updateDoc: fsMod.updateDoc,
      deleteDoc: fsMod.deleteDoc,
      onSnapshot: fsMod.onSnapshot,
      query: fsMod.query,
      where: fsMod.where,
      orderBy: fsMod.orderBy,
      limit: fsMod.limit,
      startAfter: fsMod.startAfter,
      serverTimestamp: fsMod.serverTimestamp,
      increment: fsMod.increment,
      arrayUnion: fsMod.arrayUnion,
      arrayRemove: fsMod.arrayRemove,
      writeBatch: fsMod.writeBatch,
      runTransaction: fsMod.runTransaction,
      Timestamp: fsMod.Timestamp,
    };

    return { app, auth, db, fb };
  })();
  return initPromise;
}
