// Post card used in feed, profile and detail views.
import { el, richText, timeAgo, formatCount, toast, openSheet, confirmDialog } from "./utils.js";
import { icon } from "./icons.js";
import { avatar, nameWithBadges } from "./components.js";
import { navigate } from "./router.js";
import { me, uid } from "./state.js";
import { toggleLike, hasLiked, deletePost } from "./services/posts.js";

export function postCard(post, { onDelete, clickable = true } = {}) {
  const author = {
    id: post.authorId, username: post.authorUsername, displayName: post.authorName,
    photoURL: post.authorPhoto, verified: post.authorVerified, premium: post.authorPremium,
  };

  const likeBtn = el("button", { class: "action like", onClick: (e) => { e.stopPropagation(); onLike(); } }, [
    el("span", { class: "ic", html: icon("heart") }),
    el("span", { class: "cnt", text: formatCount(post.likesCount || 0) }),
  ]);
  let liked = false;
  const setLiked = (v) => {
    liked = v;
    likeBtn.classList.toggle("on", v);
    likeBtn.querySelector(".ic").innerHTML = icon(v ? "heartFill" : "heart");
  };

  // resolve current like state
  if (uid()) hasLiked(post.id, uid()).then(setLiked).catch(() => {});

  const onLike = async () => {
    const next = !liked;
    setLiked(next);
    const cnt = likeBtn.querySelector(".cnt");
    cnt.textContent = formatCount((Number(post.likesCount) || 0) + (next ? 1 : -1));
    post.likesCount = (Number(post.likesCount) || 0) + (next ? 1 : -1);
    try { await toggleLike(post, me(), next); } catch (e) { toast("Could not update like", "error"); setLiked(!next); }
  };

  const moreBtn = el("button", { class: "action", style: { marginLeft: "auto" }, onClick: (e) => { e.stopPropagation(); openMenu(); } }, [
    el("span", { class: "ic", html: icon("more") }),
  ]);
  const openMenu = () => {
    const items = [];
    if (post.authorId === uid()) {
      items.push({ label: "Delete post", icon: icon("trash"), danger: true, onClick: async () => {
        if (await confirmDialog({ title: "Delete post?", confirmText: "Delete", danger: true })) {
          try { await deletePost(post); toast("Post deleted"); onDelete?.(post); card.remove(); }
          catch { toast("Could not delete", "error"); }
        }
      }});
    }
    items.push({ label: "Copy link", icon: icon("share"), onClick: () => copyLink() });
    openSheet(items);
  };

  const copyLink = () => {
    const url = location.origin + location.pathname + "#/post/" + post.id;
    navigator.clipboard?.writeText(url).then(() => toast("Link copied", "success")).catch(() => toast(url));
  };

  const media = post.media && post.media.url
    ? el("div", { class: "media", onClick: (e) => e.stopPropagation() }, [
        post.media.type === "video"
          ? el("video", { src: post.media.url, controls: true, playsinline: true })
          : el("img", { src: post.media.url, alt: "post image", loading: "lazy" }),
      ])
    : null;

  const card = el("article", { class: "post", onClick: clickable ? () => navigate("/post/" + post.id) : null }, [
    avatar(author, "", { link: true }),
    el("div", { class: "body" }, [
      el("div", { class: "head" }, [
        nameWithBadges(author),
        el("span", { class: "handle", text: "@" + (author.username || "") }),
        el("span", { class: "time", text: "· " + timeAgo(post.createdAt) }),
        moreBtn,
      ]),
      post.text ? el("p", { class: "text", html: richText(post.text) }) : null,
      media,
      el("div", { class: "actions" }, [
        el("button", { class: "action", onClick: (e) => { e.stopPropagation(); navigate("/post/" + post.id); } }, [
          el("span", { class: "ic", html: icon("comment") }),
          el("span", { text: formatCount(post.commentsCount || 0) }),
        ]),
        likeBtn,
        el("button", { class: "action", onClick: (e) => { e.stopPropagation(); copyLink(); } }, [
          el("span", { class: "ic", html: icon("share") }),
        ]),
      ]),
    ]),
  ]);
  return card;
}
