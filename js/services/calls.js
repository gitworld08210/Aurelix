// Firestore signaling primitives for WebRTC calls.
import { db, fb } from "../firebase.js";

const callsCol = () => fb.collection(db, "calls");
export const callRef = (id) => fb.doc(db, "calls", id);

export async function createCallDoc({ caller, callee, type }) {
  const ref = fb.doc(callsCol());
  await fb.setDoc(ref, {
    callerId: caller.id,
    callerName: caller.displayName || caller.username,
    callerPhoto: caller.photoURL || "",
    calleeId: callee.id,
    calleeName: callee.displayName || callee.username,
    calleePhoto: callee.photoURL || "",
    type, // 'video' | 'voice'
    status: "ringing",
    offer: null,
    answer: null,
    createdAt: fb.serverTimestamp(),
  });
  return ref.id;
}

export const setOffer = (id, offer) => fb.updateDoc(callRef(id), { offer });
export const setAnswer = (id, answer) => fb.updateDoc(callRef(id), { answer, status: "accepted" });
export const setStatus = (id, status) => fb.updateDoc(callRef(id), { status }).catch(() => {});

export function watchCall(id, cb) {
  return fb.onSnapshot(callRef(id), (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null));
}

export function addCandidate(id, side, candidate) {
  return fb.addDoc(fb.collection(db, "calls", id, side), candidate);
}

export function watchCandidates(id, side, cb) {
  return fb.onSnapshot(fb.collection(db, "calls", id, side), (snap) => {
    snap.docChanges().forEach((ch) => { if (ch.type === "added") cb(ch.doc.data()); });
  });
}

/** Watch for incoming ringing calls addressed to me. */
export function watchIncomingCalls(uid, cb) {
  const q = fb.query(callsCol(), fb.where("calleeId", "==", uid), fb.where("status", "==", "ringing"), fb.limit(5));
  return fb.onSnapshot(q, (snap) => {
    const calls = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      // ignore stale ringing docs (older than 60s)
      .filter((c) => !c.createdAt || (Date.now() - c.createdAt.toMillis() < 60000));
    cb(calls);
  }, (e) => { console.warn("incoming calls watch:", e); });
}

export async function cleanupCall(id) {
  // delete candidate subcollections + call doc (best-effort)
  for (const side of ["callerCandidates", "calleeCandidates"]) {
    const snap = await fb.getDocs(fb.collection(db, "calls", id, side)).catch(() => null);
    if (snap) { const b = fb.writeBatch(db); snap.docs.forEach((d) => b.delete(d.ref)); await b.commit().catch(() => {}); }
  }
  await fb.deleteDoc(callRef(id)).catch(() => {});
}
