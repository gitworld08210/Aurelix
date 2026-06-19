// In-app notifications: /notifications/{uid}/items/{id}
import { db, fb } from "../firebase.js";

export async function createNotification(targetUid, data) {
  if (!targetUid || targetUid === data.actorId) return; // never notify yourself
  await fb.addDoc(fb.collection(db, "notifications", targetUid, "items"), {
    ...data,
    read: false,
    createdAt: fb.serverTimestamp(),
  });
}

export function watchNotifications(uid, cb, max = 50) {
  const q = fb.query(
    fb.collection(db, "notifications", uid, "items"),
    fb.orderBy("createdAt", "desc"),
    fb.limit(max)
  );
  return fb.onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

/** Realtime count of unread notifications. */
export function watchUnreadCount(uid, cb) {
  const q = fb.query(fb.collection(db, "notifications", uid, "items"), fb.where("read", "==", false), fb.limit(100));
  return fb.onSnapshot(q, (snap) => cb(snap.size), () => cb(0));
}

export async function markAllRead(uid, items) {
  const unread = items.filter((n) => !n.read);
  if (!unread.length) return;
  const batch = fb.writeBatch(db);
  unread.forEach((n) => batch.update(fb.doc(db, "notifications", uid, "items", n.id), { read: true }));
  await batch.commit();
}
