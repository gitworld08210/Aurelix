// Direct + group messaging with realtime updates, read receipts and typing.
import { db, fb } from "../firebase.js";

const convCol = () => fb.collection(db, "conversations");
export const dmId = (a, b) => "dm_" + [a, b].sort().join("_");

function memberInfo(user) {
  return { displayName: user.displayName || user.username, username: user.username, photoURL: user.photoURL || "", verified: !!user.verified, premium: !!user.premium };
}

/** Get or create a 1:1 conversation between me and other. */
export async function getOrCreateDM(meUser, otherUser) {
  const id = dmId(meUser.id, otherUser.id);
  const ref = fb.doc(db, "conversations", id);
  const snap = await fb.getDoc(ref);
  if (!snap.exists()) {
    await fb.setDoc(ref, {
      isGroup: false,
      members: [meUser.id, otherUser.id],
      memberInfo: { [meUser.id]: memberInfo(meUser), [otherUser.id]: memberInfo(otherUser) },
      createdBy: meUser.id,
      lastMessage: null,
      updatedAt: fb.serverTimestamp(),
      createdAt: fb.serverTimestamp(),
    });
  }
  return id;
}

export async function createGroup(meUser, members, name) {
  const all = [meUser, ...members];
  const memberIds = all.map((u) => u.id);
  const info = {};
  all.forEach((u) => (info[u.id] = memberInfo(u)));
  const ref = await fb.addDoc(convCol(), {
    isGroup: true,
    name: name || "New group",
    members: memberIds,
    memberInfo: info,
    createdBy: meUser.id,
    lastMessage: null,
    updatedAt: fb.serverTimestamp(),
    createdAt: fb.serverTimestamp(),
  });
  return ref.id;
}

export function watchConversation(cid, cb) {
  return fb.onSnapshot(fb.doc(db, "conversations", cid), (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null));
}

export function watchMyConversations(uid, cb) {
  const q = fb.query(convCol(), fb.where("members", "array-contains", uid), fb.orderBy("updatedAt", "desc"), fb.limit(50));
  return fb.onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => { console.warn(e); cb([]); });
}

export function watchMessages(cid, cb) {
  const q = fb.query(fb.collection(db, "conversations", cid, "messages"), fb.orderBy("createdAt", "asc"), fb.limit(300));
  return fb.onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export async function sendMessage(cid, user, { text = "", image = null }) {
  const body = (text || "").trim();
  if (!body && !image) return;
  const msg = {
    senderId: user.id,
    senderName: user.displayName || user.username,
    senderPhoto: user.photoURL || "",
    text: body,
    image: image || null,
    type: image ? "image" : "text",
    readBy: [user.id],
    createdAt: fb.serverTimestamp(),
  };
  const batch = fb.writeBatch(db);
  const mref = fb.doc(fb.collection(db, "conversations", cid, "messages"));
  batch.set(mref, msg);
  batch.update(fb.doc(db, "conversations", cid), {
    lastMessage: { text: image ? "📷 Photo" : body, senderId: user.id, type: msg.type, createdAt: fb.serverTimestamp() },
    updatedAt: fb.serverTimestamp(),
  });
  await batch.commit();
}

/** Mark all unread messages (not sent by me) as read + stamp conversation read time. */
export async function markRead(cid, uid, messages) {
  const unread = messages.filter((m) => m.senderId !== uid && !(m.readBy || []).includes(uid));
  const batch = fb.writeBatch(db);
  unread.forEach((m) => batch.update(fb.doc(db, "conversations", cid, "messages", m.id), { readBy: fb.arrayUnion(uid) }));
  batch.update(fb.doc(db, "conversations", cid), { [`reads.${uid}`]: fb.serverTimestamp() });
  await batch.commit().catch(() => {});
}

export async function setTyping(cid, uid, typing) {
  await fb.setDoc(fb.doc(db, "conversations", cid, "typing", uid), { typing, updatedAt: fb.serverTimestamp() }).catch(() => {});
}

export function watchTyping(cid, meUid, cb) {
  return fb.onSnapshot(fb.collection(db, "conversations", cid, "typing"), (snap) => {
    const now = Date.now();
    const others = snap.docs
      .filter((d) => d.id !== meUid)
      .map((d) => ({ uid: d.id, ...d.data() }))
      .filter((t) => t.typing && t.updatedAt && (now - t.updatedAt.toMillis() < 6000));
    cb(others.map((t) => t.uid));
  });
}

/** Total unread conversations for the badge, based on per-member read timestamps. */
export function watchUnreadConversations(uid, cb) {
  const q = fb.query(convCol(), fb.where("members", "array-contains", uid), fb.orderBy("updatedAt", "desc"), fb.limit(50));
  return fb.onSnapshot(q, (snap) => {
    let count = 0;
    snap.docs.forEach((d) => {
      const c = d.data();
      const lm = c.lastMessage;
      if (!lm || lm.senderId === uid) return;
      const readAt = c.reads && c.reads[uid];
      if (!readAt || (lm.createdAt && lm.createdAt.toMillis() > readAt.toMillis())) count++;
    });
    cb(count);
  }, () => cb(0));
}

/** Per-conversation unread flag for the conversation list. */
export function isConversationUnread(c, uid) {
  const lm = c.lastMessage;
  if (!lm || lm.senderId === uid) return false;
  const readAt = c.reads && c.reads[uid];
  return !readAt || (lm.createdAt && readAt && lm.createdAt.toMillis() > readAt.toMillis());
}
