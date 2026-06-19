// Reels: short vertical videos stored on Cloudinary, metadata in Firestore.
import { db, fb } from "../firebase.js";
import { createNotification } from "./notifications.js";

const reelsCol = () => fb.collection(db, "reels");

export async function createReel(author, { videoUrl, thumbnail, caption = "", width, height, duration }) {
  const reel = {
    authorId: author.id,
    authorName: author.displayName || author.username,
    authorUsername: author.username,
    authorPhoto: author.photoURL || "",
    authorVerified: !!author.verified,
    authorPremium: !!author.premium,
    videoUrl,
    thumbnail: thumbnail || "",
    caption: caption.trim(),
    width: width || null,
    height: height || null,
    duration: duration || null,
    likesCount: 0,
    commentsCount: 0,
    savesCount: 0,
    viewsCount: 0,
    createdAt: fb.serverTimestamp(),
  };
  const ref = await fb.addDoc(reelsCol(), reel);
  await fb.updateDoc(fb.doc(db, "users", author.id), { reelsCount: fb.increment(1) });
  return { id: ref.id, ...reel };
}

export async function deleteReel(reel) {
  await fb.deleteDoc(fb.doc(db, "reels", reel.id));
  await fb.updateDoc(fb.doc(db, "users", reel.authorId), { reelsCount: fb.increment(-1) }).catch(() => {});
}

export async function fetchReelsPage({ cursor = null, pageSize = 6 } = {}) {
  let q = fb.query(reelsCol(), fb.orderBy("createdAt", "desc"), fb.limit(pageSize));
  if (cursor) q = fb.query(reelsCol(), fb.orderBy("createdAt", "desc"), fb.startAfter(cursor), fb.limit(pageSize));
  const snap = await fb.getDocs(q);
  return {
    items: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    cursor: snap.docs.length ? snap.docs[snap.docs.length - 1] : null,
    done: snap.docs.length < pageSize,
  };
}

export async function fetchUserReels(uid, max = 30) {
  const q = fb.query(reelsCol(), fb.where("authorId", "==", uid), fb.orderBy("createdAt", "desc"), fb.limit(max));
  const snap = await fb.getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export function watchReel(id, cb) {
  return fb.onSnapshot(fb.doc(db, "reels", id), (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null));
}

export async function getReelById(id) {
  const snap = await fb.getDoc(fb.doc(db, "reels", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

const likeRef = (reelId, uid) => fb.doc(db, "reels", reelId, "likes", uid);
const saveRef = (reelId, uid) => fb.doc(db, "reels", reelId, "saves", uid);

export async function hasLikedReel(reelId, uid) {
  return (await fb.getDoc(likeRef(reelId, uid))).exists();
}
export async function hasSavedReel(reelId, uid) {
  return (await fb.getDoc(saveRef(reelId, uid))).exists();
}

export async function toggleReelLike(reel, user, liked) {
  const uid = user.id;
  const batch = fb.writeBatch(db);
  if (liked) {
    batch.set(likeRef(reel.id, uid), { uid, createdAt: fb.serverTimestamp() });
    batch.update(fb.doc(db, "reels", reel.id), { likesCount: fb.increment(1) });
  } else {
    batch.delete(likeRef(reel.id, uid));
    batch.update(fb.doc(db, "reels", reel.id), { likesCount: fb.increment(-1) });
  }
  await batch.commit();
  if (liked && reel.authorId !== uid) {
    createNotification(reel.authorId, {
      type: "like", entity: "reel", entityId: reel.id,
      actorId: uid, actorName: user.displayName, actorUsername: user.username, actorPhoto: user.photoURL || "",
      preview: reel.caption?.slice(0, 60) || "",
    }).catch(() => {});
  }
}

export async function toggleReelSave(reel, user, saved) {
  const uid = user.id;
  const batch = fb.writeBatch(db);
  if (saved) {
    batch.set(saveRef(reel.id, uid), { uid, createdAt: fb.serverTimestamp() });
    batch.set(fb.doc(db, "users", uid, "saved", reel.id), { reelId: reel.id, createdAt: fb.serverTimestamp() });
    batch.update(fb.doc(db, "reels", reel.id), { savesCount: fb.increment(1) });
  } else {
    batch.delete(saveRef(reel.id, uid));
    batch.delete(fb.doc(db, "users", uid, "saved", reel.id));
    batch.update(fb.doc(db, "reels", reel.id), { savesCount: fb.increment(-1) });
  }
  await batch.commit();
}

/** Count a view (fire-and-forget). */
export function addView(reelId) {
  return fb.updateDoc(fb.doc(db, "reels", reelId), { viewsCount: fb.increment(1) }).catch(() => {});
}
