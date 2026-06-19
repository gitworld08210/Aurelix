// Posts: text + image. Likes stored as subcollection; counts denormalized.
import { db, fb } from "../firebase.js";
import { createNotification } from "./notifications.js";

const postsCol = () => fb.collection(db, "posts");

export async function createPost(author, { text = "", media = null }) {
  const authorId = author.id;
  const post = {
    authorId,
    authorName: author.displayName || author.username,
    authorUsername: author.username,
    authorPhoto: author.photoURL || "",
    authorVerified: !!author.verified,
    authorPremium: !!author.premium,
    text: text.trim(),
    media: media || null, // { url, type:'image', width, height }
    likesCount: 0,
    commentsCount: 0,
    createdAt: fb.serverTimestamp(),
  };
  const ref = await fb.addDoc(postsCol(), post);
  await fb.updateDoc(fb.doc(db, "users", authorId), { postsCount: fb.increment(1) });
  return { id: ref.id, ...post };
}

export async function deletePost(post) {
  await fb.deleteDoc(fb.doc(db, "posts", post.id));
  await fb.updateDoc(fb.doc(db, "users", post.authorId), { postsCount: fb.increment(-1) }).catch(() => {});
}

export async function getPost(id) {
  const snap = await fb.getDoc(fb.doc(db, "posts", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function watchPost(id, cb) {
  return fb.onSnapshot(fb.doc(db, "posts", id), (snap) => cb(snap.exists() ? { id: snap.id, ...snap.data() } : null));
}

/** Home feed page. Pass the last doc snapshot's createdAt cursor for pagination. */
export async function fetchFeedPage({ cursor = null, pageSize = 10 } = {}) {
  let q = fb.query(postsCol(), fb.orderBy("createdAt", "desc"), fb.limit(pageSize));
  if (cursor) q = fb.query(postsCol(), fb.orderBy("createdAt", "desc"), fb.startAfter(cursor), fb.limit(pageSize));
  const snap = await fb.getDocs(q);
  return {
    items: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    cursor: snap.docs.length ? snap.docs[snap.docs.length - 1] : null,
    done: snap.docs.length < pageSize,
  };
}

export async function fetchUserPosts(uid, max = 30) {
  const q = fb.query(postsCol(), fb.where("authorId", "==", uid), fb.orderBy("createdAt", "desc"), fb.limit(max));
  const snap = await fb.getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

const likeRef = (postId, uid) => fb.doc(db, "posts", postId, "likes", uid);

export async function hasLiked(postId, uid) {
  const snap = await fb.getDoc(likeRef(postId, uid));
  return snap.exists();
}

export async function toggleLike(post, user, liked) {
  const uid = user.id;
  const batch = fb.writeBatch(db);
  if (liked) {
    batch.set(likeRef(post.id, uid), { uid, createdAt: fb.serverTimestamp() });
    batch.update(fb.doc(db, "posts", post.id), { likesCount: fb.increment(1) });
  } else {
    batch.delete(likeRef(post.id, uid));
    batch.update(fb.doc(db, "posts", post.id), { likesCount: fb.increment(-1) });
  }
  await batch.commit();
  if (liked && post.authorId !== uid) {
    createNotification(post.authorId, {
      type: "like", entity: "post", entityId: post.id,
      actorId: uid, actorName: user.displayName, actorUsername: user.username, actorPhoto: user.photoURL || "",
      preview: post.text?.slice(0, 60) || "",
    }).catch(() => {});
  }
}
