// Notifications list with realtime updates + mark-all-read.
import { el, mount, clear, timeAgo } from "../utils.js";
import { icon } from "../icons.js";
import { header, avatar, nameWithBadges, emptyState, spinnerRow } from "../components.js";
import { ensureShell } from "../shell.js";
import { navigate } from "../router.js";
import { uid } from "../state.js";
import { watchNotifications, markAllRead } from "../services/notifications.js";

const TYPE = {
  follow: { cls: "follow", icon: "user", verb: "started following you" },
  like: { cls: "like", icon: "heartFill", verb: "liked your" },
  comment: { cls: "comment", icon: "comment", verb: "commented on your" },
};

export function renderNotifications() {
  const main = ensureShell();
  const list = el("div", {}, [spinnerRow()]);

  mount(main, header("Notifications"), list);

  const unsub = watchNotifications(uid(), (items) => {
    if (!items.length) { mount(list, emptyState("No notifications yet", "Activity from people you interact with shows up here.")); return; }
    clear(list);
    items.forEach((n) => list.appendChild(row(n)));
    // mark read shortly after viewing
    setTimeout(() => markAllRead(uid(), items).catch(() => {}), 1200);
  });

  function row(n) {
    const t = TYPE[n.type] || { cls: "", icon: "bell", verb: "" };
    const actor = { username: n.actorUsername, displayName: n.actorName, photoURL: n.actorPhoto };
    const target = () => {
      if (n.type === "follow") navigate("/u/" + n.actorUsername);
      else if (n.entity === "post") navigate("/post/" + n.entityId);
      else if (n.entity === "reel") navigate("/reels/" + n.entityId);
    };
    const what = n.entity ? (n.entity === "reel" ? " reel" : " post") : "";
    return el("div", { class: "notif" + (n.read ? "" : " unread"), onClick: target }, [
      el("div", { class: "ic-wrap " + t.cls, html: icon(t.icon) }),
      avatar(actor, "", { link: true }),
      el("div", { class: "grow" }, [
        el("div", {}, [nameWithBadges(actor), el("span", { text: " " + t.verb + what }) ]),
        n.preview ? el("div", { class: "muted ellipsis", text: n.preview }) : null,
        el("div", { class: "faint", style: { fontSize: ".8rem" }, text: timeAgo(n.createdAt) }),
      ]),
    ]);
  }

  return () => unsub?.();
}
