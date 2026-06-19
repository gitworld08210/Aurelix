// Comments for posts and reels (shared logic, parent collection differs).
import { db, fb } from "../firebase.js";
import { createNotification } from "./notifications.js";

// kind: 'posts' | 'reels'
function parentRef(kind, parentId) { return fb.doc(db, kind, parentId); }
function commentsCol(kind, parentId) { return fb.collection(db, kind, parentId, "comments"); }

export function watchComments(kind, parentId, cb) {
  const q = fb.query(commentsCol(kind, parentId), fb.orderBy("createdAt", "asc"), fb.limit(200));
  return fb.onSnapshot(q, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export async function addComment(kind, parent, user, text) {
  const body = text.trim();
  if (!body) return;
  const batch = fb.writeBatch(db);
  const ref = fb.doc(commentsCol(kind, parent.id));
  batch.set(ref, {
    text: body,
    authorId: user.id,
    authorName: user.displayName || user.username,
    authorUsername: user.username,
    authorPhoto: user.photoURL || "",
    authorVerified: !!user.verified,
    createdAt: fb.serverTimestamp(),
  });
  batch.update(parentRef(kind, parent.id), { commentsCount: fb.increment(1) });
  await batch.commit();
  if (parent.authorId && parent.authorId !== user.id) {
    createNotification(parent.authorId, {
      type: "comment", entity: kind === "posts" ? "post" : "reel", entityId: parent.id,
      actorId: user.id, actorName: user.displayName, actorUsername: user.username, actorPhoto: user.photoURL || "",
      preview: body.slice(0, 60),
    }).catch(() => {});
  }
}

export async function deleteComment(kind, parentId, commentId) {
  const batch = fb.writeBatch(db);
  batch.delete(fb.doc(db, kind, parentId, "comments", commentId));
  batch.update(parentRef(kind, parentId), { commentsCount: fb.increment(-1) });
  await batch.commit();
}
