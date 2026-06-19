// User profile data access.
import { db, fb } from "../firebase.js";

export function userRef(uid) { return fb.doc(db, "users", uid); }

export async function getUser(uid) {
  if (!uid) return null;
  const snap = await fb.getDoc(userRef(uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function watchUser(uid, cb) {
  return fb.onSnapshot(userRef(uid), (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null));
}

export async function getUserByUsername(username) {
  const lower = String(username).toLowerCase();
  const nameSnap = await fb.getDoc(fb.doc(db, "usernames", lower));
  if (nameSnap.exists()) return getUser(nameSnap.data().uid);
  // fallback: query users by usernameLower
  const q = fb.query(fb.collection(db, "users"), fb.where("usernameLower", "==", lower), fb.limit(1));
  const res = await fb.getDocs(q);
  return res.empty ? null : { id: res.docs[0].id, ...res.docs[0].data() };
}

export async function isUsernameAvailable(username, exceptUid = null) {
  const lower = String(username).toLowerCase();
  const snap = await fb.getDoc(fb.doc(db, "usernames", lower));
  if (!snap.exists()) return true;
  return exceptUid != null && snap.data().uid === exceptUid;
}

/** Create the user profile + reserve the username. Uses a batch write for reliability on initial signup. */
export async function createUserProfile(uid, { username, displayName, email, photoURL = "" }) {
  const lower = username.toLowerCase();
  const nameRef = fb.doc(db, "usernames", lower);

  // Quick check if username is taken (best effort — rules also enforce)
  try {
    const nameSnap = await fb.getDoc(nameRef);
    if (nameSnap.exists() && nameSnap.data().uid !== uid) {
      throw new Error("That username is already taken.");
    }
  } catch (e) {
    // If the check itself fails (permission denied on fresh auth), proceed anyway
    // — the setDoc will fail if rules block it, and we handle that upstream.
    if (e.message === "That username is already taken.") throw e;
    console.warn("Username pre-check failed, proceeding:", e.message);
  }

  // Use a batch (not transaction) — more resilient to fresh-token timing.
  const batch = fb.writeBatch(db);
  batch.set(nameRef, { uid });
  batch.set(userRef(uid), {
    username,
    usernameLower: lower,
    displayName: displayName || username,
    displayNameLower: (displayName || username).toLowerCase(),
    email: email || "",
    bio: "",
    photoURL,
    followersCount: 0,
    followingCount: 0,
    postsCount: 0,
    reelsCount: 0,
    totalViews: 0,
    verified: false,
    premium: false,
    isAdmin: false,
    creatorMode: false,
    createdAt: fb.serverTimestamp(),
  });
  await batch.commit();
  return getUser(uid);
}

export async function updateUser(uid, data) {
  const patch = { ...data };
  if (data.displayName != null) patch.displayNameLower = String(data.displayName).toLowerCase();
  await fb.updateDoc(userRef(uid), patch);
}

/** Change username: free the old reservation, claim the new one. */
export async function changeUsername(uid, newUsername, oldUsername) {
  const lower = newUsername.toLowerCase();
  await fb.runTransaction(db, async (tx) => {
    const nameRef = fb.doc(db, "usernames", lower);
    const nameSnap = await tx.get(nameRef);
    if (nameSnap.exists() && nameSnap.data().uid !== uid) throw new Error("That username is already taken.");
    tx.set(nameRef, { uid });
    if (oldUsername && oldUsername.toLowerCase() !== lower) {
      tx.delete(fb.doc(db, "usernames", oldUsername.toLowerCase()));
    }
    tx.update(userRef(uid), { username: newUsername, usernameLower: lower });
  });
}

/** Prefix search across username + display name. Returns merged, de-duped users. */
export async function searchUsers(term, max = 20) {
  const t = String(term).trim().toLowerCase();
  if (!t) return [];
  const end = t + "\uf8ff";
  const byUsername = fb.getDocs(fb.query(
    fb.collection(db, "users"), fb.orderBy("usernameLower"), fb.where("usernameLower", ">=", t), fb.where("usernameLower", "<=", end), fb.limit(max)
  ));
  const byName = fb.getDocs(fb.query(
    fb.collection(db, "users"), fb.orderBy("displayNameLower"), fb.where("displayNameLower", ">=", t), fb.where("displayNameLower", "<=", end), fb.limit(max)
  ));
  const [a, b] = await Promise.all([byUsername, byName]);
  const seen = new Map();
  [...a.docs, ...b.docs].forEach((d) => { if (!seen.has(d.id)) seen.set(d.id, { id: d.id, ...d.data() }); });
  return [...seen.values()].slice(0, max);
}

/** Suggestions: newest users (excluding given uid). */
export async function suggestedUsers(excludeUid, max = 5) {
  const snap = await fb.getDocs(fb.query(fb.collection(db, "users"), fb.orderBy("createdAt", "desc"), fb.limit(max + 5)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((u) => u.id !== excludeUid).slice(0, max);
}
