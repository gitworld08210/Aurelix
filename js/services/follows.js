// Follow / unfollow with counter maintenance + realtime watchers.
import { db, fb } from "../firebase.js";
import { createNotification } from "./notifications.js";

const followId = (followerId, followingId) => `${followerId}_${followingId}`;

export function followDocRef(followerId, followingId) {
  return fb.doc(db, "follows", followId(followerId, followingId));
}

export async function isFollowing(followerId, followingId) {
  if (!followerId || !followingId) return false;
  const snap = await fb.getDoc(followDocRef(followerId, followingId));
  return snap.exists();
}

/** Realtime "am I following X" watcher. */
export function watchIsFollowing(followerId, followingId, cb) {
  return fb.onSnapshot(followDocRef(followerId, followingId), (snap) => cb(snap.exists()));
}

export async function follow(follower, followingId) {
  const followerId = follower.id || follower.uid;
  if (followerId === followingId) throw new Error("You can't follow yourself.");
  const batch = fb.writeBatch(db);
  batch.set(followDocRef(followerId, followingId), {
    followerId,
    followingId,
    createdAt: fb.serverTimestamp(),
  });
  batch.update(fb.doc(db, "users", followerId), { followingCount: fb.increment(1) });
  batch.update(fb.doc(db, "users", followingId), { followersCount: fb.increment(1) });
  await batch.commit();
  // notify target
  createNotification(followingId, {
    type: "follow",
    actorId: followerId,
    actorName: follower.displayName,
    actorUsername: follower.username,
    actorPhoto: follower.photoURL || "",
  }).catch(() => {});
}

export async function unfollow(followerId, followingId) {
  const batch = fb.writeBatch(db);
  batch.delete(followDocRef(followerId, followingId));
  batch.update(fb.doc(db, "users", followerId), { followingCount: fb.increment(-1) });
  batch.update(fb.doc(db, "users", followingId), { followersCount: fb.increment(-1) });
  await batch.commit();
}

/** List the user ids that {uid} follows. */
export async function getFollowingIds(uid) {
  const q = fb.query(fb.collection(db, "follows"), fb.where("followerId", "==", uid), fb.limit(500));
  const snap = await fb.getDocs(q);
  return snap.docs.map((d) => d.data().followingId);
}

export async function getFollowing(uid) {
  return getFollowingIds(uid);
}

export async function getFollowerIds(uid) {
  const q = fb.query(fb.collection(db, "follows"), fb.where("followingId", "==", uid), fb.limit(500));
  const snap = await fb.getDocs(q);
  return snap.docs.map((d) => d.data().followerId);
}
