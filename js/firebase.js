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

// Test seam: lets the automated test harness inject an in-memory backend.
// Unused in production. Has no effect on the real app.
export function __setTestBackend(testFb, testDb, testAuth) {
  fb = testFb; db = testDb; auth = testAuth;
}

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

    // NOTE: App Check is intentionally NOT initialized.
    // Initializing it client-side (especially with a reCAPTCHA provider) attaches
    // App Check tokens to every Auth/Firestore request. If the key/token isn't
    // perfectly valid, requests fail with auth/network-request-failed or
    // app-check-token-is-invalid. Since this project does not enforce App Check,
    // we leave it off completely so Auth and Firestore use plain authenticated calls.

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
