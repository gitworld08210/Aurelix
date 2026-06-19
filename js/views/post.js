// Single post detail with realtime comments.
import { el, mount, clear, toast, timeAgo, confirmDialog, openSheet } from "../utils.js";
import { icon } from "../icons.js";
import { header, avatar, nameWithBadges, emptyState, spinnerRow } from "../components.js";
import { ensureShell } from "../shell.js";
import { navigate } from "../router.js";
import { me, uid } from "../state.js";
import { watchPost } from "../services/posts.js";
import { watchComments, addComment, deleteComment } from "../services/comments.js";
import { postCard } from "../postCard.js";

export function renderPostDetail(ctx) {
  const main = ensureShell();
  const id = ctx.params.id;
  let unsubPost = null, unsubComments = null;

  const cardSlot = el("div", {}, [spinnerRow()]);
  const commentList = el("div", {});
  const input = el("input", { class: "input", placeholder: "Post your reply", style: { borderRadius: "var(--radius-pill)" } });
  const sendBtn = el("button", { class: "icon-btn", html: icon("send") });

  const send = async () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    try { await addComment("posts", { id, authorId: postData?.authorId }, me(), text); }
    catch (e) { toast("Could not comment", "error"); input.value = text; }
  };
  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });

  mount(main,
    header("Post", { back: true }),
    cardSlot,
    el("div", { class: "row", style: { padding: "12px 16px", borderBottom: "1px solid var(--glass-border)", gap: "10px" } }, [
      avatar(me() || {}, "sm"), input, sendBtn,
    ]),
    commentList,
  );

  let postData = null;
  unsubPost = watchPost(id, (p) => {
    if (!p) { mount(cardSlot, emptyState("Post not found", "It may have been deleted.")); return; }
    postData = p;
    mount(cardSlot, postCard(p, { clickable: false, onDelete: () => navigate("/") }));
  });

  unsubComments = watchComments("posts", id, (comments) => {
    if (!comments.length) { mount(commentList, emptyState("No replies yet", "Be the first to reply.")); return; }
    clear(commentList);
    comments.forEach((c) => commentList.appendChild(commentRow("posts", id, c)));
  });

  return () => { unsubPost?.(); unsubComments?.(); };
}

export function commentRow(kind, parentId, c) {
  const author = { id: c.authorId, username: c.authorUsername, displayName: c.authorName, photoURL: c.authorPhoto, verified: c.authorVerified };
  const more = c.authorId === uid()
    ? el("button", { class: "action", style: { marginLeft: "auto" }, html: icon("more"), onClick: (e) => {
        e.stopPropagation();
        openSheet([{ label: "Delete", icon: icon("trash"), danger: true, onClick: async () => {
          if (await confirmDialog({ title: "Delete reply?", confirmText: "Delete", danger: true })) {
            try { await deleteComment(kind, parentId, c.id); } catch { toast("Could not delete", "error"); }
          }
        }}]);
      } })
    : null;
  return el("div", { class: "post", style: { cursor: "default" } }, [
    avatar(author, "", { link: true }),
    el("div", { class: "body" }, [
      el("div", { class: "head" }, [
        nameWithBadges(author),
        el("span", { class: "handle", text: "@" + (author.username || "") }),
        el("span", { class: "time", text: "· " + timeAgo(c.createdAt) }),
        more,
      ]),
      el("p", { class: "text", text: c.text }),
    ]),
  ]);
}
