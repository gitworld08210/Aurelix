// End-to-end test of the REAL app services against an in-memory Firebase mock.
// Exercises: signup/profile, username uniqueness, follow/unfollow + counters,
// posts + feed, likes, comments, search, reels, messaging, notifications.
import { createMockFirestore } from "./mock-firebase.mjs";
import { __setTestBackend } from "../js/firebase.js";

const { fb, db, store } = createMockFirestore();
__setTestBackend(fb, db, { currentUser: null });

// Import services AFTER injecting the backend (live bindings pick up the mock).
const users = await import("../js/services/users.js");
const follows = await import("../js/services/follows.js");
const posts = await import("../js/services/posts.js");
const comments = await import("../js/services/comments.js");
const reels = await import("../js/services/reels.js");
const messages = await import("../js/services/messages.js");
const notifications = await import("../js/services/notifications.js");

let pass = 0, fail = 0;
const results = [];
function check(name, cond, extra = "") {
  if (cond) { pass++; results.push("  ✓ " + name); }
  else { fail++; results.push("  ✗ FAIL: " + name + (extra ? "  → " + extra : "")); }
}
function section(t) { results.push("\n" + t); }

// snapshot-based watcher helper (mock emits once synchronously)
function once(watchFn) { let v; watchFn((x) => (v = x)); return v; }

try {
  // ─────────────────────────────────────────── SIGNUP / PROFILE ──
  section("1. Signup & profile creation");
  const alice = await users.createUserProfile("uA", { username: "alice", displayName: "Alice A", email: "a@x.com" });
  check("creates users/{uid} doc", !!alice && alice.id === "uA");
  check("stores username", alice.username === "alice");
  check("reserves usernames/{name}", !!store.get("usernames/alice"));
  check("counters start at 0", alice.followersCount === 0 && alice.followingCount === 0 && alice.postsCount === 0);
  check("flags default false", alice.verified === false && alice.premium === false);

  const bob = await users.createUserProfile("uB", { username: "bob", displayName: "Bob B", email: "b@x.com" });
  check("second user created", bob.id === "uB");

  // ─────────────────────────────────────────── USERNAME UNIQUENESS ──
  section("2. Username uniqueness");
  check("taken username unavailable", (await users.isUsernameAvailable("alice")) === false);
  check("free username available", (await users.isUsernameAvailable("charlie")) === true);
  let dup = false;
  try { await users.createUserProfile("uC", { username: "alice", displayName: "Imposter", email: "c@x.com" }); }
  catch { dup = true; }
  check("duplicate username rejected", dup);

  // ─────────────────────────────────────────── LOOKUP / SEARCH ──
  section("3. Lookup & search");
  const byName = await users.getUserByUsername("bob");
  check("getUserByUsername works", byName && byName.id === "uB");
  const found = await users.searchUsers("al");
  check("searchUsers prefix finds alice", found.some((u) => u.id === "uA"));

  // ─────────────────────────────────────────── FOLLOW / UNFOLLOW ──
  section("4. Follow system + counters");
  await follows.follow(alice, "uB");
  check("isFollowing true after follow", (await follows.isFollowing("uA", "uB")) === true);
  check("alice.followingCount = 1", (await users.getUser("uA")).followingCount === 1);
  check("bob.followersCount = 1", (await users.getUser("uB")).followersCount === 1);
  const bobNotifs = once((cb) => notifications.watchNotifications("uB", cb));
  check("follow created a notification for bob", bobNotifs.some((n) => n.type === "follow" && n.actorId === "uA"));
  const followingIds = await follows.getFollowingIds("uA");
  check("getFollowingIds returns [uB]", followingIds.length === 1 && followingIds[0] === "uB");

  await follows.unfollow("uA", "uB");
  check("isFollowing false after unfollow", (await follows.isFollowing("uA", "uB")) === false);
  check("alice.followingCount back to 0", (await users.getUser("uA")).followingCount === 0);
  check("bob.followersCount back to 0", (await users.getUser("uB")).followersCount === 0);

  // ─────────────────────────────────────────── POSTS / FEED ──
  section("5. Posts & feed");
  const p1 = await posts.createPost(alice, { text: "Hello world" });
  const p2 = await posts.createPost(bob, { text: "Second post", media: { url: "http://img", type: "image" } });
  check("post created with text", p1.text === "Hello world");
  check("alice.postsCount = 1", (await users.getUser("uA")).postsCount === 1);
  const feed = await posts.fetchFeedPage({ pageSize: 10 });
  check("feed returns both posts", feed.items.length === 2);
  check("feed newest-first", feed.items[0].id === p2.id);

  // ─────────────────────────────────────────── LIKES ──
  section("6. Likes");
  await posts.toggleLike(p1, bob, true);
  check("post likesCount = 1", (await posts.getPost(p1.id)).likesCount === 1);
  check("hasLiked true for bob", (await posts.hasLiked(p1.id, "uB")) === true);
  const aliceNotifs1 = once((cb) => notifications.watchNotifications("uA", cb));
  check("like notified post author", aliceNotifs1.some((n) => n.type === "like" && n.entityId === p1.id));
  await posts.toggleLike(p1, bob, false);
  check("post likesCount = 0 after unlike", (await posts.getPost(p1.id)).likesCount === 0);

  // ─────────────────────────────────────────── COMMENTS ──
  section("7. Comments");
  await comments.addComment("posts", p1, bob, "Nice post!");
  check("commentsCount = 1", (await posts.getPost(p1.id)).commentsCount === 1);
  const cList = once((cb) => comments.watchComments("posts", p1.id, cb));
  check("comment is readable", cList.length === 1 && cList[0].text === "Nice post!");
  await comments.deleteComment("posts", p1.id, cList[0].id);
  check("commentsCount = 0 after delete", (await posts.getPost(p1.id)).commentsCount === 0);

  // ─────────────────────────────────────────── REELS ──
  section("8. Reels");
  const r1 = await reels.createReel(alice, { videoUrl: "http://v", thumbnail: "http://t", caption: "my reel" });
  check("reel created", r1.caption === "my reel");
  check("alice.reelsCount = 1", (await users.getUser("uA")).reelsCount === 1);
  await reels.toggleReelLike(r1, bob, true);
  check("reel likesCount = 1", (await reels.getReelById(r1.id)).likesCount === 1);
  await reels.toggleReelSave(r1, bob, true);
  check("reel savesCount = 1", (await reels.getReelById(r1.id)).savesCount === 1);
  check("saved doc created for bob", !!store.get("users/uB/saved/" + r1.id));
  await reels.addView(r1.id);
  check("reel viewsCount = 1", (await reels.getReelById(r1.id)).viewsCount === 1);

  // ─────────────────────────────────────────── MESSAGING ──
  section("9. Direct messaging");
  const cid = await messages.getOrCreateDM(alice, bob);
  check("DM conversation created", !!store.get("conversations/" + cid));
  check("DM id is deterministic", cid === messages.dmId("uA", "uB"));
  await messages.sendMessage(cid, alice, { text: "hi bob" });
  const msgs = once((cb) => messages.watchMessages(cid, cb));
  check("message delivered", msgs.length === 1 && msgs[0].text === "hi bob");
  const convs = once((cb) => messages.watchMyConversations("uB", cb));
  check("conversation listed for bob", convs.some((c) => c.id === cid));
  check("unread for bob (didn't send)", messages.isConversationUnread(convs.find((c) => c.id === cid), "uB") === true);
  await messages.markRead(cid, "uB", msgs);
  check("message marked read by bob", once((cb) => messages.watchMessages(cid, cb))[0].readBy.includes("uB"));

  // ─────────────────────────────────────────── NOTIFICATIONS UNREAD ──
  section("10. Notifications unread count");
  const unread = once((cb) => notifications.watchUnreadCount("uA", cb));
  check("alice has unread notifications", typeof unread === "number" && unread >= 1);

} catch (e) {
  fail++;
  results.push("\n✗ UNCAUGHT ERROR: " + e.stack);
}

console.log(results.join("\n"));
console.log(`\n${"═".repeat(50)}`);
console.log(`RESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
