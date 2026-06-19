// User profile: header, stats, follow/unfollow, message + call, posts/reels tabs.
import { el, mount, clear, toast, formatCount, openModal } from "../utils.js";
import { icon } from "../icons.js";
import { header, avatar, nameWithBadges, emptyState, spinnerRow, statInline, userRow } from "../components.js";
import { ensureShell } from "../shell.js";
import { navigate } from "../router.js";
import { me, uid } from "../state.js";
import { getUserByUsername, watchUser, getUser } from "../services/users.js";
import { follow, unfollow, watchIsFollowing, getFollowerIds, getFollowingIds, isFollowing } from "../services/follows.js";
import { fetchUserReels } from "../services/reels.js";
import { fetchUserPosts as fetchPosts } from "../services/posts.js";
import { getOrCreateDM } from "../services/messages.js";
import { postCard } from "../postCard.js";
import { callController } from "../call.js";

export function renderProfile(ctx) {
  const main = ensureShell();
  const handle = ctx.params.handle;
  const activeTab = ctx.params.tab === "reels" ? "reels" : "posts";
  let unsubUser = null, unsubFollow = null;

  mount(main, header("Profile", { back: true }), spinnerRow());

  (async () => {
    let user = await getUserByUsername(handle);
    if (!user) {
      mount(main, header("Profile", { back: true }), emptyState("User not found", "@" + handle + " doesn't exist."));
      return;
    }
    const isMe = user.id === uid();
    const container = el("div");
    mount(main, header(user.displayName || user.username, { back: true, subtitle: "@" + user.username }), container);

    const render = () => {
      const followBtn = isMe
        ? el("button", { class: "btn", text: "Edit profile", onClick: () => navigate("/settings/edit") })
        : el("button", { class: "btn primary", text: "Follow" });

      const actionRow = el("div", { class: "row gap-sm" });
      if (isMe) {
        actionRow.appendChild(followBtn);
      } else {
        actionRow.append(
          el("button", { class: "icon-btn plain", title: "Message", html: icon("mail"), onClick: () => openDM(user) }),
          el("button", { class: "icon-btn plain", title: "Voice call", html: icon("phone"), onClick: () => callController.startOutgoing(user, "voice") }),
          el("button", { class: "icon-btn plain", title: "Video call", html: icon("videoCall"), onClick: () => callController.startOutgoing(user, "video") }),
          followBtn,
        );
        // realtime follow state
        unsubFollow?.();
        unsubFollow = watchIsFollowing(uid(), user.id, (following) => {
          followBtn.textContent = following ? "Following" : "Follow";
          followBtn.className = following ? "btn" : "btn primary";
          followBtn.onclick = async () => {
            followBtn.disabled = true;
            try {
              if (following) await unfollow(uid(), user.id);
              else await follow(me(), user.id);
            } catch (e) { toast(e.message || "Action failed", "error"); }
            followBtn.disabled = false;
          };
        });
      }

      const stats = el("div", { class: "stats" }, [
        statInline(user.postsCount || 0, "Posts"),
        statInline(user.followersCount || 0, "Followers", () => openFollowList(user, "followers")),
        statInline(user.followingCount || 0, "Following", () => openFollowList(user, "following")),
      ]);

      const tabsEl = el("div", { class: "tabs" }, [
        el("button", { class: "tab" + (activeTab === "posts" ? " active" : ""), text: "Posts", onClick: () => navigate(`/u/${user.username}`) }),
        el("button", { class: "tab" + (activeTab === "reels" ? " active" : ""), text: "Reels", onClick: () => navigate(`/u/${user.username}/reels`) }),
      ]);
      const tabBody = el("div");

      mount(container,
        el("div", { class: "profile-cover" }),
        el("div", { class: "profile-head" }, [
          el("div", { class: "profile-avatar-row" }, [avatar(user, "xl"), actionRow]),
          el("div", { class: "profile-meta" }, [
            el("div", { class: "display" }, [nameWithBadges(user, { bold: true })]),
            el("div", { class: "handle", text: "@" + user.username }),
            user.bio ? el("div", { class: "bio", text: user.bio }) : null,
            user.creatorMode ? el("div", { class: "chip mt", style: { width: "fit-content" } }, [el("span", { html: icon("chart") }), el("span", { text: "Creator" })]) : null,
            stats,
          ]),
        ]),
        tabsEl,
        tabBody,
      );

      loadTab(tabBody, user, activeTab, isMe);
    };

    render();
    // keep counts/avatar live
    unsubUser = watchUser(user.id, (u) => { if (u) { user = { ...u }; render(); } });
  })();

  return () => { unsubUser?.(); unsubFollow?.(); };
}

async function loadTab(body, user, tab, isMe) {
  mount(body, spinnerRow());
  try {
    if (tab === "posts") {
      const posts = await fetchPosts(user.id, 30);
      if (!posts.length) { mount(body, emptyState(isMe ? "No posts yet" : "No posts", isMe ? "Share your first post." : "")); return; }
      clear(body);
      posts.forEach((p) => body.appendChild(postCard(p)));
    } else {
      const reels = await fetchUserReels(user.id, 30);
      if (!reels.length) { mount(body, emptyState("No reels yet", isMe ? "Upload your first reel." : "")); return; }
      const grid = el("div", { class: "media-grid" });
      reels.forEach((r) => grid.appendChild(
        el("div", { class: "cell", onClick: () => navigate("/reels/" + r.id) }, [
          r.thumbnail ? el("img", { src: r.thumbnail, loading: "lazy" }) : el("video", { src: r.videoUrl, muted: true }),
          el("span", { class: "ov", html: icon("play") }),
        ])
      ));
      mount(body, grid);
    }
  } catch (e) {
    console.error(e);
    mount(body, emptyState("Couldn't load", e.message || ""));
  }
}

function openDM(user) {
  getOrCreateDM(me(), user).then((cid) => navigate("/messages/" + cid)).catch((e) => toast(e.message || "Could not open chat", "error"));
}

async function openFollowList(user, kind) {
  const list = el("div", {}, [spinnerRow()]);
  const modal = openModal(el("div", {}, [el("h2", { text: kind === "followers" ? "Followers" : "Following" }), list]));
  try {
    const ids = kind === "followers" ? await getFollowerIds(user.id) : await getFollowingIds(user.id);
    if (!ids.length) { mount(list, emptyState("Nobody yet", "")); return; }
    const users = (await Promise.all(ids.slice(0, 100).map((id) => getUser(id)))).filter(Boolean);
    clear(list);
    users.forEach((u) => {
      const row = userRow(u);
      row.addEventListener("click", () => modal.close());
      list.appendChild(row);
    });
  } catch (e) {
    mount(list, emptyState("Couldn't load", e.message || ""));
  }
}
