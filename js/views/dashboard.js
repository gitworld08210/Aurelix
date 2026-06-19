// Creator dashboard: real analytics aggregated from the user's posts & reels.
import { el, mount, formatCount } from "../utils.js";
import { icon } from "../icons.js";
import { header, spinnerRow, emptyState } from "../components.js";
import { ensureShell } from "../shell.js";
import { me } from "../state.js";
import { fetchUserPosts } from "../services/posts.js";
import { fetchUserReels } from "../services/reels.js";

export function renderDashboard() {
  const main = ensureShell();
  const user = me();
  const body = el("div", {}, [spinnerRow()]);
  mount(main, header("Creator dashboard", { back: true }), body);

  (async () => {
    try {
      const [posts, reels] = await Promise.all([fetchUserPosts(user.id, 50), fetchUserReels(user.id, 50)]);
      const reelViews = reels.reduce((s, r) => s + (r.viewsCount || 0), 0);
      const postLikes = posts.reduce((s, p) => s + (p.likesCount || 0), 0);
      const reelLikes = reels.reduce((s, r) => s + (r.likesCount || 0), 0);
      const comments = posts.reduce((s, p) => s + (p.commentsCount || 0), 0) + reels.reduce((s, r) => s + (r.commentsCount || 0), 0);
      const saves = reels.reduce((s, r) => s + (r.savesCount || 0), 0);

      const card = (n, l, ic) => el("div", { class: "stat-card glass" }, [
        el("div", { class: "row", style: { justifyContent: "space-between" } }, [
          el("div", { class: "n", text: formatCount(n) }),
          el("span", { class: "muted ic", html: icon(ic) }),
        ]),
        el("div", { class: "l", text: l }),
      ]);

      const grid = el("div", { class: "stat-grid" }, [
        card(user.followersCount || 0, "Followers", "user"),
        card(reelViews, "Reel views", "video"),
        card(postLikes + reelLikes, "Total likes", "heartFill"),
        card(comments, "Comments", "comment"),
        card(saves, "Reel saves", "bookmarkFill"),
        card((user.postsCount || 0) + (user.reelsCount || 0), "Total content", "chart"),
      ]);

      // reel performance bar chart (real view counts)
      const topReels = [...reels].sort((a, b) => (b.viewsCount || 0) - (a.viewsCount || 0)).slice(0, 8).reverse();
      const max = Math.max(1, ...topReels.map((r) => r.viewsCount || 0));
      const chart = topReels.length
        ? el("div", {}, [
            el("div", { style: { padding: "6px 16px 0", fontWeight: "700" }, text: "Top reels by views" }),
            el("div", { class: "bar-chart" }, topReels.map((r) =>
              el("div", { class: "bar", title: `${r.viewsCount || 0} views`, style: { height: ((r.viewsCount || 0) / max * 100) + "%" } })
            )),
          ])
        : null;

      const postPerf = el("div", { class: "container" }, [
        el("div", { style: { fontWeight: "700", marginBottom: "8px" }, text: "Engagement summary" }),
        el("div", { class: "muted", text: `Across ${posts.length} posts and ${reels.length} reels, your content earned ${formatCount(postLikes + reelLikes)} likes and ${formatCount(comments)} comments.` }),
      ]);

      mount(body,
        user.creatorMode ? null : el("div", { class: "container" }, [el("div", { class: "chip", style: { width: "fit-content" }, html: "Enable Creator mode in Settings to show creator tools on your profile" })]),
        grid, chart, postPerf,
        (!posts.length && !reels.length) ? emptyState("No analytics yet", "Post content to start seeing your stats.") : null,
      );
    } catch (e) {
      console.error(e);
      mount(body, emptyState("Couldn't load analytics", e.message || ""));
    }
  })();
}
