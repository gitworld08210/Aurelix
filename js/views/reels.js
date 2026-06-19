// Vertical, snap-scrolling reels feed with autoplay, like, comment, save.
import { el, mount, clear, toast, formatCount, openModal, confirmDialog, openSheet } from "../utils.js";
import { icon } from "../icons.js";
import { avatar, nameWithBadges, emptyState, spinnerRow } from "../components.js";
import { mountFull, ensureShell } from "../shell.js";
import { navigate } from "../router.js";
import { me, uid } from "../state.js";
import {
  fetchReelsPage, hasLikedReel, hasSavedReel, toggleReelLike, toggleReelSave, addView, deleteReel,
  getReelById,
} from "../services/reels.js";
import { watchComments, addComment, deleteComment } from "../services/comments.js";

export function renderReels(ctx) {
  const startId = ctx?.params?.id || null;

  const viewport = el("div", { class: "reels-viewport" });
  const closeBtn = el("button", { class: "reels-close call-btn", style: { width: "44px", height: "44px" }, html: icon("close"), onClick: () => navigate("/") });
  mountFull(el("div", {}, [closeBtn, viewport]));

  let cursor = null, done = false, loading = false, count = 0;
  const observed = new Map(); // reelEl -> {video, reel, controller}

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const v = entry.target.querySelector("video");
      if (!v) return;
      if (entry.isIntersecting && entry.intersectionRatio > 0.6) {
        v.play().catch(() => {});
        entry.target.classList.remove("paused");
        const reelId = entry.target.dataset.reelId;
        if (reelId && !entry.target.dataset.viewed) { entry.target.dataset.viewed = "1"; addView(reelId); }
      } else {
        v.pause();
      }
    });
  }, { threshold: [0, 0.6, 1] });

  const sentinel = el("div", { style: { height: "1px" } });

  async function loadMore() {
    if (loading || done) return;
    loading = true;
    const loader = spinnerRow();
    viewport.appendChild(loader);
    try {
      const page = await fetchReelsPage({ cursor });
      loader.remove();
      cursor = page.cursor; done = page.done;
      page.items.forEach(addReel);
      count += page.items.length;
      if (!count && done) mount(viewport, emptyState("No reels yet", "Be the first to share a reel.",
        el("button", { class: "btn primary", text: "Upload reel", onClick: () => import("./compose.js").then((m) => m.openComposer("reel")) })));
      if (!done) viewport.appendChild(sentinel) && io2.observe(sentinel);
    } catch (e) {
      loader.remove();
      console.error(e);
      mount(viewport, emptyState("Couldn't load reels", e.message || ""));
      done = true;
    }
    loading = false;
  }

  const io2 = new IntersectionObserver((entries) => { if (entries[0].isIntersecting) { io2.unobserve(sentinel); sentinel.remove(); loadMore(); } }, { rootMargin: "800px", root: viewport });

  function addReel(reel) {
    const node = buildReel(reel);
    viewport.appendChild(node);
    io.observe(node);
  }

  (async () => {
    if (startId) {
      try { const r = await getReelById(startId); if (r) { addReel(r); count++; } } catch {}
    }
    await loadMore();
  })();

  return () => { io.disconnect(); io2.disconnect(); };
}

function buildReel(reel) {
  const node = el("div", { class: "reel", dataset: { reelId: reel.id } });
  const video = el("video", { src: reel.videoUrl, loop: true, playsinline: true, muted: true, preload: "metadata", poster: reel.thumbnail || "" });

  const playHint = el("div", { class: "play-hint", html: icon("play") });
  node.addEventListener("click", (e) => {
    if (e.target.closest(".side") || e.target.closest(".meta a")) return;
    if (video.paused) { video.play().catch(() => {}); node.classList.remove("paused"); }
    else { video.pause(); node.classList.add("paused"); }
  });
  // first interaction unmutes
  const unmuteOnce = () => { video.muted = false; node.removeEventListener("click", unmuteOnce); };
  node.addEventListener("click", unmuteOnce, { once: true });

  const author = { id: reel.authorId, username: reel.authorUsername, displayName: reel.authorName, photoURL: reel.authorPhoto, verified: reel.authorVerified, premium: reel.authorPremium };

  // side actions
  const likeBtn = el("button", { class: "action like" }, [el("span", { class: "ic", html: icon("heart") }), el("span", { class: "c", text: formatCount(reel.likesCount || 0) })]);
  const saveBtn = el("button", { class: "action save" }, [el("span", { class: "ic", html: icon("bookmark") }), el("span", { text: "Save" })]);
  const commentBtn = el("button", { class: "action" }, [el("span", { class: "ic", html: icon("comment") }), el("span", { class: "c", text: formatCount(reel.commentsCount || 0) })]);

  let liked = false, saved = false;
  if (uid()) {
    hasLikedReel(reel.id, uid()).then((v) => { liked = v; likeBtn.classList.toggle("on", v); likeBtn.querySelector(".ic").innerHTML = icon(v ? "heartFill" : "heart"); }).catch(() => {});
    hasSavedReel(reel.id, uid()).then((v) => { saved = v; saveBtn.classList.toggle("on", v); saveBtn.querySelector(".ic").innerHTML = icon(v ? "bookmarkFill" : "bookmark"); }).catch(() => {});
  }
  likeBtn.addEventListener("click", async (e) => {
    e.stopPropagation(); liked = !liked;
    likeBtn.classList.toggle("on", liked); likeBtn.querySelector(".ic").innerHTML = icon(liked ? "heartFill" : "heart");
    reel.likesCount = (reel.likesCount || 0) + (liked ? 1 : -1); likeBtn.querySelector(".c").textContent = formatCount(reel.likesCount);
    try { await toggleReelLike(reel, me(), liked); } catch { toast("Action failed", "error"); }
  });
  saveBtn.addEventListener("click", async (e) => {
    e.stopPropagation(); saved = !saved;
    saveBtn.classList.toggle("on", saved); saveBtn.querySelector(".ic").innerHTML = icon(saved ? "bookmarkFill" : "bookmark");
    try { await toggleReelSave(reel, me(), saved); toast(saved ? "Saved" : "Removed", "success"); } catch { toast("Action failed", "error"); }
  });
  commentBtn.addEventListener("click", (e) => { e.stopPropagation(); openReelComments(reel); });

  const side = el("div", { class: "side" }, [
    avatar(author, "", { link: true }),
    likeBtn, commentBtn, saveBtn,
    reel.authorId === uid()
      ? el("button", { class: "action", onClick: (e) => { e.stopPropagation(); openSheet([{ label: "Delete reel", icon: icon("trash"), danger: true, onClick: async () => {
          if (await confirmDialog({ title: "Delete reel?", confirmText: "Delete", danger: true })) { try { await deleteReel(reel); node.remove(); toast("Deleted"); } catch { toast("Could not delete", "error"); } }
        }}]); } }, [el("span", { class: "ic", html: icon("more") })])
      : el("button", { class: "action", onClick: (e) => { e.stopPropagation(); const url = location.origin + location.pathname + "#/reels/" + reel.id; navigator.clipboard?.writeText(url).then(() => toast("Link copied", "success")); } }, [el("span", { class: "ic", html: icon("share") })]),
  ]);

  const meta = el("div", { class: "meta" }, [
    el("a", { class: "name", href: "#/u/" + author.username, onClick: (e) => e.stopPropagation() }, [nameWithBadges(author, { bold: true })]),
    reel.caption ? el("div", { class: "cap", text: reel.caption }) : null,
  ]);

  mount(node, video, el("div", { class: "gradient" }), playHint, meta, side);
  return node;
}

function openReelComments(reel) {
  const list = el("div", {}, [spinnerRow()]);
  const input = el("input", { class: "input", placeholder: "Add a comment…", style: { borderRadius: "var(--radius-pill)" } });
  const sendBtn = el("button", { class: "icon-btn", html: icon("send") });
  const send = async () => { const t = input.value.trim(); if (!t) return; input.value = ""; try { await addComment("reels", reel, me(), t); } catch { toast("Could not comment", "error"); } };
  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });

  openModal(el("div", {}, [
    el("h2", { text: "Comments" }),
    el("div", { style: { maxHeight: "50vh", overflowY: "auto" } }, [list]),
    el("div", { class: "row mt", style: { gap: "8px" } }, [avatar(me() || {}, "sm"), input, sendBtn]),
  ]));

  watchComments("reels", reel.id, (comments) => {
    if (!comments.length) { mount(list, emptyState("No comments", "")); return; }
    clear(list);
    comments.forEach((c) => {
      const author = { id: c.authorId, username: c.authorUsername, displayName: c.authorName, photoURL: c.authorPhoto, verified: c.authorVerified };
      const del = c.authorId === uid() ? el("button", { class: "action", style: { marginLeft: "auto" }, html: icon("trash"), onClick: () => deleteComment("reels", reel.id, c.id).catch(() => {}) }) : null;
      list.appendChild(el("div", { class: "row", style: { alignItems: "flex-start", padding: "8px 0", gap: "10px" } }, [
        avatar(author, "sm", { link: true }),
        el("div", { class: "grow" }, [el("div", {}, [nameWithBadges(author), el("span", { class: "muted", text: " @" + (author.username || "") })]), el("div", { text: c.text })]),
        del,
      ]));
    });
  });
}
